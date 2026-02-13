import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestJob } from "@/lib/ingest/ingestJob";

export async function runGreenhouseStub(input: {
  company: string;
  supabase: SupabaseClient;
}): Promise<{ attempted: number; ingested: number; duplicates: number }> {
  const jobs = [
    { title: "Software Engineer", link: "https://example.com/se" },
    { title: "Product Manager", link: "https://example.com/pm" },
  ];

  let attempted = 0;
  let ingested = 0;
  let duplicates = 0;

  for (const job of jobs) {
    attempted += 1;

    const result = await ingestJob({
      source: "greenhouse",
      title: job.title,
      company: input.company,
      link: job.link,
      created_by_role: "system",
      created_by_id: null,
      source_detail: "greenhouse_stub",
      supabase: input.supabase,
    });

    if (result.ok) {
      ingested += 1;
      continue;
    }

    if (result.reason === "duplicate") {
      duplicates += 1;
      continue;
    }
  }

  return { attempted, ingested, duplicates };
}
