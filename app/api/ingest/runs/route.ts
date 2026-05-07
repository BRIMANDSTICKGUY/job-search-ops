export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type IngestRunRow = {
  id: string;
  source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  job_count: number;
  error_message: string | null;
};

type IngestRunSummary = IngestRunRow & {
  run_count: number;
};

function summarizeRuns(rows: IngestRunRow[]): IngestRunSummary[] {
  const groups = new Map<string, IngestRunRow[]>();

  for (const row of rows) {
    const dayKey = row.started_at.slice(0, 10);
    const key = `${row.source}::${dayKey}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  return Array.from(groups.values())
    .map((group) => {
      const sorted = [...group].sort(
        (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      );
      const latest = sorted[0];
      const hasRunning = group.some((row) => row.status === "running");
      const hasCompleted = group.some((row) => row.status === "completed");
      const latestFailedWithError = sorted.find(
        (row) => row.status === "failed" && row.error_message && row.error_message.trim().length > 0
      );

      return {
        ...latest,
        status: hasRunning ? "running" : hasCompleted ? "completed" : "failed",
        job_count: group.reduce((sum, row) => sum + (row.job_count ?? 0), 0),
        error_message: hasRunning || hasCompleted ? null : latestFailedWithError?.error_message ?? latest.error_message,
        run_count: group.length,
      } satisfies IngestRunSummary;
    })
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .slice(0, 20);
}

export async function GET() {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase env" },
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    await supabase
      .from("ingest_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: "Run marked failed automatically after exceeding the stale running timeout.",
      })
      .eq("status", "running")
      .is("finished_at", null)
      .lt("started_at", staleThreshold);

    const { data, error } = await supabase
      .from("ingest_runs")
      .select("id, source, status, started_at, finished_at, job_count, error_message")
      .order("started_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message || "Failed to load ingest runs" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, runs: summarizeRuns((data ?? []) as IngestRunRow[]) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 }
    );
  }
}
