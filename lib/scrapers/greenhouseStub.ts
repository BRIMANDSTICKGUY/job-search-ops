import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestJob } from "@/lib/ingest/ingestJob";

type GreenhouseStubJob = {
  title: string;
  company: string;
  link?: string | null;
  raw?: unknown;
};

export async function getGreenhouseStubJobs(): Promise<GreenhouseStubJob[]> {
  return [
    {
      title: "Software Engineer",
      company: "Greenhouse Stub Co",
      link: "https://example.com/se",
      raw: { source: "greenhouse_stub", role: "Software Engineer" },
    },
    {
      title: "Product Manager",
      company: "Greenhouse Stub Co",
      link: "https://example.com/pm",
      raw: { source: "greenhouse_stub", role: "Product Manager" },
    },
  ];
}

export async function runGreenhouseStub(input: {
  company: string;
  supabase: SupabaseClient;
}): Promise<{ attempted: number; ingested: number; duplicates: number }> {
  const jobs = await getGreenhouseStubJobs();

  let attempted = 0;
  let ingested = 0;
  let duplicates = 0;

  for (const job of jobs) {
    attempted += 1;

    const result = await ingestJob({
      source: "greenhouse",
      title: job.title,
      company: input.company,
      link: job.link ?? null,
      created_by_role: "system",
      created_by_id: null,
      raw_payload: job.raw ?? job,
      source_detail: "greenhouse_stub",
      supabase: input.supabase,
    });

    if (result.duplicate === true) {
      duplicates += 1;
      continue;
    }

    ingested += 1;
  }

  return { attempted, ingested, duplicates };
}
