"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function JobsRealtimeListener() {
  useEffect(() => {
    const channel = supabase
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
      supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
