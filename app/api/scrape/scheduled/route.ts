export const runtime = "nodejs";

import { NextResponse } from "next/server";

type ScrapeRunResponse = {
  ok?: boolean;
  error?: string;
  ingest_run_id?: string;
  total?: number;
  ingested?: number;
  duplicates?: number;
};

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return errorResponse("Unauthorized", 401);
  }

  if (process.env.SCRAPERS_ENABLED !== "true") {
    return errorResponse("Scrapers disabled", 503);
  }

  if (process.env.INGEST_DISABLED === "true") {
    return errorResponse("Ingest temporarily disabled", 503);
  }

  const scrapeAdminToken = process.env.SCRAPE_ADMIN_TOKEN;
  if (!scrapeAdminToken) {
    return errorResponse("Server misconfiguration", 500);
  }

  const origin = new URL(req.url).origin;

  try {
    const response = await fetch(`${origin}/api/scrape/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": scrapeAdminToken,
      },
      body: JSON.stringify({
        source: "greenhouse",
        mode: "stub",
        source_detail: "scheduled_cron",
      }),
      cache: "no-store",
    });

    const payload = (await response.json()) as ScrapeRunResponse;

    if (!response.ok || payload.ok !== true) {
      return NextResponse.json(
        { ok: false, error: payload.error ?? "Scheduled scrape failed" },
        { status: response.status || 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      ingest_run_id: payload.ingest_run_id,
      total: payload.total,
      ingested: payload.ingested,
      duplicates: payload.duplicates,
    });
  } catch {
    return errorResponse("Unexpected server error", 500);
  }
}
