
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'contributor');
CREATE TYPE public.site_code AS ENUM ('Allentown','Modesto','Midlothian','Alexandria','3rd Ave','EPIC');
CREATE TYPE public.project_status AS ENUM ('On Track','At Risk','Blocked','Complete','On Hold');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) > 0),
  site public.site_code NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user updates own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "user inserts own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Auto-create profile + contributor role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name TEXT := NULLIF(trim(coalesce(NEW.raw_user_meta_data->>'full_name','')), '');
  v_site TEXT := NULLIF(trim(coalesce(NEW.raw_user_meta_data->>'site','')), '');
BEGIN
  IF v_name IS NULL OR v_site IS NULL THEN
    RAISE EXCEPTION 'full_name and site are required';
  END IF;
  INSERT INTO public.profiles (id, full_name, site) VALUES (NEW.id, v_name, v_site::public.site_code);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'contributor');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  site public.site_code NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.project_status NOT NULL DEFAULT 'On Track',
  description TEXT,
  blocker TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read all projects" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner or admin insert" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "owner or admin update" ON public.projects FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "owner or admin delete" ON public.projects FOR DELETE TO authenticated
  USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));

-- Weekly updates
CREATE TABLE public.weekly_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_label TEXT NOT NULL,
  status public.project_status NOT NULL,
  note TEXT NOT NULL CHECK (length(trim(note)) > 0),
  blocker TEXT,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.weekly_updates (project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_updates TO authenticated;
GRANT ALL ON public.weekly_updates TO service_role;
ALTER TABLE public.weekly_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read all updates" ON public.weekly_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY "author or admin insert update" ON public.weekly_updates FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id AND (
      public.has_role(auth.uid(), 'admin') OR
      EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
    )
  );
-- Only admins can update updates (for review flag or corrections)
CREATE POLICY "admin update updates" ON public.weekly_updates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "owner or admin delete update" ON public.weekly_updates FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));
