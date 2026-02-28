export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { JobSourceType } from "@/app/types";

type IngestionSource = {
  id: string;
  client_id: string | null;
  source_type: JobSourceType;
  source_url: string | null;
  active: boolean;
};

type NormalizedJob = {
  title: string;
  company: string;
  location: string | null;
  link: string | null;
  source_type: IngestionSource["source_type"];
  source_url: string | null;
  raw_payload: unknown;
};

type FetchError = {
  source_type: IngestionSource["source_type"];
  source_url: string | null;
  message: string;
};

type HardenedFetchResult =
  | { ok: true; res: Response }
  | { ok: false; errorMessage: string };

function isValidSourceUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

function extractCompanySlug(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.hostname.includes("greenhouse.io")) {
      const idx = parts.findIndex((p) => p === "boards" || p === "boards-api.greenhouse.io");
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      return parts[0] ?? null;
    }
    if (url.hostname.includes("lever.co")) return parts[0] ?? null;
    if (url.hostname.includes("ashbyhq.com")) return parts[0] ?? null;
    return parts[0] ?? null;
  } catch {
    return null;
  }
}

function companyFromSource(source: IngestionSource): string {
  const slug = extractCompanySlug(source.source_url);
  if (slug) return slug.replace(/[-_]/g, " ");
  return "Unknown";
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
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, errorMessage: message || "Fetch failed" };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchGreenhouse(
  source: IngestionSource,
  fetchErrors: FetchError[]
): Promise<NormalizedJob[]> {
  const sourceUrl = source.source_url;
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
  const sourceUrl = source.source_url;
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
  const sourceUrl = source.source_url;
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
    default:
      return [];
  }
}

async function fetchExistingLinks(
  supabase: ReturnType<typeof createClient>,
  links: string[]
): Promise<Set<string>> {
  if (links.length === 0) return new Set();
  const { data, error } = await supabase
    .from("jobs")
    .select("link")
    .in("link", links);
  if (error || !data) return new Set();
  return new Set((data as any[]).map((d) => d.link).filter(Boolean) as string[]);
}

export async function POST() {
  try {
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
      .select("id,client_id,source_type,source_url,active")
      .eq("active", true);

    if (error || !sources) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Failed to load ingestion sources" },
        { status: 500 }
      );
    }

    let insertedCount = 0;
    const errors: Array<{ source_id: string; message: string }> = [];
    const fetchErrors: FetchError[] = [];

    for (const source of sources as any[]) {
      try {
        const normalized = await fetchJobsForSource(source, fetchErrors);
        const links = normalized.map((j) => j.link).filter(Boolean) as string[];
        const existing = await fetchExistingLinks(supabase, links);

        for (const job of normalized) {
          if (job.link && existing.has(job.link)) continue;

          const { data: jobRow, error: jobErr } = await supabase
            .from("jobs")
            .insert({
              title: job.title,
              company: job.company,
              link: job.link,
              location: job.location,
              lane: "INBOX",
              status: "new",
              client_id: source.client_id,
            })
            .select("id")
            .single();

          if (jobErr || !jobRow) continue;

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
        }
      } catch (e: any) {
        errors.push({
          source_id: source.id,
          message: e?.message ?? "Unknown error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      inserted: insertedCount,
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
