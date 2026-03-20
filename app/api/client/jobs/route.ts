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

function maskToken(token: string) {
  if (!token) return "";
  if (token.length <= 20) return token;
  return `${token.slice(0, 12)}...${token.slice(-8)}`;
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

    const rawAuthorization = req.headers.get("authorization");
    const accessToken = parseBearerToken(rawAuthorization);

    console.log("[client/jobs] AUTH HEADER PRESENT:", !!rawAuthorization);
    console.log("[client/jobs] AUTH HEADER PREFIX:", rawAuthorization?.slice(0, 20) ?? null);
    console.log("[client/jobs] TOKEN PRESENT:", !!accessToken);
    console.log("[client/jobs] TOKEN LENGTH:", accessToken.length);
    console.log("[client/jobs] TOKEN MASKED:", maskToken(accessToken));

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          stage: "missing_token",
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    console.log("[client/jobs] GET USER ERROR MESSAGE:", userError?.message ?? null);
    console.log("[client/jobs] GET USER ERROR STATUS:", userError?.status ?? null);
    console.log("[client/jobs] GET USER ID:", user?.id ?? null);
    console.log("[client/jobs] NODE_ENV:", process.env.NODE_ENV);

    if (userError || !user) {
      return NextResponse.json(
        {
          ok: false,
          stage: "token_rejected",
          error: "Unauthorized",
          details: {
            message: userError?.message ?? null,
            status: userError?.status ?? null,
          },
        },
        { status: 401 }
      );
    }

    const { data: assignments, error: assignmentsError } = await supabase
      .from("job_assignments")
      .select("job_id")
      .eq("client_id_uuid", user.id);

    if (assignmentsError) {
      return NextResponse.json(
        {
          ok: false,
          stage: "assignments_query_failed",
          error: assignmentsError.message || "Failed to load assignments",
        },
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
      .in("job_id", jobIds)
      .eq("is_test", false)
      .order("created_at", { ascending: false });

    if (jobsError) {
      return NextResponse.json(
        {
          ok: false,
          stage: "jobs_query_failed",
          error: jobsError.message || "Failed to load jobs",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, jobs: jobs ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        stage: "unexpected_server_error",
        error: error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 }
    );
  }
}
