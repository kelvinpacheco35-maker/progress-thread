
-- 1. Add archived column
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- 2. Extend the featured-rules function to also gate archived to admins.
CREATE OR REPLACE FUNCTION public.enforce_featured_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cnt INTEGER;
BEGIN
  -- Featured flag: admin-only to change
  IF TG_OP = 'UPDATE' AND NEW.featured IS DISTINCT FROM OLD.featured THEN
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Only admins can change the featured flag';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.featured = true THEN
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Only admins can create featured projects';
    END IF;
  END IF;

  -- Archived flag: admin-only to change
  IF TG_OP = 'UPDATE' AND NEW.archived IS DISTINCT FROM OLD.archived THEN
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Only admins can archive or unarchive projects';
    END IF;
  END IF;

  -- 5-per-site featured cap
  IF NEW.featured = true THEN
    SELECT count(*) INTO cnt FROM public.projects
      WHERE site = NEW.site AND featured = true AND id <> NEW.id;
    IF cnt >= 5 THEN
      RAISE EXCEPTION 'Site % already has 5 featured projects. Un-feature one first.', NEW.site;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Attach trigger (idempotent)
DROP TRIGGER IF EXISTS enforce_featured_rules_trg ON public.projects;
CREATE TRIGGER enforce_featured_rules_trg
BEFORE INSERT OR UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_featured_rules();

-- 4. Delete policy: admin only (was: owner or admin)
DROP POLICY IF EXISTS "owner or admin delete" ON public.projects;
CREATE POLICY "admin delete projects"
  ON public.projects
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
