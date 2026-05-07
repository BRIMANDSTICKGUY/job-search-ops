export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

function getUtcDayBounds(value: string) {
  const parsed = new Date(value);
  const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const resolvedParams = await context.params;
    const id = resolvedParams?.id?.trim();

    if (!id) {
      return NextResponse.json({ ok: false, error: "Run not found" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: run, error: runError } = await supabase
      .from("ingest_runs")
      .select("id, source, started_at")
      .eq("id", id)
      .single();

    if (runError || !run) {
      return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
    }

    const { startIso, endIso } = getUtcDayBounds(run.started_at);

    const { data: deletedRows, error: deleteError } = await supabase
      .from("ingest_runs")
      .delete()
      .eq("source", run.source)
      .gte("started_at", startIso)
      .lt("started_at", endIso)
      .select("id");

    if (deleteError) {
      return NextResponse.json({ ok: false, error: deleteError.message || "Failed to delete ingest run" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deleted_count: deletedRows?.length ?? 0,
      source: run.source,
      day: startIso.slice(0, 10),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    );
  }
}