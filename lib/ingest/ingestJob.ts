import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type IngestJobInput = {
  source: string;
  title: string;
  company: string;
  link: string | null;
  created_by_role: "coach" | "client" | "system";
  created_by_id: string | null;
  ingest_run_id?: string;
  raw_payload?: unknown;
  source_detail?: string;
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
  const insertPayload = {
    title,
    company,
    link: input.link,
    source: input.source,
    idempotency_key: idempotencyKey,
    created_by_role: input.created_by_role,
    created_by_id: input.created_by_id,
    ...(input.raw_payload !== undefined ? { raw_payload: input.raw_payload } : {}),
    ...(input.source_detail !== undefined ? { source_detail: input.source_detail } : {}),
  };

  console.error("[CRON_DIAG][ingestJob][jobs][payload_keys]", Object.keys(insertPayload));
  console.error(
    "[CRON_DIAG][ingestJob][jobs][has_ingest_run_id]",
    "ingest_run_id" in insertPayload
  );
  const { data, error } = await input.supabase
    .from("jobs")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    console.error("[CRON_DIAG][ingestJob][jobs][SUPABASE_ERROR]", error);
    if (error.code === "23505") {
      return { ok: false, reason: "duplicate" };
    }
    throw error;
  }

  if (!data?.id) {
    throw new Error("Ingestion insert succeeded without returning job id");
  }

  const sourceIdentifier =
    input.link ?? `${input.source}|${title.toLowerCase()}|${company.toLowerCase()}`;

  const jobIngestionEventPayload = {
    job_id: data.id,
    source_type: input.source,
    source_identifier: sourceIdentifier,
    link: input.link,
    raw_payload: input.raw_payload ?? null,
    ...(input.ingest_run_id !== undefined ? { ingest_run_id: input.ingest_run_id } : {}),
  };

  console.error("[CRON_DIAG][ingestJob][job_ingestion_events][payload]", jobIngestionEventPayload);
  console.error("[CRON_DIAG][ingestJob][job_ingestion_events][ingest_run_id]", {
    value: input.ingest_run_id,
    type: typeof input.ingest_run_id,
  });
  console.error("[CRON_DIAG][ingestJob][job_ingestion_events][expected_columns]", [
    "id",
    "job_id",
    "source_type",
    "source_identifier",
    "link",
    "raw_payload",
    "ingest_run_id",
    "created_at",
  ]);

  const { error: eventError } = await input.supabase
    .from("job_ingestion_events")
    .insert(jobIngestionEventPayload);

  if (eventError) {
    console.error("[CRON_DIAG][ingestJob][job_ingestion_events][NON_BLOCKING_ERROR]", eventError);
  }

  return { ok: true, job_id: data.id as string };
}
