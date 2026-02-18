import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ingestJob } from "@/lib/ingest/ingestJob";
import { startIngestRun, completeIngestRun, failIngestRun } from "@/lib/ingest/ingestRun";
import { getGreenhouseStubJobs } from "@/lib/scrapers/greenhouseStub";

type ScrapeRunBody = {
  source?: unknown;
  mode?: unknown;
  source_detail?: unknown;
};

export async function POST(req: Request) {
  const adminToken = req.headers.get("x-admin-token");
  const expectedAdminToken = process.env.SCRAPE_ADMIN_TOKEN;

  if (!expectedAdminToken || adminToken !== expectedAdminToken) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: ScrapeRunBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const source = typeof body.source === "string" ? body.source.trim() : "";
  const mode = typeof body.mode === "string" ? body.mode.trim() : "";
  const sourceDetail = typeof body.source_detail === "string" ? body.source_detail.trim() : null;

  if (source !== "greenhouse") {
    if (mode === "live") {
      console.error("[scrape-run:early-exit]", {
        mode,
        source,
        source_detail: sourceDetail,
        reason: "invalid_source",
      });
    }
    return NextResponse.json(
      { ok: false, error: "Invalid source: must be 'greenhouse'" },
      { status: 400 }
    );
  }

  if (mode !== "stub" && mode !== "live") {
    if (mode === "live") {
      console.error("[scrape-run:early-exit]", {
        mode,
        source,
        source_detail: sourceDetail,
        reason: "unsupported_mode",
      });
    }
    return NextResponse.json(
      { ok: false, error: "Invalid mode: must be 'stub' or 'live'" },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: "Server not configured" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.error("[scrape-run:before-ingest]", {
    mode,
    source,
    source_detail: sourceDetail,
  });

  const trigger = mode === "live" ? "scheduled_cron" : "coach_manual_stub";
  const { ingest_run_id: ingestRunId } = await startIngestRun({
    source: "greenhouse",
    metadata: {
      trigger,
      ...(sourceDetail ? { source_detail: sourceDetail } : {}),
    },
    supabase,
  });

  let ingested = 0;
  let duplicates = 0;

  try {
    const jobs = await getGreenhouseStubJobs();

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
        source_detail: sourceDetail ?? trigger,
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

    return NextResponse.json({
      ok: true,
      ingest_run_id: ingestRunId,
      ingested,
      duplicates,
      total: jobs.length,
    });
  } catch (error) {
    await failIngestRun({
      ingest_run_id: ingestRunId,
      error_message: error instanceof Error ? error.message : String(error),
      supabase,
    });

    return NextResponse.json({ ok: false, error: "Unexpected server error" }, { status: 500 });
  }
}
