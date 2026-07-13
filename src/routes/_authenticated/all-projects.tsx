import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SITES, STATUSES, PRIORITIES, CATEGORIES, formatDate, statusRank, priorityRank, priorityClasses, isOverdue, weeksBetween, daysSince, type Status, type Priority, type Category } from "@/lib/ci";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { ProjectHistoryDialog, type ProjectRow, type UpdateRow } from "@/components/project-history";
import { toast } from "sonner";
import { Copy, Check, ArrowUpDown, Star, Pencil, Archive, ArchiveRestore, Trash2, Search, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/all-projects")({
  head: () => ({ meta: [{ title: "All Projects — CI Status Tracker" }] }),
  component: AllProjectsPage,
});

type ViewMode = "active" | "completed" | "archived" | "all";

function AllProjectsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [updates, setUpdates] = useState<(UpdateRow & { project_id: string })[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("active");
  const [search, setSearch] = useState("");
  const [sortByRisk, setSortByRisk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [openProject, setOpenProject] = useState<ProjectRow | null>(null);
  const [editProject, setEditProject] = useState<ProjectRow | null>(null);
  const [deleteProject, setDeleteProject] = useState<ProjectRow | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast.error("Admin only");
      throw redirect({ to: "/my-projects" });
    }
  }, [authLoading, isAdmin]);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: u }, { data: pr }] = await Promise.all([
      supabase.from("projects").select("id, name, site, owner_id, status, description, blocker, featured, archived, created_at").order("created_at", { ascending: false }),
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
      const currentStatus = (latest?.status ?? p.status) as Status;
      const lastUpdated = latest?.created_at ?? null;
      const staleDays = lastUpdated ? daysSince(lastUpdated) : null;
      const isComplete = currentStatus === "Complete";
      const needsUpdate = !isComplete && !p.archived && (staleDays === null || staleDays > 7);
      return {
        ...p,
        owner_name: profiles[p.owner_id],
        currentStatus,
        latestNote: latest?.note ?? null,
        latestBlocker: latest?.blocker ?? p.blocker,
        lastUpdated: lastUpdated ?? p.created_at,
        latestReviewed: latest?.reviewed ?? false,
        latestId: latest?.id ?? null,
        weeksTracked: weeksBetween(p.created_at),
        staleDays,
        needsUpdate,
        isComplete,
      };
    });

    // View mode filter
    if (viewMode === "active") out = out.filter((r) => !r.archived && !r.isComplete);
    else if (viewMode === "completed") out = out.filter((r) => !r.archived && r.isComplete);
    else if (viewMode === "archived") out = out.filter((r) => r.archived);

    if (siteFilter !== "all") out = out.filter((r) => r.site === siteFilter);
    if (statusFilter !== "all") out = out.filter((r) => r.currentStatus === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) => r.name.toLowerCase().includes(q) || (r.owner_name ?? "").toLowerCase().includes(q));
    }
    if (sortByRisk) out.sort((a, b) => statusRank(a.currentStatus) - statusRank(b.currentStatus) || (new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()));
    else out.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
    return out;
  }, [projects, latestByProject, profiles, siteFilter, statusFilter, viewMode, search, sortByRisk]);

  const siteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.site] = (counts[r.site] ?? 0) + (r.latestNote && !r.latestReviewed ? 1 : 0);
    return counts;
  }, [rows]);

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

  const toggleFeatured = async (r: ProjectRow) => {
    const next = !r.featured;
    const { error } = await supabase.from("projects").update({ featured: next }).eq("id", r.id);
    if (error) return toast.error(error.message.includes("5 featured") ? error.message : `Could not feature: ${error.message}`);
    toast.success(next ? "Featured in Executive Summary" : "Removed from Executive Summary");
    load();
  };

  const toggleArchived = async (r: ProjectRow) => {
    const next = !r.archived;
    const { error } = await supabase.from("projects").update({ archived: next, featured: next ? false : r.featured }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(next ? "Project archived" : "Project restored");
    load();
  };

  const deleteRow = async () => {
    if (!deleteProject) return;
    const { error } = await supabase.from("projects").delete().eq("id", deleteProject.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Deleted "${deleteProject.name}"`);
    setDeleteProject(null);
    load();
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
        <div className="space-y-1 flex-1 min-w-[220px] max-w-md">
          <div className="text-xs font-medium text-muted-foreground">Search</div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Project or owner…" className="pl-8" />
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">View</div>
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Site</div>
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {SITES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Status</div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSortByRisk((v) => !v)}>
          <ArrowUpDown className="w-4 h-4 mr-1" /> {sortByRisk ? "Risk first" : "Last updated"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-medium text-muted-foreground mr-1">Copy unreviewed by site:</span>
        {SITES.map((s) => {
          const count = siteCounts[s] ?? 0;
          const disabled = count === 0;
          return (
            <Button
              key={s}
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => copyForSite(s)}
              title={disabled ? `No unreviewed updates for ${s}` : `Copy ${count} update(s)`}
            >
              <Copy className="w-3.5 h-3.5 mr-1" /> {s}{count > 0 && ` (${count})`}
            </Button>
          );
        })}
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
                <th className="text-left px-3 py-2 font-medium">Updated</th>
                <th className="text-left px-3 py-2 font-medium">Weeks</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn("border-t border-border hover:bg-muted/30", r.archived && "opacity-60")}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setOpenProject(r)} className="text-left font-medium text-primary hover:underline">
                        {r.name}
                      </button>
                      {r.needsUpdate && (
                        <span
                          title={r.staleDays === null ? "No weekly update yet" : `Last update ${r.staleDays} days ago`}
                          className="inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 border border-[var(--status-blocked)]/30 bg-[var(--status-blocked)]/10 text-[var(--status-blocked)]"
                        >
                          <AlertCircle className="w-3 h-3" /> Needs update
                        </span>
                      )}
                      {r.archived && (
                        <span className="text-[10px] rounded px-1.5 py-0.5 bg-muted text-muted-foreground border">Archived</span>
                      )}
                    </div>
                    {r.latestBlocker && (
                      <div className="text-xs text-[var(--status-blocked)] mt-0.5 truncate max-w-[320px]" title={r.latestBlocker}>
                        Blocker: {r.latestBlocker}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.site}</td>
                  <td className="px-3 py-2">{r.owner_name ?? "—"}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.currentStatus} /></td>
                  <td className="px-3 py-2 max-w-[280px] truncate" title={r.latestNote ?? ""}>
                    {r.latestNote ?? <span className="text-muted-foreground">No updates</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.lastUpdated)}</td>
                  <td className="px-3 py-2">{r.weeksTracked}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-0.5">
                      <IconBtn
                        title={r.featured ? "Un-feature from Executive Summary" : "Feature in Executive Summary"}
                        onClick={() => toggleFeatured(r)}
                        active={r.featured}
                      >
                        <Star className={cn("w-4 h-4", r.featured && "fill-current")} />
                      </IconBtn>
                      {r.latestId && (
                        r.latestReviewed ? (
                          <IconBtn title="Latest update already reviewed" disabled>
                            <Check className="w-4 h-4 text-[var(--status-ontrack)]" />
                          </IconBtn>
                        ) : (
                          <IconBtn title="Mark latest update reviewed" onClick={() => markReviewed(r.latestId!)}>
                            <Check className="w-4 h-4" />
                          </IconBtn>
                        )
                      )}
                      <IconBtn title="Edit project" onClick={() => setEditProject(r)}>
                        <Pencil className="w-4 h-4" />
                      </IconBtn>
                      <IconBtn
                        title={r.archived ? "Restore project" : "Archive project"}
                        onClick={() => toggleArchived(r)}
                      >
                        {r.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                      </IconBtn>
                      <IconBtn title="Delete project permanently" onClick={() => setDeleteProject(r)} danger>
                        <Trash2 className="w-4 h-4" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No projects match those filters.</td></tr>
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

      <EditProjectDialog project={editProject} onOpenChange={(v) => !v && setEditProject(null)} onSaved={load} />

      <AlertDialog open={!!deleteProject} onOpenChange={(v) => !v && setDeleteProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteProject?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the project and all of its weekly updates. This cannot be undone.
              Prefer <span className="font-medium">Archive</span> if you want to keep the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteRow} className="bg-[var(--status-blocked)] hover:bg-[var(--status-blocked)]/90">
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IconBtn({
  children, title, onClick, disabled, active, danger,
}: {
  children: React.ReactNode; title: string; onClick?: () => void;
  disabled?: boolean; active?: boolean; danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded p-1.5 transition-colors",
        disabled ? "text-muted-foreground/40 cursor-not-allowed" : "hover:bg-muted",
        active && "text-primary",
        danger && !disabled && "hover:bg-[var(--status-blocked)]/10 hover:text-[var(--status-blocked)]",
      )}
    >
      {children}
    </button>
  );
}

function EditProjectDialog({
  project, onOpenChange, onSaved,
}: { project: ProjectRow | null; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("On Track");
  const [blocker, setBlocker] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? "");
      setStatus(project.status);
      setBlocker(project.blocker ?? "");
    }
  }, [project]);

  const save = async () => {
    if (!project) return;
    setSaving(true);
    const { error } = await supabase.from("projects").update({
      name: name.trim(),
      description: description.trim() || null,
      status,
      blocker: blocker.trim() || null,
    }).eq("id", project.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Project updated");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={!!project} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>{project?.site} · Owner {project?.owner_name ?? "—"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Blocker</Label><Input value={blocker} onChange={(e) => setBlocker(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
