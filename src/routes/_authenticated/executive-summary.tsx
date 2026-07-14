import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SITES, formatDate, isOverdue, statusRank, supportStatusRank, priorityClasses, type Status, type SupportStatus, type Category, type Priority, type EntryType } from "@/lib/ci";
import { StatusBadge, SupportStatusBadge, EntryTypeBadge } from "@/components/status-badge";
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
  support_status: SupportStatus | null;
  entry_type: EntryType;
  featured: boolean;
  due_date: string | null;
  category: Category | null;
  priority: Priority | null;
  next_action: string | null;
  requester: string | null;
};
type U = { project_id: string; status: Status | null; support_status: SupportStatus | null; note: string; created_at: string };

function statusAccent(s: Status | SupportStatus): string {
  switch (s) {
    case "On Track": return "border-l-[var(--status-ontrack)]";
    case "At Risk": return "border-l-[var(--status-atrisk)]";
    case "Blocked": return "border-l-[var(--status-blocked)]";
    case "Complete": return "border-l-[var(--status-complete)]";
    case "On Hold": return "border-l-[var(--status-hold)]";
    case "Open": return "border-l-[var(--support-open)]";
    case "In Progress": return "border-l-[var(--support-inprogress)]";
    case "Done": return "border-l-[var(--support-done)]";
  }
}

function ExecutiveSummaryPage() {
  const [projects, setProjects] = useState<P[]>([]);
  const [updates, setUpdates] = useState<U[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: u }] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, site, status, support_status, entry_type, featured, due_date, category, priority, next_action, requester")
          .eq("featured", true),
        supabase
          .from("weekly_updates")
          .select("project_id, status, support_status, note, created_at")
          .order("created_at", { ascending: false }),
      ]);
      setProjects((p ?? []) as unknown as P[]);
      setUpdates((u ?? []) as unknown as U[]);
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
          const isSupport = p.entry_type === "support";
          const currentStatus = isSupport
            ? ((l?.support_status ?? p.support_status ?? "Open") as SupportStatus)
            : ((l?.status ?? p.status) as Status);
          return { ...p, isSupport, currentStatus, summary, overdue: isOverdue(p.due_date, currentStatus) };
        })
        .sort((a, b) => {
          const ar = a.isSupport ? supportStatusRank(a.currentStatus as SupportStatus) + 10 : statusRank(a.currentStatus as Status);
          const br = b.isSupport ? supportStatusRank(b.currentStatus as SupportStatus) + 10 : statusRank(b.currentStatus as Status);
          return ar - br;
        }),
    }));
  }, [projects, latest]);

  const totals = useMemo(() => {
    const all = bySite.flatMap((g) => g.rows);
    const counts: Record<Status, number> = { "On Track": 0, "At Risk": 0, "Blocked": 0, "Complete": 0, "On Hold": 0 };
    let support = 0;
    for (const r of all) {
      if (r.isSupport) support += 1;
      else counts[r.currentStatus as Status] += 1;
    }
    return { total: all.length, counts, support };
  }, [bySite]);

  const copyAll = async () => {
    const groups = bySite.filter((g) => g.rows.length > 0);
    if (groups.length === 0) return toast.info("Nothing featured yet");
    const text = groups
      .map(
        (g) =>
          `${g.site}\n` +
          g.rows
            .map((r) => {
              const meta = [
                r.isSupport ? "SUPPORT" : r.category,
                r.due_date ? `due ${formatDate(r.due_date)}${r.overdue ? " OVERDUE" : ""}` : null,
              ].filter(Boolean).join(" · ");
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
            Featured entries only · up to 5 per site (projects + support combined).
          </p>
        </div>
        <Button onClick={copyAll} variant="outline" size="sm">
          <Copy className="w-4 h-4 mr-1.5" /> Copy all
        </Button>
      </div>

      <div className="rounded-md border border-border bg-card px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{totals.total}</span>
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Featured</span>
        </div>
        <StatCount label="On Track" count={totals.counts["On Track"]} colorVar="--status-ontrack" />
        <StatCount label="At Risk" count={totals.counts["At Risk"]} colorVar="--status-atrisk" />
        <StatCount label="Blocked" count={totals.counts["Blocked"]} colorVar="--status-blocked" />
        <StatCount label="Support" count={totals.support} colorVar="--support-inprogress" />
      </div>

      <div className="space-y-6">
        {bySite.map((g) => (
          <section key={g.site}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {g.site}
            </h2>
            {g.rows.length === 0 ? (
              <div className="rounded-md border border-border bg-card px-4 py-4 text-sm text-muted-foreground italic">
                No entries featured yet
              </div>
            ) : (
              <div className="rounded-md border border-border bg-card divide-y divide-border overflow-hidden">
                {g.rows.map((r) => (
                  <div key={r.id} className={cn("px-4 py-3 flex items-start gap-3 border-l-4", statusAccent(r.currentStatus))}>
                    {r.isSupport
                      ? <SupportStatusBadge status={r.currentStatus as SupportStatus} />
                      : <StatusBadge status={r.currentStatus as Status} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap gap-2">
                        <EntryTypeBadge type={r.isSupport ? "support" : "project"} />
                        <span className="font-medium">{r.name}</span>
                        {!r.isSupport && (r.category ? (
                          <span className="text-xs rounded-full px-2 py-0.5 border bg-primary/5 text-primary border-primary/20">{r.category}</span>
                        ) : (
                          <span className="text-xs rounded-full px-2 py-0.5 border border-dashed border-border text-muted-foreground italic">No category</span>
                        ))}
                        {r.priority && (
                          <span className={cn("text-xs rounded-full px-2 py-0.5 border", priorityClasses(r.priority))}>{r.priority}</span>
                        )}
                        {r.due_date ? (
                          <span className={cn("text-xs", r.overdue ? "text-[var(--status-blocked)] font-medium" : "text-muted-foreground")}>
                            Due {formatDate(r.due_date)}{r.overdue && " · Overdue"}
                          </span>
                        ) : (
                          !r.isSupport && <span className="text-xs text-muted-foreground italic">No due date</span>
                        )}
                        {r.isSupport && r.requester && (
                          <span className="text-xs text-muted-foreground">Req: {r.requester}</span>
                        )}
                      </div>
                      {!r.isSupport && r.next_action && (
                        <p className="text-xs text-primary mt-1"><span className="font-semibold">Next:</span> {r.next_action}</p>
                      )}
                      {r.summary && (
                        <p className="text-sm text-foreground/80 mt-0.5 line-clamp-2">{r.summary}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function StatCount({ label, count, colorVar }: { label: string; count: number; colorVar: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `var(${colorVar})` }} />
      <span className="text-sm font-medium" style={{ color: `var(${colorVar})` }}>{count}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
