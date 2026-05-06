CREATE TABLE IF NOT EXISTS public.client_resume_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  content_type text NULL,
  file_size integer NOT NULL,
  extracted_text text NOT NULL,
  extracted_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_resume_uploads_client_id_idx
  ON public.client_resume_uploads (client_id, created_at DESC);