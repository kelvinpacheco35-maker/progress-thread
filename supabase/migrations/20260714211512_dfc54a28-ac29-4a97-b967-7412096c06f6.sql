
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS pending_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS previous_status public.project_status,
  ADD COLUMN IF NOT EXISTS previous_support_status public.support_status,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE OR REPLACE FUNCTION public.enforce_approval_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Only admins can clear a pending_approval flag (approve or reject).
    IF OLD.pending_approval = true AND NEW.pending_approval = false THEN
      IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
        RAISE EXCEPTION 'Only admins can approve or reject pending closures';
      END IF;
    END IF;

    -- Only admins can flip a project directly to Complete (bypassing pending).
    IF NEW.entry_type = 'project'
       AND NEW.status = 'Complete'::project_status
       AND OLD.status IS DISTINCT FROM 'Complete'::project_status
       AND NEW.pending_approval = false THEN
      IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
        RAISE EXCEPTION 'Only admins can finalize completion. Request closure to send for approval.';
      END IF;
    END IF;

    -- Only admins can flip a support item directly to Done (bypassing pending).
    IF NEW.entry_type = 'support'
       AND NEW.support_status = 'Done'::support_status
       AND OLD.support_status IS DISTINCT FROM 'Done'::support_status
       AND NEW.pending_approval = false THEN
      IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
        RAISE EXCEPTION 'Only admins can finalize a support item. Request closure to send for approval.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_approval_rules_trg ON public.projects;
CREATE TRIGGER enforce_approval_rules_trg
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_approval_rules();
