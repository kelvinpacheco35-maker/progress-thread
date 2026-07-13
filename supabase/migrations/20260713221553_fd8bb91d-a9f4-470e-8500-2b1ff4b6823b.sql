ALTER TABLE public.projects
  ADD COLUMN problem_statement TEXT,
  ADD COLUMN start_date DATE,
  ADD COLUMN completion_pct INTEGER NOT NULL DEFAULT 0 CHECK (completion_pct >= 0 AND completion_pct <= 100);