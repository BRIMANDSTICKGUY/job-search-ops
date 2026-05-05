export const STORAGE_KEY = "job-search-ops:mvp:v1";

/**
 * Canonical lane policy:
 * - Internal state/storage: lowercase LaneId
 * - UI only: uppercase UpperLaneId
 */
export type LaneId = "inbox" | "verified" | "clientSent" | "watchlist" | "rejected";

export type UpperLaneId = "INBOX" | "VERIFIED" | "CLIENT-SENT" | "WATCHLIST" | "REJECTED";

export type Mode = "coach" | "client";

export type JobSourceType = "greenhouse" | "lever" | "ashby" | "workday" | "smartrecruiters";

export type Client = {
  id: string;
  name: string;
  email?: string;
};

export type Job = {
  id: string;
  title: string;
  company: string;
  link?: string;
  location?: string;
  salary?: string;

  lane: LaneId;

  // ✅ multi-assign
  assignedClientIds: string[];

  // ✅ split notes
  clientNotes: string;
  internalNotes: string;

  createdAt: number;
  movedAt: number;

  // Outcome signals (read-only for now)
  outcome_status?: "interview" | "no_response" | "rejected" | "offer" | null;
  last_response_at?: string | null;
};

export type AppState = {
  version: number;
  mode: Mode;

  clients: Client[];
  jobs: Job[];

  // canonical lane (lowercase)
  activeLane: LaneId;

  selectedJobIds: string[];

  // optional filter for coach UI or preview mode
  selectedClientId?: string;
};

export function toUpperLane(lane: LaneId): UpperLaneId {
  switch (lane) {
    case "inbox":
      return "INBOX";
    case "verified":
      return "VERIFIED";
    case "clientSent":
      return "CLIENT-SENT";
    case "watchlist":
      return "WATCHLIST";
    case "rejected":
      return "REJECTED";
  }
}

export function toLowerLane(lane: UpperLaneId): LaneId {
  switch (lane) {
    case "INBOX":
      return "inbox";
    case "VERIFIED":
      return "verified";
    case "CLIENT-SENT":
      return "clientSent";
    case "WATCHLIST":
      return "watchlist";
    case "REJECTED":
      return "rejected";
  }
}

/**
 * Defensive normalization for lane values read from LocalStorage.
 * Accepts:
 * - lowercase canonical
 * - uppercase UI labels
 * - common variants ("client-sent", "client_sent", etc.)
 * Falls back to "inbox".
 */
export function normalizeLane(input: unknown): LaneId {
  if (typeof input !== "string") return "inbox";

  const raw = input.trim();
  if (!raw) return "inbox";

  // exact canonical
  if (raw === "inbox" || raw === "verified" || raw === "clientSent" || raw === "watchlist" || raw === "rejected") {
    return raw;
  }

  const up = raw.toUpperCase();

  // uppercase UI labels
  if (up === "INBOX") return "inbox";
  if (up === "VERIFIED") return "verified";
  if (up === "CLIENT-SENT") return "clientSent";
  if (up === "WATCHLIST") return "watchlist";
  if (up === "REJECTED") return "rejected";

  // tolerate separators
  const collapsed = raw.replace(/[\s_-]+/g, "").toLowerCase();
  if (collapsed === "inbox") return "inbox";
  if (collapsed === "verified") return "verified";
  if (collapsed === "clientsent") return "clientSent";
  if (collapsed === "watchlist") return "watchlist";
  if (collapsed === "rejected") return "rejected";

  return "inbox";
}
