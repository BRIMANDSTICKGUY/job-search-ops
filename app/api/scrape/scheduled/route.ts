export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { deny } from "@/lib/api/guard";

type ScrapeRunResponse = {
  ok?: boolean;
  error?: string;
  ingest_run_id?: string;
  total?: number;
  ingested?: number;
  duplicates?: number;
};

export async function POST(req: Request) {
  try {
    const isVercelCron = req.headers.get("x-vercel-cron") === "1";
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");

    if (!isVercelCron && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
      return deny(req, "Unauthorized cron request", 401);
    }

    if (process.env.SCRAPERS_ENABLED !== "true") {
      return deny(req, "Scrapers disabled", 503);
    }

    if (process.env.INGEST_DISABLED === "true") {
      return deny(req, "Ingest temporarily disabled", 503);
    }

    const scrapeAdminToken = process.env.SCRAPE_ADMIN_TOKEN;
    if (!scrapeAdminToken) {
      return deny(req, "Server misconfiguration", 500);
    }

    const origin = new URL(req.url).origin;

    const response = await fetch(`${origin}/api/scrape/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": scrapeAdminToken,
      },
      body: JSON.stringify({
        source: "greenhouse",
        mode: "live",
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
  } catch (error) {
    console.error("[scheduled:fatal]", error);
    return deny(req, "Unexpected server error", 500);
  }
}

export async function GET(req: Request) {
  return POST(req);
}
