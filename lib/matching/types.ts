export type RemotePreference = "remote" | "hybrid" | "onsite" | "all";

export type MatchClientProfile = {
  client_id?: string;
  primary_role: string;
  secondary_role?: string | null;
  core_skills?: string[] | null;
  preferred_locations?: string[] | null;
  remote_preference?: RemotePreference | null;
};

export type MatchJobInput = {
  id: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  raw_payload?: unknown;
};

export type JobSignals = {
  id: string;
  title: string;
  company: string;
  location: string;
  haystack: string;
};

export type MatchFlags = {
  roleMatched?: boolean;
  locationMatched?: boolean;
  skillsMatchedCount?: number;
};

export type MatchResult = {
  score: number;
  reasons: string[];
  flags?: MatchFlags;
};
