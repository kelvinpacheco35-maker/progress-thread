import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SITES, STATUSES, monthLabel, currentWeekLabel, type Status, type SupportStatus, type EntryType } from "@/lib/ci";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/_authenticated/summary")({
  head: () => ({ meta: [{ title: "Summary — CI Status Tracker" }] }),
  component: SummaryPage,
});

type Row = {
  id: string;
  project_id: string;
  week_label: string;
  status: Status | null;
  support_status: SupportStatus | null;
  note: string;
  created_at: string;
};

type Proj = { id: string; name: string; site: string; status: Status; support_status: SupportStatus | null; entry_type: EntryType; created_at: string; archived?: boolean; pending_approval?: boolean };

function priorWeekLabel(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return currentWeekLabel(d);
}

function priorMonthLabel(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return monthLabel(d);
}

function SummaryPage() {
  const [projects, setProjects] = useState<Proj[]>([]);
  const [updates, setUpdates] = useState<Row[]>([]);
  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: u }] = await Promise.all([
        supabase.from("projects").select("id, name, site, status, support_status, entry_type, created_at, archived, pending_approval"),
        supabase.from("weekly_updates").select("id, project_id, week_label, status, support_status, note, created_at").order("created_at", { ascending: false }),
      ]);
      setProjects((p ?? []) as unknown as Proj[]);
      setUpdates((u ?? []) as unknown as Row[]);
      setLoading(false);
    })();
  }, []);

  const currentBucket = mode === "weekly" ? currentWeekLabel() : monthLabel(new Date());
  const priorBucket = mode === "weekly" ? priorWeekLabel() : priorMonthLabel();
  const bucketOf = (u: Row) => (mode === "weekly" ? u.week_label : monthLabel(u.created_at));
  const bucketOfDate = (d: string) => (mode === "weekly" ? currentWeekLabel(new Date(d)) : monthLabel(d));

  const perSite = useMemo(() => {
    return SITES.map((site) => {
      const siteAll = projects.filter((p) => p.site === site);
      const siteProjects = siteAll.filter((p) => (p.entry_type ?? "project") === "project");
      const siteSupport = siteAll.filter((p) => p.entry_type === "support");
      const activeProjects = siteProjects.filter((p) => p.status !== "Complete");
      const statusCounts: Record<Status, number> = {
        "On Track": 0, "At Risk": 0, "Blocked": 0, "Complete": 0, "On Hold": 0,
      };
      const latestP = new Map<string, Status>();
      const latestS = new Map<string, SupportStatus>();
      for (const u of updates) {
        if (u.status && !latestP.has(u.project_id)) latestP.set(u.project_id, u.status);
        if (u.support_status && !latestS.has(u.project_id)) latestS.set(u.project_id, u.support_status);
      }
      for (const p of siteProjects) {
        const s = latestP.get(p.id) ?? p.status;
        statusCounts[s] += 1;
      }
      // Support counts for this period
      let supportOpen = 0;
      let supportCompletedPeriod = 0;
      for (const s of siteSupport) {
        const cur = latestS.get(s.id) ?? s.support_status ?? "Open";
        if (cur !== "Done") supportOpen += 1;
      }
      const bucketUpdates = updates.filter((u) => bucketOf(u) === currentBucket && siteAll.some((p) => p.id === u.project_id));
      const projectBucketUpdates = bucketUpdates.filter((u) => u.status !== null);
      const newProjects = siteProjects.filter((p) => bucketOfDate(p.created_at) === currentBucket);
      const completions = projectBucketUpdates.filter((u) => u.status === "Complete");
      supportCompletedPeriod = bucketUpdates.filter((u) => u.support_status === "Done" && siteSupport.some((s) => s.id === u.project_id)).length;
      const changes = projectBucketUpdates.map((u) => ({
        projectName: siteProjects.find((p) => p.id === u.project_id)?.name ?? "—",
        status: u.status as Status, note: u.note,
      }));

      const priorNew = siteProjects.filter((p) => bucketOfDate(p.created_at) === priorBucket).length;
      const priorCompletions = updates.filter((u) => bucketOf(u) === priorBucket && u.status === "Complete" && siteProjects.some((p) => p.id === u.project_id)).length;
      const currDelta = newProjects.length - completions.length;
      const priorDelta = priorNew - priorCompletions;
      const delta = currDelta - priorDelta;

      return {
        site, activeCount: activeProjects.length, statusCounts, newProjects, completions, changes, delta,
        supportTotal: siteSupport.length, supportOpen, supportCompletedPeriod,
      };
    });
  }, [projects, updates, currentBucket, priorBucket, mode]);

  const overall = useMemo(() => {
    const totals: Record<Status, number> = { "On Track": 0, "At Risk": 0, "Blocked": 0, "Complete": 0, "On Hold": 0 };
    let active = 0;
    for (const s of perSite) {
      for (const st of STATUSES) totals[st] += s.statusCounts[st];
      active += s.activeCount;
    }
    return { active, totals };
  }, [perSite]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">Current period: {currentBucket}</p>
        </div>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "weekly" | "monthly")}>
          <TabsList>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
          <TabsContent value="weekly" />
          <TabsContent value="monthly" />
        </Tabs>
      </div>

      {/* Overall totals */}
      <div className="rounded-md border border-border bg-card px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{overall.active}</span>
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Active</span>
        </div>
        <TotalCount label="On Track" count={overall.totals["On Track"]} colorVar="--status-ontrack" />
        <TotalCount label="At Risk" count={overall.totals["At Risk"]} colorVar="--status-atrisk" />
        <TotalCount label="Blocked" count={overall.totals["Blocked"]} colorVar="--status-blocked" />
        <div className="flex-1" />
        <StackedBar
          on={overall.totals["On Track"]}
          at={overall.totals["At Risk"]}
          bl={overall.totals["Blocked"]}
          className="min-w-[160px] max-w-[280px] flex-1"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {perSite.map((s) => {
          const noActivity = s.newProjects.length === 0 && s.completions.length === 0 && s.changes.length === 0;
          return (
            <Card key={s.site} className="flex flex-col min-h-[320px]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span>{s.site}</span>
                  <span className="text-sm font-normal text-muted-foreground flex items-center gap-2">
                    <span>{s.activeCount} active</span>
                    <DeltaChip delta={s.delta} />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col min-h-0">
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((st) => s.statusCounts[st] > 0 && (
                    <div key={st} className="flex items-center gap-1.5">
                      <StatusBadge status={st} />
                      <span className="text-xs text-muted-foreground">{s.statusCounts[st]}</span>
                    </div>
                  ))}
                </div>
                <StackedBar
                  on={s.statusCounts["On Track"]}
                  at={s.statusCounts["At Risk"]}
                  bl={s.statusCounts["Blocked"]}
                />
                {s.supportTotal > 0 && (
                  <div className="rounded-md border border-[var(--support-inprogress)]/25 bg-[var(--support-inprogress)]/5 px-2.5 py-1.5 text-xs flex items-center gap-3">
                    <span className="font-semibold uppercase tracking-wide text-[var(--support-inprogress)]">Support</span>
                    <span className="text-muted-foreground">
                      {s.supportOpen} open · {s.supportCompletedPeriod} completed this {mode === "weekly" ? "week" : "month"}
                    </span>
                  </div>
                )}
                {noActivity ? (
                  <div className="text-sm text-muted-foreground">No activity this period.</div>
                ) : (
                  <div className="text-sm space-y-1.5 flex-1 flex flex-col min-h-0">
                    {s.newProjects.length > 0 && (
                      <SummaryLine label="New projects" items={s.newProjects.map((p) => p.name)} />
                    )}
                    {s.completions.length > 0 && (
                      <SummaryLine label="Completions" items={s.completions.map(() => "1 project completed")} />
                    )}
                    {s.changes.length > 0 && (
                      <div className="flex-1 min-h-0 flex flex-col">
                        <span className="text-muted-foreground">
                          {mode === "weekly" ? "Updates this week" : "Updates this month"}:
                        </span>
                        <ul className="ml-1 mt-0.5 space-y-0.5 overflow-y-auto max-h-40 pr-1">
                          {s.changes.map((c, i) => (
                            <li key={i}>· {c.projectName} — {c.status}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SummaryLine({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>
      <ul className="ml-1 mt-0.5 space-y-0.5">
        {items.map((it, i) => <li key={i}>· {it}</li>)}
      </ul>
    </div>
  );
}

function TotalCount({ label, count, colorVar }: { label: string; count: number; colorVar: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `var(${colorVar})` }} />
      <span className="text-sm font-medium" style={{ color: `var(${colorVar})` }}>{count}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function StackedBar({ on, at, bl, className = "" }: { on: number; at: number; bl: number; className?: string }) {
  const total = on + at + bl;
  if (total === 0) {
    return <div className={`h-1.5 rounded-full bg-muted ${className}`} />;
  }
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className={`h-1.5 rounded-full bg-muted overflow-hidden flex ${className}`}>
      {on > 0 && <div style={{ width: pct(on), backgroundColor: "var(--status-ontrack)" }} />}
      {at > 0 && <div style={{ width: pct(at), backgroundColor: "var(--status-atrisk)" }} />}
      {bl > 0 && <div style={{ width: pct(bl), backgroundColor: "var(--status-blocked)" }} />}
    </div>
  );
}

function DeltaChip({ delta }: { delta: number }) {
  if (delta === 0) {
    return <span className="text-xs text-muted-foreground">no change</span>;
  }
  const positive = delta > 0;
  const color = positive ? "var(--status-ontrack)" : "var(--status-blocked)";
  return (
    <span className="text-xs font-medium" style={{ color }}>
      {positive ? "+" : ""}{delta} vs last
    </span>
  );
}
