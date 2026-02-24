export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CareerLevel = "early" | "mid" | "senior" | "executive";
type RemotePreference = "remote" | "hybrid" | "onsite" | "all";

type ProfileBody = {
  primary_role?: unknown;
  secondary_role?: unknown;
  career_level?: unknown;
  core_skills?: unknown;
  industry_keywords?: unknown;
  preferred_locations?: unknown;
  remote_preference?: unknown;
  salary_min?: unknown;
  salary_max?: unknown;
  dealbreakers?: unknown;
};

type ClientProfileRow = {
  id: string;
  client_id: string;
  primary_role: string;
  secondary_role: string | null;
  career_level: CareerLevel | null;
  core_skills: string[] | null;
  industry_keywords: string[] | null;
  preferred_locations: string[] | null;
  remote_preference: RemotePreference;
  salary_min: number | null;
  salary_max: number | null;
  dealbreakers: string[] | null;
  created_at: string;
  updated_at: string;
};

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function serverError(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function toOptionalTrimmedString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return normalized;
}

function toInteger(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return undefined;
}

function isCareerLevel(value: unknown): value is CareerLevel {
  return value === "early" || value === "mid" || value === "senior" || value === "executive";
}

function isRemotePreference(value: unknown): value is RemotePreference {
  return value === "remote" || value === "hybrid" || value === "onsite" || value === "all";
}

async function getAuthedUser(req: Request) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { error: serverError("Missing Supabase env") };
  }

  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return { error: unauthorized() };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return { error: unauthorized() };
  }

  return { supabase, user };
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthedUser(req);
    if ("error" in auth) return auth.error;

    const { data, error } = await auth.supabase
      .from("client_profiles")
      .select(
        "id, client_id, primary_role, secondary_role, career_level, core_skills, industry_keywords, preferred_locations, remote_preference, salary_min, salary_max, dealbreakers, created_at, updated_at"
      )
      .eq("client_id", auth.user.id)
      .maybeSingle();

    if (error) {
      return serverError(error.message || "Failed to load profile");
    }

    return NextResponse.json({ ok: true, profile: (data as ClientProfileRow | null) ?? null });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Unexpected server error");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthedUser(req);
    if ("error" in auth) return auth.error;

    const body = (await req.json()) as ProfileBody;

    const primaryRoleRaw = toOptionalTrimmedString(body.primary_role);
    const secondaryRole = toOptionalTrimmedString(body.secondary_role);
    const coreSkills = toStringArray(body.core_skills);
    const industryKeywords = toStringArray(body.industry_keywords);
    const preferredLocations = toStringArray(body.preferred_locations);
    const dealbreakers = toStringArray(body.dealbreakers);
    const salaryMin = toInteger(body.salary_min);
    const salaryMax = toInteger(body.salary_max);

    if (!primaryRoleRaw) {
      return badRequest("primary_role is required");
    }

    if (!isRemotePreference(body.remote_preference)) {
      return badRequest("remote_preference is required");
    }

    if (body.career_level !== undefined && body.career_level !== null && !isCareerLevel(body.career_level)) {
      return badRequest("career_level is invalid");
    }

    if (
      coreSkills === undefined ||
      industryKeywords === undefined ||
      preferredLocations === undefined ||
      dealbreakers === undefined ||
      salaryMin === undefined ||
      salaryMax === undefined
    ) {
      return badRequest("Invalid profile fields");
    }

    const { data: existing, error: existingError } = await auth.supabase
      .from("client_profiles")
      .select("id")
      .eq("client_id", auth.user.id)
      .maybeSingle();

    if (existingError) {
      return serverError(existingError.message || "Failed to load profile");
    }

    if (existing) {
      return badRequest("Profile already exists");
    }

    const { data, error } = await auth.supabase
      .from("client_profiles")
      .insert({
        client_id: auth.user.id,
        primary_role: primaryRoleRaw,
        secondary_role: secondaryRole,
        career_level: body.career_level ?? null,
        core_skills: coreSkills,
        industry_keywords: industryKeywords,
        preferred_locations: preferredLocations,
        remote_preference: body.remote_preference,
        salary_min: salaryMin,
        salary_max: salaryMax,
        dealbreakers,
      })
      .select(
        "id, client_id, primary_role, secondary_role, career_level, core_skills, industry_keywords, preferred_locations, remote_preference, salary_min, salary_max, dealbreakers, created_at, updated_at"
      )
      .single();

    if (error || !data) {
      return serverError(error?.message || "Failed to create profile");
    }

    return NextResponse.json({ ok: true, profile: data as ClientProfileRow });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Unexpected server error");
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await getAuthedUser(req);
    if ("error" in auth) return auth.error;

    const body = (await req.json()) as ProfileBody;

    const primaryRole = toOptionalTrimmedString(body.primary_role);
    const secondaryRole = toOptionalTrimmedString(body.secondary_role);
    const coreSkills = toStringArray(body.core_skills);
    const industryKeywords = toStringArray(body.industry_keywords);
    const preferredLocations = toStringArray(body.preferred_locations);
    const dealbreakers = toStringArray(body.dealbreakers);
    const salaryMin = toInteger(body.salary_min);
    const salaryMax = toInteger(body.salary_max);

    if (body.primary_role !== undefined && primaryRole === undefined) {
      return badRequest("primary_role is invalid");
    }

    if (body.career_level !== undefined && body.career_level !== null && !isCareerLevel(body.career_level)) {
      return badRequest("career_level is invalid");
    }

    if (body.remote_preference !== undefined && !isRemotePreference(body.remote_preference)) {
      return badRequest("remote_preference is invalid");
    }

    if (
      (body.core_skills !== undefined && coreSkills === undefined) ||
      (body.industry_keywords !== undefined && industryKeywords === undefined) ||
      (body.preferred_locations !== undefined && preferredLocations === undefined) ||
      (body.dealbreakers !== undefined && dealbreakers === undefined) ||
      (body.salary_min !== undefined && salaryMin === undefined) ||
      (body.salary_max !== undefined && salaryMax === undefined)
    ) {
      return badRequest("Invalid profile fields");
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.primary_role !== undefined) updatePayload.primary_role = primaryRole;
    if (body.secondary_role !== undefined) updatePayload.secondary_role = secondaryRole;
    if (body.career_level !== undefined) updatePayload.career_level = body.career_level ?? null;
    if (body.core_skills !== undefined) updatePayload.core_skills = coreSkills;
    if (body.industry_keywords !== undefined) updatePayload.industry_keywords = industryKeywords;
    if (body.preferred_locations !== undefined) updatePayload.preferred_locations = preferredLocations;
    if (body.remote_preference !== undefined) updatePayload.remote_preference = body.remote_preference;
    if (body.salary_min !== undefined) updatePayload.salary_min = salaryMin;
    if (body.salary_max !== undefined) updatePayload.salary_max = salaryMax;
    if (body.dealbreakers !== undefined) updatePayload.dealbreakers = dealbreakers;

    const { data, error } = await auth.supabase
      .from("client_profiles")
      .update(updatePayload)
      .eq("client_id", auth.user.id)
      .select(
        "id, client_id, primary_role, secondary_role, career_level, core_skills, industry_keywords, preferred_locations, remote_preference, salary_min, salary_max, dealbreakers, created_at, updated_at"
      )
      .single();

    if (error || !data) {
      return serverError(error?.message || "Failed to update profile");
    }

    return NextResponse.json({ ok: true, profile: data as ClientProfileRow });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Unexpected server error");
  }
}
