export const THIRTY_DAYS = 60 * 60 * 24 * 30;

type RoleAwareUser = {
  app_metadata?: unknown;
  user_metadata?: unknown;
};

type SessionStateResponse = {
  ok?: boolean;
  authenticated?: boolean;
  redirectPath?: string;
};

export function setAuthCookies(accessToken: string, refreshToken: string) {
  document.cookie = `sb-access-token=${encodeURIComponent(accessToken)}; Path=/; Max-Age=${THIRTY_DAYS}; SameSite=Lax`;
  document.cookie = `sb-refresh-token=${encodeURIComponent(refreshToken)}; Path=/; Max-Age=${THIRTY_DAYS}; SameSite=Lax`;
}

export function hasCoachMetadata(user: RoleAwareUser | null | undefined) {
  const appRole =
    typeof user?.app_metadata === "object" && user.app_metadata !== null
      ? (user.app_metadata as Record<string, unknown>).role
      : undefined;
  const userRole =
    typeof user?.user_metadata === "object" && user.user_metadata !== null
      ? (user.user_metadata as Record<string, unknown>).role
      : undefined;

  return appRole === "coach" || appRole === "admin" || userRole === "coach" || userRole === "admin";
}

export async function resolveRedirectPath(fallbackUser?: RoleAwareUser | null) {
  try {
    const response = await fetch("/api/auth/session", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });

    const payload = (await response.json()) as SessionStateResponse;
    if (response.ok && payload.ok && payload.authenticated && typeof payload.redirectPath === "string") {
      return payload.redirectPath;
    }
  } catch {
    // Fall back to the client session metadata when the server session endpoint is unavailable.
  }

  return hasCoachMetadata(fallbackUser) ? "/coach" : "/client";
}