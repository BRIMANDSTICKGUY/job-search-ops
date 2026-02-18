import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  if (source !== "greenhouse") {
    return NextResponse.json(
      { ok: false, error: "Invalid source: must be 'greenhouse'" },
      { status: 400 }
    );
  }

  if (mode !== "stub") {
    return NextResponse.json(
      { ok: false, error: "Only stub mode is supported" },
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

  const now = new Date().toISOString();

  const { error } = await supabase.from("ingest_runs").insert({
    source: "greenhouse",
    status: "completed",
    job_count: 3,
    error_message: null,
    started_at: now,
    finished_at: now,
    metadata: { trigger: "coach_manual_stub" },
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Failed to insert ingest run" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ingested: 3, total: 3 });
}
