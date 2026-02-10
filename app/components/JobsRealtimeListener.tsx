"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function JobsRealtimeListener() {
  useEffect(() => {
    const channel = supabaseBrowser
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
      supabaseBrowser.removeChannel(channel);
    };
  }, []);

  return null;
}
