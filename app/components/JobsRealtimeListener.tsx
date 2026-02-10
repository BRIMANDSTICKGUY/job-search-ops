"use client";

import { useEffect } from "react";
import { getSupabaseBrowser } from "../../lib/supabase/browser";

export default function JobsRealtimeListener() {
  useEffect(() => {
    const channel = getSupabaseBrowser()
      .channel("job-lane-events")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_lane_events",
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
