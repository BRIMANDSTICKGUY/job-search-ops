export const runtime = "nodejs";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ingestJob } from "@/lib/ingest/ingestJob";
import { completeIngestRun, failIngestRun, startIngestRun } from "@/lib/ingest/ingestRun";
import { getGreenhouseStubJobs } from "@/lib/scrapers/greenhouseStub";

type ScrapeRunBody = {
  source?: unknown;
  mode?: unknown;
  source_detail?: unknown;
};

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  const adminToken = req.headers.get("x-admin-token");
  const expectedAdminToken = process.env.SCRAPE_ADMIN_TOKEN;
  if (!expectedAdminToken || adminToken !== expectedAdminToken) {
    return errorResponse("Unauthorized", 401);
  }

  if (process.env.SCRAPERS_ENABLED !== "true") {
    return errorResponse("Scrapers disabled", 503);
  }

  if (process.env.INGEST_DISABLED === "true") {
    return errorResponse("Ingest temporarily disabled", 503);
  }

  let body: ScrapeRunBody;
  try {
    body = (await req.json()) as ScrapeRunBody;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const source = typeof body.source === "string" ? body.source.trim() : "";
  const mode = typeof body.mode === "string" ? body.mode.trim() : "";
  const sourceDetail =
    body.source_detail === undefined
      ? undefined
      : typeof body.source_detail === "string"
        ? body.source_detail.trim()
        : null;

  if (source !== "greenhouse") {
    return errorResponse("Invalid source: must be 'greenhouse'", 400);
  }

  if (mode !== "stub") {
    return errorResponse("Invalid mode: must be 'stub'", 400);
  }

  if (sourceDetail === null) {
    return errorResponse("Invalid source_detail: must be a string", 400);
  }

  console.info("Scrape run request started", {
    request_id: requestId,
    source,
    mode,
    source_detail: sourceDetail ?? null,
  });

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return errorResponse("Server misconfiguration", 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let ingestRunId: string | null = null;

  try {
    const ingestRun = await startIngestRun({
      source: "greenhouse",
      metadata: {
        request_id: requestId,
        mode: "stub",
        source_detail: sourceDetail ?? null,
      },
      supabase,
    });
    ingestRunId = ingestRun.ingest_run_id;

    console.info("Scrape run started", {
      request_id: requestId,
      ingest_run_id: ingestRunId,
    });

    const jobs = await getGreenhouseStubJobs();
    let ingested = 0;
    let duplicates = 0;

    for (const job of jobs) {
      const result = await ingestJob({
        source: "greenhouse",
        title: job.title,
        company: job.company,
        link: job.link ?? null,
        created_by_role: "system",
        created_by_id: null,
        ingest_run_id: ingestRunId,
        raw_payload: job.raw ?? job,
        source_detail: sourceDetail ?? "greenhouse_stub",
        supabase,
      });

      if (result.ok) {
        ingested += 1;
        continue;
      }

      if (result.reason === "duplicate") {
        duplicates += 1;
      }
    }

    await completeIngestRun({
      ingest_run_id: ingestRunId,
      job_count: ingested,
      supabase,
    });

    console.info("Scrape run completed", {
      request_id: requestId,
      ingest_run_id: ingestRunId,
      total: jobs.length,
      ingested,
      duplicates,
    });

    return NextResponse.json({
      ok: true,
      ingest_run_id: ingestRunId,
      total: jobs.length,
      ingested,
      duplicates,
    });
  } catch (error) {
    if (ingestRunId) {
      try {
        await failIngestRun({
          ingest_run_id: ingestRunId,
          error_message: error instanceof Error ? error.message : String(error),
          supabase,
        });
      } catch {}
    }

    console.error("Scrape run failed", {
      request_id: requestId,
      ingest_run_id: ingestRunId,
      error,
    });

    return errorResponse("Unexpected server error", 500);
  }
}
