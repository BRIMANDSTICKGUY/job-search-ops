"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { hasSupabaseBrowserEnv, getSupabaseBrowser } from "@/lib/supabase/browser";

const navShellStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 40,
  backdropFilter: "blur(12px)",
  background: "rgba(248, 250, 252, 0.84)",
  borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
};

const navInnerStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "14px 24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

const brandStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  textDecoration: "none",
  color: "#0f172a",
};

const navListStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const navActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const navLinkBaseStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 999,
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
  color: "#475569",
  border: "1px solid transparent",
};

const sessionBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 12px",
  borderRadius: 999,
  background: "rgba(37, 99, 235, 0.08)",
  color: "#1d4ed8",
  fontSize: 13,
  fontWeight: 700,
};

const navButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(148, 163, 184, 0.35)",
  background: "rgba(255, 255, 255, 0.82)",
  color: "#334155",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const baseRoutes = [
  { href: "/", label: "Board" },
] as const;

const coachRoutes = [{ href: "/coach", label: "Coach" }] as const;

const signedInRoutes = [
  { href: "/client", label: "Client" },
  { href: "/client/profile", label: "Profile" },
] as const;

type SessionStateResponse = {
  ok?: boolean;
  authenticated?: boolean;
  email?: string | null;
  isCoach?: boolean;
};

function hasCoachMetadata(user: { app_metadata?: unknown; user_metadata?: unknown } | null | undefined) {
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

function clearAuthCookies() {
  document.cookie = "sb-access-token=; Path=/; Max-Age=0; SameSite=Lax";
  document.cookie = "sb-refresh-token=; Path=/; Max-Age=0; SameSite=Lax";
}

export function AppNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [isCoach, setIsCoach] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const routes = sessionEmail
    ? [...baseRoutes, ...(isCoach ? coachRoutes : []), ...signedInRoutes]
    : baseRoutes;

  useEffect(() => {
    if (!hasSupabaseBrowserEnv()) return;

    const supabase = getSupabaseBrowser();
    let active = true;

    async function syncSessionState() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session) {
        setSessionEmail(null);
        setIsCoach(false);
        return;
      }

      setSessionEmail(session.user.email ?? null);

      try {
        const response = await fetch("/api/auth/session", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        });

        const payload = (await response.json()) as SessionStateResponse;
        if (!active) return;

        if (response.ok && payload.ok && payload.authenticated) {
          setSessionEmail(payload.email ?? session.user.email ?? null);
          setIsCoach(payload.isCoach === true);
          return;
        }
      } catch {
        // Fall back to local session metadata when the server session endpoint is unavailable.
      }

      if (!active) return;
      setIsCoach(hasCoachMetadata(session.user));
    }

    void syncSessionState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event) => {
      void syncSessionState();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    if (!hasSupabaseBrowserEnv()) {
      clearAuthCookies();
      setSessionEmail(null);
      setIsCoach(false);
      router.push("/login");
      router.refresh();
      return;
    }

    setIsSigningOut(true);
    try {
      await getSupabaseBrowser().auth.signOut();
    } finally {
      clearAuthCookies();
      setSessionEmail(null);
      setIsCoach(false);
      setIsSigningOut(false);
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <header style={navShellStyle}>
      <div style={navInnerStyle}>
        <Link href="/" style={brandStyle}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>
            Job Search Ops
          </span>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em" }}>Navigation</span>
        </Link>

        <div style={navActionsStyle}>
          <nav aria-label="Primary" style={navListStyle}>
            {routes.map((route) => {
              const isActive = pathname === route.href || (route.href !== "/" && pathname?.startsWith(`${route.href}/`));

              return (
                <Link
                  key={route.href}
                  href={route.href}
                  aria-current={isActive ? "page" : undefined}
                  style={{
                    ...navLinkBaseStyle,
                    background: isActive ? "#0f172a" : "rgba(255, 255, 255, 0.82)",
                    color: isActive ? "#ffffff" : "#334155",
                    borderColor: isActive ? "#0f172a" : "rgba(148, 163, 184, 0.35)",
                    boxShadow: isActive ? "0 10px 24px rgba(15, 23, 42, 0.18)" : "none",
                  }}
                >
                  {route.label}
                </Link>
              );
            })}
          </nav>

          {sessionEmail ? <span style={sessionBadgeStyle}>{sessionEmail}</span> : null}

          {sessionEmail ? (
            <button type="button" onClick={handleSignOut} disabled={isSigningOut} style={navButtonStyle}>
              {isSigningOut ? "Signing out..." : "Logout"}
            </button>
          ) : (
            <Link
              href="/login"
              style={{
                ...navLinkBaseStyle,
                background: "rgba(255, 255, 255, 0.82)",
                color: "#334155",
                borderColor: "rgba(148, 163, 184, 0.35)",
              }}
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}