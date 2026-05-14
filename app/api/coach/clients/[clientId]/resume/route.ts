export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCoachSession } from "@/lib/auth/coach";

type ExtractedResumeProfile = {
  file_name: string;
  primary_role: string;
  secondary_role: string;
  career_level: "" | "early" | "mid" | "senior" | "executive";
  core_skills: string[];
  industry_keywords: string[];
  preferred_locations: string[];
  remote_preference: "remote" | "hybrid" | "onsite" | "all";
  dealbreakers: string[];
  text_preview: string;
};

type StoredResumeUpload = {
  id: string;
  file_name: string;
  content_type: string | null;
  file_size: number;
  extracted_text: string;
  extracted_profile: ExtractedResumeProfile;
  created_at: string;
};

type SupabaseLikeError = { code?: string | null; message?: string | null };

function isMissingResumeUploadsTable(error: SupabaseLikeError | null | undefined): boolean {
  return error?.code === "42P01" || error?.message?.includes("client_resume_uploads") === true;
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function serverError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

async function getCoachScopedResumeTarget(req: Request, clientId: string) {
  const { user, isCoach } = await getCoachSession(req);
  if (!user || !isCoach) return { error: unauthorized() };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return { error: serverError("Missing Supabase env") };

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: clientRow, error: clientError } = await supabase
    .from("clients")
    .select("id, auth_user_id")
    .eq("id", clientId)
    .maybeSingle();

  if (clientError) return { error: serverError(clientError.message || "Failed to load client") };
  const authUserId = typeof clientRow?.auth_user_id === "string" ? clientRow.auth_user_id.trim() : "";
  if (!authUserId) return { error: badRequest("Client is not linked to an auth user yet") };

  return { supabase, authUserId };
}

export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    const { clientId } = await params;
    const auth = await getCoachScopedResumeTarget(req, clientId);
    if ("error" in auth) return auth.error;

    const { data, error } = await auth.supabase
      .from("client_resume_uploads")
      .select("id, file_name, content_type, file_size, extracted_text, extracted_profile, created_at")
      .eq("client_id", auth.authUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (isMissingResumeUploadsTable(error)) {
      return NextResponse.json({ ok: true, resume_upload: null, persistence_available: false });
    }
    if (error) return serverError(error.message || "Failed to load resume upload");

    return NextResponse.json({
      ok: true,
      resume_upload: (data as StoredResumeUpload | null) ?? null,
      persistence_available: true,
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Unexpected server error");
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    const { clientId } = await params;
    const auth = await getCoachScopedResumeTarget(req, clientId);
    if ("error" in auth) return auth.error;

    const { extractProfileFromResumeText, extractTextFromResumeFile } = await import("@/lib/resume/extractProfileFromResume");
    const formData = await req.formData();
    const file = formData.get("resume");

    if (!(file instanceof File)) return serverError("Resume file is required", 400);
    if (file.size === 0) return serverError("Resume file is empty", 400);
    if (file.size > 5 * 1024 * 1024) return serverError("Resume file must be 5MB or smaller", 400);

    const text = await extractTextFromResumeFile(file);
    if (text.length < 80) return serverError("Could not extract enough resume text to interpret roles", 400);

    const extracted = extractProfileFromResumeText(text, file.name);
    const { data: storedUpload, error: insertError } = await auth.supabase
      .from("client_resume_uploads")
      .insert({
        client_id: auth.authUserId,
        file_name: file.name,
        content_type: file.type || null,
        file_size: file.size,
        extracted_text: text,
        extracted_profile: extracted,
      })
      .select("id, file_name, content_type, file_size, extracted_text, extracted_profile, created_at")
      .single();

    if (isMissingResumeUploadsTable(insertError)) {
      return NextResponse.json({
        ok: true,
        extracted,
        resume_upload: null,
        persistence_available: false,
        warning: "Resume suggestions were extracted, but upload history is not available until the database migration is applied.",
      });
    }

    if (insertError || !storedUpload) return serverError(insertError?.message || "Failed to store resume upload");

    return NextResponse.json({
      ok: true,
      extracted,
      resume_upload: storedUpload as StoredResumeUpload,
      persistence_available: true,
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Unexpected server error");
  }
}