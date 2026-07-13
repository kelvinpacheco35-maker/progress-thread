import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SITES, formatDate, isOverdue, type Status, type Category } from "@/lib/ci";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/executive-summary")({
  head: () => ({ meta: [{ title: "Executive Summary — CI Status Tracker" }] }),
  component: ExecutiveSummaryPage,
});

type P = {
  id: string;
  name: string;
  site: string;
  status: Status;
  featured: boolean;
  due_date: string | null;
  category: Category | null;
  next_action: string | null;
};
type U = { project_id: string; status: Status; note: string; created_at: string };

function ExecutiveSummaryPage() {
  const [projects, setProjects] = useState<P[]>([]);
  const [updates, setUpdates] = useState<U[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: u }] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, site, status, featured, due_date, category, next_action")
          .eq("featured", true),
        supabase
          .from("weekly_updates")
          .select("project_id, status, note, created_at")
          .order("created_at", { ascending: false }),
      ]);
      setProjects((p ?? []) as P[]);
      setUpdates((u ?? []) as U[]);
      setLoading(false);
    })();
  }, []);

  const latest = useMemo(() => {
    const m = new Map<string, U>();
    for (const u of updates) if (!m.has(u.project_id)) m.set(u.project_id, u);
    return m;
  }, [updates]);

  const bySite = useMemo(() => {
    return SITES.map((site) => ({
      site,
      rows: projects
        .filter((p) => p.site === site)
        .map((p) => {
          const l = latest.get(p.id);
          const summary = (l?.note ?? "").split("\n").slice(0, 2).join(" ").trim();
          const currentStatus = (l?.status ?? p.status) as Status;
          return { ...p, currentStatus, summary, overdue: isOverdue(p.due_date, currentStatus) };
        }),
    })).filter((g) => g.rows.length > 0);
  }, [projects, latest]);

  const copyAll = async () => {
    if (bySite.length === 0) return toast.info("Nothing featured yet");
    const text = bySite
      .map(
        (g) =>
          `${g.site}\n` +
          g.rows
            .map((r) => {
              const meta = [r.category, r.due_date ? `due ${formatDate(r.due_date)}${r.overdue ? " OVERDUE" : ""}` : null].filter(Boolean).join(" · ");
              return `  [${r.currentStatus}] ${r.name}${meta ? ` (${meta})` : ""}${r.summary ? ` — ${r.summary}` : ""}`;
            })
            .join("\n"),
      )
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    toast.success("Executive summary copied");
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Executive Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Featured projects only · up to 5 per site.
          </p>
        </div>
        <Button onClick={copyAll} variant="outline" size="sm">
          <Copy className="w-4 h-4 mr-1.5" /> Copy all
        </Button>
      </div>

      {bySite.length === 0 ? (
        <div className="rounded-md border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No projects have been featured yet. An admin can feature projects from the All Projects tab.
        </div>
      ) : (
        <div className="space-y-6">
          {bySite.map((g) => (
            <section key={g.site}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {g.site}
              </h2>
              <div className="rounded-md border border-border bg-card divide-y divide-border">
                {g.rows.map((r) => (
                  <div key={r.id} className="px-4 py-3 flex items-start gap-3">
                    <StatusBadge status={r.currentStatus} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-medium">{r.name}</span>
                        {r.category && (
                          <span className="text-xs rounded-full px-2 py-0.5 border bg-primary/5 text-primary border-primary/20">{r.category}</span>
                        )}
                        {r.due_date && (
                          <span className={cn("text-xs", r.overdue ? "text-[var(--status-blocked)] font-medium" : "text-muted-foreground")}>
                            Due {formatDate(r.due_date)}{r.overdue && " · Overdue"}
                          </span>
                        )}
                      </div>
                      {r.next_action && (
                        <p className="text-xs text-primary mt-1"><span className="font-semibold">Next:</span> {r.next_action}</p>
                      )}
                      {r.summary && (
                        <p className="text-sm text-foreground/80 mt-0.5 line-clamp-2">{r.summary}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

