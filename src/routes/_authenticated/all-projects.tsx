import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SITES, STATUSES, formatDate, statusRank, weeksBetween, type Site, type Status } from "@/lib/ci";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { ProjectHistoryDialog, type ProjectRow, type UpdateRow } from "@/components/project-history";
import { toast } from "sonner";
import { Copy, Check, ArrowUpDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/all-projects")({
  head: () => ({ meta: [{ title: "All Projects — CI Status Tracker" }] }),
  component: AllProjectsPage,
});

function AllProjectsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [updates, setUpdates] = useState<(UpdateRow & { project_id: string })[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortByRisk, setSortByRisk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [openProject, setOpenProject] = useState<ProjectRow | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast.error("Admin only");
      throw redirect({ to: "/my-projects" });
    }
  }, [authLoading, isAdmin]);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: u }, { data: pr }] = await Promise.all([
      supabase.from("projects").select("id, name, site, owner_id, status, description, blocker, created_at").order("created_at", { ascending: false }),
      supabase.from("weekly_updates").select("id, project_id, week_label, status, note, blocker, reviewed, created_at, author_id").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name"),
    ]);
    setProjects((p ?? []) as ProjectRow[]);
    setUpdates((u ?? []) as (UpdateRow & { project_id: string })[]);
    const m: Record<string, string> = {};
    (pr ?? []).forEach((x: { id: string; full_name: string }) => (m[x.id] = x.full_name));
    setProfiles(m);
    setLoading(false);
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const latestByProject = useMemo(() => {
    const m = new Map<string, UpdateRow & { project_id: string }>();
    for (const u of updates) if (!m.has(u.project_id)) m.set(u.project_id, u);
    return m;
  }, [updates]);

  const updatesByProject = useMemo(() => {
    const m = new Map<string, UpdateRow[]>();
    for (const u of updates) {
      const arr = m.get(u.project_id) ?? [];
      arr.push({ ...u, author_name: profiles[u.author_id] });
      m.set(u.project_id, arr);
    }
    return m;
  }, [updates, profiles]);

  const rows = useMemo(() => {
    let out = projects.map((p) => {
      const latest = latestByProject.get(p.id);
      return {
        ...p,
        owner_name: profiles[p.owner_id],
        currentStatus: (latest?.status ?? p.status) as Status,
        latestNote: latest?.note ?? null,
        latestBlocker: latest?.blocker ?? p.blocker,
        lastUpdated: latest?.created_at ?? p.created_at,
        latestReviewed: latest?.reviewed ?? false,
        latestId: latest?.id ?? null,
        weeksTracked: weeksBetween(p.created_at),
      };
    });
    if (siteFilter !== "all") out = out.filter((r) => r.site === siteFilter);
    if (statusFilter !== "all") out = out.filter((r) => r.currentStatus === statusFilter);
    if (sortByRisk) out.sort((a, b) => statusRank(a.currentStatus) - statusRank(b.currentStatus) || (new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()));
    else out.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
    return out;
  }, [projects, latestByProject, profiles, siteFilter, statusFilter, sortByRisk]);

  const markReviewed = async (updateId: string) => {
    const { error } = await supabase.from("weekly_updates").update({ reviewed: true, reviewed_at: new Date().toISOString() }).eq("id", updateId);
    if (error) return toast.error(error.message);
    toast.success("Marked reviewed");
    load();
  };

  const copyForSite = async (site: string) => {
    const items = rows.filter((r) => r.site === site && !r.latestReviewed && r.latestNote);
    if (items.length === 0) return toast.info("Nothing new to copy for " + site);
    const text = items
      .map((r) => `[${r.currentStatus}] ${r.name}: ${r.latestNote}${r.latestBlocker ? ` (Blocker: ${r.latestBlocker})` : ""}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${items.length} update(s) for ${site}`);
  };

  if (authLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">All Projects</h1>
        <p className="text-sm text-muted-foreground mt-1">Every CI project across every site.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Site</div>
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {SITES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Status</div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSortByRisk((v) => !v)}>
          <ArrowUpDown className="w-4 h-4 mr-1" /> Sort: {sortByRisk ? "Risk first" : "Last updated"}
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          {SITES.map((s) => (
            <Button key={s} size="sm" variant="outline" onClick={() => copyForSite(s)}>
              <Copy className="w-3.5 h-3.5 mr-1" /> {s}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="rounded-md border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Project</th>
                <th className="text-left px-3 py-2 font-medium">Site</th>
                <th className="text-left px-3 py-2 font-medium">Owner</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Latest update</th>
                <th className="text-left px-3 py-2 font-medium">Blocker</th>
                <th className="text-left px-3 py-2 font-medium">Updated</th>
                <th className="text-left px-3 py-2 font-medium">Weeks</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <button onClick={() => setOpenProject(r)} className="text-left font-medium text-primary hover:underline">
                      {r.name}
                    </button>
                  </td>
                  <td className="px-3 py-2">{r.site}</td>
                  <td className="px-3 py-2">{r.owner_name ?? "—"}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.currentStatus} /></td>
                  <td className="px-3 py-2 max-w-[280px] truncate" title={r.latestNote ?? ""}>{r.latestNote ?? <span className="text-muted-foreground">No updates</span>}</td>
                  <td className="px-3 py-2 max-w-[180px] truncate text-[var(--status-blocked)]">{r.latestBlocker ?? ""}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.lastUpdated)}</td>
                  <td className="px-3 py-2">{r.weeksTracked}</td>
                  <td className="px-3 py-2 text-right">
                    {r.latestId && (r.latestReviewed ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5" /> Reviewed</span>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => markReviewed(r.latestId!)}>Mark reviewed</Button>
                    ))}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No projects match those filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ProjectHistoryDialog
        open={!!openProject}
        onOpenChange={(v) => !v && setOpenProject(null)}
        project={openProject}
        updates={openProject ? (updatesByProject.get(openProject.id) ?? []).slice().sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ) : []}
      />
    </div>
  );
}

void SITES; void ({} as Site);
