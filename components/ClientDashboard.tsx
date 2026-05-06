"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientJobsTable } from "@/components/ClientJobsTable";
import { ClientProfileForm } from "@/components/ClientProfileForm";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type ClientJob = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  created_at: string | null;
  client_status: string | null;
  link: string | null;
};

type ClientJobsResponse = {
  ok: boolean;
  jobs?: ClientJob[];
  error?: string;
};

export default function ClientDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ClientJob[]>([]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { session },
        } = await getSupabaseBrowser().auth.getSession();

        const accessToken = session?.access_token;
        if (!accessToken) {
          router.replace("/login");
          return;
        }

        const response = await fetch("/api/client/jobs", {
          method: "GET",
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        });

        const payload = (await response.json()) as ClientJobsResponse;

        if (!response.ok || !payload.ok) {
          if (!active) return;
          setError(payload.error ?? "Failed to load jobs");
          return;
        }

        if (!active) return;
        setJobs(payload.jobs ?? []);
      } catch {
        if (!active) return;
        setError("Failed to load jobs");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [router]);

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Client Dashboard</h1>
        <p>Loading...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Client Dashboard</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f4f7fb 0%, #eef3f8 100%)", padding: "32px 24px 64px", color: "#0f172a" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <section style={{ background: "linear-gradient(135deg, #ffffff 0%, #f6f9fc 62%, #eef6ff 100%)", border: "1px solid #dbe4f0", borderRadius: 20, boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)", padding: 24, marginBottom: 20 }}>
          <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Assigned Job Feed</p>
          <h1 style={{ margin: "0 0 10px", fontSize: 34, lineHeight: 1.05, letterSpacing: "-0.04em" }}>Your curated opportunities</h1>
          <p style={{ margin: 0, color: "#526071", fontSize: 15, lineHeight: 1.6 }}>
            This dashboard only shows roles assigned to you. Open the real application link, update your status, and stay focused on the jobs already curated for your search.
          </p>
        </section>

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #dbe4f0",
            borderRadius: 20,
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.05)",
            padding: 24,
            marginBottom: 20,
          }}
        >
          <ClientProfileForm />
        </section>

        <ClientJobsTable jobs={jobs} />
      </div>
    </main>
  );
}