CREATE TABLE IF NOT EXISTS public.ingest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  job_count integer NOT NULL DEFAULT 0,
  error_message text NULL,
  metadata jsonb NULL
);

CREATE INDEX IF NOT EXISTS ingest_runs_source_idx
  ON public.ingest_runs (source);

CREATE INDEX IF NOT EXISTS ingest_runs_status_idx
  ON public.ingest_runs (status);

CREATE INDEX IF NOT EXISTS ingest_runs_started_at_idx
  ON public.ingest_runs (started_at);
