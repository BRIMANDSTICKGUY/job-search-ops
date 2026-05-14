"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { resolveRedirectPath, setAuthCookies } from "@/lib/auth/browser";

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "32px 20px",
  background: "radial-gradient(circle at top, #dbeafe 0%, #eff6ff 26%, #f8fafc 58%, #eef2ff 100%)",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 440,
  padding: 32,
  borderRadius: 28,
  background: "rgba(255, 255, 255, 0.92)",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  boxShadow: "0 28px 80px rgba(15, 23, 42, 0.14)",
  backdropFilter: "blur(14px)",
};

type OtpType = "magiclink" | "recovery" | "invite" | "email" | "email_change";

function getAuthTargetPath(searchParams: URLSearchParams, hashParams: URLSearchParams) {
  const searchType = searchParams.get("type");
  const hashType = hashParams.get("type");

  if (searchType === "recovery" || hashType === "recovery") {
    return "/auth/update-password";
  }

  return null;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function completeAuth() {
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const searchParams = new URLSearchParams(window.location.search);
        const authTargetPath = getAuthTargetPath(searchParams, hashParams);

        const hashAccessToken = hashParams.get("access_token");
        const hashRefreshToken = hashParams.get("refresh_token");

        if (hashAccessToken && hashRefreshToken) {
          setAuthCookies(hashAccessToken, hashRefreshToken);
          router.replace(authTargetPath ?? (await resolveRedirectPath()));
          return;
        }

        const authCode = searchParams.get("code");

        if (authCode) {
          const { data, error: exchangeError } = await getSupabaseBrowser().auth.exchangeCodeForSession(authCode);

          if (exchangeError || !data.session?.access_token || !data.session?.refresh_token) {
            if (active) {
              setError(exchangeError?.message ?? "Invalid or expired magic link");
            }
            return;
          }

          setAuthCookies(data.session.access_token, data.session.refresh_token);
          router.replace(authTargetPath ?? (await resolveRedirectPath(data.session.user)));
          return;
        }

        const tokenHash = searchParams.get("token_hash");
        const typeParam = searchParams.get("type");

        if (tokenHash && typeParam) {
          const { data, error: verifyError } = await getSupabaseBrowser().auth.verifyOtp({
            token_hash: tokenHash,
            type: typeParam as OtpType,
          });

          if (verifyError || !data.session?.access_token || !data.session?.refresh_token) {
            if (active) {
              setError(verifyError?.message ?? "Invalid or expired magic link");
            }
            return;
          }

          setAuthCookies(data.session.access_token, data.session.refresh_token);
          router.replace(authTargetPath ?? (await resolveRedirectPath(data.session.user)));
          return;
        }

        const {
          data: { session },
        } = await getSupabaseBrowser().auth.getSession();

        if (session?.access_token && session.refresh_token) {
          setAuthCookies(session.access_token, session.refresh_token);
          router.replace(authTargetPath ?? (await resolveRedirectPath(session.user)));
          return;
        }

        if (active) {
          setError("Invalid or expired magic link");
        }
      } catch {
        if (active) {
          setError("Failed to complete sign in");
        }
      }
    }

    void completeAuth();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main style={shellStyle}>
      <section style={cardStyle}>
        <div style={{ display: "inline-flex", padding: "7px 12px", borderRadius: 999, background: "#dbeafe", color: "#1d4ed8", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Secure Login
        </div>
        <h1 style={{ margin: "16px 0 10px", fontSize: 36, lineHeight: 1.02, letterSpacing: "-0.04em", color: "#0f172a" }}>
          Signing you in
        </h1>
        <p style={{ margin: 0, color: "#526071", fontSize: 15, lineHeight: 1.6 }}>
          We&apos;re finishing the magic-link sign-in and redirecting you to your dashboard.
        </p>
        {error ? (
          <p style={{ margin: "16px 0 0", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14, padding: "12px 14px", fontSize: 14 }}>
            {error}
          </p>
        ) : (
          <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12, color: "#334155", fontSize: 14, fontWeight: 600 }}>
            <span style={{ width: 14, height: 14, borderRadius: 999, background: "linear-gradient(135deg, #2563eb 0%, #0f172a 100%)", boxShadow: "0 0 0 6px rgba(37, 99, 235, 0.12)" }} />
            Verifying your secure sign-in link...
          </div>
        )}
      </section>
    </main>
  );
}
