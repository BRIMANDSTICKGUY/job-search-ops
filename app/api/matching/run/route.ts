import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { runMatchingForClient } from "@/lib/matching/runMatchingForClient";
import type { MatchClientProfile, MatchJobInput } from "@/lib/matching/types";

type RequestBody = {
  client_id?: unknown;
};

type ClientProfileRow = {
  primary_role: string;
  secondary_role: string | null;
  core_skills: string[] | null;
  preferred_locations: string[] | null;
  remote_preference: "remote" | "hybrid" | "onsite" | "all" | null;
};

type JobRow = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  raw_payload: unknown;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function toBand(score: number): "green" | "yellow" | "red" {
  if (score >= 70) return "green";
  if (score >= 40) return "yellow";
  return "red";
}

export async function POST(req: NextRequest) {
  try {
    let body: RequestBody;

    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const clientId =
      typeof body.client_id === "string" ? body.client_id.trim() : "";

    if (!clientId || !isUuid(clientId)) {
      return NextResponse.json(
        { ok: false, error: "client_id must be a valid UUID" },
        { status: 400 }
      );
    }

    const supabase = createServerClient({
      authorization: req.headers.get("authorization"),
    });

    const { data: profileData, error: profileError } = await supabase
      .from("client_profiles")
      .select(
        "primary_role, secondary_role, core_skills, preferred_locations, remote_preference"
      )
      .eq("client_id", clientId)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { ok: false, error: profileError.message || "Failed to load client profile" },
        { status: 500 }
      );
    }

    if (!profileData) {
      return NextResponse.json(
        { ok: false, error: "Client not found" },
        { status: 404 }
      );
    }

    const profileRow = profileData as ClientProfileRow;
    const profile: MatchClientProfile = {
      primary_role: profileRow.primary_role,
      secondary_role: profileRow.secondary_role,
      core_skills: profileRow.core_skills,
      preferred_locations: profileRow.preferred_locations,
      remote_preference: profileRow.remote_preference ?? "all",
    };

    const { data: jobsData, error: jobsError } = await supabase
      .from("jobs")
      .select("id, title, company, location, raw_payload")
      .eq("is_test", false)
      .order("created_at", { ascending: false })
      .limit(500);

    if (jobsError) {
      return NextResponse.json(
        { ok: false, error: jobsError.message || "Failed to load jobs" },
        { status: 500 }
      );
    }

    const jobs: MatchJobInput[] = ((jobsData ?? []) as JobRow[]).map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      raw_payload: job.raw_payload,
    }));

    const results = runMatchingForClient(profile, jobs);

    const rows = results.map((result) => ({
      client_id: clientId,
      job_id: result.job_id,
      score: result.score,
      band: toBand(result.score),
      reasons: result.reasons,
      flags: result.flags ?? null,
    }));

    const { data: upserted, error: upsertError } = await supabase
      .from("job_matches")
      .upsert(rows, { onConflict: "client_id,job_id" })
      .select("job_id");

    if (upsertError) {
      return NextResponse.json(
        { ok: false, error: upsertError.message || "Failed to write matches" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      client_id: clientId,
      jobs_scored: jobs.length,
      matches_written: upserted?.length ?? 0,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500 }
    );
  }
}
