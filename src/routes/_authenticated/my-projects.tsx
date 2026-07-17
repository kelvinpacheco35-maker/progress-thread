import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { projectsQuery, updatesQuery, profilesQuery, useInvalidateCi } from "@/lib/ci-queries";
import {
  SITES, STATUSES, PRIORITIES, CATEGORIES, SUPPORT_STATUSES,
  currentWeekLabel, formatDate, statusRank, supportStatusRank,
  type Status, type SupportStatus, type Site, type Priority, type Category, type EntryType,
} from "@/lib/ci";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, SupportStatusBadge, EntryTypeBadge, PendingApprovalBadge } from "@/components/status-badge";
import { ProjectHistoryDialog, type ProjectRow, type UpdateRow } from "@/components/project-history";
import { toast } from "sonner";
import { Plus, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { priorityClasses } from "@/lib/ci";

export const Route = createFileRoute("/_authenticated/my-projects")({
  head: () => ({ meta: [{ title: "My Projects — CI Status Tracker" }] }),
  component: MyProjectsPage,
});

function MyProjectsPage() {
  const { user, profile } = useAuth();
  const invalidate = useInvalidateCi();

  const projectsQ = useQuery({ ...projectsQuery(), enabled: !!user });
  const updatesQ = useQuery({ ...updatesQuery(), enabled: !!user });
  const profilesQ = useQuery(profilesQuery());

  const projects = useMemo(
    () => ((projectsQ.data ?? []) as ProjectRow[]).filter((p) => p.owner_id === user?.id),
    [projectsQ.data, user?.id],
  );
  const nameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of profilesQ.data ?? []) m[p.id] = p.full_name;
    return m;
  }, [profilesQ.data]);

  const loading = projectsQ.isLoading || updatesQ.isLoading;
  const [openProject, setOpenProject] = useState<ProjectRow | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | EntryType>("all");
  const [logUpdateFor, setLogUpdateFor] = useState<ProjectRow | null>(null);

  const currentWeek = currentWeekLabel();
  const load = invalidate;

  const updatesByProject = useMemo(() => {
    const m = new Map<string, UpdateRow[]>();
    const myIds = new Set(projects.map((p) => p.id));
    for (const raw of (updatesQ.data ?? []) as (UpdateRow & { project_id: string })[]) {
      if (!myIds.has(raw.project_id)) continue;
      const arr = m.get(raw.project_id) ?? [];
      arr.push({ ...raw, author_name: nameMap[raw.author_id] });
      m.set(raw.project_id, arr);
    }
    return m;
  }, [updatesQ.data, projects, nameMap]);


  const filtered = useMemo(() => {
    const base = typeFilter === "all"
      ? projects
      : projects.filter((p) => (p.entry_type ?? "project") === typeFilter);
    const SEVEN_DAYS_MS = 7 * 86400 * 1000;
    const now = Date.now();
    const needsUpdate = (p: ProjectRow) => {
      const ups = updatesByProject.get(p.id) ?? [];
      if (ups.length === 0) return true;
      const latest = ups[0];
      return now - new Date(latest.created_at).getTime() >= SEVEN_DAYS_MS;
    };
    const rankFor = (p: ProjectRow) => {
      const ups = updatesByProject.get(p.id) ?? [];
      const latest = ups[0];
      if ((p.entry_type ?? "project") === "support") {
        const s = (latest?.support_status ?? p.support_status ?? "Open") as SupportStatus;
        return supportStatusRank(s);
      }
      return statusRank((latest?.status ?? p.status) as Status);
    };
    return base.slice().sort((a, b) => {
      const na = needsUpdate(a) ? 0 : 1;
      const nb = needsUpdate(b) ? 0 : 1;
      if (na !== nb) return na - nb;
      const ra = rankFor(a);
      const rb = rankFor(b);
      if (ra !== rb) return ra - rb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [projects, typeFilter, updatesByProject]);

  const openHistory = (p: ProjectRow) => setOpenProject({ ...p, owner_name: profile?.full_name });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Entries</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {profile?.full_name} · {profile?.site} · Week {currentWeek}
          </p>
        </div>
        <div className="flex gap-2">
          <NewEntryDialog onCreated={load} defaultSite={profile?.site ?? SITES[0]} fixedType="project" />
          <NewEntryDialog onCreated={load} defaultSite={profile?.site ?? SITES[0]} fixedType="support" />
        </div>
      </div>

      <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | EntryType)}>
        <TabsList>
          <TabsTrigger value="all">All ({projects.length})</TabsTrigger>
          <TabsTrigger value="project">Projects ({projects.filter((p) => (p.entry_type ?? "project") === "project").length})</TabsTrigger>
          <TabsTrigger value="support">Support ({projects.filter((p) => p.entry_type === "support").length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border-l-4 border-l-muted">
              <CardContent className="py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-16 rounded bg-muted animate-pulse" />
                    <div className="h-5 w-64 rounded bg-muted animate-pulse" />
                    <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
                  </div>
                  <div className="h-3 w-72 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-96 max-w-full rounded bg-muted animate-pulse" />
                </div>
                <div className="h-8 w-28 rounded bg-muted animate-pulse shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No entries yet. Create your first CI project or support item to start tracking.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((p) => {
            const ups = updatesByProject.get(p.id) ?? [];
            const latest = ups[0];
            const isSupport = p.entry_type === "support";
            const hasCurrentWeek = ups.some((u) => u.week_label === currentWeek);
            const shownStatus = isSupport
              ? (latest?.support_status ?? p.support_status ?? "Open")
              : (latest?.status ?? p.status);
            return (
              <Card
                key={p.id}
                className={cn(
                  "cursor-pointer hover:border-primary/60 transition-colors border-l-4",
                  statusAccent(shownStatus as Status | SupportStatus),
                  isSupport && "bg-muted/20",
                )}
                onClick={() => openHistory(p)}
              >
                <CardContent className="py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <EntryTypeBadge type={isSupport ? "support" : "project"} />
                      <h3 className="font-medium truncate">{p.name}</h3>
                      {p.pending_approval
                        ? <PendingApprovalBadge />
                        : isSupport
                        ? <SupportStatusBadge status={shownStatus as SupportStatus} />
                        : <StatusBadge status={shownStatus as Status} />}
                      {p.priority === "High" && (
                        <span className={cn("text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 border", priorityClasses("High"))}>
                          High priority
                        </span>
                      )}
                      {!isSupport && !hasCurrentWeek && (
                        <span className="text-xs rounded px-1.5 py-0.5 bg-[var(--status-atrisk)]/10 text-[var(--status-atrisk)] border border-[var(--status-atrisk)]/30">
                          No update this week
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">
                      {p.site} · {ups.length} update{ups.length === 1 ? "" : "s"}
                      {latest && ` · Latest ${formatDate(latest.created_at)}`}
                      {isSupport && p.requester ? ` · Req: ${p.requester}` : ""}
                    </p>
                    {latest?.note && (
                      <p className="text-sm mt-1.5 line-clamp-1 text-foreground/80">{latest.note}</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={(e) => { e.stopPropagation(); setLogUpdateFor(p); }}
                  >
                    <PencilLine className="w-3.5 h-3.5 mr-1" /> Log update
                  </Button>
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
        updates={openProject ? (updatesByProject.get(openProject.id) ?? []).slice().sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ) : []}
      />

      <LogUpdateDialog
        open={!!logUpdateFor}
        onOpenChange={(v) => !v && setLogUpdateFor(null)}
        project={logUpdateFor}
        onCreated={load}
      />
    </div>
  );
}

function NewEntryDialog({ onCreated, defaultSite, fixedType }: { onCreated: () => void; defaultSite: Site; fixedType: EntryType }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const entryType: EntryType = fixedType;

  // Shared
  const [name, setName] = useState("");
  const [site, setSite] = useState<Site>(defaultSite);
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [saving, setSaving] = useState(false);

  // Project-only
  const [status, setStatus] = useState<Status>("On Track");
  const [blocker, setBlocker] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [problemStatement, setProblemStatement] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [completionPct, setCompletionPct] = useState<number>(0);

  // Support-only
  const [supportStatus, setSupportStatus] = useState<SupportStatus>("Open");
  const [requester, setRequester] = useState("");

  const reset = () => {
    setName(""); setDescription(""); setDueDate("");
    setPriority("Medium");
    setStatus("On Track"); setBlocker(""); setNextAction(""); setCategory("");
    setProblemStatement(""); setStartDate(new Date().toISOString().slice(0, 10)); setCompletionPct(0);
    setSupportStatus("Open"); setRequester("");
  };

  const submit = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    if (entryType === "project") {
      if (!dueDate) { setSaving(false); return toast.error("Due date is required"); }
      if (!category) { setSaving(false); return toast.error("Category is required"); }
      if (!startDate) { setSaving(false); return toast.error("Start date is required"); }
      const { error } = await supabase.from("projects").insert({
        name: name.trim(), site, owner_id: user.id,
        entry_type: "project",
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
    } else {
      if (!description.trim()) { setSaving(false); return toast.error("Description is required"); }
      const { error } = await supabase.from("projects").insert({
        name: name.trim(), site, owner_id: user.id,
        entry_type: "support",
        status: "On Track", // placeholder (not shown for support)
        support_status: supportStatus,
        description: description.trim(),
        due_date: dueDate || null,
        priority,
        requester: requester.trim() || null,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Support item created");
    }
    setOpen(false);
    reset();
    onCreated();
  };

  const canSubmit = entryType === "project"
    ? Boolean(name.trim() && dueDate && category && startDate)
    : Boolean(name.trim() && description.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant={fixedType === "project" ? "default" : "secondary"}>
          <Plus className="w-4 h-4 mr-1" /> {fixedType === "project" ? "New project" : "New support"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fixedType === "project" ? "New CI project" : "New support item"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{entryType === "support" ? "Title" : "Project name"}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={entryType === "support" ? "Line 2 conveyor jam troubleshooting" : "Line 3 changeover reduction"} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Site *</Label>
              <Select value={site} onValueChange={(v) => setSite(v as Site)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SITES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
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

          {entryType === "project" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category *</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                    <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Initial status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start date *</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Due date *</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Completion % ({completionPct}%)</Label>
                <Input type="range" min={0} max={100} step={5} value={completionPct} onChange={(e) => setCompletionPct(Number(e.target.value))} />
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
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Initial status</Label>
                  <Select value={supportStatus} onValueChange={(v) => setSupportStatus(v as SupportStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SUPPORT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Due date (optional)</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Requester (optional)</Label>
                <Input value={requester} onChange={(e) => setRequester(e.target.value)} placeholder="Who asked for this" />
              </div>
              <div className="space-y-1.5">
                <Label>Description *</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What's the request? Keep it short." />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !canSubmit}>{saving ? "Saving…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogUpdateDialog({
  open, onOpenChange, project, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: ProjectRow | null;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>("On Track");
  const [supportStatus, setSupportStatus] = useState<SupportStatus>("Open");
  const [note, setNote] = useState("");
  const [blocker, setBlocker] = useState("");
  const [weekLabel, setWeekLabel] = useState<string>(currentWeekLabel());
  const [completionPct, setCompletionPct] = useState<number>(0);
  const [nextAction, setNextAction] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const isSupport = project?.entry_type === "support";
  const projectId = project?.id ?? "";

  useEffect(() => {
    if (!project || !open) return;
    setNote(""); setBlocker(""); setWeekLabel(currentWeekLabel());
    if (project.entry_type === "support") {
      setSupportStatus((project.support_status ?? "Open") as SupportStatus);
    } else {
      setCompletionPct(typeof project.completion_pct === "number" ? project.completion_pct : 0);
      setNextAction(project.next_action ?? "");
      setStatus(project.status);
      setBlocker(project.blocker ?? "");
    }
  }, [project, open]);

  const submit = async () => {
    if (!user || !projectId || !note.trim() || !weekLabel || !project) return;
    setSaving(true);

    const wantsClose =
      (isSupport && supportStatus === "Done") ||
      (!isSupport && status === "Complete");

    if (wantsClose && !project.pending_approval) {
      // Route closure through admin approval. Do NOT flip status yet.
      const { error: uErr } = await supabase.from("weekly_updates").insert({
        project_id: projectId, author_id: user.id, week_label: weekLabel,
        status: null, support_status: null,
        note: `🔒 Closure requested: ${note.trim()}`, blocker: null,
      });
      if (uErr) { setSaving(false); return toast.error(uErr.message); }
      const { error: pErr } = await supabase.from("projects").update({
        pending_approval: true,
        previous_status: project.status,
        previous_support_status: project.support_status ?? null,
        rejection_reason: null,
      }).eq("id", projectId);
      if (pErr) { setSaving(false); return toast.error(pErr.message); }
      setSaving(false);
      toast.success("Closure request sent to admin for approval");
      onOpenChange(false);
      onCreated();
      return;
    }

    if (isSupport) {
      const { error: uErr } = await supabase.from("weekly_updates").insert({
        project_id: projectId, author_id: user.id, week_label: weekLabel,
        status: null, support_status: supportStatus,
        note: note.trim(), blocker: null,
      });
      if (uErr) { setSaving(false); return toast.error(uErr.message); }
      await supabase.from("projects").update({ support_status: supportStatus }).eq("id", projectId);
    } else {
      const { error: uErr } = await supabase.from("weekly_updates").insert({
        project_id: projectId, author_id: user.id, week_label: weekLabel,
        status, support_status: null,
        note: note.trim(), blocker: blocker.trim() || null,
      });
      if (uErr) { setSaving(false); return toast.error(uErr.message); }
      const projectPatch: {
        completion_pct: number; next_action: string | null;
        status?: Status; blocker?: string | null;
      } = {
        completion_pct: completionPct,
        next_action: nextAction.trim() || null,
      };
      if (weekLabel === currentWeekLabel()) {
        projectPatch.status = status;
        projectPatch.blocker = blocker.trim() || null;
      }
      await supabase.from("projects").update(projectPatch).eq("id", projectId);
    }

    setSaving(false);
    toast.success("Update logged");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log update</DialogTitle>
        </DialogHeader>
        {project && (
          <p className="text-sm text-muted-foreground -mt-2">
            {isSupport ? "[Support] " : ""}{project.name} — {project.site}
          </p>
        )}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Week</Label>
              <Input
                type="week"
                value={weekLabel}
                onChange={(e) => setWeekLabel(e.target.value)}
                max={currentWeekLabel()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              {isSupport ? (
                <Select value={supportStatus} onValueChange={(v) => setSupportStatus(v as SupportStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SUPPORT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{isSupport ? "Progress note" : "What happened this week?"}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={isSupport ? 3 : 4} />
          </div>
          {!isSupport && (
            <>
              <div className="space-y-1.5">
                <Label>Progress ({completionPct}%)</Label>
                <Input type="range" min={0} max={100} step={5} value={completionPct} onChange={(e) => setCompletionPct(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Next action</Label>
                <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="What needs to happen next (and who owns it)" />
              </div>
              <div className="space-y-1.5"><Label>Blocker (optional)</Label><Input value={blocker} onChange={(e) => setBlocker(e.target.value)} /></div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !projectId || !note.trim() || !weekLabel}>
            {saving ? "Saving…" : "Log update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
