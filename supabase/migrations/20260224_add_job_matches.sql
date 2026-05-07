create table if not exists job_matches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  job_id text not null,
  score integer not null,
  band text not null check (band in ('green','yellow','red')),
  reasons text[] not null,
  flags jsonb null,
  created_at timestamptz not null default now(),
  constraint job_matches_client_id_fkey
    foreign key (client_id)
    references auth.users(id)
    on delete cascade
);

create index if not exists job_matches_client_id_idx
  on job_matches (client_id);

create index if not exists job_matches_client_id_score_desc_idx
  on job_matches (client_id, score desc);

create unique index if not exists job_matches_client_id_job_id_uidx
  on job_matches (client_id, job_id);
