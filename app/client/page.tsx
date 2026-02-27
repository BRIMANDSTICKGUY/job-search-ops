"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientProfileForm } from "@/components/ClientProfileForm";
import { ClientJobsTable } from "@/components/ClientJobsTable";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type ClientJob = {
  id: string;
  title: string | null;
  company: string | null;
  source: string | null;
  created_at: string | null;
  client_status: string | null;
  link: string | null;
};

type ClientJobsResponse = {
  ok: boolean;
  jobs?: ClientJob[];
  error?: string;
};

export default function ClientPage() {
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
    <main style={{ padding: 24 }}>
      <h1>Client Dashboard</h1>
      <ClientProfileForm />
      <ClientJobsTable jobs={jobs} />
    </main>
  );
}
