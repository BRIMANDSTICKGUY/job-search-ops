"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSent(false);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Email is required");
      return;
    }

    setSubmitting(true);

    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error: signInError } = await getSupabaseBrowser().auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (signInError) {
        const normalizedMessage = signInError.message.toLowerCase();
        if (normalizedMessage.includes("rate limit")) {
          setError("Email rate limit reached by the auth provider. Try again shortly.");
          return;
        }

        setError(signInError.message);
        return;
      }

      setSent(true);
    } catch {
      setError("Failed to send magic link");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={shellStyle}>
      <section style={cardStyle}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "inline-flex", padding: "7px 12px", borderRadius: 999, background: "#dbeafe", color: "#1d4ed8", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Client Login
          </div>
          <h1 style={{ margin: "16px 0 10px", fontSize: 36, lineHeight: 1.02, letterSpacing: "-0.04em", color: "#0f172a" }}>
            Sign in with a magic link
          </h1>
          <p style={{ margin: 0, color: "#526071", fontSize: 15, lineHeight: 1.6 }}>
            Client accounts use email magic links. Coach accounts should use the dedicated password login.
          </p>
        </div>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>Email address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              style={inputStyle}
            />
          </label>
          <button type="submit" disabled={submitting} style={{ ...buttonStyle, opacity: submitting ? 0.7 : 1, cursor: submitting ? "not-allowed" : "pointer" }}>
            {submitting ? "Sending..." : "Send magic link"}
          </button>
        </form>

        <div style={{ marginTop: 16, minHeight: 48 }}>
          {sent ? (
            <p style={{ margin: 0, color: "#166534", background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 14, padding: "12px 14px", fontSize: 14 }}>
              Check your email for the sign-in link.
            </p>
          ) : null}
          {error ? (
            <p style={{ margin: sent ? "12px 0 0" : 0, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14, padding: "12px 14px", fontSize: 14 }}>
              {error}
            </p>
          ) : null}
        </div>

        <div style={{ marginTop: 20, fontSize: 14 }}>
          <Link href="/coach/login" style={{ color: "#1d4ed8", textDecoration: "none", fontWeight: 700 }}>
            Coach or admin? Use password login
          </Link>
        </div>
      </section>
    </main>
  );
}
