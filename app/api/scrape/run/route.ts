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

  const now = new Date().toISOString();

  console.error("[scrape-run:before-insert]", {
    mode,
    source,
    source_detail: sourceDetail,
  });

  const { error } = await supabase.from("ingest_runs").insert({
    source: "greenhouse",
    status: "completed",
    job_count: 3,
    error_message: null,
    started_at: now,
    finished_at: now,
    metadata: { trigger: mode === "live" ? "scheduled_cron" : "coach_manual_stub" },
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Failed to insert ingest run" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ingested: 3, total: 3 });
}
