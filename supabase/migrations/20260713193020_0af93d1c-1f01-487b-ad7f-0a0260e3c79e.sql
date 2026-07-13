
CREATE TYPE public.project_priority AS ENUM ('Low', 'Medium', 'High');
CREATE TYPE public.project_category AS ENUM ('Efficiency', 'Safety', 'Quality', 'Maintenance', 'Training', 'Cost');

ALTER TABLE public.projects
  ADD COLUMN due_date DATE,
  ADD COLUMN priority public.project_priority NOT NULL DEFAULT 'Medium',
  ADD COLUMN next_action TEXT,
  ADD COLUMN category public.project_category;
