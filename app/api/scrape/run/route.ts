import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serializeIngestError, startIngestRun } from "@/lib/ingest/ingestRun";
import { ingestJob } from "@/lib/ingest/ingestJob";
import { getGreenhouseStubJobs } from "@/lib/scrapers/greenhouseStub";

type ScrapeRunBody = {
  mode?: unknown;
  jobs?: unknown[];
};

export async function POST(req: Request) {
  console.error("[CRON_DIAG][run] ENTER");

  let body: ScrapeRunBody;
  try {
    body = (await req.json()) as ScrapeRunBody;
    console.error("[CRON_DIAG][run] JSON OK");
  } catch (e) {
    console.error("[CRON_DIAG][run] JSON FAIL", e);
    return NextResponse.json({ ok: false, step: "json" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.error("[CRON_DIAG][run] ENV CHECK", { has_url: !!supabaseUrl, has_service_key: !!serviceRoleKey });

  const supabase = createClient(supabaseUrl!, serviceRoleKey!);
  console.error("[CRON_DIAG][run] Supabase Client Initialized");

  // Step 1: Create Ingest Run
  const { ingest_run_id } = await startIngestRun({
    source: "greenhouse",
    metadata: { trigger: "diag_test" },
    supabase,
  });
  console.error("[CRON_DIAG][run] startIngestRun OK", { ingest_run_id });

  let jobs = Array.isArray(body.jobs) ? body.jobs : null;

  if (body.mode === "stub") {
    jobs = await getGreenhouseStubJobs();
  }

  if (!Array.isArray(jobs)) {
    return NextResponse.json({ ok: false, step: "jobs" }, { status: 400 });
  }

  let ingested = 0;
  try {
    for (const job of jobs) {
      const result = await ingestJob({
        source: "greenhouse",
        title: String((job as { title?: unknown }).title ?? ""),
        company: String((job as { company?: unknown }).company ?? ""),
        link: (job as { link?: string | null }).link ?? null,
        created_by_role: "system",
        created_by_id: null,
        ingest_run_id,
        raw_payload: (job as { raw_payload?: unknown }).raw_payload ?? job,
        supabase,
      });

      if (result.ok) {
        ingested += 1;
      }
    }

    await supabase
      .from("ingest_runs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        job_count: ingested,
        error_message: null,
      })
      .eq("id", ingest_run_id);

    return NextResponse.json({ ok: true, ingest_run_id, ingested });
  } catch (err) {
    const errorString = serializeIngestError(err);

    await supabase
      .from("ingest_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: errorString,
        job_count: ingested,
      })
      .eq("id", ingest_run_id);

    return NextResponse.json(
      { ok: false, ingest_run_id, step: "run", error: errorString },
      { status: 500 }
    );
  }
}
