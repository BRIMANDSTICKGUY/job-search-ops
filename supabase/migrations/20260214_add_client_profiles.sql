CREATE TABLE IF NOT EXISTS public.client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES auth.users(id),
  primary_role text NOT NULL,
  secondary_role text NULL,
  career_level text NULL CHECK (career_level IN ('early', 'mid', 'senior', 'executive')),
  core_skills text[] NULL,
  industry_keywords text[] NULL,
  preferred_locations text[] NULL,
  remote_preference text NOT NULL CHECK (remote_preference IN ('remote', 'hybrid', 'onsite', 'all')),
  salary_min integer NULL,
  salary_max integer NULL,
  dealbreakers text[] NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_profiles_client_id_idx
  ON public.client_profiles (client_id);

CREATE INDEX IF NOT EXISTS client_profiles_primary_role_idx
  ON public.client_profiles (primary_role);

CREATE INDEX IF NOT EXISTS client_profiles_remote_preference_idx
  ON public.client_profiles (remote_preference);
