-- 1. New enums
CREATE TYPE public.entry_type AS ENUM ('project', 'support');
CREATE TYPE public.support_status AS ENUM ('Open', 'In Progress', 'Done');

-- 2. projects: add entry type, support status, requester
ALTER TABLE public.projects
  ADD COLUMN entry_type public.entry_type NOT NULL DEFAULT 'project',
  ADD COLUMN support_status public.support_status,
  ADD COLUMN requester text;

-- 3. weekly_updates: make status optional for support entries; add support_status
ALTER TABLE public.weekly_updates
  ALTER COLUMN status DROP NOT NULL,
  ADD COLUMN support_status public.support_status;

-- Ensure each update carries exactly one kind of status
ALTER TABLE public.weekly_updates
  ADD CONSTRAINT weekly_updates_status_xor CHECK (
    (status IS NOT NULL AND support_status IS NULL)
    OR (status IS NULL AND support_status IS NOT NULL)
  );