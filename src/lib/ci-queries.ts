import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Column projections — kept broad enough to feed every page (my-projects,
// all-projects, summary, executive-summary) from ONE cache entry each.
// Any consumer that doesn't need a column simply ignores it.
const PROJECT_COLS =
  "id, name, site, owner_id, status, description, blocker, featured, archived, created_at, due_date, priority, next_action, category, problem_statement, start_date, completion_pct, entry_type, support_status, requester, pending_approval, previous_status, previous_support_status, approved_at, approved_by, rejection_reason";
const UPDATE_COLS =
  "id, project_id, week_label, status, support_status, note, blocker, reviewed, created_at, author_id";

// 60s stale time: fresh enough for a status tracker, avoids refetching every
// tab switch. Mutations explicitly invalidate via `invalidateCiCaches()`.
const STALE = 60_000;

export const projectsQuery = () =>
  queryOptions({
    queryKey: ["ci", "projects"],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select(PROJECT_COLS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown[];
    },
  });

export const updatesQuery = () =>
  queryOptions({
    queryKey: ["ci", "updates"],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_updates")
        .select(UPDATE_COLS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown[];
    },
  });

export const profilesQuery = () =>
  queryOptions({
    queryKey: ["ci", "profiles"],
    // Profiles rarely change — cache longer.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, site");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string; site: string }>;
    },
  });

export function useInvalidateCi() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["ci", "projects"] });
    qc.invalidateQueries({ queryKey: ["ci", "updates"] });
  };
}
