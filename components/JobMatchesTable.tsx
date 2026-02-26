"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type MatchBand = "green" | "yellow" | "red";

type MatchItem = {
  job_id: string;
  score: number;
  band: MatchBand;
  reasons: string[];
  flags: Record<string, unknown> | null;
  title: string | null;
  company: string | null;
  location: string | null;
  created_at: string | null;
};

type MatchBands = {
  green: MatchItem[];
  yellow: MatchItem[];
  red: MatchItem[];
};

type MatchesResponse = {
  ok: boolean;
  bands?: MatchBands;
  error?: string;
};

type JobNote = {
  id: string;
  author_role: string;
  body: string;
  created_at: string;
};

type NotesResponse = {
  ok: boolean;
  notes?: JobNote[];
  error?: string;
};

type JobMatchesTableProps = {
  clientId: string;
};

const EMPTY_BANDS: MatchBands = {
  green: [],
  yellow: [],
  red: [],
};

function formatBandLabel(band: MatchBand) {
  if (band === "green") return "Green";
  if (band === "yellow") return "Yellow";
  return "Red";
}

function getBandBadgeStyle(band: MatchBand): CSSProperties {
  if (band === "green") {
    return {
      background: "#e8f9ee",
      border: "1px solid #9fd9b0",
      color: "#14532d",
    };
  }

  if (band === "yellow") {
    return {
      background: "#fff9e5",
      border: "1px solid #f1d48a",
      color: "#7a4e00",
    };
  }

  return {
    background: "#ffecec",
    border: "1px solid #e2a6a6",
    color: "#7f1d1d",
  };
}

function formatJobAge(createdAt: string | null) {
  if (!createdAt) return "Age unknown";

  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return "Age unknown";

  const diffMs = Date.now() - created;
  if (diffMs < 0) return "Just now";

  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function readMatchingVersion(flags: Record<string, unknown> | null) {
  if (!flags) return "v1";

  const raw = flags.matching_version ?? flags.version;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "number") return `v${raw}`;

  return "v1";
}

export function JobMatchesTable({ clientId }: JobMatchesTableProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bands, setBands] = useState<MatchBands>(EMPTY_BANDS);
  const [authorizationHeader, setAuthorizationHeader] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadMatches() {
      setLoading(true);
      setError(null);
      setBands(EMPTY_BANDS);
      setAuthorizationHeader(null);

      try {
        const {
          data: { session },
        } = await getSupabaseBrowser().auth.getSession();

        const token = session?.access_token;
        if (!token) {
          if (!active) return;
          setError("Unauthorized");
          return;
        }

        const auth = `Bearer ${token}`;
        const res = await fetch(`/api/coach/matches?client_id=${encodeURIComponent(clientId)}`, {
          method: "GET",
          headers: {
            authorization: auth,
          },
          cache: "no-store",
        });

        const payload = (await res.json()) as MatchesResponse;

        if (!res.ok || !payload.ok) {
          if (!active) return;
          setError(payload.error ?? "Failed to load matches");
          return;
        }

        if (!active) return;
        setAuthorizationHeader(auth);
        setBands(payload.bands ?? EMPTY_BANDS);
      } catch {
        if (!active) return;
        setError("Failed to load matches");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadMatches();

    return () => {
      active = false;
    };
  }, [clientId]);

  const totalMatches = useMemo(
    () => bands.green.length + bands.yellow.length + bands.red.length,
    [bands]
  );

  if (loading) {
    return <p>Loading matches...</p>;
  }

  if (error) {
    return <p style={{ color: "#b91c1c" }}>{error}</p>;
  }

  if (totalMatches === 0) {
    return <p>No matches found.</p>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <MatchBandSection
        label="Green"
        band="green"
        items={bands.green}
        defaultOpen
        authorizationHeader={authorizationHeader}
      />
      <MatchBandSection
        label="Yellow"
        band="yellow"
        items={bands.yellow}
        authorizationHeader={authorizationHeader}
      />
      <MatchBandSection
        label="Red"
        band="red"
        items={bands.red}
        authorizationHeader={authorizationHeader}
      />
    </div>
  );
}

function MatchBandSection({
  label,
  band,
  items,
  defaultOpen,
  authorizationHeader,
}: {
  label: string;
  band: MatchBand;
  items: MatchItem[];
  defaultOpen?: boolean;
  authorizationHeader: string | null;
}) {
  return (
    <details
      open={defaultOpen}
      style={{
        border: "1px solid #cbd5e1",
        borderRadius: 10,
        background: "#fff",
        padding: 10,
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>
        {label} ({items.length})
      </summary>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>No {label.toLowerCase()} matches.</div>
        ) : (
          items.map((item) => (
            <MatchCard
              key={`${band}-${item.job_id}`}
              item={item}
              authorizationHeader={authorizationHeader}
            />
          ))
        )}
      </div>
    </details>
  );
}

function MatchCard({ item, authorizationHeader }: { item: MatchItem; authorizationHeader: string | null }) {
  const [open, setOpen] = useState(false);

  const firstReason = item.reasons[0] ?? "No reason recorded";
  const badgeStyle = getBandBadgeStyle(item.band);
  const matchingVersion = readMatchingVersion(item.flags);

  return (
    <details
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      style={{
        border: "1px solid #dbe2ea",
        borderRadius: 8,
        background: "#f8fafc",
        padding: 8,
      }}
    >
      <summary style={{ cursor: "pointer", listStyle: "none" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 8,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>{item.title ?? "Untitled role"}</div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>{item.company ?? "Unknown company"}</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>{firstReason}</div>
          </div>

          <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
            <span
              style={{
                ...badgeStyle,
                borderRadius: 999,
                fontSize: 11,
                padding: "2px 8px",
                textTransform: "uppercase",
                letterSpacing: 0.4,
                fontWeight: 700,
              }}
            >
              {formatBandLabel(item.band)}
            </span>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Score: {item.score}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Age: {formatJobAge(item.created_at)}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Match: {matchingVersion}</div>
          </div>
        </div>
      </summary>

      <div style={{ marginTop: 8, borderTop: "1px solid #e2e8f0", paddingTop: 8, display: "grid", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Reasons</div>
          {item.reasons.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.75 }}>No reasons recorded.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {item.reasons.map((reason, index) => (
                <li key={`${item.job_id}-reason-${index}`}>{reason}</li>
              ))}
            </ul>
          )}
        </div>

        {item.flags && Object.keys(item.flags).length > 0 ? (
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Flags</div>
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                border: "1px solid #dbe2ea",
                borderRadius: 6,
                padding: 8,
                background: "#fff",
                fontSize: 12,
              }}
            >
              {JSON.stringify(item.flags, null, 2)}
            </pre>
          </div>
        ) : null}

        <MatchNotesPreview
          jobId={item.job_id}
          enabled={open}
          authorizationHeader={authorizationHeader}
        />
      </div>
    </details>
  );
}

function MatchNotesPreview({
  jobId,
  enabled,
  authorizationHeader,
}: {
  jobId: string;
  enabled: boolean;
  authorizationHeader: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<JobNote[] | null>(null);

  useEffect(() => {
    let active = true;

    if (!enabled || typeof authorizationHeader !== "string" || notes !== null) {
      return () => {
        active = false;
      };
    }
    const auth: string = authorizationHeader;

    async function loadNotes() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/notes`, {
          method: "GET",
          headers: {
            authorization: auth,
          },
          cache: "no-store",
        });

        const payload = (await response.json()) as NotesResponse;

        if (!response.ok || !payload.ok) {
          if (!active) return;
          setError(payload.error ?? "Failed to load notes");
          setNotes([]);
          return;
        }

        if (!active) return;
        const sorted = Array.isArray(payload.notes)
          ? [...payload.notes].sort(
              (a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
          : [];
        setNotes(sorted);
      } catch {
        if (!active) return;
        setError("Failed to load notes");
        setNotes([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadNotes();

    return () => {
      active = false;
    };
  }, [jobId, enabled, authorizationHeader, notes]);

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Notes (read-only)</div>

      {!authorizationHeader ? (
        <div style={{ fontSize: 13, opacity: 0.75 }}>No session available.</div>
      ) : loading ? (
        <div style={{ fontSize: 13, opacity: 0.75 }}>Loading notes...</div>
      ) : error ? (
        <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>
      ) : !notes || notes.length === 0 ? (
        <div style={{ fontSize: 13, opacity: 0.75 }}>No notes yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {notes.map((note) => (
            <div
              key={note.id}
              style={{
                border: "1px solid #dbe2ea",
                borderRadius: 6,
                background: "#fff",
                padding: 8,
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 3 }}>
                {note.author_role === "coach"
                  ? "Coach"
                  : note.author_role === "client"
                  ? "Client"
                  : note.author_role} · {new Date(note.created_at).toLocaleString()}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{note.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
