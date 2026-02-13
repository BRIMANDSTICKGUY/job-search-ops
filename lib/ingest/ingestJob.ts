import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type IngestJobInput = {
  source: string;
  title: string;
  company: string;
  link: string | null;
  created_by_role: "coach" | "client" | "system";
  created_by_id: string | null;
  supabase: SupabaseClient;
};

type IngestJobResult =
  | { ok: true; job_id: string }
  | { ok: false; reason: "duplicate" };

function buildIdempotencyKey(source: string, title: string, company: string): string {
  return createHash("sha256")
    .update(`${source}|${title.toLowerCase()}|${company.toLowerCase()}`)
    .digest("hex");
}

export async function ingestJob(input: IngestJobInput): Promise<IngestJobResult> {
  const title = input.title.trim();
  const company = input.company.trim();
  const idempotencyKey = buildIdempotencyKey(input.source, title, company);

  const { data, error } = await input.supabase
    .from("jobs")
    .insert({
      title,
      company,
      link: input.link,
      source: input.source,
      idempotency_key: idempotencyKey,
      created_by_role: input.created_by_role,
      created_by_id: input.created_by_id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, reason: "duplicate" };
    }
    throw error;
  }

  if (!data?.id) {
    throw new Error("Ingestion insert succeeded without returning job id");
  }

  return { ok: true, job_id: data.id as string };
}
