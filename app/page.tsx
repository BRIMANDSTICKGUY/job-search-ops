"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "../lib/supabase/browser";
import type { AppState, Client, Job, LaneId, Mode, UpperLaneId } from "./types";
import { STORAGE_KEY, normalizeLane, toLowerLane, toUpperLane } from "./types";
import { JobMatchesTable } from "@/components/JobMatchesTable";

/**
 * Job Search Ops — MVP Coach Portal
 * - LocalStorage persistence (single key)
 * - Lanes: INBOX / VERIFIED / CLIENT-SENT / WATCHLIST / REJECTED (UI)
 * - Canonical lanes in state/storage: inbox | verified | clientSent | watchlist | rejected
 * - Add job, assign clients (multi-assign), notes
 * - Bulk move + bulk assign (ADD only; never overwrites)
 * - Client Link panel (copy + open) with "Copied ✓" feedback
 * - Safety: Export/Import state so you can recover instantly
 */

const UPPER_LANES: UpperLaneId[] = ["INBOX", "VERIFIED", "CLIENT-SENT", "WATCHLIST", "REJECTED"];

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #f4f7fb 0%, #eef3f8 100%)",
  padding: "32px 24px 64px",
  color: "#0f172a",
};

const containerStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe4f0",
  borderRadius: 20,
  boxShadow: "0 16px 40px rgba(15, 23, 42, 0.06)",
  padding: 24,
};

const heroCardStyle: React.CSSProperties = {
  ...cardStyle,
  marginBottom: 20,
  background: "linear-gradient(135deg, #ffffff 0%, #f6f9fc 62%, #eef6ff 100%)",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: "-0.02em",
};

const mutedTextStyle: React.CSSProperties = {
  margin: 0,
  color: "#526071",
  fontSize: 14,
  lineHeight: 1.5,
};

const sectionEyebrowStyle: React.CSSProperties = {
  margin: "0 0 8px",
  color: "#64748b",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const utilityGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
  marginBottom: 20,
};

const utilityPanelStyle: React.CSSProperties = {
  ...cardStyle,
  padding: 20,
};

const textInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#fff",
  fontSize: 14,
  color: "#0f172a",
  boxSizing: "border-box",
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 12,
  background: "#0f172a",
  color: "#fff",
  padding: "11px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  background: "#fff",
  color: "#0f172a",
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const statsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(120px, 1fr))",
  gap: 12,
  alignSelf: "stretch",
  minWidth: 280,
  flex: "1 1 320px",
};

const tabListStyle: React.CSSProperties = {
  display: "inline-flex",
  gap: 10,
  padding: 6,
  borderRadius: 16,
  background: "#eaf0f7",
  border: "1px solid #d7e0eb",
  flexWrap: "wrap",
};

const selectInputStyle: React.CSSProperties = {
  minHeight: 38,
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  background: "#fff",
  color: "#0f172a",
  padding: "8px 10px",
  fontSize: 14,
  lineHeight: 1.2,
  fontWeight: 500,
  boxSizing: "border-box",
};

const inlineCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.82)",
  border: "1px solid #d8e2ee",
  borderRadius: 18,
  padding: 16,
};

const helperCaptionStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.5,
};

const compactButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  minHeight: 38,
  padding: "8px 12px",
  fontSize: 12,
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 30,
  padding: "0 10px",
  borderRadius: 999,
  border: "1px solid #d7e0eb",
  background: "#f8fbff",
  color: "#334155",
  fontSize: 12,
  fontWeight: 700,
};

const laneCountBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 24,
  height: 24,
  padding: "0 8px",
  borderRadius: 999,
  background: "rgba(15, 23, 42, 0.06)",
  color: "#475569",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1,
};

function now() {
  return Date.now();
}

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Math.random().toString(16).slice(2)}`;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

type BoardBootstrapResponse = {
  ok: boolean;
  clients?: Client[];
  jobs?: Job[];
  error?: string;
};

function makeEmptyState(): AppState {
  return {
    version: 1,
    mode: "coach",
    clients: [
      { id: "c_twanna", name: "twanna", email: "" },
      { id: "c_diane", name: "Diane", email: "" },
    ],
    jobs: [],
    activeLane: "inbox",
    selectedJobIds: [],
    selectedClientId: undefined,
  };
}

function buildClientLink(origin: string, clientId: string) {
  return `${origin}/client?clientId=${encodeURIComponent(clientId)}`;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeClients(input: any): Client[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((c) => c && typeof c.id === "string")
    .map((c) => ({
      id: c.id,
      name: typeof c.name === "string" ? c.name : "",
      email: typeof c.email === "string" ? c.email : "",
    }));
}

function sanitizeJobs(input: any): Job[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((j) => j && typeof j.id === "string")
    .map((j) => {
      const createdAt = typeof j.createdAt === "number" ? j.createdAt : now();
      const movedAt = typeof j.movedAt === "number" ? j.movedAt : createdAt;

      const assignedClientIds: string[] = Array.isArray(j.assignedClientIds)
        ? j.assignedClientIds.filter((x: any) => typeof x === "string")
        : [];

      return {
        id: j.id,
        title: typeof j.title === "string" ? j.title : "",
        company: typeof j.company === "string" ? j.company : "",
        link: typeof j.link === "string" ? j.link : "",
        location: typeof j.location === "string" ? j.location : "",
        salary: typeof j.salary === "string" ? j.salary : "",
        lane: normalizeLane(j.lane), // ✅ safety net: normalize on load
        assignedClientIds,
        clientNotes: typeof j.clientNotes === "string" ? j.clientNotes : "",
        internalNotes: typeof j.internalNotes === "string" ? j.internalNotes : "",
        createdAt,
        movedAt,
        outcome_status:
          j.outcome_status === "interview" ||
          j.outcome_status === "no_response" ||
          j.outcome_status === "rejected" ||
          j.outcome_status === "offer"
            ? j.outcome_status
            : null,
        last_response_at: typeof j.last_response_at === "string" ? j.last_response_at : null,
      } satisfies Job;
    });
}

export default function Page() {
  // hydration-safe origin (client only)
  const [origin, setOrigin] = useState<string>("");

  // app state
  const [state, setState] = useState<AppState>(() => makeEmptyState());
  const [hydrated, setHydrated] = useState(false);
  const [boardSource, setBoardSource] = useState<"local" | "live">("local");
  const [liveBoardError, setLiveBoardError] = useState<string | null>(null);

  // UI states
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"movedNewest" | "createdNewest">("movedNewest");
  const [coachClientView, setCoachClientView] = useState<"jobs" | "matches">("jobs");

  // Add job fields
  const [newTitle, setNewTitle] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newLink, setNewLink] = useState("");
  const [newIngestText, setNewIngestText] = useState("");

  // Bulk controls
  const [bulkMoveTarget, setBulkMoveTarget] = useState<UpperLaneId>("VERIFIED");
  const [bulkAssignClientId, setBulkAssignClientId] = useState<string>("");

  // Client link panel feedback
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  // Import input ref
  const importRef = useRef<HTMLInputElement | null>(null);

  async function fetchLiveBoard() {
    const {
      data: { session },
    } = await getSupabaseBrowser().auth.getSession();

    const token = session?.access_token;
    if (!token) {
      throw new Error("Unauthorized");
    }

    const response = await fetch("/api/board", {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const payload = (await response.json()) as BoardBootstrapResponse;
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? "Failed to load live board");
    }

    return {
      clients: sanitizeClients(payload.clients),
      jobs: sanitizeJobs(payload.jobs),
    };
  }

  function loadLocalBoard() {
    const loaded = safeParse<AppState>(window.localStorage.getItem(STORAGE_KEY));
    if (loaded && typeof loaded === "object") {
      const normalized: AppState = {
        version: typeof (loaded as any).version === "number" ? (loaded as any).version : 1,
        mode: (loaded as any).mode === "client" ? "client" : "coach",
        clients: sanitizeClients((loaded as any).clients),
        jobs: sanitizeJobs((loaded as any).jobs),
        activeLane: normalizeLane((loaded as any).activeLane),
        selectedJobIds: Array.isArray((loaded as any).selectedJobIds) ? (loaded as any).selectedJobIds : [],
        selectedClientId: (loaded as any).selectedClientId ?? undefined,
      };

      setState(normalized);
    } else {
      setState(makeEmptyState());
    }

    setBoardSource("local");
  }

  async function reloadLiveBoard() {
    const liveBoard = await fetchLiveBoard();

    setState((current) => {
      const validSelectedJobIds = current.selectedJobIds.filter((jobId) =>
        liveBoard.jobs.some((job) => job.id === jobId)
      );
      const selectedClientStillExists = current.selectedClientId
        ? liveBoard.clients.some((client) => client.id === current.selectedClientId)
        : false;

      return {
        ...current,
        clients: liveBoard.clients,
        jobs: liveBoard.jobs,
        selectedJobIds: validSelectedJobIds,
        selectedClientId: selectedClientStillExists
          ? current.selectedClientId
          : current.mode === "client"
            ? liveBoard.clients[0]?.id
            : undefined,
      };
    });

    setBoardSource("live");
    setLiveBoardError(null);
  }

  async function patchLiveJob(jobId: string, payload: {
    lane?: UpperLaneId;
    outcome_status?: Job["outcome_status"];
    client_notes?: string;
    internal_notes?: string;
  }) {
    const {
      data: { session },
    } = await getSupabaseBrowser().auth.getSession();

    const token = session?.access_token;
    if (!token) {
      throw new Error("Unauthorized");
    }

    const response = await fetch(`/api/board/jobs/${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !body.ok) {
      throw new Error(body.error ?? "Failed to update job");
    }
  }

  async function mutateLiveAssignment(jobId: string, clientId: string, method: "POST" | "DELETE") {
    const {
      data: { session },
    } = await getSupabaseBrowser().auth.getSession();

    const token = session?.access_token;
    if (!token) {
      throw new Error("Unauthorized");
    }

    const response = await fetch(`/api/board/jobs/${encodeURIComponent(jobId)}/assignments`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ client_id: clientId }),
    });

    const body = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !body.ok) {
      throw new Error(body.error ?? "Failed to update assignment");
    }
  }

  // --- first hydration: load LS + origin ---
  useEffect(() => {
    let active = true;

    async function hydrateBoard() {
      setOrigin(window.location.origin);

      try {
        await reloadLiveBoard();
      } catch (error) {
        if (!active) return;
        loadLocalBoard();
        setLiveBoardError(
          error instanceof Error && error.message !== "Unauthorized"
            ? `${error.message}. Showing local browser data instead.`
            : null
        );
      } finally {
        if (active) {
          setHydrated(true);
        }
      }
    }

    void hydrateBoard();

    return () => {
      active = false;
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  // --- persist to LS after hydration ---
  useEffect(() => {
    if (!hydrated || boardSource !== "local") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [boardSource, hydrated, state]);

  // --- derived: selected client ---
  const selectedClient = useMemo(() => {
    if (!state.selectedClientId) return null;
    return state.clients.find((c) => c.id === state.selectedClientId) ?? null;
  }, [state.clients, state.selectedClientId]);

  // --- derived: counts by lane (UI lanes) ---
  const counts = useMemo(() => {
    const c: Record<UpperLaneId, number> = {
      INBOX: 0,
      VERIFIED: 0,
      "CLIENT-SENT": 0,
      WATCHLIST: 0,
      REJECTED: 0,
    };

    const filterClientId = state.mode === "client" ? state.selectedClientId : null;

    for (const job of state.jobs) {
      if (filterClientId && !job.assignedClientIds.includes(filterClientId)) continue;
      c[toUpperLane(job.lane)]++;
    }

    return c;
  }, [state.jobs, state.mode, state.selectedClientId]);

  // --- filtering + sorting + active lane list ---
  const visibleJobs = useMemo(() => {
    const activeUpper = toUpperLane(state.activeLane);
    const filterClientId = state.mode === "client" ? state.selectedClientId : null;

    let jobs = state.jobs.filter((j) => toUpperLane(j.lane) === activeUpper);

    if (filterClientId) {
      jobs = jobs.filter((j) => j.assignedClientIds.includes(filterClientId));
    }

    const q = search.trim().toLowerCase();
    if (q) {
      jobs = jobs.filter((j) => {
        const hay = `${j.title} ${j.company} ${j.link ?? ""} ${j.location ?? ""} ${j.salary ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    jobs.sort((a, b) => {
      if (sortMode === "movedNewest") return (b.movedAt ?? 0) - (a.movedAt ?? 0);
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });

    return jobs;
  }, [state.jobs, state.activeLane, state.mode, state.selectedClientId, search, sortMode]);

  // --- helpers ---
  function setMode(mode: Mode) {
    setState((s) => ({
      ...s,
      mode,
      selectedJobIds: [],
      selectedClientId:
        mode === "client"
          ? s.selectedClientId ?? (s.clients[0]?.id ? s.clients[0].id : undefined)
          : s.selectedClientId,
    }));
  }

  // UI click passes UpperLaneId; state stores LaneId
  function setActiveUpperLane(lane: UpperLaneId) {
    setState((s) => ({ ...s, activeLane: toLowerLane(lane), selectedJobIds: [] }));
  }

  function toggleSelected(jobId: string, checked: boolean) {
    setState((s) => {
      const set = new Set(s.selectedJobIds);
      if (checked) set.add(jobId);
      else set.delete(jobId);
      return { ...s, selectedJobIds: Array.from(set) };
    });
  }

  function selectAllVisible() {
    setState((s) => {
      const ids = visibleJobs.map((j) => j.id);
      return { ...s, selectedJobIds: ids };
    });
  }

  function clearSelection() {
    setState((s) => ({ ...s, selectedJobIds: [] }));
  }

  function addJob() {
    if (boardSource === "live") {
      void addIngestedJob(false);
      return;
    }

    const title = newTitle.trim();
    const company = newCompany.trim();
    const link = newLink.trim();

    if (!title || !company) return;

    const job: Job = {
      id: uid("job"),
      title,
      company,
      link,
      location: "",
      salary: "",
      lane: "inbox",
      assignedClientIds: [],
      clientNotes: "",
      internalNotes: "",
      createdAt: now(),
      movedAt: now(),
    };

    setState((s) => ({
      ...s,
      jobs: [job, ...s.jobs],
      activeLane: "inbox",
    }));

    setNewTitle("");
    setNewCompany("");
    setNewLink("");
  }

  async function addIngestedJob(trackIngestionEvent = true) {
    const title = newTitle.trim();
    const company = newCompany.trim();
    const link = newLink.trim();
    const rawPayload = newIngestText.trim();

    if (!title || !company) return;

    if (boardSource !== "live") {
      addJob();
      return;
    }

    const { data: jobData, error: jobErr } = await getSupabaseBrowser()
      .from("jobs")
      .insert({
        title,
        company,
        link: link || null,
        lane: "INBOX",
      })
      .select("id")
      .single();

    if (jobErr || !jobData) {
      setLiveBoardError(jobErr?.message ?? "Failed to save live job");
      return;
    }

    if (trackIngestionEvent) {
      const sourceIdentifier = link || (rawPayload ? rawPayload.slice(0, 140) : "manual");

      const { error: ingestErr } = await getSupabaseBrowser()
        .from("job_ingestion_events")
        .insert({
          job_id: jobData.id,
          source_type: "manual",
          source_identifier: sourceIdentifier,
          raw_payload: rawPayload || null,
        });

      if (ingestErr) {
        setLiveBoardError(ingestErr.message ?? "Failed to attach ingestion record");
        return;
      }
    }

    await reloadLiveBoard();
    setState((s) => ({ ...s, activeLane: "inbox" }));

    setNewTitle("");
    setNewCompany("");
    setNewLink("");
    setNewIngestText("");
  }

  function moveJob(jobId: string, lane: UpperLaneId) {
    if (boardSource === "live") {
      void (async () => {
        try {
          await patchLiveJob(jobId, { lane });
          await reloadLiveBoard();
        } catch (error) {
          setLiveBoardError(error instanceof Error ? error.message : "Failed to move job");
        }
      })();
      return;
    }

    setState((s) => ({
      ...s,
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return { ...j, lane: toLowerLane(lane), movedAt: now() };
      }),
    }));
  }

  function bulkMoveSelected() {
    const target = bulkMoveTarget;

    if (boardSource === "live") {
      void (async () => {
        try {
          await Promise.all(state.selectedJobIds.map((jobId) => patchLiveJob(jobId, { lane: target })));
          await reloadLiveBoard();
          setState((s) => ({ ...s, selectedJobIds: [] }));
        } catch (error) {
          setLiveBoardError(error instanceof Error ? error.message : "Failed to move selected jobs");
        }
      })();
      return;
    }

    setState((s) => {
      const selected = new Set(s.selectedJobIds);
      if (selected.size === 0) return s;
      return {
        ...s,
        jobs: s.jobs.map((j) => {
          if (!selected.has(j.id)) return j;
          return { ...j, lane: toLowerLane(target), movedAt: now() };
        }),
        selectedJobIds: [],
      };
    });
  }

  function addClient(nameRaw?: string) {
    const name = (nameRaw ?? "").trim();
    if (!name) return;
    const client: Client = { id: uid("c"), name, email: "" };
    setState((s) => ({
      ...s,
      clients: [...s.clients, client],
      selectedClientId: s.selectedClientId ?? client.id,
    }));
  }

  function addClientToJob(jobId: string, clientId: string) {
    if (!clientId) return;

    if (boardSource === "live") {
      void (async () => {
        try {
          await mutateLiveAssignment(jobId, clientId, "POST");
          await reloadLiveBoard();
        } catch (error) {
          setLiveBoardError(error instanceof Error ? error.message : "Failed to assign client");
        }
      })();
      return;
    }

    setState((s) => ({
      ...s,
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j;
        if (j.assignedClientIds.includes(clientId)) return j;
        return { ...j, assignedClientIds: [...j.assignedClientIds, clientId] };
      }),
    }));
  }

  function removeClientFromJob(jobId: string, clientId: string) {
    if (boardSource === "live") {
      void (async () => {
        try {
          await mutateLiveAssignment(jobId, clientId, "DELETE");
          await reloadLiveBoard();
        } catch (error) {
          setLiveBoardError(error instanceof Error ? error.message : "Failed to remove client assignment");
        }
      })();
      return;
    }

    setState((s) => ({
      ...s,
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j;
        return { ...j, assignedClientIds: j.assignedClientIds.filter((id) => id !== clientId) };
      }),
    }));
  }

  function bulkAssignSelected() {
    const clientId = bulkAssignClientId;
    if (!clientId) return;

    if (boardSource === "live") {
      void (async () => {
        try {
          await Promise.all(state.selectedJobIds.map((jobId) => mutateLiveAssignment(jobId, clientId, "POST")));
          await reloadLiveBoard();
          setState((s) => ({ ...s, selectedJobIds: [] }));
        } catch (error) {
          setLiveBoardError(error instanceof Error ? error.message : "Failed to assign selected jobs");
        }
      })();
      return;
    }

    setState((s) => {
      const selected = new Set(s.selectedJobIds);
      if (selected.size === 0) return s;

      return {
        ...s,
        jobs: s.jobs.map((j) => {
          if (!selected.has(j.id)) return j;
          if (j.assignedClientIds.includes(clientId)) return j;
          return { ...j, assignedClientIds: [...j.assignedClientIds, clientId] };
        }),
        selectedJobIds: [],
      };
    });
  }

  function setNotes(jobId: string, field: "clientNotes" | "internalNotes", value: string) {
    if (boardSource === "live") {
      void (async () => {
        try {
          await patchLiveJob(jobId, {
            [field === "clientNotes" ? "client_notes" : "internal_notes"]: value,
          });
          setState((s) => ({
            ...s,
            jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, [field]: value } : j)),
          }));
          setLiveBoardError(null);
        } catch (error) {
          setLiveBoardError(error instanceof Error ? error.message : "Failed to save notes");
        }
      })();
      return;
    }

    setState((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, [field]: value } : j)),
    }));
  }

  function setOutcome(jobId: string, outcome_status: Job["outcome_status"]) {
    if (boardSource === "live") {
      void (async () => {
        try {
          await patchLiveJob(jobId, { outcome_status });
          await reloadLiveBoard();
        } catch (error) {
          setLiveBoardError(error instanceof Error ? error.message : "Failed to update outcome");
        }
      })();
      return;
    }

    setState((s) => ({
      ...s,
      jobs: s.jobs.map((j) =>
        j.id === jobId
          ? { ...j, outcome_status, last_response_at: new Date().toISOString() }
          : j
      ),
    }));
  }

  function clearData() {
    if (boardSource === "live") {
      void reloadLiveBoard();
      setState((s) => ({ ...s, selectedJobIds: [], activeLane: "inbox" }));
      return;
    }

    setState(makeEmptyState());
  }

  function loadSampleData() {
    setBoardSource("local");
    setLiveBoardError(null);
    const t = now();
    const twannaId = state.clients.find((c) => c.name.toLowerCase() === "twanna")?.id ?? "c_twanna";
    const dianeId = state.clients.find((c) => c.name.toLowerCase() === "diane")?.id ?? "c_diane";

    const demoJobs: Job[] = [
      {
        id: uid("job"),
        title: "Loan Processor (Remote)",
        company: "Prosperity Home Mortgage",
        link: "https://example.com/job-processor",
        location: "Remote",
        salary: "$45,400–$62,400",
        lane: "inbox",
        assignedClientIds: [twannaId],
        clientNotes: "Review the JD. If you want this, reply YES and I’ll tailor your resume bullets to match.",
        internalNotes: "Strong match for Twanna: processing workflow + docs + conditions.",
        createdAt: t - 1000 * 60 * 10,
        movedAt: t - 1000 * 60 * 10,
      },
      {
        id: uid("job"),
        title: "Program Manager, Operations (Remote)",
        company: "Jobgether (Partner Company)",
        link: "https://example.com/job-program-ops",
        location: "Remote",
        salary: "",
        lane: "inbox",
        assignedClientIds: [twannaId, dianeId],
        clientNotes: "This one’s competitive. If you want it, reply YES and I’ll optimize your resume + LinkedIn headline for it.",
        internalNotes: "Use as multi-assign test job. Verify pay + remote policy.",
        createdAt: t - 1000 * 60 * 8,
        movedAt: t - 1000 * 60 * 8,
      },
      {
        id: uid("job"),
        title: "Scrum Master (Remote)",
        company: "Acme Health Systems",
        link: "https://example.com/job-scrum",
        location: "Remote",
        salary: "",
        lane: "inbox",
        assignedClientIds: [dianeId],
        clientNotes: "If you want this role, reply YES and tell me your last 2 projects so I can write your STAR stories.",
        internalNotes: "Watch certs + tooling keywords. Prep 2 wins + 1 conflict story.",
        createdAt: t - 1000 * 60 * 6,
        movedAt: t - 1000 * 60 * 6,
      },
    ];

    setState((s) => ({
      ...s,
      jobs: demoJobs,
      activeLane: "inbox",
      selectedJobIds: [],
    }));
  }

  // --- backup: export/import ---
  function exportBackup() {
    const payload = JSON.stringify(state, null, 2);
    downloadText(`job-search-ops-backup-${new Date().toISOString().slice(0, 10)}.json`, payload);
  }

  function triggerImport() {
    importRef.current?.click();
  }

  async function handleImportFile(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AppState;
      if (!parsed || typeof parsed !== "object") return;

      // ensure safety on import
      const normalized: AppState = {
        version: typeof (parsed as any).version === "number" ? (parsed as any).version : 1,
        mode: (parsed as any).mode === "client" ? "client" : "coach",
        clients: sanitizeClients((parsed as any).clients),
        jobs: sanitizeJobs((parsed as any).jobs),
        activeLane: normalizeLane((parsed as any).activeLane),
        selectedJobIds: Array.isArray((parsed as any).selectedJobIds) ? (parsed as any).selectedJobIds : [],
        selectedClientId: (parsed as any).selectedClientId ?? undefined,
      };

      setState(normalized);
    } catch {
      // ignore
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  // --- client link panel ---
  const clientLinkValue = useMemo(() => {
    if (!origin) return "";
    if (!state.selectedClientId) return "";
    return buildClientLink(origin, state.selectedClientId);
  }, [origin, state.selectedClientId]);

  async function copyClientLink() {
    if (!clientLinkValue) return;

    try {
      await navigator.clipboard.writeText(clientLinkValue);
      setCopied(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = clientLinkValue;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore
      }
    }
  }

  function openClientLink() {
    if (!clientLinkValue) return;
    window.open(clientLinkValue, "_blank", "noopener,noreferrer");
  }

  // --- rendering helpers ---
  const activeUpper = toUpperLane(state.activeLane);
  const selectedCount = state.selectedJobIds.length;
  const selectedJobContext = useMemo(() => {
    if (state.selectedJobIds.length !== 1) return null;
    const selectedJobId = state.selectedJobIds[0];
    return visibleJobs.find((job) => job.id === selectedJobId) ?? null;
  }, [state.selectedJobIds, visibleJobs]);

  const canGenerateClientLink =
    state.mode === "coach" && !!state.selectedClientId && state.selectedClientId !== "" && state.selectedClientId !== "ALL";
  const canViewCoachMatches =
    state.mode === "coach" &&
    !!state.selectedClientId &&
    state.selectedClientId !== "" &&
    state.selectedClientId !== "ALL";

  useEffect(() => {
    if (!canViewCoachMatches && coachClientView !== "jobs") {
      setCoachClientView("jobs");
    }
  }, [canViewCoachMatches, coachClientView]);

  return (
    <main style={shellStyle}>
      <div style={containerStyle}>
        <section style={heroCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <p style={sectionEyebrowStyle}>Board workspace</p>
              <h1 style={{ margin: "8px 0 10px", fontSize: 36, lineHeight: 1.05, letterSpacing: "-0.04em" }}>
                Job Search Ops Board
              </h1>
              <p style={{ ...mutedTextStyle, maxWidth: 700 }}>
                Manage the active job board with the same polished shell as coach while keeping fast triage, notes, bulk actions, and client preview tools in one place.
              </p>
            </div>
            <div style={statsGridStyle}>
              {[
                ["Total jobs", String(state.jobs.length)],
                ["Visible lane", String(visibleJobs.length)],
                ["Clients", String(state.clients.length)],
              ].map(([label, value]) => (
                <div key={label} style={{ background: "rgba(255,255,255,0.72)", border: "1px solid #d8e2ee", borderRadius: 16, padding: 16 }}>
                  <div style={{ fontSize: 12, color: "#526071", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={utilityGridStyle}>
          <div style={utilityPanelStyle}>
            <p style={sectionEyebrowStyle}>Workspace Controls</p>
            <h2 style={{ ...sectionTitleStyle, marginBottom: 8 }}>Board setup</h2>
            <p style={{ ...mutedTextStyle, marginBottom: 14 }}>
              Switch modes, manage client context, and keep backups without falling back to the older utility-strip layout.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <span style={badgeStyle}>{boardSource === "live" ? "Live ingest board" : "Demo sandbox"}</span>
              {liveBoardError ? <span style={{ color: "#b45309", fontSize: 13 }}>{liveBoardError}</span> : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {boardSource === "live" ? (
                <>
                  <button onClick={() => void reloadLiveBoard()} style={secondaryButtonStyle}>Reload live jobs</button>
                  <button onClick={loadSampleData} style={secondaryButtonStyle}>Open demo sandbox</button>
                </>
              ) : (
                <>
                  <button onClick={() => void reloadLiveBoard()} style={secondaryButtonStyle}>Return to live board</button>
                  <button onClick={loadSampleData} style={secondaryButtonStyle}>Reload demo sandbox</button>
                </>
              )}
              <button onClick={clearData} style={secondaryButtonStyle}>{boardSource === "live" ? "Reset live view" : "Clear board"}</button>
              {boardSource === "local" ? (
                <>
                  <button onClick={exportBackup} title="Download a JSON backup of your current state" style={secondaryButtonStyle}>
                    Export backup
                  </button>
                  <button onClick={triggerImport} title="Import a previously exported backup JSON (overwrites current state)" style={secondaryButtonStyle}>
                    Import backup
                  </button>
                </>
              ) : null}
            </div>
            <p style={{ ...helperCaptionStyle, marginTop: 10 }}>
              {boardSource === "live"
                ? "Signed-in sessions load real jobs from Supabase. The demo sandbox is browser-only and never writes into the live ingest board."
                : "The demo sandbox stays in browser storage only. It is safe for walkthroughs and does not publish anything to the live job feed."}
            </p>

            <input
              ref={importRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => handleImportFile(e.target.files?.[0] ?? null)}
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 }}>
              <select value={state.mode} onChange={(e) => setMode(e.target.value as Mode)} title="Mode" style={selectInputStyle}>
                <option value="coach">Coach (Operator)</option>
                <option value="client">Client (preview)</option>
              </select>

              <select
                value={state.selectedClientId ?? ""}
                onChange={(e) => setState((s) => ({ ...s, selectedClientId: e.target.value || undefined }))}
                title="Client"
                style={selectInputStyle}
              >
                <option value="">All clients</option>
                {state.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {boardSource === "local" ? (
              <div style={{ marginTop: 14 }}>
                <AddClientInline onAdd={addClient} />
              </div>
            ) : (
              <p style={{ ...helperCaptionStyle, marginTop: 14 }}>
                Live mode uses clients already stored in Supabase. Use the client selector to filter or assign jobs to existing clients.
              </p>
            )}
          </div>

          <div style={utilityPanelStyle}>
            <p style={sectionEyebrowStyle}>Search</p>
            <h2 style={{ ...sectionTitleStyle, marginBottom: 8 }}>Filter the board</h2>
            <p style={{ ...mutedTextStyle, marginBottom: 14 }}>
              Search across role details and keep the board sorted with the same card-based presentation as coach.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, company, link, location, or salary..."
                style={textInputStyle}
              />

              <select value={sortMode} onChange={(e) => setSortMode(e.target.value as any)} title="Sort" style={selectInputStyle}>
                <option value="movedNewest">Sort: moved newest</option>
                <option value="createdNewest">Sort: created newest</option>
              </select>
            </div>
          </div>
        </section>

      {/* Coach-only Client Link panel */}
      {state.mode === "coach" && (
        <section style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div>
              <p style={sectionEyebrowStyle}>Client Link</p>
              <h2 style={sectionTitleStyle}>Share a client view</h2>
            </div>

            <div style={{ flex: 1 }} />

            <button onClick={copyClientLink} disabled={!canGenerateClientLink || copied} style={{ ...secondaryButtonStyle, opacity: !canGenerateClientLink ? 0.5 : 1 }}>
              {copied ? "Copied ✓" : "Copy client link"}
            </button>

            <button onClick={openClientLink} disabled={!canGenerateClientLink} style={{ ...secondaryButtonStyle, opacity: !canGenerateClientLink ? 0.5 : 1 }}>
              Open
            </button>

            <input
              readOnly
              value={canGenerateClientLink ? clientLinkValue : "Select a client (not 'All clients') to generate a link…"}
              style={{ ...textInputStyle, flex: "1 1 520px" }}
            />
          </div>

          <div style={{ ...mutedTextStyle, marginTop: 10 }}>
            Tip: Select a client from the dropdown, then copy this link and send it. Client sees only assigned jobs + client notes.
          </div>
        </section>
      )}

      {canViewCoachMatches ? (
        <div style={{ marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setCoachClientView("jobs")}
            style={{
              border: "1px solid #99b",
              padding: "6px 10px",
              borderRadius: 999,
              background: coachClientView === "jobs" ? "#d7ecff" : "#f4f7ff",
              fontWeight: coachClientView === "jobs" ? 800 : 600,
            }}
          >
            Jobs
          </button>
          <button
            onClick={() => setCoachClientView("matches")}
            style={{
              border: "1px solid #99b",
              padding: "6px 10px",
              borderRadius: 999,
              background: coachClientView === "matches" ? "#d7ecff" : "#f4f7ff",
              fontWeight: coachClientView === "matches" ? 800 : 600,
            }}
          >
            Matches
          </button>
        </div>
      ) : null}

      {coachClientView === "jobs" || !canViewCoachMatches ? (
        <>
          {/* Lane Tabs (UI uppercase) */}
          <div style={{ marginBottom: 14 }}>
            <nav aria-label="Board lanes" style={tabListStyle}>
            {UPPER_LANES.map((lane) => {
              const active = activeUpper === lane;
              return (
                <button
                  key={lane}
                  onClick={() => setActiveUpperLane(lane)}
                  style={{
                    ...secondaryButtonStyle,
                    gap: 8,
                    borderRadius: 999,
                    background: active ? "#ffffff" : "transparent",
                    boxShadow: active ? "0 8px 18px rgba(15, 23, 42, 0.08)" : "none",
                    fontWeight: active ? 800 : 600,
                  }}
                >
                  <span>{lane}</span>
                  <span
                    style={{
                      ...laneCountBadgeStyle,
                      background: active ? "#e2e8f0" : "rgba(15, 23, 42, 0.06)",
                      color: active ? "#0f172a" : "#475569",
                    }}
                  >
                    {counts[lane]}
                  </span>
                </button>
              );
            })}
            </nav>
          </div>

      {/* Main lane header */}
      <section style={{ ...cardStyle, marginBottom: 16, background: "linear-gradient(135deg, #ffffff 0%, #f6f9fc 62%, #eef6ff 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={sectionEyebrowStyle}>Active Lane</p>
            <h2 style={{ ...sectionTitleStyle, marginBottom: 8 }}>{activeUpper}</h2>
            <div style={mutedTextStyle}>
              {state.mode === "coach"
                ? "Triage fast: assign, notes, bulk move."
                : `Client: ${selectedClient?.name ?? "(missing)"} — shows assigned jobs + notes.`}
            </div>
          </div>
        </div>

        {state.mode === "coach" && (
          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <div style={inlineCardStyle}>
              <p style={sectionEyebrowStyle}>Quick Add</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Job title" style={textInputStyle} />
                <input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="Company" style={textInputStyle} />
                <input value={newLink} onChange={(e) => setNewLink(e.target.value)} placeholder="Link (optional)" style={textInputStyle} />
                <textarea
                  value={newIngestText}
                  onChange={(e) => setNewIngestText(e.target.value)}
                  placeholder="Paste email or job description (optional)"
                  rows={2}
                  style={{ ...textInputStyle, minWidth: 0, resize: "vertical" }}
                />
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={addJob} style={primaryButtonStyle}>Add Job</button>
                <button onClick={() => void addIngestedJob(true)} style={secondaryButtonStyle}>Save as Unverified</button>
                <span style={helperCaptionStyle}>
                  {boardSource === "live"
                    ? "Live mode saves into the Supabase jobs table. Use the raw payload field only when you want an ingestion record attached to the job."
                    : "Use the raw payload field only when you want an ingestion record attached to the job."}
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              <div style={inlineCardStyle}>
                <p style={sectionEyebrowStyle}>Selection</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button onClick={selectAllVisible} style={secondaryButtonStyle}>Select visible</button>
                  <button onClick={clearSelection} style={secondaryButtonStyle}>Clear selection</button>
                  <span style={badgeStyle}>Selected {selectedCount}</span>
                </div>
              </div>

              <div style={inlineCardStyle}>
                <p style={sectionEyebrowStyle}>Bulk Move</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select value={bulkMoveTarget} onChange={(e) => setBulkMoveTarget(e.target.value as UpperLaneId)} style={selectInputStyle}>
                    {UPPER_LANES.filter((l) => l !== activeUpper).map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <button onClick={bulkMoveSelected} disabled={selectedCount === 0} style={secondaryButtonStyle}>
                    Move selected
                  </button>
                </div>
              </div>

              <div style={inlineCardStyle}>
                <p style={sectionEyebrowStyle}>Bulk Assign</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select value={bulkAssignClientId} onChange={(e) => setBulkAssignClientId(e.target.value)} style={selectInputStyle}>
                    <option value="">Assign to client…</option>
                    {state.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button onClick={bulkAssignSelected} disabled={selectedCount === 0 || !bulkAssignClientId} title="Adds this client to selected jobs (does not overwrite)" style={secondaryButtonStyle}>
                    Add client
                  </button>
                </div>
                <p style={{ ...helperCaptionStyle, marginTop: 8 }}>Assignments are additive and keep any clients already linked to those jobs.</p>
              </div>
            </div>
          </div>
        )}
      </section>

          <div style={{ marginTop: 12 }}>
            {visibleJobs.length === 0 ? (
              <div style={{ ...cardStyle, padding: 20, opacity: 0.75, textAlign: "center", borderStyle: "dashed", boxShadow: "none" }}>No jobs in this lane.</div>
            ) : (
              visibleJobs.map((job) => (
                <JobCard
                  key={job.id}
                  mode={state.mode}
                  job={job}
                  clients={state.clients}
                  selected={state.selectedJobIds.includes(job.id)}
                  onToggleSelected={(checked) => toggleSelected(job.id, checked)}
                  onMove={(lane) => moveJob(job.id, lane)}
                  onAssignClient={(clientId) => addClientToJob(job.id, clientId)}
                  onRemoveClient={(clientId) => removeClientFromJob(job.id, clientId)}
                  onChangeClientNotes={(v) => setNotes(job.id, "clientNotes", v)}
                  onChangeInternalNotes={(v) => setNotes(job.id, "internalNotes", v)}
                  onSetOutcome={(v) => setOutcome(job.id, v)}
                  notesMode={boardSource === "live" ? "context" : "local"}
                />
              ))
            )}
          </div>

          {selectedJobContext ? (
            <div style={{ marginTop: 12 }}>
              <JobContextPanel job={selectedJobContext} mode={state.mode} />
            </div>
          ) : null}
        </>
      ) : (
        <div style={{ marginTop: 12 }}>
          <JobMatchesTable clientId={state.selectedClientId as string} />
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: 12, opacity: 0.75 }}>
        {boardSource === "live" ? "Live source: Supabase jobs + job assignments" : <>Local storage key: <code>{STORAGE_KEY}</code></>}
      </div>
      </div>
    </main>
  );
}

/* ---------------------------
   Components
----------------------------*/

function AddClientInline({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add client…" style={{ ...textInputStyle, width: 220 }} />
      <button
        style={secondaryButtonStyle}
        onClick={() => {
          const n = name.trim();
          if (!n) return;
          onAdd(n);
          setName("");
        }}
      >
        Add
      </button>
    </div>
  );
}

function JobCard(props: {
  mode: Mode;
  job: Job;
  clients: Client[];
  selected: boolean;

  onToggleSelected: (checked: boolean) => void;
  onMove: (lane: UpperLaneId) => void;

  onAssignClient: (clientId: string) => void;
  onRemoveClient: (clientId: string) => void;

  onChangeClientNotes: (value: string) => void;
  onChangeInternalNotes: (value: string) => void;
  onSetOutcome: (value: Job["outcome_status"]) => void;
  notesMode: "local" | "context";
}) {
  const { mode, job, clients, selected, notesMode } = props;

  const assignedClients = useMemo(() => {
    const map = new Map(clients.map((c) => [c.id, c]));
    return job.assignedClientIds.map((id) => map.get(id)).filter(Boolean) as Client[];
  }, [clients, job.assignedClientIds]);

  const [assignPick, setAssignPick] = useState<string>("");
  const [sendPick, setSendPick] = useState<string>("");

  useEffect(() => {
    setAssignPick("");
    setSendPick("");
  }, [job.id]);

  const upperLane = toUpperLane(job.lane);
  const showSendToClient = mode === "coach" && upperLane === "VERIFIED" && assignedClients.length === 0;
  const outcomeLabel =
    job.outcome_status === "interview"
      ? "Interview"
      : job.outcome_status === "no_response"
      ? "No response"
      : job.outcome_status === "rejected"
      ? "Rejected"
      : job.outcome_status === "offer"
      ? "Offer"
      : "—";
  const lastResponseLabel =
    job.last_response_at && !Number.isNaN(new Date(job.last_response_at).getTime())
      ? new Date(job.last_response_at).toLocaleDateString()
      : "—";
  const responseTimeLabel =
    job.createdAt &&
    job.last_response_at &&
    !Number.isNaN(new Date(job.last_response_at).getTime())
      ? `${Math.ceil(
          (new Date(job.last_response_at).getTime() - job.createdAt) /
            (1000 * 60 * 60 * 24)
        )} days`
      : "—";

  return (
    <div style={{ ...cardStyle, marginTop: 10, padding: 18, minWidth: 0, overflowX: "hidden", boxShadow: "0 12px 32px rgba(15, 23, 42, 0.05)" }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 260px", overflowWrap: "anywhere" }}>
            {mode === "coach" && (
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={selected} onChange={(e) => props.onToggleSelected(e.target.checked)} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>{job.title}</div>
                  <div style={{ color: "#526071", marginTop: 2 }}>{job.company}</div>
                </div>
              </label>
            )}

            {mode === "client" && (
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>{job.title}</div>
                <div style={{ color: "#526071", marginTop: 2 }}>{job.company}</div>
              </div>
            )}

            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={badgeStyle}>{upperLane}</span>
              {job.location ? <span style={badgeStyle}>{job.location}</span> : null}
              {job.salary ? <span style={badgeStyle}>{job.salary}</span> : null}
            </div>

            {job.link ? (
              <div style={{ marginTop: 8 }}>
                <a href={job.link} target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
                  {job.link}
                </a>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{new Date(job.movedAt).toLocaleString()}</div>

            {mode === "coach" && (
              <select value={upperLane} onChange={(e) => props.onMove(e.target.value as UpperLaneId)} title="Move" style={selectInputStyle}>
                {UPPER_LANES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {mode === "coach" && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Assigned</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {assignedClients.length === 0 ? <span style={{ opacity: 0.7 }}>None</span> : null}

              {assignedClients.map((c) => (
                <span
                  key={c.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    border: "1px solid #bbb",
                    borderRadius: 999,
                    padding: "2px 8px",
                    background: "#f7f7f7",
                  }}
                >
                  {c.name}
                  <button
                    onClick={() => props.onRemoveClient(c.id)}
                    style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 900 }}
                    title="Remove"
                  >
                    ×
                  </button>
                </span>
              ))}

              <select value={assignPick} onChange={(e) => setAssignPick(e.target.value)} style={selectInputStyle}>
                <option value="">Assign client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  if (!assignPick) return;
                  props.onAssignClient(assignPick);
                  setAssignPick("");
                }}
                disabled={!assignPick}
                style={compactButtonStyle}
              >
                Assign
              </button>
            </div>
          </div>
        )}

        {showSendToClient && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Send to Client</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <select value={sendPick} onChange={(e) => setSendPick(e.target.value)} style={selectInputStyle}>
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (!sendPick) return;
                  props.onAssignClient(sendPick);
                  setSendPick("");
                }}
                disabled={!sendPick}
                style={compactButtonStyle}
              >
                Send to Client
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 10, minWidth: 0 }}>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>
            Client Notes (client-safe){notesMode === "context" ? " · saved live" : ""}
          </div>
          <textarea
            value={job.clientNotes}
            onChange={(e) => props.onChangeClientNotes(e.target.value)}
            rows={2}
            style={{ display: "block", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box", padding: 8, resize: "vertical" }}
            readOnly={mode === "client"}
          />
        </div>

        {mode === "coach" && (
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            <div style={{ marginBottom: 4 }}>Outcome</div>
            <div>Outcome: {outcomeLabel}</div>
            <div>Last Response: {lastResponseLabel}</div>
            <div>Time to Response: {responseTimeLabel}</div>
          </div>
        )}

        {mode === "coach" && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Set Outcome</div>
            <select
              value={job.outcome_status ?? ""}
              onChange={(e) =>
                props.onSetOutcome(
                  (e.target.value || null) as Job["outcome_status"]
                )
              }
              style={selectInputStyle}
            >
              <option value="">Select…</option>
              <option value="interview">Interview</option>
              <option value="no_response">No response</option>
              <option value="rejected">Rejected</option>
              <option value="offer">Offer</option>
            </select>
          </div>
        )}

        {mode === "coach" && (
          <div style={{ marginTop: 10, minWidth: 0 }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>
              Internal Notes (coach-only){notesMode === "context" ? " · saved live" : ""}
            </div>
            <textarea
              value={job.internalNotes}
              onChange={(e) => props.onChangeInternalNotes(e.target.value)}
              rows={2}
              style={{ display: "block", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box", padding: 8, resize: "vertical" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function JobContextPanel({ job, mode }: { job: Job; mode: Mode }) {
  type JobNote = {
    id: string;
    author_role: string;
    body: string;
    created_at: string;
  };

  const [notes, setNotes] = useState<JobNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [submittingNote, setSubmittingNote] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [newNoteBody, setNewNoteBody] = useState("");

  async function fetchNotes() {
    setLoadingNotes(true);
    setNotesError(null);

    try {
      const {
        data: { session },
      } = await getSupabaseBrowser().auth.getSession();

      const accessToken = session?.access_token;
      const headers: HeadersInit = {};
      if (accessToken) {
        headers.authorization = `Bearer ${accessToken}`;
      }

      const response = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/notes`, {
        method: "GET",
        headers,
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        notes?: JobNote[];
        error?: string;
      };

      if (!response.ok || !payload?.ok) {
        setNotes([]);
        setNotesError(payload?.error ?? "Failed to load notes");
        return;
      }

      const sorted = Array.isArray(payload.notes)
        ? [...payload.notes].sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          )
        : [];

      setNotes(sorted);
    } catch {
      setNotes([]);
      setNotesError("Failed to load notes");
    } finally {
      setLoadingNotes(false);
    }
  }

  useEffect(() => {
    setNewNoteBody("");
    void fetchNotes();
  }, [job.id]);

  async function handleSubmitNote(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const body = newNoteBody.trim();
    if (!body || body.length > 2000) {
      setNotesError("Note must be 1-2000 characters");
      return;
    }

    setSubmittingNote(true);
    setNotesError(null);

    try {
      const {
        data: { session },
      } = await getSupabaseBrowser().auth.getSession();

      const accessToken = session?.access_token;
      const headers: HeadersInit = {
        "content-type": "application/json",
      };
      if (accessToken) {
        headers.authorization = `Bearer ${accessToken}`;
      }

      const response = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/notes`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          body,
          author_role: mode === "client" ? "client" : "coach",
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !payload?.ok) {
        setNotesError(payload?.error ?? "Failed to save note");
        return;
      }

      setNewNoteBody("");
      await fetchNotes();
    } catch {
      setNotesError("Failed to save note");
    } finally {
      setSubmittingNote(false);
    }
  }

  return (
    <aside
      style={{
        border: "1px solid #99b",
        borderRadius: 10,
        background: "#f8fbff",
        padding: 12,
      }}
      aria-label="Job Context Panel"
    >
      <div style={{ fontWeight: 800, marginBottom: 6 }}>Job Context</div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Title</div>
        <div>{job.title || "(Untitled)"}</div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Company</div>
        <div>{job.company || "(Unknown company)"}</div>
      </div>
      <div style={{ borderTop: "1px solid #ccd7ee", paddingTop: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Notes</div>

        {loadingNotes ? (
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
            Notes loading...
          </div>
        ) : notesError ? (
          <div style={{ fontSize: 13, color: "#b91c1c", marginBottom: 10 }}>
            {notesError}
          </div>
        ) : notes.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
            No notes yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
            {notes.map((note) => (
              <div
                key={note.id}
                style={{
                  border: "1px solid #d6e0f2",
                  borderRadius: 8,
                  padding: 8,
                  background: "#fff",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>
                  {note.author_role === "coach"
                    ? "Coach"
                    : note.author_role === "client"
                    ? "Client"
                    : note.author_role}{" "}
                  · {new Date(note.created_at).toLocaleString()}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{note.body}</div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmitNote}>
          <textarea
            value={newNoteBody}
            onChange={(e) => setNewNoteBody(e.target.value)}
            rows={3}
            placeholder="Add a note..."
            style={{ width: "100%", padding: 8, marginBottom: 6 }}
            disabled={submittingNote}
          />
          <button type="submit" disabled={submittingNote}>
            {submittingNote ? "Saving..." : "Add Note"}
          </button>
        </form>
      </div>
    </aside>
  );
}
