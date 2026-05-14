"use server";

import { getCoachSupabase } from "@/lib/supabase/coach";
import { getCoachSession } from "@/lib/auth/coach";
import { revalidatePath } from "next/cache";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type ExistingAssignmentRow = {
  id: string;
  client_id: string | null;
  client_id_uuid: string | null;
  client_id_legacy: string | null;
};

async function assertCoachAccess() {
  const { user, isCoach } = await getCoachSession();

  if (!user || !isCoach) {
    throw new Error("Unauthorized");
  }
}

export async function updateJobLane(jobId: string, lane: string) {
  await assertCoachAccess();

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
  await assertCoachAccess();

  const supabase = getCoachSupabase();
  if (!supabase) {
    console.error("Coach Supabase client unavailable; assignment skipped.");
    return;
  }

  if (!jobId || !clientId) {
    throw new Error("Missing jobId or clientId");
  }

  const clientIdTrimmed = clientId.trim();
  let clientIdUuid = isUuid(clientIdTrimmed) ? clientIdTrimmed : null;

  if (!clientIdUuid) {
    const { data: clientRow, error: clientLookupError } = await (supabase as any)
      .from("clients")
      .select("id, auth_user_id")
      .eq("id", clientIdTrimmed)
      .maybeSingle();

    if (clientLookupError) {
      throw new Error(clientLookupError.message);
    }

    if (clientRow && typeof clientRow.auth_user_id === "string" && isUuid(clientRow.auth_user_id)) {
      clientIdUuid = clientRow.auth_user_id;
    }
  }

  if (!clientIdUuid) {
    throw new Error("Client is not mapped to an auth user id");
  }

  const { data: existingRows, error: existingError } = await (supabase as any)
    .from("job_assignments")
    .select("id, client_id, client_id_uuid, client_id_legacy")
    .eq("job_id", jobId)
    .limit(200);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existing = ((existingRows ?? []) as ExistingAssignmentRow[]).find((row) => {
    const byClientId = (row.client_id ?? "").trim() === clientIdUuid;
    const byClientIdUuid = (row.client_id_uuid ?? "").trim() === clientIdUuid;
    const byLegacy = (row.client_id_legacy ?? "").trim() === clientIdTrimmed;
    return byClientId || byClientIdUuid || byLegacy;
  });

  if (existing) {
    revalidatePath("/coach");
    return;
  }

  const { error } = await (supabase as any).from("job_assignments").insert({
    job_id: jobId,
    client_id: clientIdUuid,
    client_id_uuid: clientIdUuid,
    client_id_legacy: clientIdTrimmed,
    assigned_at: new Date().toISOString(),
    assigned_by: null,
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

export async function assignJobToClientFromForm(jobId: string, formData: FormData) {
  const clientId = formData.get("clientId");
  if (typeof clientId !== "string" || clientId.trim().length === 0) {
    return;
  }

  await assignJobToClient(jobId, clientId);
}
