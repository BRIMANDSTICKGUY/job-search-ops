export const runtime = "nodejs";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ingestJob } from "@/lib/ingest/ingestJob";
import { startIngestRun, completeIngestRun, failIngestRun, serializeIngestError } from "@/lib/ingest/ingestRun";
import { runGreenhouseStub } from "@/lib/scrapers/greenhouseStub";

type RouterIngestBody = {
  source?: unknown;
  title?: unknown;
  company?: unknown;
  action?: unknown;
  link?: unknown;
  created_by_role?: unknown;
  created_by_id?: unknown;
  source_detail?: unknown;
  raw_payload?: unknown;
};

type CreatedByRole = "coach" | "client" | "system";
const ALLOWED_SOURCES = ["manual", "greenhouse", "lever", "ashby", "workday", "smartrecruiters"] as const;
const SOURCE_LIMITS = {
  manual: { per_minute: 20, per_hour: 200 },
  greenhouse: { per_minute: 60, per_hour: 1000 },
  lever: { per_minute: 60, per_hour: 1000 },
  ashby: { per_minute: 60, per_hour: 1000 },
  workday: { per_minute: 60, per_hour: 1000 },
  smartrecruiters: { per_minute: 60, per_hour: 1000 },
} as const;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isCreatedByRole(value: unknown): value is CreatedByRole {
  return value === "coach" || value === "client" || value === "system";
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Ingest router missing Supabase env", {
      request_id: requestId,
      source: null,
      title: null,
      company: null,
    });
    return errorResponse("Server misconfiguration", 500);
  }

  let body: RouterIngestBody;
  try {
    body = (await req.json()) as RouterIngestBody;
  } catch {
    console.error("Ingest router invalid JSON", {
      request_id: requestId,
      source: null,
      title: null,
      company: null,
    });
    return errorResponse("Invalid JSON body", 400);
  }

  const source = typeof body.source === "string" ? body.source.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : "";
  const action = body.action === "run_stub" ? "run_stub" : undefined;

  if (!source || !title || !company) {
    return errorResponse("Missing required fields: source, title, company", 400);
  }

  if (action === "run_stub" && source !== "greenhouse") {
    return errorResponse("run_stub action is only allowed for greenhouse source", 400);
  }

  if (!ALLOWED_SOURCES.includes(source as (typeof ALLOWED_SOURCES)[number])) {
    return errorResponse("Source not allowed", 403);
  }

  if (process.env.INGEST_DISABLED === "true") {
    console.warn("Ingest router blocked by kill switch", {
      request_id: requestId,
      source,
      title,
      company,
    });
    return errorResponse("Ingest temporarily disabled", 503);
  }

  if (action === "run_stub" && process.env.SCRAPERS_ENABLED !== "true") {
    console.warn("Ingest router blocked: scrapers disabled", {
      request_id: requestId,
      source,
      title,
      company,
    });
    return errorResponse("Scrapers disabled", 503);
  }

  const link =
    body.link === null
      ? null
      : typeof body.link === "string"
        ? body.link.trim() || null
        : undefined;

  if (body.link !== undefined && link === undefined) {
    return errorResponse("Invalid field: link must be string or null", 400);
  }

  const createdByRole: CreatedByRole = isCreatedByRole(body.created_by_role)
    ? body.created_by_role
    : "system";

  const createdById =
    body.created_by_id === null
      ? null
      : typeof body.created_by_id === "string"
        ? body.created_by_id
        : body.created_by_id === undefined
          ? null
          : undefined;

  if (createdById === undefined) {
    return errorResponse("Invalid field: created_by_id must be string or null", 400);
  }

  const sourceDetail =
    body.source_detail === undefined
      ? undefined
      : typeof body.source_detail === "string"
        ? body.source_detail
        : undefined;

  if (body.source_detail !== undefined && sourceDetail === undefined) {
    return errorResponse("Invalid field: source_detail must be string", 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.info("Ingest router request started", {
    request_id: requestId,
    source,
    title,
    company,
  });

  let ingestRunId: string | null = null;
  let jobCount = 0;

  try {
    const sourceKey = source as keyof typeof SOURCE_LIMITS;
    const sourceLimits = SOURCE_LIMITS[sourceKey];
    const oneMinuteAgoIso = new Date(Date.now() - 60_000).toISOString();
    const oneHourAgoIso = new Date(Date.now() - 60 * 60_000).toISOString();

    const { count: minuteCount, error: minuteCountError } = await supabase
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("source", source)
      .gte("created_at", oneMinuteAgoIso);

    if (minuteCountError) {
      console.error("Ingest router rate limit minute query failed", {
        request_id: requestId,
        source,
        title,
        company,
        error: minuteCountError,
      });
      return errorResponse("Unexpected server error", 500);
    }

    if ((minuteCount ?? 0) >= sourceLimits.per_minute) {
      console.warn("Ingest router rate limit exceeded", {
        request_id: requestId,
        source,
        title,
        company,
        window: "per_minute",
        limit: sourceLimits.per_minute,
      });
      return errorResponse("Rate limit exceeded (per minute)", 429);
    }

    const { count: hourCount, error: hourCountError } = await supabase
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("source", source)
      .gte("created_at", oneHourAgoIso);

    if (hourCountError) {
      console.error("Ingest router rate limit hour query failed", {
        request_id: requestId,
        source,
        title,
        company,
        error: hourCountError,
      });
      return errorResponse("Unexpected server error", 500);
    }

    if ((hourCount ?? 0) >= sourceLimits.per_hour) {
      console.warn("Ingest router rate limit exceeded", {
        request_id: requestId,
        source,
        title,
        company,
        window: "per_hour",
        limit: sourceLimits.per_hour,
      });
      return errorResponse("Rate limit exceeded (per hour)", 429);
    }

    const ingestRun = await startIngestRun({
      source,
      metadata: { request_id: requestId },
      supabase,
    });
    ingestRunId = ingestRun.ingest_run_id;

    if (source === "greenhouse" && action === "run_stub") {
      const stubResult = await runGreenhouseStub({
        company,
        supabase,
      });

      jobCount = stubResult.ingested;
      await completeIngestRun({
        ingest_run_id: ingestRunId,
        job_count: jobCount,
        supabase,
      });

      return NextResponse.json({
        ok: true,
        mode: "stub",
        attempted: stubResult.attempted,
        ingested: stubResult.ingested,
        duplicates: stubResult.duplicates,
      });
    }

    const result = await ingestJob({
      source,
      title,
      company,
      link: link ?? null,
      created_by_role: createdByRole,
      created_by_id: createdById,
      ingest_run_id: ingestRunId,
      raw_payload: body.raw_payload,
      source_detail: sourceDetail,
      supabase,
    });

    if (!result.duplicate) {
      jobCount += 1;
    }

    await completeIngestRun({
      ingest_run_id: ingestRunId,
      job_count: jobCount,
      supabase,
    });

    console.info("Ingest router succeeded", {
      request_id: requestId,
      source,
      title,
      company,
      job_id: result.job_id,
    });
    return NextResponse.json({ ok: true, id: result.job_id });
  } catch (error) {
    if (ingestRunId) {
      try {
        await failIngestRun({
          ingest_run_id: ingestRunId,
          error_message: serializeIngestError(error),
          supabase,
        });
      } catch (failError) {
        console.error("Ingest router failed to close ingest run", {
          request_id: requestId,
          source,
          title,
          company,
          ingest_run_id: ingestRunId,
          error: failError,
        });
      }
    }

    console.error("Ingest router failed", {
      request_id: requestId,
      source,
      title,
      company,
      error,
    });
    return errorResponse("Unexpected server error", 500);
  }
}
