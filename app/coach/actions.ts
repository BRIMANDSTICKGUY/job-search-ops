"use server";

import crypto from "node:crypto";
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

type ClientRow = {
  id: string;
  email: string | null;
  auth_user_id: string | null;
};

async function assertCoachAccess() {
  const { user, isCoach } = await getCoachSession();

  if (!user || !isCoach) {
    throw new Error("Unauthorized");
  }
}

function slugifyClientId(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "client";
}

async function buildUniqueClientId(supabase: ReturnType<typeof getCoachSupabase>, baseName: string) {
  const baseId = slugifyClientId(baseName);
  const { data, error } = await (supabase as any)
    .from("clients")
    .select("id")
    .ilike("id", `${baseId}%`)
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  const existingIds = new Set(((data ?? []) as Array<{ id?: string | null }>).map((row) => (row.id ?? "").trim()));
  if (!existingIds.has(baseId)) return baseId;

  let suffix = 2;
  while (existingIds.has(`${baseId}_${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}_${suffix}`;
}

async function ensureClientAuthUser(
  supabase: ReturnType<typeof getCoachSupabase>,
  email: string,
  name: string
) {
  const admin = supabase?.auth?.admin;
  if (!admin) {
    throw new Error("Coach auth admin client unavailable");
  }

  const { data: usersPage, error: usersError } = await admin.listUsers({ page: 1, perPage: 200 });
  if (usersError) {
    throw new Error(usersError.message);
  }

  const existingUser = (usersPage.users ?? []).find(
    (user) => (user.email ?? "").trim().toLowerCase() === email.toLowerCase()
  );

  if (existingUser) {
    return existingUser.id;
  }

  const generatedPassword = `${crypto.randomBytes(18).toString("base64url")}A1!`;
  const { data: createdUser, error: createUserError } = await admin.createUser({
    email,
    password: generatedPassword,
    email_confirm: true,
    user_metadata: { role: "client", name },
  });

  if (createUserError || !createdUser.user?.id) {
    throw new Error(createUserError?.message || "Failed to create client auth user");
  }

  return createdUser.user.id;
}

export async function createCoachClientOnboarding(formData: FormData) {
  await assertCoachAccess();

  const supabase = getCoachSupabase();
  if (!supabase) {
    throw new Error("Coach Supabase client unavailable; client creation skipped.");
  }

  const name = typeof formData.get("name") === "string" ? String(formData.get("name")).trim() : "";
  const email = typeof formData.get("email") === "string" ? String(formData.get("email")).trim().toLowerCase() : "";

  if (!name || !email) {
    throw new Error("Client name and email are required");
  }

  const authUserId = await ensureClientAuthUser(supabase, email, name);
  const { data: existingClient, error: existingClientError } = await (supabase as any)
    .from("clients")
    .select("id, email, auth_user_id")
    .eq("email", email)
    .maybeSingle();

  if (existingClientError) {
    throw new Error(existingClientError.message);
  }

  let clientId = (existingClient as ClientRow | null)?.id ?? "";

  if (!clientId) {
    clientId = await buildUniqueClientId(supabase, name);
    const { error: insertError } = await (supabase as any).from("clients").insert({
      id: clientId,
      name,
      email,
      auth_user_id: authUserId,
      program_status: "coach_onboarding",
    });

    if (insertError) {
      throw new Error(insertError.message);
    }
  } else {
    const { error: updateError } = await (supabase as any)
      .from("clients")
      .update({ name, email, auth_user_id: authUserId, program_status: "coach_onboarding", updated_at: new Date().toISOString() })
      .eq("id", clientId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  revalidatePath("/coach");
}

export async function updateClientProgramStatus(clientId: string, programStatus: string) {
  await assertCoachAccess();

  const supabase = getCoachSupabase();
  if (!supabase) {
    throw new Error("Coach Supabase client unavailable; client status update skipped.");
  }

  const normalizedStatus = programStatus.trim();
  if (!normalizedStatus) {
    throw new Error("Program status is required");
  }

  const { error } = await (supabase as any)
    .from("clients")
    .update({ program_status: normalizedStatus, updated_at: new Date().toISOString() })
    .eq("id", clientId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/coach");
  revalidatePath(`/coach/clients/${clientId}`);
}

export async function updateClientProgramStatusFromForm(clientId: string, formData: FormData) {
  const programStatus = formData.get("programStatus");
  if (typeof programStatus !== "string" || programStatus.trim().length === 0) {
    throw new Error("Program status is required");
  }

  await updateClientProgramStatus(clientId, programStatus);
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
