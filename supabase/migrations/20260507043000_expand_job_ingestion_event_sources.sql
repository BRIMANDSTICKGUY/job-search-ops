ALTER TABLE public.job_ingestion_events
  DROP CONSTRAINT IF EXISTS job_ingestion_events_source_type_check;

ALTER TABLE public.job_ingestion_events
  ADD CONSTRAINT job_ingestion_events_source_type_check
  CHECK (
    source_type = ANY (
      ARRAY[
        'manual'::text,
        'email_forward'::text,
        'coach_curated'::text,
        'client_submitted'::text,
        'greenhouse'::text,
        'lever'::text,
        'ashby'::text,
        'workday'::text
      ]
    )
  );