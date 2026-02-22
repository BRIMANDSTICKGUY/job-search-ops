import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { startIngestRun } from "@/lib/ingest/ingestRun";
import { ingestJob } from "@/lib/ingest/ingestJob"; // Include ingestJob function

export async function POST(req: Request) {
  console.error("[CRON_DIAG][run] ENTER");

  let body: unknown;
  try {
    body = await req.json();
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

  // Step 2: Insert a job (mock data for now)
  const jobData = {
    title: "Sample Job",
    company: "Sample Company",
    link: "https://sample-job-link.com",
    source: "greenhouse",
    created_by_role: "system",
    created_by_id: null,
    ingest_run_id: ingest_run_id,
    raw_payload: { sample: "data" },
  };

  const result = await ingestJob({
    source: "greenhouse",
    title: jobData.title,
    company: jobData.company,
    link: jobData.link,
    created_by_role: jobData.created_by_role,
    created_by_id: jobData.created_by_id,
    ingest_run_id: jobData.ingest_run_id,
    raw_payload: jobData.raw_payload,
    supabase,
  });

  console.error("[CRON_DIAG][run] ingestJob result", result);

  return NextResponse.json({ ok: true, marker: "INGEST_JOB_CREATED", ingest_run_id });
}
