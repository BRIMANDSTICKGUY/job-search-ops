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
  let lastStep = "[CRON_DIAG][run][00] Init";
  let ingestRunId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

  try {
    lastStep = "[CRON_DIAG][run][01] Enter handler";
    console.error(lastStep);

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

    supabase = createClient(supabaseUrl, serviceRoleKey);

    console.error("[scrape-run:before-ingest]", {
      mode,
      source,
      source_detail: sourceDetail,
    });

    const trigger = mode === "live" ? "scheduled_cron" : "coach_manual_stub";

    lastStep = "[CRON_DIAG][run][02] startIngestRun START";
    console.error(lastStep);
    const { ingest_run_id: startedIngestRunId } = await startIngestRun({
      source: "greenhouse",
      metadata: {
        trigger,
        ...(sourceDetail ? { source_detail: sourceDetail } : {}),
      },
      supabase,
    });
    ingestRunId = startedIngestRunId;
    lastStep = "[CRON_DIAG][run][02] startIngestRun DONE";
    console.error(lastStep, { ingest_run_id: ingestRunId });

    let ingested = 0;
    let duplicates = 0;

    const jobs = await getGreenhouseStubJobs();

    for (const job of jobs) {
      const jobIdentifier =
        (job.raw &&
        typeof job.raw === "object" &&
        "source_identifier" in job.raw &&
        typeof (job.raw as { source_identifier?: unknown }).source_identifier === "string"
          ? (job.raw as { source_identifier: string }).source_identifier
          : null) ??
        job.link ??
        job.title;

      lastStep = "[CRON_DIAG][run][job] ingestJob START";
      console.error(lastStep, { job_identifier: jobIdentifier });
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
      lastStep = "[CRON_DIAG][run][job] ingestJob DONE";
      console.error(lastStep, {
        job_identifier: jobIdentifier,
        ok: result.ok,
        reason: result.ok ? null : result.reason,
      });

      if (result.ok) {
        ingested += 1;
        continue;
      }

      if (result.reason === "duplicate") {
        duplicates += 1;
      }
    }

    lastStep = "[CRON_DIAG][run][03] completeIngestRun START";
    console.error(lastStep);
    await completeIngestRun({
      ingest_run_id: ingestRunId,
      job_count: ingested,
      supabase,
    });
    lastStep = "[CRON_DIAG][run][03] completeIngestRun DONE";
    console.error(lastStep, { ingest_run_id: ingestRunId });

    return NextResponse.json({
      ok: true,
      ingest_run_id: ingestRunId,
      ingested,
      duplicates,
      total: jobs.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const cause =
      error instanceof Error && "cause" in error
        ? (error as Error & { cause?: unknown }).cause
        : undefined;
    const supabaseLike = error as { code?: unknown; details?: unknown; hint?: unknown };

    console.error("[CRON_DIAG][run][ERR] message", message);
    console.error("[CRON_DIAG][run][ERR] stack", stack);
    console.error("[CRON_DIAG][run][ERR] cause", cause);
    if (
      typeof supabaseLike.code === "string" ||
      typeof supabaseLike.details === "string" ||
      typeof supabaseLike.hint === "string"
    ) {
      console.error("[CRON_DIAG][run][ERR] supabase", {
        code: supabaseLike.code,
        details: supabaseLike.details,
        hint: supabaseLike.hint,
      });
    }

    if (ingestRunId && supabase) {
      await failIngestRun({
        ingest_run_id: ingestRunId,
        error_message: message,
        supabase,
      });
    }

    return NextResponse.json({ ok: false, error: message, step: lastStep }, { status: 500 });
  }
}
