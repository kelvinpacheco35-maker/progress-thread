
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_owner_id_fkey;
ALTER TABLE public.projects ADD CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.weekly_updates DROP CONSTRAINT IF EXISTS weekly_updates_author_id_fkey;
ALTER TABLE public.weekly_updates ADD CONSTRAINT weekly_updates_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
