export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  type ExtractedResumeProfile,
  extractProfileFromResumeText,
  extractTextFromResumeFile,
} from "@/lib/resume/extractProfileFromResume";

type StoredResumeUpload = {
  id: string;
  file_name: string;
  content_type: string | null;
  file_size: number;
  extracted_text: string;
  extracted_profile: ExtractedResumeProfile;
  created_at: string;
};

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function serverError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function getAuthedUser(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: serverError("Missing Supabase env") };
  }

  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return { error: unauthorized() };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return { error: unauthorized() };
  }

  return { supabase, user };
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthedUser(req);
    if ("error" in auth) return auth.error;

    const { data, error } = await auth.supabase
      .from("client_resume_uploads")
      .select("id, file_name, content_type, file_size, extracted_text, extracted_profile, created_at")
      .eq("client_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return serverError(error.message || "Failed to load resume upload");
    }

    return NextResponse.json({
      ok: true,
      resume_upload: (data as StoredResumeUpload | null) ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return serverError(message);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthedUser(req);
    if ("error" in auth) return auth.error;

    const formData = await req.formData();
    const file = formData.get("resume");

    if (!(file instanceof File)) {
      return serverError("Resume file is required", 400);
    }

    if (file.size === 0) {
      return serverError("Resume file is empty", 400);
    }

    if (file.size > 5 * 1024 * 1024) {
      return serverError("Resume file must be 5MB or smaller", 400);
    }

    const text = await extractTextFromResumeFile(file);
    if (text.length < 80) {
      return serverError("Could not extract enough resume text to interpret roles", 400);
    }

    const extracted = extractProfileFromResumeText(text, file.name);

    const { data: storedUpload, error: insertError } = await auth.supabase
      .from("client_resume_uploads")
      .insert({
        client_id: auth.user.id,
        file_name: file.name,
        content_type: file.type || null,
        file_size: file.size,
        extracted_text: text,
        extracted_profile: extracted,
      })
      .select("id, file_name, content_type, file_size, extracted_text, extracted_profile, created_at")
      .single();

    if (insertError || !storedUpload) {
      return serverError(insertError?.message || "Failed to store resume upload");
    }

    return NextResponse.json({
      ok: true,
      extracted,
      resume_upload: storedUpload as StoredResumeUpload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return serverError(message);
  }
}