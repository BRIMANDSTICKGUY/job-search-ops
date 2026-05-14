"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
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

const primaryButtonStyle: React.CSSProperties = {
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

const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: "#ffffff",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
  boxShadow: "none",
};

export default function CoachLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Email and password are required");
      return;
    }

    setSubmitting(true);

    try {
      const { data, error: signInError } = await getSupabaseBrowser().auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signInError || !data.session?.access_token || !data.session.refresh_token) {
        setError(signInError?.message ?? "Unable to sign in");
        return;
      }

      setAuthCookies(data.session.access_token, data.session.refresh_token);
      const redirectPath = await resolveRedirectPath(data.session.user);

      if (redirectPath !== "/coach") {
        await getSupabaseBrowser().auth.signOut();
        setError("This account is not authorized for coach access.");
        return;
      }

      router.replace("/coach");
    } catch {
      setError("Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  }

  async function sendResetLink() {
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your coach email first");
      return;
    }

    setSendingReset(true);

    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error: resetError } = await getSupabaseBrowser().auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setNotice("Password reset email sent. Use that link to set a coach password.");
    } catch {
      setError("Failed to send password reset email");
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <main style={shellStyle}>
      <section style={cardStyle}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "inline-flex", padding: "7px 12px", borderRadius: 999, background: "#dbeafe", color: "#1d4ed8", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Coach Login
          </div>
          <h1 style={{ margin: "16px 0 10px", fontSize: 36, lineHeight: 1.02, letterSpacing: "-0.04em", color: "#0f172a" }}>
            Sign in as coach
          </h1>
          <p style={{ margin: 0, color: "#526071", fontSize: 15, lineHeight: 1.6 }}>
            Use your coach email and password here. Client accounts should continue using the magic-link flow.
          </p>
        </div>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>Coach email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
          </label>
          <button type="submit" disabled={submitting || sendingReset} style={{ ...primaryButtonStyle, opacity: submitting || sendingReset ? 0.7 : 1, cursor: submitting || sendingReset ? "not-allowed" : "pointer" }}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
          <button type="button" onClick={sendResetLink} disabled={submitting || sendingReset} style={{ ...secondaryButtonStyle, opacity: submitting || sendingReset ? 0.7 : 1, cursor: submitting || sendingReset ? "not-allowed" : "pointer" }}>
            {sendingReset ? "Sending reset..." : "Email password reset link"}
          </button>
        </form>

        <div style={{ marginTop: 16, minHeight: 48 }}>
          {notice ? (
            <p style={{ margin: 0, color: "#166534", background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 14, padding: "12px 14px", fontSize: 14 }}>
              {notice}
            </p>
          ) : null}
          {error ? (
            <p style={{ margin: notice ? "12px 0 0" : 0, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14, padding: "12px 14px", fontSize: 14 }}>
              {error}
            </p>
          ) : null}
        </div>

        <div style={{ marginTop: 20, fontSize: 14 }}>
          <Link href="/login" style={{ color: "#1d4ed8", textDecoration: "none", fontWeight: 700 }}>
            Go to client magic-link login
          </Link>
        </div>
      </section>
    </main>
  );
}