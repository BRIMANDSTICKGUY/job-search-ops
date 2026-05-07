ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS source_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source_last_seen_at timestamptz;

UPDATE public.jobs
SET source_active = true,
    source_last_seen_at = COALESCE(source_last_seen_at, ingested_at, created_at, now())
WHERE source_active IS DISTINCT FROM true
   OR source_last_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS jobs_source_active_idx
  ON public.jobs (source_active);

CREATE INDEX IF NOT EXISTS jobs_ingest_source_source_active_idx
  ON public.jobs (ingest_source, source_active);