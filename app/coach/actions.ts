"use server";

import { getCoachSupabase } from "@/lib/supabase/coach";
import { revalidatePath } from "next/cache";

export async function updateJobLane(jobId: string, lane: string) {
  const supabase = getCoachSupabase();
  if (!supabase) {
    console.error("Coach Supabase client unavailable; lane update skipped.");
    return;
  }

  const { error } = await supabase
    .from("jobs")
    .update({ lane } as { lane: string })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/coach");
}
