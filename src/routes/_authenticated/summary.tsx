import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SITES, STATUSES, monthLabel, currentWeekLabel, type Status } from "@/lib/ci";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/_authenticated/summary")({
  head: () => ({ meta: [{ title: "Summary — CI Status Tracker" }] }),
  component: SummaryPage,
});

type Row = {
  id: string;
  project_id: string;
  week_label: string;
  status: Status;
  note: string;
  created_at: string;
};

function SummaryPage() {
  const [projects, setProjects] = useState<{ id: string; name: string; site: string; status: Status; created_at: string }[]>([]);
  const [updates, setUpdates] = useState<Row[]>([]);
  const [mode, setMode] = useState<"weekly" | "monthly">("weekly");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: u }] = await Promise.all([
        supabase.from("projects").select("id, name, site, status, created_at"),
        supabase.from("weekly_updates").select("id, project_id, week_label, status, note, created_at").order("created_at", { ascending: false }),
      ]);
      setProjects((p ?? []) as typeof projects);
      setUpdates((u ?? []) as Row[]);
      setLoading(false);
    })();
  }, []);

  const currentBucket = mode === "weekly" ? currentWeekLabel() : monthLabel(new Date());
  const bucketOf = (u: Row) => (mode === "weekly" ? u.week_label : monthLabel(u.created_at));

  const perSite = useMemo(() => {
    return SITES.map((site) => {
      const siteProjects = projects.filter((p) => p.site === site);
      const activeProjects = siteProjects.filter((p) => p.status !== "Complete");
      const statusCounts: Record<Status, number> = {
        "On Track": 0, "At Risk": 0, "Blocked": 0, "Complete": 0, "On Hold": 0,
      };
      // Use latest status per project
      const latest = new Map<string, Status>();
      for (const u of updates) if (!latest.has(u.project_id)) latest.set(u.project_id, u.status);
      for (const p of siteProjects) {
        const s = latest.get(p.id) ?? p.status;
        statusCounts[s] += 1;
      }
      // Changes in current bucket
      const bucketUpdates = updates.filter((u) => bucketOf(u) === currentBucket && siteProjects.some((p) => p.id === u.project_id));
      const newProjects = siteProjects.filter((p) => {
        if (mode === "weekly") return currentWeekLabel(new Date(p.created_at)) === currentBucket;
        return monthLabel(p.created_at) === currentBucket;
      });
      const completions = bucketUpdates.filter((u) => u.status === "Complete");
      const changes = bucketUpdates.map((u) => ({
        projectName: siteProjects.find((p) => p.id === u.project_id)?.name ?? "—",
        status: u.status, note: u.note,
      }));
      return { site, activeCount: activeProjects.length, statusCounts, newProjects, completions, changes };
    });
  }, [projects, updates, currentBucket, mode]);

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

      <div className="grid gap-4 md:grid-cols-2">
        {perSite.map((s) => (
          <Card key={s.site}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between">
                <span>{s.site}</span>
                <span className="text-sm font-normal text-muted-foreground">{s.activeCount} active</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((st) => s.statusCounts[st] > 0 && (
                  <div key={st} className="flex items-center gap-1.5">
                    <StatusBadge status={st} />
                    <span className="text-xs text-muted-foreground">{s.statusCounts[st]}</span>
                  </div>
                ))}
              </div>
              <div className="text-sm space-y-1.5">
                <SummaryLine label="New projects" items={s.newProjects.map((p) => p.name)} />
                <SummaryLine label="Completions" items={s.completions.map((_c) => "1 project completed")} />
                <SummaryLine label={mode === "weekly" ? "Updates this week" : "Updates this month"} items={s.changes.slice(0, 5).map((c) => `${c.projectName} — ${c.status}`)} more={s.changes.length > 5 ? s.changes.length - 5 : 0} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SummaryLine({ label, items, more = 0 }: { label: string; items: string[]; more?: number }) {
  if (items.length === 0) return (
    <div><span className="text-muted-foreground">{label}:</span> <span className="text-muted-foreground">none</span></div>
  );
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>
      <ul className="ml-1 mt-0.5 space-y-0.5">
        {items.map((it, i) => <li key={i}>· {it}</li>)}
        {more > 0 && <li className="text-muted-foreground">· +{more} more</li>}
      </ul>
    </div>
  );
}
