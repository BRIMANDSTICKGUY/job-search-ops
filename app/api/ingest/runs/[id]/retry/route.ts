export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ingestJob } from "@/lib/ingest/ingestJob";
import { startIngestRun, completeIngestRun, failIngestRun } from "@/lib/ingest/ingestRun";
import { getGreenhouseStubJobs } from "@/lib/scrapers/greenhouseStub";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

type IngestRunRow = {
  id: string;
  source: string;
  status: "running" | "completed" | "failed";
  metadata: unknown;
};

export async function POST(_req: Request, context: RouteContext) {
  try {
    const resolvedParams = await context.params;
    const id = resolvedParams?.id?.trim();

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Run not found or not retryable" },
        { status: 400 }
      );
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: run, error: runError } = await supabase
      .from("ingest_runs")
      .select("id, source, status, metadata")
      .eq("id", id)
      .single();

    if (runError || !run) {
      return NextResponse.json(
        { ok: false, error: "Run not found or not retryable" },
        { status: 400 }
      );
    }

    const typedRun = run as IngestRunRow;
    if (typedRun.status !== "failed") {
      return NextResponse.json(
        { ok: false, error: "Run not found or not retryable" },
        { status: 400 }
      );
    }

    if (typedRun.source !== "greenhouse") {
      return NextResponse.json(
        { ok: false, error: "Run not found or not retryable" },
        { status: 400 }
      );
    }

    const { ingest_run_id: newRunId } = await startIngestRun({
      source: typedRun.source,
      metadata: { retry_of: id },
      supabase,
    });

    let runClosed = false;

    try {
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
          ingest_run_id: newRunId,
          raw_payload: job.raw ?? job,
          source_detail: "greenhouse_stub",
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
        ingest_run_id: newRunId,
        job_count: ingested,
        supabase,
      });
      runClosed = true;

      return NextResponse.json({
        ok: true,
        new_run_id: newRunId,
        total: jobs.length,
        ingested,
        duplicates,
      });
    } catch (error) {
      if (!runClosed) {
        await failIngestRun({
          ingest_run_id: newRunId,
          error_message: error instanceof Error ? error.message : String(error),
          supabase,
        });
      }
      return NextResponse.json(
        { ok: false, error: "Unexpected server error" },
        { status: 500 }
      );
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Unexpected server error" }, { status: 500 });
  }
}
