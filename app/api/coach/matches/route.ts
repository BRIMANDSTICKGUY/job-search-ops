export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CareerLevel = "early" | "mid" | "senior" | "executive";
type RemotePreference = "remote" | "hybrid" | "onsite" | "all";

type ClientProfile = {
  client_id: string;
  primary_role: string;
  secondary_role: string | null;
  career_level: CareerLevel | null;
  core_skills: string[] | null;
  preferred_locations: string[] | null;
  remote_preference: RemotePreference;
};

type JobRow = {
  id: string;
  title: string | null;
  company: string | null;
  source: string | null;
  created_at: string | null;
  link: string | null;
  location: string | null;
  raw_payload: unknown;
};

type JobMatch = {
  id: string;
  title: string | null;
  company: string | null;
  source: string | null;
  created_at: string | null;
  job_score: number;
  link: string | null;
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

function hasCoachRole(user: { app_metadata?: unknown; user_metadata?: unknown }): boolean {
  const appRole =
    typeof user.app_metadata === "object" && user.app_metadata !== null
      ? (user.app_metadata as Record<string, unknown>).role
      : undefined;
  const userRole =
    typeof user.user_metadata === "object" && user.user_metadata !== null
      ? (user.user_metadata as Record<string, unknown>).role
      : undefined;

  return appRole === "coach" || userRole === "coach";
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

export async function GET(req: Request) {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return serverError("Missing Supabase env");
    }

    const authHeader = req.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    if (!accessToken) {
      return unauthorized();
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user || !hasCoachRole(user)) {
      return unauthorized();
    }

    const url = new URL(req.url);
    const clientId = url.searchParams.get("client_id")?.trim();
    if (!clientId) {
      return badRequest("client_id is required");
    }

    const { data: profileData, error: profileError } = await supabase
      .from("client_profiles")
      .select("client_id, primary_role, secondary_role, career_level, core_skills, preferred_locations, remote_preference")
      .eq("client_id", clientId)
      .maybeSingle();

    if (profileError) {
      return serverError(profileError.message || "Failed to load client profile");
    }

    if (!profileData) {
      return NextResponse.json({ ok: true, matches: [] as JobMatch[] });
    }

    const profile = profileData as ClientProfile;

    const { data: jobsData, error: jobsError } = await supabase
      .from("jobs")
      .select("id, title, company, source, created_at, link, location, raw_payload")
      .eq("is_test", false)
      .order("created_at", { ascending: false })
      .limit(200);

    if (jobsError) {
      return serverError(jobsError.message || "Failed to load jobs");
    }

    const roles = [profile.primary_role, profile.secondary_role].filter(
      (role): role is string => typeof role === "string" && role.trim().length > 0
    );

    const preferredLocations = (profile.preferred_locations ?? [])
      .map((loc) => loc.trim().toLowerCase())
      .filter((loc) => loc.length > 0);

    const coreSkills = (profile.core_skills ?? [])
      .map((skill) => skill.trim().toLowerCase())
      .filter((skill) => skill.length > 0);

    const matches: JobMatch[] = [];

    for (const row of (jobsData ?? []) as JobRow[]) {
      const title = normalizeText(row.title);
      const company = normalizeText(row.company);
      const location = normalizeText(row.location);
      const rawText = normalizeText(
        typeof row.raw_payload === "string" ? row.raw_payload : JSON.stringify(row.raw_payload ?? {})
      );
      const haystack = `${title} ${company} ${location} ${rawText}`;

      const roleMatched = roles.some((role) => haystack.includes(role.toLowerCase()));
      if (!roleMatched) {
        continue;
      }

      const locationMatched =
        profile.remote_preference === "all"
          ? true
          : preferredLocations.some((loc) => loc.length > 0 && location.includes(loc));

      if (!locationMatched) {
        continue;
      }

      let score = 1;
      if (roles[0] && haystack.includes(roles[0].toLowerCase())) score += 2;
      if (roles[1] && haystack.includes(roles[1].toLowerCase())) score += 1;

      if (coreSkills.length > 0) {
        const skillHits = coreSkills.filter((skill) => haystack.includes(skill)).length;
        score += skillHits;
      }

      matches.push({
        id: row.id,
        title: row.title,
        company: row.company,
        source: row.source,
        created_at: row.created_at,
        job_score: score,
        link: row.link,
      });
    }

    matches.sort((a, b) => b.job_score - a.job_score);

    return NextResponse.json({ ok: true, matches });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Unexpected server error");
  }
}
