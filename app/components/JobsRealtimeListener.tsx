"use client";

import { useEffect } from "react";
import { getSupabaseBrowser } from "../../lib/supabase/browser";

export default function JobsRealtimeListener() {
  useEffect(() => {
    const channel = getSupabaseBrowser()
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
      getSupabaseBrowser().removeChannel(channel);
    };
  }, []);

  return null;
}
