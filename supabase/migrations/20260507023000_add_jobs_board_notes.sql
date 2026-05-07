ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS client_notes text,
  ADD COLUMN IF NOT EXISTS internal_notes text;