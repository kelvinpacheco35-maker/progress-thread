-- 1) Restrict EXECUTE on has_role to authenticated only (revoke from PUBLIC/anon).
--    RLS policies that reference has_role() require authenticated EXECUTE, so we
--    keep that grant but remove the broader ones.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- 2) Restrict user_roles SELECT: users see only their own row; admins see all.
DROP POLICY IF EXISTS "authenticated read roles" ON public.user_roles;

CREATE POLICY "users read own role"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "admins read all roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Explicit admin-only INSERT/UPDATE/DELETE on user_roles so no user
--    can self-assign a role. (Currently no write policies exist, so RLS
--    denies by default — this makes the intent explicit and future-proof.)
CREATE POLICY "admins insert roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins update roles"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins delete roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));