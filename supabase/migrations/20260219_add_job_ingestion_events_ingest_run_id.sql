ALTER TABLE public.job_ingestion_events
ADD COLUMN IF NOT EXISTS ingest_run_id uuid;

CREATE INDEX IF NOT EXISTS job_ingestion_events_ingest_run_id_idx
ON public.job_ingestion_events (ingest_run_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_ingestion_events_ingest_run_id_fkey'
      AND conrelid = 'public.job_ingestion_events'::regclass
  ) THEN
    ALTER TABLE public.job_ingestion_events
    ADD CONSTRAINT job_ingestion_events_ingest_run_id_fkey
    FOREIGN KEY (ingest_run_id)
    REFERENCES public.ingest_runs(id)
    ON DELETE SET NULL;
  END IF;
END
$$;
