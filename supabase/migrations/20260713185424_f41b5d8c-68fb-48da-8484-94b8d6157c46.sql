
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS projects_featured_site_idx ON public.projects (site) WHERE featured;

-- Enforce max 5 featured per site + admin-only toggle
CREATE OR REPLACE FUNCTION public.enforce_featured_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cnt INTEGER;
BEGIN
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
  IF NEW.featured = true THEN
    SELECT count(*) INTO cnt FROM public.projects
      WHERE site = NEW.site AND featured = true AND id <> NEW.id;
    IF cnt >= 5 THEN
      RAISE EXCEPTION 'Site % already has 5 featured projects. Un-feature one first.', NEW.site;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS projects_featured_rules ON public.projects;
CREATE TRIGGER projects_featured_rules
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_featured_rules();
