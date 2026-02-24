"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type JobMatch = {
  id: string;
  title: string | null;
  company: string | null;
  source: string | null;
  created_at: string | null;
  job_score: number;
  link: string | null;
};

type MatchesResponse = {
  ok: boolean;
  matches?: JobMatch[];
  error?: string;
};

type JobMatchesTableProps = {
  clientId: string;
};

export function JobMatchesTable({ clientId }: JobMatchesTableProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<JobMatch[]>([]);

  useEffect(() => {
    let active = true;

    async function loadMatches() {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { session },
        } = await getSupabaseBrowser().auth.getSession();

        const token = session?.access_token;
        if (!token) {
          if (!active) return;
          setError("Unauthorized");
          setMatches([]);
          return;
        }

        const res = await fetch(`/api/coach/matches?client_id=${encodeURIComponent(clientId)}`, {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        const payload = (await res.json()) as MatchesResponse;

        if (!res.ok || !payload.ok) {
          if (!active) return;
          setError(payload.error ?? "Failed to load matches");
          setMatches([]);
          return;
        }

        if (!active) return;
        setMatches(payload.matches ?? []);
      } catch {
        if (!active) return;
        setError("Failed to load matches");
        setMatches([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadMatches();

    return () => {
      active = false;
    };
  }, [clientId]);

  if (loading) {
    return <p>Loading matches...</p>;
  }

  if (error) {
    return <p style={{ color: "#b91c1c" }}>{error}</p>;
  }

  if (matches.length === 0) {
    return <p>No matches found.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Company</th>
          <th>Source</th>
          <th>Match Score</th>
          <th>Link</th>
        </tr>
      </thead>
      <tbody>
        {matches.map((match) => (
          <tr key={match.id}>
            <td>{match.title ?? "—"}</td>
            <td>{match.company ?? "—"}</td>
            <td>{match.source ?? "—"}</td>
            <td>{match.job_score}</td>
            <td>
              {match.link ? (
                <a href={match.link} target="_blank" rel="noreferrer">
                  View
                </a>
              ) : (
                "—"
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
