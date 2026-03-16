export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AssignmentRow = {
  job_id: string | null;
};

const JOB_SELECT_FIELDS = "id, title, company, source, created_at, client_status, link";

function parseBearerToken(authorization: string | null): string {
  if (!authorization) return "";
  if (!authorization.startsWith("Bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}

export async function GET(req: NextRequest) {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase env" },
        { status: 500 }
      );
    }

    const accessToken = parseBearerToken(req.headers.get("authorization"));

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if ((userError || !user) && process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: assignments, error: assignmentsError } = await supabase
      .from("job_assignments")
      .select("job_id")
      .eq("client_id_uuid", user!.id);

    if (assignmentsError) {
      return NextResponse.json(
        { ok: false, error: assignmentsError.message || "Failed to load assignments" },
        { status: 500 }
      );
    }

    const jobIds = Array.from(
      new Set(
        ((assignments ?? []) as AssignmentRow[])
          .map((row) => (row.job_id ?? "").trim())
          .filter((id) => id.length > 0)
      )
    );

    if (jobIds.length === 0) {
      return NextResponse.json({ ok: true, jobs: [] });
    }

    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select(JOB_SELECT_FIELDS)
      .in("id", jobIds)
      .eq("is_test", false)
      .order("created_at", { ascending: false });

    if (jobsError) {
      return NextResponse.json(
        { ok: false, error: jobsError.message || "Failed to load jobs" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, jobs: jobs ?? [] });
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
