import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SITES, STATUSES, PRIORITIES, CATEGORIES, SUPPORT_STATUSES, formatDate, statusRank, supportStatusRank, priorityRank, priorityClasses, isOverdue, weeksBetween, daysSince, type Status, type SupportStatus, type Priority, type Category, type EntryType } from "@/lib/ci";
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
import { StatusBadge, SupportStatusBadge, EntryTypeBadge } from "@/components/status-badge";
import { ProjectHistoryDialog, type ProjectRow, type UpdateRow } from "@/components/project-history";
import { toast } from "sonner";
import { Copy, Check, ArrowUpDown, Star, Pencil, Archive, ArchiveRestore, Trash2, Search, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/all-projects")({
  head: () => ({ meta: [{ title: "All Projects — CI Status Tracker" }] }),
  component: AllProjectsPage,
});

type ViewMode = "active" | "completed" | "archived" | "all";
type SortMode = "risk" | "updated" | "priority" | "due";

function AllProjectsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [updates, setUpdates] = useState<(UpdateRow & { project_id: string })[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | EntryType>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("active");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("risk");
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
      supabase.from("projects").select("id, name, site, owner_id, status, description, blocker, featured, archived, created_at, due_date, priority, next_action, category, problem_statement, start_date, completion_pct, entry_type, support_status, requester").order("created_at", { ascending: false }),
      supabase.from("weekly_updates").select("id, project_id, week_label, status, support_status, note, blocker, reviewed, created_at, author_id").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name"),
    ]);
    setProjects((p ?? []) as unknown as ProjectRow[]);
    setUpdates((u ?? []) as unknown as (UpdateRow & { project_id: string })[]);
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
      const isSupport = p.entry_type === "support";
      const latest = latestByProject.get(p.id);
      const projectStatus = (latest?.status ?? p.status) as Status;
      const supportStat = (latest?.support_status ?? p.support_status ?? "Open") as SupportStatus;
      const displayStatus: string = isSupport ? supportStat : projectStatus;
      const lastUpdated = latest?.created_at ?? null;
      const staleDays = lastUpdated ? daysSince(lastUpdated) : null;
      const isComplete = isSupport ? supportStat === "Done" : projectStatus === "Complete";
      const needsUpdate = !isSupport && !isComplete && !p.archived && (staleDays === null || staleDays > 7);
      return {
        ...p,
        owner_name: profiles[p.owner_id],
        isSupport,
        projectStatus,
        supportStatus: supportStat,
        displayStatus,
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

    if (viewMode === "active") out = out.filter((r) => !r.archived && !r.isComplete);
    else if (viewMode === "completed") out = out.filter((r) => !r.archived && r.isComplete);
    else if (viewMode === "archived") out = out.filter((r) => r.archived);

    if (typeFilter !== "all") out = out.filter((r) => (r.entry_type ?? "project") === typeFilter);
    if (siteFilter !== "all") out = out.filter((r) => r.site === siteFilter);
    if (statusFilter !== "all") out = out.filter((r) => r.displayStatus === statusFilter);
    if (categoryFilter !== "all") out = out.filter((r) => r.category === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) => r.name.toLowerCase().includes(q) || (r.owner_name ?? "").toLowerCase().includes(q));
    }
    const byUpdated = (a: typeof out[number], b: typeof out[number]) =>
      new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
    const riskRank = (r: typeof out[number]) => r.isSupport ? supportStatusRank(r.supportStatus) + 10 : statusRank(r.projectStatus);
    if (sortMode === "risk") out.sort((a, b) => riskRank(a) - riskRank(b) || byUpdated(a, b));
    else if (sortMode === "priority") out.sort((a, b) => priorityRank((a.priority ?? "Medium") as Priority) - priorityRank((b.priority ?? "Medium") as Priority) || byUpdated(a, b));
    else if (sortMode === "due") out.sort((a, b) => {
      const av = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
      const bv = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
      return av - bv;
    });
    else out.sort(byUpdated);
    return out;
  }, [projects, latestByProject, profiles, typeFilter, siteFilter, statusFilter, categoryFilter, viewMode, search, sortMode]);

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
      .map((r) => `[${r.displayStatus}] ${r.name}: ${r.latestNote}${r.latestBlocker ? ` (Blocker: ${r.latestBlocker})` : ""}`)
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
          <div className="text-xs font-medium text-muted-foreground">Type</div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | EntryType)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="project">Projects</SelectItem>
              <SelectItem value="support">Support</SelectItem>
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
              {STATUSES.map((s) => <SelectItem key={`p-${s}`} value={s}>{s}</SelectItem>)}
              {SUPPORT_STATUSES.map((s) => <SelectItem key={`s-${s}`} value={s}>{s} (support)</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Category</div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Sort</div>
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="w-40"><ArrowUpDown className="w-3.5 h-3.5 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="risk">Risk first</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="due">Due date</SelectItem>
              <SelectItem value="updated">Last updated</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
                <th className="text-left px-3 py-2 font-medium">Category</th>
                <th className="text-left px-3 py-2 font-medium">Owner</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Priority</th>
                <th className="text-left px-3 py-2 font-medium">Due</th>
                <th className="text-left px-3 py-2 font-medium">Progress</th>
                <th className="text-left px-3 py-2 font-medium">Next action</th>
                <th className="text-left px-3 py-2 font-medium">Updated</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const overdue = isOverdue(r.due_date, r.displayStatus as Status | SupportStatus);
                return (
                <tr key={r.id} className={cn("border-t border-border hover:bg-muted/30", r.archived && "opacity-60", r.isSupport && "bg-muted/10")}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <EntryTypeBadge type={r.isSupport ? "support" : "project"} />
                      <button onClick={() => setOpenProject(r)} className="text-left font-medium text-primary hover:underline">
                        {r.name}
                      </button>
                      {r.priority === "High" && (
                        <span className={cn("text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 border", priorityClasses("High"))}>High</span>
                      )}
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
                    {r.isSupport && r.requester && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[320px]">Requester: {r.requester}</div>
                    )}
                    {r.latestBlocker && !r.isSupport && (
                      <div className="text-xs text-[var(--status-blocked)] mt-0.5 truncate max-w-[320px]" title={r.latestBlocker}>
                        Blocker: {r.latestBlocker}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.site}</td>
                  <td className="px-3 py-2">
                    {r.isSupport ? <span className="text-muted-foreground">—</span> : r.category ? (
                      <span className="text-xs rounded-full px-2 py-0.5 border bg-primary/5 text-primary border-primary/20">{r.category}</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">{r.owner_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.isSupport
                      ? <SupportStatusBadge status={r.supportStatus} />
                      : <StatusBadge status={r.projectStatus} />}
                  </td>
                  <td className="px-3 py-2">
                    {r.priority && (
                      <span className={cn("text-xs font-medium rounded-full px-2 py-0.5 border", priorityClasses(r.priority as Priority))}>
                        {r.priority}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.due_date ? (
                      <span className={cn(overdue && "text-[var(--status-blocked)] font-medium")}>
                        {formatDate(r.due_date)}
                        {overdue && <span className="ml-1 text-[10px] rounded px-1 py-0.5 border border-[var(--status-blocked)]/30 bg-[var(--status-blocked)]/10">Overdue</span>}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 min-w-[110px]">
                    {r.isSupport ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, r.completion_pct ?? 0))}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">{r.completion_pct ?? 0}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[220px] truncate" title={r.isSupport ? (r.description ?? "") : (r.next_action ?? "")}>
                    {r.isSupport ? (r.description ?? <span className="text-muted-foreground">—</span>) : (r.next_action ?? <span className="text-muted-foreground">—</span>)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.lastUpdated)}</td>
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
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">No projects match those filters.</td></tr>
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

      <EditProjectDialog project={editProject} onOpenChange={(v) => !v && setEditProject(null)} onSaved={load} profiles={profiles} />

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
  project, onOpenChange, onSaved, profiles,
}: { project: ProjectRow | null; onOpenChange: (v: boolean) => void; onSaved: () => void; profiles: Record<string, string> }) {
  const { isAdmin, profile: currentProfile } = useAuth();
  const isSupport = project?.entry_type === "support";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("On Track");
  const [supportStatus, setSupportStatus] = useState<SupportStatus>("Open");
  const [blocker, setBlocker] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [nextAction, setNextAction] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [problemStatement, setProblemStatement] = useState("");
  const [startDate, setStartDate] = useState("");
  const [completionPct, setCompletionPct] = useState<number>(0);
  const [requester, setRequester] = useState("");
  const [ownerId, setOwnerId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? "");
      setStatus(project.status);
      setSupportStatus((project.support_status ?? "Open") as SupportStatus);
      setBlocker(project.blocker ?? "");
      setDueDate(project.due_date ?? "");
      setPriority((project.priority as Priority) ?? "Medium");
      setNextAction(project.next_action ?? "");
      setCategory((project.category as Category) ?? "");
      setProblemStatement(project.problem_statement ?? "");
      setStartDate(project.start_date ?? "");
      setCompletionPct(project.completion_pct ?? 0);
      setRequester(project.requester ?? "");
      setOwnerId(project.owner_id);
    }
  }, [project]);

  const ownerOptions = useMemo(
    () => Object.entries(profiles).sort((a, b) => a[1].localeCompare(b[1])),
    [profiles],
  );

  const save = async () => {
    if (!project) return;
    setSaving(true);
    if (isSupport) {
      const { error } = await supabase.from("projects").update({
        name: name.trim(),
        description: description.trim() || null,
        support_status: supportStatus,
        due_date: dueDate || null,
        priority,
        requester: requester.trim() || null,
      }).eq("id", project.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Support item updated");
    } else {
      if (!dueDate) { setSaving(false); return toast.error("Due date is required"); }
      if (!category) { setSaving(false); return toast.error("Category is required"); }
      const { error } = await supabase.from("projects").update({
        name: name.trim(),
        description: description.trim() || null,
        status,
        blocker: blocker.trim() || null,
        due_date: dueDate,
        priority,
        next_action: nextAction.trim() || null,
        category,
        problem_statement: problemStatement.trim() || null,
        start_date: startDate || null,
        completion_pct: Math.max(0, Math.min(100, Number(completionPct) || 0)),
      }).eq("id", project.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Project updated");
    }
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={!!project} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {isSupport ? "support item" : "project"}</DialogTitle>
          <DialogDescription>{project?.site} · Owner {project?.owner_name ?? "—"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>{isSupport ? "Title" : "Name"}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          {isSupport ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={supportStatus} onValueChange={(v) => setSupportStatus(v as SupportStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SUPPORT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Due date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Requester</Label>
                  <Input value={requester} onChange={(e) => setRequester(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5"><Label>Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Category *</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                    <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Due date *</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Completion % ({completionPct}%)</Label>
                  <Input type="range" min={0} max={100} step={5} value={completionPct} onChange={(e) => setCompletionPct(Number(e.target.value))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Problem statement</Label>
                <Textarea rows={2} value={problemStatement} onChange={(e) => setProblemStatement(e.target.value)} placeholder="Why this project exists — the pain it's solving and the baseline today" />
              </div>
              <div className="space-y-1.5">
                <Label>Next action</Label>
                <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="What needs to happen next" />
              </div>
              <div className="space-y-1.5"><Label>Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Blocker</Label><Input value={blocker} onChange={(e) => setBlocker(e.target.value)} /></div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
