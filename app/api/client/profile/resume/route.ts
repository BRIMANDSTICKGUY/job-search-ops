export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  extractProfileFromResumeText,
  extractTextFromResumeFile,
} from "@/lib/resume/extractProfileFromResume";

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

  return { user };
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

    return NextResponse.json({ ok: true, extracted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return serverError(message);
  }
}