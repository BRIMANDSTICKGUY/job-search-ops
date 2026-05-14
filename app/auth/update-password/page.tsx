"use client";

import { FormEvent, useEffect, useState } from "react";
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
  maxWidth: 460,
  padding: 32,
  borderRadius: 28,
  background: "rgba(255, 255, 255, 0.92)",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  boxShadow: "0 28px 80px rgba(15, 23, 42, 0.14)",
  backdropFilter: "blur(14px)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 15,
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  borderRadius: 14,
  padding: "14px 16px",
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  color: "#ffffff",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 18px 32px rgba(29, 78, 216, 0.22)",
};

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const {
        data: { session },
      } = await getSupabaseBrowser().auth.getSession();

      if (!active) return;

      if (!session?.access_token || !session.refresh_token) {
        setError("This password reset link is invalid or expired.");
        return;
      }

      setAuthCookies(session.access_token, session.refresh_token);
      setReady(true);
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!password || !confirmPassword) {
      setError("Enter and confirm your new password");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);

    try {
      const { data, error: updateError } = await getSupabaseBrowser().auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      const session = data.user
        ? (await getSupabaseBrowser().auth.getSession()).data.session
        : null;

      if (session?.access_token && session.refresh_token) {
        setAuthCookies(session.access_token, session.refresh_token);
        router.replace(await resolveRedirectPath(session.user));
        return;
      }

      router.replace("/coach/login");
    } catch {
      setError("Failed to update password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={shellStyle}>
      <section style={cardStyle}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "inline-flex", padding: "7px 12px", borderRadius: 999, background: "#dbeafe", color: "#1d4ed8", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Coach Password
          </div>
          <h1 style={{ margin: "16px 0 10px", fontSize: 36, lineHeight: 1.02, letterSpacing: "-0.04em", color: "#0f172a" }}>
            Set your password
          </h1>
          <p style={{ margin: 0, color: "#526071", fontSize: 15, lineHeight: 1.6 }}>
            Choose a password for coach login. After this, you can use the dedicated coach login page instead of a magic link.
          </p>
        </div>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>New password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>Confirm password</span>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required style={inputStyle} />
          </label>
          <button type="submit" disabled={!ready || submitting} style={{ ...buttonStyle, opacity: !ready || submitting ? 0.7 : 1, cursor: !ready || submitting ? "not-allowed" : "pointer" }}>
            {submitting ? "Saving password..." : "Save password"}
          </button>
        </form>

        <div style={{ marginTop: 16, minHeight: 48 }}>
          {error ? (
            <p style={{ margin: 0, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14, padding: "12px 14px", fontSize: 14 }}>
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}