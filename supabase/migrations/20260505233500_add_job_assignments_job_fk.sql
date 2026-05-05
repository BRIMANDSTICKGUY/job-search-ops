DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'job_assignments'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'jobs'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_assignments_job_id_fkey'
  ) THEN
    ALTER TABLE public.job_assignments
      ADD CONSTRAINT job_assignments_job_id_fkey
      FOREIGN KEY (job_id)
      REFERENCES public.jobs(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS job_assignments_client_id_uuid_idx
  ON public.job_assignments (client_id_uuid);

CREATE INDEX IF NOT EXISTS job_assignments_job_id_idx
  ON public.job_assignments (job_id);