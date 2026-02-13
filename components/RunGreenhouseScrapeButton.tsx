"use client";

import { useState } from "react";

type ScrapeResponse = {
  ok?: boolean;
  ingested?: number;
  total?: number;
  error?: string;
};

export function RunGreenhouseScrapeButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");

  async function runScrape() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/scrape/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-token": process.env.NEXT_PUBLIC_SCRAPE_ADMIN_TOKEN ?? "",
        },
        body: JSON.stringify({
          source: "greenhouse",
          mode: "stub",
          source_detail: "coach_manual_trigger",
        }),
      });

      const data = (await res.json()) as ScrapeResponse;

      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "Scrape failed");
        return;
      }

      setMessage(`Scrape complete. Ingested ${data.ingested ?? 0} of ${data.total ?? 0} jobs`);
    } catch {
      setMessage("Unexpected error while running scrape");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button type="button" onClick={runScrape} disabled={loading}>
        {loading ? "Running Scrape..." : "Run Greenhouse Scrape (Stub)"}
      </button>
      {message ? <p style={{ margin: 0, fontSize: 13 }}>{message}</p> : null}
    </div>
  );
}
