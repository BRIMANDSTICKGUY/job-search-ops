import { createClient } from "@supabase/supabase-js";

export function getCoachSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.warn(
      "Coach Supabase env vars missing. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
