import type { JobSignals, MatchJobInput } from "./types";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function rawPayloadToText(raw: unknown): string {
  if (typeof raw === "string") return normalizeText(raw);
  try {
    return normalizeText(JSON.stringify(raw ?? {}));
  } catch {
    return "";
  }
}

export function extractJobSignals(job: MatchJobInput): JobSignals {
  const title = normalizeText(job.title);
  const company = normalizeText(job.company);
  const location = normalizeText(job.location);
  const rawText = rawPayloadToText(job.raw_payload);
  const haystack = [title, company, location, rawText].filter(Boolean).join(" ");

  return {
    id: String(job.id),
    title,
    company,
    location,
    haystack,
  };
}
