CREATE TABLE public.auth_lockouts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.auth_lockouts TO service_role;
ALTER TABLE public.auth_lockouts ENABLE ROW LEVEL SECURITY;
-- No policies: this table is only accessed by the service role from the
-- public sign-in endpoint and admin server functions. RLS enabled with no
-- policies denies all access to anon/authenticated by default.