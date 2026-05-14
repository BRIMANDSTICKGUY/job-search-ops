import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

type RoleAwareUser = {
  email?: string | null;
  app_metadata?: unknown;
  user_metadata?: unknown;
};

function getAuthSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getMetadataRole(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) {
    return null;
  }

  const role = (metadata as Record<string, unknown>).role;
  return typeof role === "string" ? role.trim().toLowerCase() : null;
}

function getCoachEmailAllowlist(): Set<string> {
  const rawValue =
    process.env.COACH_EMAILS ?? process.env.COACH_ALLOWED_EMAILS ?? process.env.ADMIN_EMAILS ?? "";

  return new Set(
    rawValue
      .split(/[\n,]/)
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0)
  );
}

export function hasCoachRole(user: RoleAwareUser): boolean {
  const appRole = getMetadataRole(user.app_metadata);
  const userRole = getMetadataRole(user.user_metadata);

  if (appRole === "coach" || appRole === "admin" || userRole === "coach" || userRole === "admin") {
    return true;
  }

  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!email) {
    return false;
  }

  return getCoachEmailAllowlist().has(email);
}

function parseBearerToken(authorization: string | null): string {
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice("Bearer ".length).trim();
}

async function getCookieAccessToken() {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get("sb-access-token")?.value ?? "";

  if (!rawValue) {
    return "";
  }

  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export async function getSessionUser(req?: Request) {
  const accessToken = req
    ? parseBearerToken(req.headers.get("authorization")) || (await getCookieAccessToken())
    : await getCookieAccessToken();

  if (!accessToken) {
    return null;
  }

  const supabase = getAuthSupabase();
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  return user;
}

export async function getCoachSession(req?: Request) {
  const user = await getSessionUser(req);

  return {
    user,
    isCoach: user ? hasCoachRole(user) : false,
  };
}