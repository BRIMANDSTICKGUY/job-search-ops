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

function truncate(value: string, max = 2000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...<truncated>`;
}

function safeJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isAuthorizedCron(req: Request): boolean {
  // 1) Vercel Cron header (when present)
  const xVercelCron = req.headers.get("x-vercel-cron");
  if (xVercelCron === "1") return true;

  // 2) Vercel Cron user-agent (reliable signal)
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  if (ua.includes("vercel-cron")) return true;

  // 3) Manual auth via CRON_SECRET bearer
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  // 4) Manual auth via Vercel protection bypass secret (same secret you already use)
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const bypassHeader = req.headers.get("x-vercel-protection-bypass");
  if (bypassSecret && bypassHeader === bypassSecret) return true;

  return false;
}

export async function POST(req: Request) {
  let lastStep = "[CRON_DIAG][scheduled][00] Init";
  try {
    lastStep = "[CRON_DIAG][scheduled][01] Enter handler";
    console.error(lastStep);

    if (!isAuthorizedCron(req)) {
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

    lastStep = "[CRON_DIAG][scheduled][02] Cron auth passed";
    console.error(lastStep);

    const origin = new URL(req.url).origin;

    lastStep = "[CRON_DIAG][scheduled][03] delegate ingest to run route";
    console.error(lastStep);
    lastStep = "[CRON_DIAG][scheduled][04] delegation acknowledged";
    console.error(lastStep, { ingest_run_id: null, note: "delegated_to_run_route" });

    lastStep = "[CRON_DIAG][scheduled][05] fetch /api/scrape/run START";
    console.error(lastStep, { url: `${origin}/api/scrape/run` });

    const vercelAutomationBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

    const runHeaders: Record<string, string> = {
      "content-type": "application/json",
      "x-admin-token": scrapeAdminToken,
    };

    if (vercelAutomationBypassSecret) {
      runHeaders["x-vercel-protection-bypass"] = vercelAutomationBypassSecret;
      console.error("[CRON_DIAG][scheduled][AUTH] bypass_header_branch", { branch: "with_bypass" });
    } else {
      console.error("[CRON_DIAG][scheduled][AUTH] bypass_header_branch", { branch: "without_bypass" });
    }

    const response = await fetch(`${origin}/api/ingest/web`, {
      method: "POST",
      headers: runHeaders,
      body: JSON.stringify({
        source: "greenhouse",
        mode: "live",
        source_detail: "scheduled_cron",
      }),
      cache: "no-store",
    });

    const responseText = await response.text();
    const payload = safeJson<ScrapeRunResponse>(responseText) ?? {};

    lastStep = "[CRON_DIAG][scheduled][06] fetch /api/scrape/run DONE";
    console.error(lastStep, {
      status: response.status,
      body: truncate(responseText, 2000),
    });

    if (!response.ok || payload.ok !== true) {
      console.error("[CRON_DIAG][scheduled][06] fetch failure branch", {
        responseOk: response.ok,
        payloadOk: payload.ok,
        status: response.status,
        payload,
      });
      return NextResponse.json(
        { ok: false, error: payload.error ?? "Scheduled scrape failed" },
        { status: response.status || 500 }
      );
    }

    lastStep = "[CRON_DIAG][scheduled][09] Return OK";
    console.error(lastStep);

    return NextResponse.json({
      ok: true,
      ingest_run_id: payload.ingest_run_id,
      total: payload.total,
      ingested: payload.ingested,
      duplicates: payload.duplicates,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const cause =
      error instanceof Error && "cause" in error
        ? (error as Error & { cause?: unknown }).cause
        : undefined;
    const supabaseLike = error as { code?: unknown; details?: unknown; hint?: unknown };

    console.error("[CRON_DIAG][scheduled][ERR] message", message);
    console.error("[CRON_DIAG][scheduled][ERR] stack", stack);
    console.error("[CRON_DIAG][scheduled][ERR] cause", cause);

    if (
      typeof supabaseLike.code === "string" ||
      typeof supabaseLike.details === "string" ||
      typeof supabaseLike.hint === "string"
    ) {
      console.error("[CRON_DIAG][scheduled][ERR] supabase", {
        code: supabaseLike.code,
        details: supabaseLike.details,
        hint: supabaseLike.hint,
      });
    }

    return NextResponse.json({ ok: false, error: message, step: lastStep }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
