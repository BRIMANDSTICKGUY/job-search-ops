export const runtime = "nodejs";

import { NextResponse } from "next/server";

type CoachIngestBody = {
  mode?: unknown;
  source_detail?: unknown;
};

export async function POST(req: Request) {
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

  const response = await fetch(`${origin}/api/ingest/web`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": scrapeAdminToken,
    },
    body: JSON.stringify({
      source: "all_active_sources",
      mode: "live",
      source_detail:
        typeof body.source_detail === "string" && body.source_detail.trim().length > 0
          ? body.source_detail.trim()
          : "coach_manual_trigger",
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({ ok: false, error: "Live ingest failed" }));
  return NextResponse.json(payload, { status: response.status });
}