"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

type OtpType = "magiclink" | "recovery" | "invite" | "email" | "email_change";

function setAuthCookies(accessToken: string, refreshToken: string) {
  document.cookie = `sb-access-token=${encodeURIComponent(accessToken)}; Path=/; Max-Age=${THIRTY_DAYS}; SameSite=Lax`;
  document.cookie = `sb-refresh-token=${encodeURIComponent(refreshToken)}; Path=/; Max-Age=${THIRTY_DAYS}; SameSite=Lax`;
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

        const hashAccessToken = hashParams.get("access_token");
        const hashRefreshToken = hashParams.get("refresh_token");

        if (hashAccessToken && hashRefreshToken) {
          setAuthCookies(hashAccessToken, hashRefreshToken);
          router.replace("/client");
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
          router.replace("/client");
          return;
        }

        const {
          data: { session },
        } = await getSupabaseBrowser().auth.getSession();

        if (session?.access_token && session.refresh_token) {
          setAuthCookies(session.access_token, session.refresh_token);
          router.replace("/client");
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
    <main style={{ padding: 24 }}>
      <h1>Signing in...</h1>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
    </main>
  );
}
