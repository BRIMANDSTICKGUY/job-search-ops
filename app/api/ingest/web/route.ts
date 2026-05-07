export const runtime = "nodejs";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { JobSourceType } from "@/app/types";
import { serializeIngestError } from "@/lib/ingest/ingestRun";
import { evaluateJobForClient, JOB_ASSIGNMENT_THRESHOLD } from "@/lib/scoring/evaluateJobForClient";

type IngestionSource = {
  id: string;
  client_id: string | null;
  source_type: JobSourceType;
  base_url: string | null;
  company_name: string | null;
  active: boolean;
};

type NormalizedJob = {
  title: string;
  company: string;
  location: string | null;
  link: string | null;
  remote_type?: string | null;
  source_type: IngestionSource["source_type"];
  source_url: string | null;
  raw_payload: unknown;
};

type FetchError = {
  source_type: IngestionSource["source_type"];
  source_url: string | null;
  message: string;
};

type SourceRunSummary = {
  source_id: string;
  source_type: IngestionSource["source_type"];
  company_name: string | null;
  client_id: string | null;
  fetched: number;
  inserted: number;
  duplicates: number;
  archived: number;
  skipped_no_profiles: boolean;
};

type ExistingJobRow = {
  id: string;
  link: string | null;
};

type HardenedFetchResult =
  | { ok: true; res: Response }
  | { ok: false; errorMessage: string };

function isValidSourceUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

function extractCompanySlug(baseUrl: string | null): string | null {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.hostname.includes("greenhouse.io")) {
      const idx = parts.findIndex((p) => p === "boards" || p === "boards-api.greenhouse.io");
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      return parts[0] ?? null;
    }
    if (url.hostname.includes("lever.co")) return parts[0] ?? null;
    if (url.hostname.includes("ashbyhq.com")) return parts[0] ?? null;
    if (url.pathname.includes("/recruiting/")) {
      const recruitingIdx = parts.findIndex((p) => p === "recruiting");
      if (recruitingIdx >= 0 && parts[recruitingIdx + 1]) return parts[recruitingIdx + 1];
    }
    return parts[0] ?? null;
  } catch {
    return null;
  }
}

function companyFromSource(source: IngestionSource): string {
  if (typeof source.company_name === "string" && source.company_name.trim().length > 0) {
    return source.company_name.trim();
  }
  const slug = extractCompanySlug(source.base_url);
  if (slug) return slug.replace(/[-_]/g, " ");
  return "Unknown";
}

function extractWorkdayConfig(baseUrl: string | null): { apiUrl: string; boardUrl: string } | null {
  if (!baseUrl) return null;

  try {
    const url = new URL(baseUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const recruitingIdx = parts.findIndex((part) => part === "recruiting");

    if (recruitingIdx < 0 || !parts[recruitingIdx + 1] || !parts[recruitingIdx + 2]) {
      return null;
    }

    const tenant = parts[recruitingIdx + 1];
    const site = parts[recruitingIdx + 2];
    const origin = `${url.protocol}//${url.host}`;

    return {
      apiUrl: `${origin}/wday/cxs/${tenant}/${site}/jobs`,
      boardUrl: `${origin}/recruiting/${tenant}/${site}`,
    };
  } catch {
    return null;
  }
}

async function hardenedFetch(url: string): Promise<HardenedFetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "JobSearchOpsBot/1.0",
        accept: "application/json,text/html,*/*",
      },
      signal: controller.signal,
    });
    return { ok: true, res };
  } catch (error: unknown) {
    const message = serializeIngestError(error);
    return { ok: false, errorMessage: message || "Fetch failed" };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchGreenhouse(
  source: IngestionSource,
  fetchErrors: FetchError[]
): Promise<NormalizedJob[]> {
  const sourceUrl = source.base_url;
  if (!isValidSourceUrl(sourceUrl)) return [];
  const slug = extractCompanySlug(sourceUrl);
  if (!slug) return [];
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;

  const result = await hardenedFetch(apiUrl);
  if (!result.ok) {
    const message = result.errorMessage;
    console.error("Fetch failed", {
      source_type: "greenhouse",
      source_url: sourceUrl,
      message,
    });
    fetchErrors.push({
      source_type: "greenhouse",
      source_url: sourceUrl,
      message,
    });
    return [];
  }

  if (!result.res.ok) {
    const message = `Failed to fetch from Greenhouse: ${result.res.status} ${result.res.statusText}`;
    console.error("Fetch failed", {
      source_type: "greenhouse",
      source_url: sourceUrl,
      message,
    });
    fetchErrors.push({
      source_type: "greenhouse",
      source_url: sourceUrl,
      message,
    });
    return [];
  }

  const data = (await result.res.json()) as { jobs?: any[] };
  const company = companyFromSource(source);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map((j) => ({
    title: j.title ?? "",
    company,
    location: j.location?.name ?? null,
    link: j.absolute_url ?? null,
    source_type: "greenhouse",
    source_url: sourceUrl,
    raw_payload: j,
  }));
}

async function fetchLever(
  source: IngestionSource,
  fetchErrors: FetchError[]
): Promise<NormalizedJob[]> {
  const sourceUrl = source.base_url;
  if (!isValidSourceUrl(sourceUrl)) return [];
  const slug = extractCompanySlug(sourceUrl);
  if (!slug) return [];
  const apiUrl = `https://api.lever.co/v0/postings/${slug}?mode=json`;

  const result = await hardenedFetch(apiUrl);
  if (!result.ok) {
    const message = result.errorMessage;
    console.error("Fetch failed", {
      source_type: "lever",
      source_url: sourceUrl,
      message,
    });
    fetchErrors.push({
      source_type: "lever",
      source_url: sourceUrl,
      message,
    });
    return [];
  }

  if (!result.res.ok) {
    const message = `Failed to fetch from Lever: ${result.res.status} ${result.res.statusText}`;
    console.error("Fetch failed", {
      source_type: "lever",
      source_url: sourceUrl,
      message,
    });
    fetchErrors.push({
      source_type: "lever",
      source_url: sourceUrl,
      message,
    });
    return [];
  }

  const data = (await result.res.json()) as any[];
  const company = companyFromSource(source);
  const jobs = Array.isArray(data) ? data : [];
  return jobs.map((j) => ({
    title: j.text ?? "",
    company,
    location: j.categories?.location ?? null,
    link: j.hostedUrl ?? j.applyUrl ?? null,
    source_type: "lever",
    source_url: sourceUrl,
    raw_payload: j,
  }));
}

async function fetchAshby(
  source: IngestionSource,
  fetchErrors: FetchError[]
): Promise<NormalizedJob[]> {
  const sourceUrl = source.base_url;
  if (!isValidSourceUrl(sourceUrl)) return [];

  const slug = extractCompanySlug(sourceUrl);
  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;

  const result = await hardenedFetch(apiUrl);
  if (!result.ok) {
    const message = result.errorMessage;
    console.error("Fetch failed", {
      source_type: "ashby",
      source_url: sourceUrl,
      message,
    });
    fetchErrors.push({
      source_type: "ashby",
      source_url: sourceUrl,
      message,
    });
    return [];
  }

  if (!result.res.ok) {
    const message = `Failed to fetch from Ashby: ${result.res.status} ${result.res.statusText}`;
    console.error("Fetch failed", {
      source_type: "ashby",
      source_url: sourceUrl,
      message,
    });
    fetchErrors.push({
      source_type: "ashby",
      source_url: sourceUrl,
      message,
    });
    return [];
  }

  const data = (await result.res.json()) as { jobs?: any[] };
  const company = companyFromSource(source);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map((j) => ({
    title: j.title ?? "",
    company,
    location: j.location ?? null,
    link: j.jobUrl ?? null,
    source_type: "ashby",
    source_url: sourceUrl,
    raw_payload: j,
  }));
}

async function fetchWorkday(
  source: IngestionSource,
  fetchErrors: FetchError[]
): Promise<NormalizedJob[]> {
  const sourceUrl = source.base_url;
  if (!isValidSourceUrl(sourceUrl)) return [];

  const config = extractWorkdayConfig(sourceUrl);
  if (!config) {
    fetchErrors.push({
      source_type: "workday",
      source_url: sourceUrl,
      message: "Unsupported Workday URL. Expected a /recruiting/{tenant}/{site} board URL.",
    });
    return [];
  }

  const company = companyFromSource(source);
  const jobs: NormalizedJob[] = [];
  let offset = 0;
  const limit = 20;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    let res: Response;

    try {
      res = await fetch(config.apiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json,text/plain,*/*",
          "user-agent": "JobSearchOpsBot/1.0",
        },
        body: JSON.stringify({ limit, offset }),
      });
    } catch (error) {
      const message = serializeIngestError(error);
      fetchErrors.push({
        source_type: "workday",
        source_url: sourceUrl,
        message,
      });
      return jobs;
    }

    if (!res.ok) {
      const message = `Failed to fetch from Workday: ${res.status} ${res.statusText}`;
      console.error("Fetch failed", {
        source_type: "workday",
        source_url: sourceUrl,
        message,
      });
      fetchErrors.push({
        source_type: "workday",
        source_url: sourceUrl,
        message,
      });
      return jobs;
    }

    const data = (await res.json()) as {
      jobPostings?: Array<Record<string, unknown>>;
      total?: number;
    };

    const pageJobs = Array.isArray(data.jobPostings) ? data.jobPostings : [];
    total = typeof data.total === "number" && Number.isFinite(data.total) ? data.total : pageJobs.length;

    jobs.push(
      ...pageJobs.map((job) => {
        const externalPath = typeof job.externalPath === "string" ? job.externalPath : "";
        const title = typeof job.title === "string" ? job.title : "";
        const locationsText =
          typeof job.locationsText === "string"
            ? job.locationsText
            : Array.isArray(job.locations)
              ? (job.locations as Array<Record<string, unknown>>)
                  .map((location) => (typeof location?.displayName === "string" ? location.displayName : ""))
                  .filter(Boolean)
                  .join(", ")
              : null;

        return {
          title,
          company,
          location: locationsText,
          link: externalPath ? `${config.boardUrl}${externalPath.startsWith("/") ? "" : "/"}${externalPath}` : sourceUrl,
          source_type: "workday" as const,
          source_url: sourceUrl,
          raw_payload: job,
        };
      })
    );

    offset += pageJobs.length;
    if (pageJobs.length === 0 || pageJobs.length < limit) {
      break;
    }
  }

  return jobs;
}

async function fetchJobsForSource(
  source: IngestionSource,
  fetchErrors: FetchError[]
): Promise<NormalizedJob[]> {
  switch (source.source_type) {
    case "greenhouse":
      return fetchGreenhouse(source, fetchErrors);
    case "lever":
      return fetchLever(source, fetchErrors);
    case "ashby":
      return fetchAshby(source, fetchErrors);
    case "workday":
      return fetchWorkday(source, fetchErrors);
    default:
      return [];
  }
}

async function fetchExistingJobsForSource(
  supabase: ReturnType<typeof createClient>,
  sourceId: string
): Promise<ExistingJobRow[]> {
  const { data, error } = await (supabase as any)
    .from("jobs")
    .select("id, link")
    .eq("ingest_source", sourceId)
    .eq("is_test", false);
  if (error || !data) return [];

  return (data as ExistingJobRow[]).filter(
    (row) => typeof row.link === "string" && row.link.trim().length > 0
  );
}

async function reconcileSourceJobs(
  existingJobs: ExistingJobRow[],
  liveLinks: string[],
): Promise<number> {
  const liveLinkSet = new Set(liveLinks.filter((link) => link.length > 0));
  const staleIds = existingJobs
    .filter((row) => {
      const link = (row.link ?? "").trim();
      return link.length > 0 && !liveLinkSet.has(link);
    })
    .map((row) => row.id);

  return staleIds.length;
}

export async function POST(req: Request) {
  try {
    const adminToken = req.headers.get("x-admin-token");
    const expectedToken = process.env.SCRAPE_ADMIN_TOKEN;

    if (!expectedToken || adminToken !== expectedToken) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing Supabase env",
          diagnostics: {
            SUPABASE_URL: Boolean(SUPABASE_URL),
            SUPABASE_SERVICE_ROLE_KEY: Boolean(SUPABASE_SERVICE_ROLE_KEY),
          },
        },
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as any;

    const { data: sources, error } = await supabase
      .from("ingestion_sources")
      .select("id,client_id,source_type,base_url,company_name,active")
      .eq("active", true);

    if (error || !sources) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Failed to load ingestion sources" },
        { status: 500 }
      );
    }

    let insertedCount = 0;
    let fetchedCount = 0;
    let duplicateCount = 0;
    const errors: Array<{ source_id: string; message: string }> = [];
    const fetchErrors: FetchError[] = [];
    const sourceSummaries: SourceRunSummary[] = [];

    for (const source of sources as any[]) {
      const seenAtIso = new Date().toISOString();
      const sourceSummary: SourceRunSummary = {
        source_id: source.id,
        source_type: source.source_type,
        company_name: source.company_name ?? null,
        client_id: source.client_id ?? null,
        fetched: 0,
        inserted: 0,
        duplicates: 0,
        archived: 0,
        skipped_no_profiles: false,
      };

      try {
        const { data: profiles, error: profilesError } = await supabase
          .from("client_job_profiles")
          .select("*")
          .eq("client_id", source.client_id);

        if (profilesError) {
          console.error("[INGEST][profiles][ERROR]", profilesError);
          sourceSummaries.push(sourceSummary);
          continue;
        }

        if (!profiles || profiles.length === 0) {
          sourceSummary.skipped_no_profiles = true;
          sourceSummaries.push(sourceSummary);
          continue;
        }

        const normalized = await fetchJobsForSource(source, fetchErrors);
        sourceSummary.fetched = normalized.length;
        fetchedCount += normalized.length;
        const links = normalized.map((j) => j.link).filter(Boolean) as string[];
        const existingJobs = await fetchExistingJobsForSource(supabase, source.id);
        const existingByLink = new Map(
          existingJobs.map((row) => [String(row.link).trim(), row])
        );

        for (const job of normalized) {
          const existing = job.link ? existingByLink.get(job.link) : null;

          if (existing) {
            const { error: updateExistingError } = await supabase
              .from("jobs")
              .update({
                title: job.title,
                company: job.company,
                location: job.location ?? null,
                remote_type: job.remote_type ?? "unknown",
                source_active: true,
                source_last_seen_at: seenAtIso,
                ingested_at: seenAtIso,
              })
              .eq("id", existing.id);

            if (updateExistingError) {
              console.error("[INGEST][existing_job_update][ERROR]", updateExistingError);
            }

            duplicateCount += 1;
            sourceSummary.duplicates += 1;
            continue;
          }

          const jobId = crypto
            .createHash("sha256")
            .update(job.link ?? `${job.title}-${job.company}`)
            .digest("hex");

          const { data: jobRow, error: jobErr } = await supabase
            .from("jobs")
            .insert({
              id: jobId,
              title: job.title,
              company: job.company,
              link: job.link,
              location: job.location ?? null,
              remote_type: job.remote_type ?? "unknown",
              source: source.source_type,
              ingest_source: source.id,
              ingested_at: seenAtIso,
              source_active: true,
              source_last_seen_at: seenAtIso,
            })
            .select("id")
            .single();

          if (jobErr || !jobRow) continue;

          try {
            for (const profile of profiles ?? []) {
              const result = evaluateJobForClient(
                {
                  title: job.title,
                  company: job.company,
                },
                profile
              );

              if (result.score >= JOB_ASSIGNMENT_THRESHOLD) {
                const { error: assignmentError } = await supabase
                  .from("job_assignments")
                  .insert({
                    job_id: jobRow.id,
                    client_id: profile.client_id,
                    fit_score: result.score,
                    lane: "NEW",
                    status: "pending",
                  })
                  .select()
                  .maybeSingle();

                if (assignmentError) {
                  const maybeCode = (assignmentError as { code?: unknown }).code;
                  if (maybeCode !== "23505") {
                    console.error("[INGEST][scoring][assign][ERROR]", assignmentError);
                  }
                }
              }
            }
          } catch (scoringError) {
            console.error("[INGEST][scoring][ERROR]", scoringError);
          }

          const { data: clientMapping, error: clientMappingError } = await supabase
            .from("clients")
            .select("auth_user_id")
            .eq("id", source.client_id)
            .maybeSingle();

          if (clientMappingError) {
            return NextResponse.json(
              { ok: false, error: clientMappingError.message ?? "Failed to load client mapping" },
              { status: 500 }
            );
          }

          const clientUuid =
            clientMapping && typeof clientMapping.auth_user_id === "string"
              ? clientMapping.auth_user_id
              : null;

          if (!clientUuid) {
            return NextResponse.json(
              { ok: false, error: "client not mapped to auth_user_id" },
              { status: 400 }
            );
          }

          const { error: eventErr } = await supabase
            .from("job_ingestion_events")
            .insert({
              client_id: source.client_id,
              client_uuid: clientUuid,
              source_type: source.source_type,
              link: job.link,
              raw_payload: job.raw_payload ?? null,
            });

          if (eventErr) continue;
          insertedCount += 1;
          sourceSummary.inserted += 1;
        }

        const staleIds = existingJobs
          .filter((row) => {
            const link = (row.link ?? "").trim();
            return link.length > 0 && !new Set(links).has(link);
          })
          .map((row) => row.id);

        sourceSummary.archived = await reconcileSourceJobs(existingJobs, links);

        if (staleIds.length > 0) {
          const { error: updateError } = await (supabase as any)
            .from("jobs")
            .update({ source_active: false })
            .in("id", staleIds);

          if (updateError) {
            console.error("[INGEST][reconcile][UPDATE_ERROR]", {
              sourceId: source.id,
              updateError,
              staleIds: staleIds.length,
              seenAtIso,
            });
            sourceSummary.archived = 0;
          }
        }

        sourceSummaries.push(sourceSummary);
      } catch (e: any) {
        errors.push({
          source_id: source.id,
          message: e?.message ?? "Unknown error",
        });
        sourceSummaries.push(sourceSummary);
      }
    }

    return NextResponse.json({
      ok: true,
      inserted: insertedCount,
      fetched: fetchedCount,
      duplicates: duplicateCount,
      source_summaries: sourceSummaries,
      errors,
      fetch_errors: fetchErrors,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unhandled error",
        message: e?.message ?? "Unknown error",
      },
      { status: 500 }
    );
  }
}
