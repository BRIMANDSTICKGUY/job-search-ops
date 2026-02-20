import type { SupabaseClient } from "@supabase/supabase-js";

export async function startIngestRun(input: {
  source: string;
  metadata?: unknown;
  supabase: SupabaseClient;
}): Promise<{ ingest_run_id: string }> {
  const { data, error } = await input.supabase
    .from("ingest_runs")
    .insert({
      source: input.source,
      status: "running",
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[CRON_DIAG][startIngestRun][SUPABASE_ERROR]", error);
    throw error;
  }

  if (!data?.id) {
    throw new Error("Ingest run insert succeeded without returning id");
  }

  return { ingest_run_id: data.id as string };
}

export async function completeIngestRun(input: {
  ingest_run_id: string;
  job_count: number;
  supabase: SupabaseClient;
}): Promise<void> {
  const { error } = await input.supabase
    .from("ingest_runs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      job_count: input.job_count,
    })
    .eq("id", input.ingest_run_id);

  if (error) {
    throw error;
  }
}

export async function failIngestRun(input: {
  ingest_run_id: string;
  error_message: string;
  supabase: SupabaseClient;
}): Promise<void> {
  const { error } = await input.supabase
    .from("ingest_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message:
        typeof input.error_message === "string"
          ? input.error_message
          : input.error_message
            ? JSON.stringify(input.error_message)
            : null,
    })
    .eq("id", input.ingest_run_id);

  if (error) {
    throw error;
  }
}
