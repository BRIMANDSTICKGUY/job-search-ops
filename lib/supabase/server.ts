import { createClient } from "@supabase/supabase-js";

type ServerClientOptions = {
  authorization?: string | null;
};

export function createServerClient(opts: ServerClientOptions = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const headers: Record<string, string> = {};
  if (opts.authorization) headers.Authorization = opts.authorization;

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers },
  });
}
