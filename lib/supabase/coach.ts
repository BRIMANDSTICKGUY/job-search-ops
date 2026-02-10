import { createClient } from "@supabase/supabase-js";

export function getCoachSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Coach Supabase env vars missing");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
