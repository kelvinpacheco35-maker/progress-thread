ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_password boolean NOT NULL DEFAULT false;
UPDATE public.profiles p SET has_password = true WHERE EXISTS (SELECT 1 FROM public.user_credentials c WHERE c.user_id = p.id);
DROP TABLE IF EXISTS public.user_credentials;