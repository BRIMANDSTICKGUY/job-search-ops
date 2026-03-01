"use server";

import { getCoachSupabase } from "@/lib/supabase/coach";
import { revalidatePath } from "next/cache";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function updateJobLane(jobId: string, lane: string) {
  const supabase = getCoachSupabase();
  if (!supabase) {
    console.error("Coach Supabase client unavailable; lane update skipped.");
    return;
  }

  const { error } = await (supabase as any)
    .from("jobs")
    .update({ lane })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/coach");
}

export async function assignJobToClient(jobId: string, clientId: string) {
  const supabase = getCoachSupabase();
  if (!supabase) {
    console.error("Coach Supabase client unavailable; assignment skipped.");
    return;
  }

  if (!jobId || !clientId) {
    throw new Error("Missing jobId or clientId");
  }

  const clientIdTrimmed = clientId.trim();
  if (!isUuid(clientIdTrimmed)) {
    throw new Error("clientId must be a valid UUID");
  }

  const { error } = await (supabase as any).from("job_assignments").insert({
    job_id: jobId,
    client_id: clientIdTrimmed,
    client_id_uuid: clientIdTrimmed,
    client_id_legacy: clientIdTrimmed,
  });

  if (error) {
    console.error("Failed to assign job to client", {
      jobId,
      clientId,
      message: error.message,
    });
    throw new Error(error.message);
  }

  revalidatePath("/coach");
}
