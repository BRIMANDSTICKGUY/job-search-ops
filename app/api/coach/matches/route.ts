export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCoachSession } from "@/lib/auth/coach";

type MatchBand = "green" | "yellow" | "red";

type JobMatchRow = {
  job_id: string;
  score: number;
  band: MatchBand;
  reasons: string[];
  flags: Record<string, unknown> | null;
};

type JobRow = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  created_at: string | null;
};

type MatchItem = {
  job_id: string;
  score: number;
  band: MatchBand;
  reasons: string[];
  flags: Record<string, unknown> | null;
  title: string | null;
  company: string | null;
  location: string | null;
  created_at: string | null;
};

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function serverError(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

function emptyBands(): Record<MatchBand, MatchItem[]> {
  return { green: [], yellow: [], red: [] };
}

export async function GET(req: Request) {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return serverError("Missing Supabase env");
    }

    const { user, isCoach } = await getCoachSession(req);

    if (!user || !isCoach) {
      return unauthorized();
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const url = new URL(req.url);
    const clientId = url.searchParams.get("client_id")?.trim();
    if (!clientId) {
      return badRequest("client_id is required");
    }

    const { data: matchesData, error: matchesError } = await supabase
      .from("job_matches")
      .select("job_id, score, band, reasons, flags")
      .eq("client_id", clientId);

    if (matchesError) {
      return serverError(matchesError.message || "Failed to load matches");
    }

    const bands = emptyBands();
    const matchRows = (matchesData ?? []) as JobMatchRow[];

    if (matchRows.length === 0) {
      return NextResponse.json({ ok: true, bands });
    }

    const jobIds = Array.from(new Set(matchRows.map((row) => row.job_id))).filter(
      (id) => typeof id === "string" && id.length > 0
    );

    const { data: jobsData, error: jobsError } = await supabase
      .from("jobs")
      .select("id, title, company, location, created_at")
      .eq("is_test", false)
      .in("id", jobIds);

    if (jobsError) {
      return serverError(jobsError.message || "Failed to load jobs");
    }

    const jobsById = new Map<string, JobRow>(
      ((jobsData ?? []) as JobRow[]).map((job) => [job.id, job])
    );

    for (const row of matchRows) {
      if (row.band !== "green" && row.band !== "yellow" && row.band !== "red") {
        continue;
      }

      const job = jobsById.get(row.job_id);
      bands[row.band].push({
        job_id: row.job_id,
        score: row.score,
        band: row.band,
        reasons: row.reasons,
        flags: row.flags,
        title: job?.title ?? null,
        company: job?.company ?? null,
        location: job?.location ?? null,
        created_at: job?.created_at ?? null,
      });
    }

    bands.green.sort((a, b) => b.score - a.score);
    bands.yellow.sort((a, b) => b.score - a.score);
    bands.red.sort((a, b) => b.score - a.score);

    return NextResponse.json({ ok: true, bands });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Unexpected server error");
  }
}
