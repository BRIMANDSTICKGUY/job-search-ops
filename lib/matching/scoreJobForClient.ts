import { extractJobSignals } from "./extractJobSignals";
import type { MatchClientProfile, MatchJobInput, MatchResult } from "./types";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function toCleanList(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((v) => normalizeText(v)).filter((v) => v.length > 0);
}

function clampScore(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

export function scoreJobForClient(
  profile: MatchClientProfile,
  job: MatchJobInput
): MatchResult {
  const signals = extractJobSignals(job);

  const reasons: string[] = [];
  const roles = [
    normalizeText(profile.primary_role),
    normalizeText(profile.secondary_role),
  ].filter((role) => role.length > 0);
  const preferredLocations = toCleanList(profile.preferred_locations);
  const coreSkills = toCleanList(profile.core_skills);
  const remotePreference = profile.remote_preference ?? "all";

  let score = 0;

  const roleHits = roles.filter((role) => signals.haystack.includes(role));
  const roleMatched = roleHits.length > 0;
  if (roleMatched) {
    score += 45;
    reasons.push(`Role match: ${roleHits.join(", ")}`);
  } else {
    reasons.push("No role match");
  }

  let locationMatched = false;
  if (remotePreference === "all") {
    locationMatched = true;
    score += 20;
    reasons.push("Location preference: all");
  } else if (preferredLocations.length === 0) {
    locationMatched = true;
    score += 10;
    reasons.push("No preferred locations set");
  } else {
    const locationHits = preferredLocations.filter((loc) =>
      signals.location.includes(loc)
    );
    locationMatched = locationHits.length > 0;
    if (locationMatched) {
      score += 20;
      reasons.push(`Location match: ${locationHits.join(", ")}`);
    } else {
      reasons.push("No location match");
    }
  }

  const skillHits = coreSkills.filter((skill) => signals.haystack.includes(skill));
  if (skillHits.length > 0) {
    score += Math.min(skillHits.length * 7, 35);
    reasons.push(`Skill matches: ${skillHits.join(", ")}`);
  } else if (coreSkills.length > 0) {
    reasons.push("No core skill matches");
  } else {
    reasons.push("No core skills defined");
  }

  return {
    score: clampScore(score),
    reasons,
    flags: {
      roleMatched,
      locationMatched,
      skillsMatchedCount: skillHits.length,
    },
  };
}
