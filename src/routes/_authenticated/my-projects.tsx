import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { SITES, STATUSES, PRIORITIES, CATEGORIES, currentWeekLabel, formatDate, statusRank, type Status, type Site, type Priority, type Category } from "@/lib/ci";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { ProjectHistoryDialog, type ProjectRow, type UpdateRow } from "@/components/project-history";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/my-projects")({
  head: () => ({ meta: [{ title: "My Projects — CI Status Tracker" }] }),
  component: MyProjectsPage,
});

function MyProjectsPage() {
  const { user, profile } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [openProject, setOpenProject] = useState<ProjectRow | null>(null);

  const currentWeek = currentWeekLabel();

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: p } = await supabase
      .from("projects")
      .select("id, name, site, owner_id, status, description, blocker, created_at, due_date, priority, next_action, category, problem_statement, start_date, completion_pct")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    const proj = (p ?? []) as ProjectRow[];
    setProjects(proj);
    const projectIds = proj.map((x) => x.id);
    if (projectIds.length) {
      const { data: u } = await supabase
        .from("weekly_updates")
        .select("id, project_id, week_label, status, note, blocker, reviewed, created_at, author_id")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false });
      const ups = (u ?? []) as (UpdateRow & { project_id: string })[];
      setUpdates(ups);
      const authorIds = Array.from(new Set(ups.map((x) => x.author_id)));
      if (authorIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", authorIds);
        const m: Record<string, string> = {};
        (profs ?? []).forEach((pr: { id: string; full_name: string }) => (m[pr.id] = pr.full_name));
        setNameMap(m);
      }
    } else {
      setUpdates([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const updatesByProject = useMemo(() => {
    const m = new Map<string, UpdateRow[]>();
    for (const u of updates) {
      const arr = m.get((u as UpdateRow & { project_id: string }).project_id) ?? [];
      arr.push({ ...u, author_name: nameMap[u.author_id] });
      m.set((u as UpdateRow & { project_id: string }).project_id, arr);
    }
    return m;
  }, [updates, nameMap]);

  const openHistory = (p: ProjectRow) => setOpenProject({ ...p, owner_name: profile?.full_name });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {profile?.full_name} · {profile?.site} · Week {currentWeek}
          </p>
        </div>
        <div className="flex gap-2">
          <NewProjectDialog onCreated={load} defaultSite={profile?.site ?? SITES[0]} />
          <LogUpdateDialog projects={projects} onCreated={load} />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No projects yet. Create your first CI project to start tracking weekly status.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => {
            const ups = updatesByProject.get(p.id) ?? [];
            const latest = ups[0];
            const hasCurrentWeek = ups.some((u) => u.week_label === currentWeek);
            return (
              <Card
                key={p.id}
                className="cursor-pointer hover:border-primary/60 transition-colors"
                onClick={() => openHistory(p)}
              >
                <CardContent className="py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{p.name}</h3>
                      <StatusBadge status={(latest?.status ?? p.status) as Status} />
                      {!hasCurrentWeek && (
                        <span className="text-xs rounded px-1.5 py-0.5 bg-[var(--status-atrisk)]/10 text-[var(--status-atrisk)] border border-[var(--status-atrisk)]/30">
                          No update this week
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">
                      {p.site} · {ups.length} update{ups.length === 1 ? "" : "s"}
                      {latest && ` · Latest ${formatDate(latest.created_at)}`}
                    </p>
                    {latest?.note && (
                      <p className="text-sm mt-1.5 line-clamp-1 text-foreground/80">{latest.note}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ProjectHistoryDialog
        open={!!openProject}
        onOpenChange={(v) => !v && setOpenProject(null)}
        project={openProject}
        updates={openProject ? (updatesByProject.get(openProject.id) ?? []).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ) : []}
      />
    </div>
  );
}

function NewProjectDialog({ onCreated, defaultSite }: { onCreated: () => void; defaultSite: Site }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [site, setSite] = useState<Site>(defaultSite);
  const [status, setStatus] = useState<Status>("On Track");
  const [description, setDescription] = useState("");
  const [blocker, setBlocker] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [nextAction, setNextAction] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [problemStatement, setProblemStatement] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [completionPct, setCompletionPct] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(""); setDescription(""); setBlocker(""); setStatus("On Track");
    setDueDate(""); setPriority("Medium"); setNextAction(""); setCategory("");
    setProblemStatement(""); setStartDate(new Date().toISOString().slice(0, 10)); setCompletionPct(0);
  };

  const submit = async () => {
    if (!user || !name.trim()) return;
    if (!dueDate) return toast.error("Due date is required");
    if (!category) return toast.error("Category is required");
    if (!startDate) return toast.error("Start date is required");
    setSaving(true);
    const { error } = await supabase.from("projects").insert({
      name: name.trim(),
      site,
      owner_id: user.id,
      status,
      description: description.trim() || null,
      blocker: blocker.trim() || null,
      due_date: dueDate,
      priority,
      next_action: nextAction.trim() || null,
      category,
      problem_statement: problemStatement.trim() || null,
      start_date: startDate,
      completion_pct: Math.max(0, Math.min(100, Number(completionPct) || 0)),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Project created");
    setOpen(false);
    reset();
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-1" /> New project</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New CI project</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Project name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Line 3 changeover reduction" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Site</Label>
              <Select value={site} onValueChange={(v) => setSite(v as Site)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SITES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
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
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Initial status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
              <Label>Start date *</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Completion % ({completionPct}%)</Label>
              <Input type="range" min={0} max={100} step={5} value={completionPct} onChange={(e) => setCompletionPct(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Problem statement</Label>
            <Textarea value={problemStatement} onChange={(e) => setProblemStatement(e.target.value)} rows={2} placeholder="Why this project exists — the pain it's solving and the baseline today" />
          </div>
          <div className="space-y-1.5">
            <Label>Next action</Label>
            <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="What needs to happen next (and who owns it)" />
          </div>
          <div className="space-y-1.5"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
          <div className="space-y-1.5"><Label>Blocker (optional)</Label><Input value={blocker} onChange={(e) => setBlocker(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !name.trim() || !dueDate || !category || !startDate}>{saving ? "Saving…" : "Create project"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogUpdateDialog({ projects, onCreated }: { projects: ProjectRow[]; onCreated: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [status, setStatus] = useState<Status>("On Track");
  const [note, setNote] = useState("");
  const [blocker, setBlocker] = useState("");
  const [weekLabel, setWeekLabel] = useState<string>(currentWeekLabel());
  const [completionPct, setCompletionPct] = useState<number>(0);
  const [nextAction, setNextAction] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => [...projects].sort((a, b) => statusRank(a.status) - statusRank(b.status)), [projects]);

  // Prefill progress & next action from the selected project
  useEffect(() => {
    const p = projects.find((x) => x.id === projectId);
    if (p) {
      setCompletionPct(typeof p.completion_pct === "number" ? p.completion_pct : 0);
      setNextAction(p.next_action ?? "");
    }
  }, [projectId, projects]);

  const submit = async () => {
    if (!user || !projectId || !note.trim() || !weekLabel) return;
    setSaving(true);
    const { error: uErr } = await supabase.from("weekly_updates").insert({
      project_id: projectId,
      author_id: user.id,
      week_label: weekLabel,
      status,
      note: note.trim(),
      blocker: blocker.trim() || null,
    });
    if (uErr) { setSaving(false); return toast.error(uErr.message); }
    const projectPatch: Record<string, unknown> = {
      completion_pct: completionPct,
      next_action: nextAction.trim() || null,
    };
    // Only sync the project's current status if logging for the current week
    if (weekLabel === currentWeekLabel()) {
      projectPatch.status = status;
      projectPatch.blocker = blocker.trim() || null;
    }
    await supabase.from("projects").update(projectPatch).eq("id", projectId);
    setSaving(false);
    toast.success("Update logged");
    setOpen(false);
    setNote(""); setBlocker(""); setStatus("On Track"); setProjectId(""); setWeekLabel(currentWeekLabel());
    setCompletionPct(0); setNextAction("");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={projects.length === 0}>Log update</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log weekly update</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
              <SelectContent>
                {sorted.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.site}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Week</Label>
              <Input
                type="week"
                value={weekLabel}
                onChange={(e) => setWeekLabel(e.target.value)}
                max={currentWeekLabel()}
              />
              <p className="text-xs text-muted-foreground">Defaults to this week. Pick an earlier week to backfill.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>What happened this week?</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} /></div>
          <div className="space-y-1.5"><Label>Blocker (optional)</Label><Input value={blocker} onChange={(e) => setBlocker(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !projectId || !note.trim() || !weekLabel}>
            {saving ? "Saving…" : "Log update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// suppress unused CardHeader/CardTitle/CardDescription imports if not used
void CardHeader; void CardTitle; void CardDescription;
