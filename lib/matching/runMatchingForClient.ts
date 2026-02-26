import { scoreJobForClient } from "./scoreJobForClient";
import type {
  MatchClientProfile,
  MatchFlags,
  MatchJobInput,
} from "./types";

export function runMatchingForClient(
  profile: MatchClientProfile,
  jobs: MatchJobInput[]
): Array<{
  job_id: string;
  score: number;
  reasons: string[];
  flags?: MatchFlags;
}> {
  if (jobs.length === 0) return [];

  return jobs
    .map((job) => {
      const result = scoreJobForClient(profile, job);
      return {
        job_id: String(job.id),
        score: result.score,
        reasons: result.reasons,
        flags: result.flags,
      };
    })
    .sort((a, b) => b.score - a.score);
}
