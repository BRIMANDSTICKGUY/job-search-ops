"use client";

import { useEffect } from "react";
import { getSupabaseBrowser, hasSupabaseBrowserEnv } from "../../lib/supabase/browser";

export default function JobsRealtimeListener() {
  useEffect(() => {
    if (!hasSupabaseBrowserEnv()) {
      return;
    }

    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel("jobs-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
        },
        () => {
          window.dispatchEvent(new Event("jobs-updated"));
        }
      )
      .subscribe((status) => {
        void status;
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
