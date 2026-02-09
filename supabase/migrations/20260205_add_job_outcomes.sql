alter table public.jobs
  add column if not exists outcome_status text,
  add column if not exists last_response_at timestamptz;
