import type { SupabaseClient } from "@supabase/supabase-js";

function readErrorField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function serializeIngestError(error: unknown): string {
  if (error instanceof Error) {
    return readErrorField(error.message) ?? readErrorField(error.name) ?? "Unexpected server error";
  }

  if (typeof error === "string") {
    return readErrorField(error) ?? "Unexpected server error";
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const directMessage =
      readErrorField(record.message) ??
      readErrorField(record.error) ??
      readErrorField(record.details) ??
      readErrorField(record.hint) ??
      readErrorField(record.code);

    if (directMessage) return directMessage;

    try {
      const serialized = JSON.stringify(error);
      return readErrorField(serialized) ?? "Unexpected server error";
    } catch {
      return "Unexpected server error";
    }
  }

  return "Unexpected server error";
}

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
  error_message: unknown;
  supabase: SupabaseClient;
}): Promise<void> {
  const { error } = await input.supabase
    .from("ingest_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: serializeIngestError(input.error_message),
    })
    .eq("id", input.ingest_run_id);

  if (error) {
    throw error;
  }
}
