"use server";

import { getCoachSupabase } from "@/lib/supabase/coach";

export async function updateJobLane(jobId: string, lane: string) {
  const supabase = getCoachSupabase();

  const { error } = await supabase
    .from("jobs")
    .update({ lane })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message);
  }
}
