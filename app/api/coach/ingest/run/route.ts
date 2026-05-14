export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getCoachSupabase } from "@/lib/supabase/coach";
import { failIngestRun, serializeIngestError, startIngestRun } from "@/lib/ingest/ingestRun";
import { getCoachSession } from "@/lib/auth/coach";

type CoachIngestBody = {
  mode?: unknown;
  source_detail?: unknown;
};

type LiveIngestPayload = {
  ok?: boolean;
  error?: string;
  inserted?: number;
  fetched?: number;
  duplicates?: number;
  source_summaries?: unknown;
  errors?: unknown;
  fetch_errors?: unknown;
};

export async function POST(req: Request) {
  const { user, isCoach } = await getCoachSession(req);

  if (!user || !isCoach) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: CoachIngestBody;

  try {
    body = (await req.json()) as CoachIngestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode === "stub" ? "stub" : body.mode === "live" ? "live" : null;
  if (!mode) {
    return NextResponse.json({ ok: false, error: "Invalid mode" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;

  if (mode === "stub") {
    const response = await fetch(`${origin}/api/scrape/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source: "greenhouse",
        mode: "stub",
        source_detail:
          typeof body.source_detail === "string" && body.source_detail.trim().length > 0
            ? body.source_detail.trim()
            : "coach_manual_trigger",
      }),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({ ok: false, error: "Stub ingest failed" }));
    return NextResponse.json(payload, { status: response.status });
  }

  const scrapeAdminToken = process.env.SCRAPE_ADMIN_TOKEN;
  if (!scrapeAdminToken) {
    return NextResponse.json({ ok: false, error: "Server misconfiguration" }, { status: 500 });
  }

  const supabase = getCoachSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Server misconfiguration" }, { status: 500 });
  }

  const sourceDetail =
    typeof body.source_detail === "string" && body.source_detail.trim().length > 0
      ? body.source_detail.trim()
      : "coach_manual_trigger";

  const { ingest_run_id } = await startIngestRun({
    source: "live_sources",
    metadata: {
      mode: "live",
      source_detail: sourceDetail,
      trigger: "coach_manual_trigger",
    },
    supabase,
  });

  const response = await fetch(`${origin}/api/ingest/web`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": scrapeAdminToken,
    },
    body: JSON.stringify({
      source: "all_active_sources",
      mode: "live",
      source_detail: sourceDetail,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({ ok: false, error: "Live ingest failed" }))) as LiveIngestPayload;

  if (!response.ok || payload.ok !== true) {
    await failIngestRun({
      ingest_run_id,
      error_message: payload.error ?? "Live ingest failed",
      supabase,
    });

    await (supabase as any)
      .from("ingest_runs")
      .update({
        metadata: {
          mode: "live",
          source_detail: sourceDetail,
          trigger: "coach_manual_trigger",
          fetched: payload.fetched ?? 0,
          inserted: payload.inserted ?? 0,
          duplicates: payload.duplicates ?? 0,
          source_summaries: payload.source_summaries ?? [],
          errors: payload.errors ?? [],
          fetch_errors: payload.fetch_errors ?? [],
        },
      })
      .eq("id", ingest_run_id);

    return NextResponse.json(payload, { status: response.status });
  }

  const archived = Array.isArray(payload.source_summaries)
    ? payload.source_summaries.reduce((sum, summary) => {
        if (!summary || typeof summary !== "object") return sum;
        const value = (summary as { archived?: unknown }).archived;
        return sum + (typeof value === "number" ? value : 0);
      }, 0)
    : 0;

  const { error: completeError } = await (supabase as any)
    .from("ingest_runs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      job_count: payload.inserted ?? 0,
      error_message: null,
      metadata: {
        mode: "live",
        source_detail: sourceDetail,
        trigger: "coach_manual_trigger",
        fetched: payload.fetched ?? 0,
        inserted: payload.inserted ?? 0,
        duplicates: payload.duplicates ?? 0,
        archived,
        source_summaries: payload.source_summaries ?? [],
        errors: payload.errors ?? [],
        fetch_errors: payload.fetch_errors ?? [],
      },
    })
    .eq("id", ingest_run_id);

  if (completeError) {
    await failIngestRun({
      ingest_run_id,
      error_message: serializeIngestError(completeError),
      supabase,
    });
    return NextResponse.json(
      { ok: false, error: serializeIngestError(completeError) },
      { status: 500 }
    );
  }

  return NextResponse.json(payload, { status: response.status });
}