"use client";

import { FormEvent, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

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
    <main style={{ padding: 24 }}>
      <h1>Login</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Sending..." : "Send magic link"}
        </button>
      </form>
      {sent ? <p>Check your email</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
    </main>
  );
}
