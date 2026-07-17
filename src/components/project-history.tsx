import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatusBadge, SupportStatusBadge, EntryTypeBadge, PendingApprovalBadge } from "@/components/status-badge";
import { formatDate, priorityClasses, isOverdue, weeksBetween } from "@/lib/ci";
import type { Status, SupportStatus, Priority, Category, EntryType } from "@/lib/ci";
import { cn } from "@/lib/utils";

export type UpdateRow = {
  id: string;
  week_label: string;
  status: Status | null;
  support_status?: SupportStatus | null;
  note: string;
  blocker: string | null;
  reviewed: boolean;
  created_at: string;
  author_id: string;
  author_name?: string;
};

export type ProjectRow = {
  id: string;
  name: string;
  site: string;
  owner_id: string;
  owner_name?: string;
  status: Status;
  description: string | null;
  blocker: string | null;
  created_at: string;
  featured?: boolean;
  archived?: boolean;
  due_date?: string | null;
  priority?: Priority;
  next_action?: string | null;
  category?: Category | null;
  problem_statement?: string | null;
  start_date?: string | null;
  completion_pct?: number | null;
  entry_type?: EntryType;
  support_status?: SupportStatus | null;
  requester?: string | null;
  pending_approval?: boolean;
  previous_status?: Status | null;
  previous_support_status?: SupportStatus | null;
  approved_at?: string | null;
  approved_by?: string | null;
  rejection_reason?: string | null;
};

export function ProjectHistoryDialog({
  open,
  onOpenChange,
  project,
  updates,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: ProjectRow | null;
  updates: UpdateRow[];
}) {
  if (!project) return null;
  const isSupport = project.entry_type === "support";
  const effectiveStatus = isSupport
    ? (project.support_status ?? "Open")
    : project.status;
  const overdue = isOverdue(project.due_date, effectiveStatus);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {project.name}
            <EntryTypeBadge type={isSupport ? "support" : "project"} />
            {project.pending_approval ? (
              <PendingApprovalBadge />
            ) : isSupport ? (
              <SupportStatusBadge status={(project.support_status ?? "Open") as SupportStatus} />
            ) : (
              <StatusBadge status={project.status} />
            )}
            {project.priority && (
              <span className={cn("text-xs font-medium rounded-full px-2 py-0.5 border", priorityClasses(project.priority))}>
                {project.priority} priority
              </span>
            )}
            {!isSupport && project.category && (
              <span className="text-xs font-medium rounded-full px-2 py-0.5 border bg-primary/5 text-primary border-primary/20">
                {project.category}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {project.site} · Owner {project.owner_name ?? "—"}
            {isSupport && project.requester ? <> · Requested by {project.requester}</> : null}
            {!isSupport && project.start_date ? <> · Started {formatDate(project.start_date)}</> : <> · Created {formatDate(project.created_at)}</>}
            {!isSupport && <> · {weeksBetween(project.start_date ?? project.created_at)} weeks tracked</>}
            {project.due_date && (
              <> · Due <span className={cn(overdue && "text-[var(--status-blocked)] font-medium")}>
                {formatDate(project.due_date)}{overdue && " (Overdue)"}
              </span></>
            )}
          </DialogDescription>
        </DialogHeader>
        {!isSupport && typeof project.completion_pct === "number" && (
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-muted-foreground uppercase tracking-wide">Progress</span>
              <span className="font-medium">{project.completion_pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, project.completion_pct))}%` }} />
            </div>
          </div>
        )}
        {!isSupport && project.problem_statement && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Problem statement</div>
            <p className="text-sm whitespace-pre-wrap">{project.problem_statement}</p>
          </div>
        )}
        {!isSupport && project.next_action && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-0.5">Next action</div>
            <p className="text-sm">{project.next_action}</p>
          </div>
        )}
        {project.description && (
          <p className="text-sm text-muted-foreground border-l-2 border-border pl-3">{project.description}</p>
        )}
        {project.blocker && (
          <div className="rounded-md border border-[var(--status-blocked)]/30 bg-[var(--status-blocked)]/5 px-3 py-2 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--status-blocked)] mb-0.5">Blocker</div>
            <p>{project.blocker}</p>
          </div>
        )}
        {project.pending_approval && (
          <div className="rounded-md border border-[var(--status-atrisk)]/40 bg-[var(--status-atrisk)]/10 px-3 py-2 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--status-atrisk)] mb-0.5">Closure pending admin approval</div>
            <p className="text-muted-foreground">Waiting for an admin to approve or reject this closure request.</p>
          </div>
        )}
        {!project.pending_approval && project.rejection_reason && (
          <div className="rounded-md border border-[var(--status-blocked)]/30 bg-[var(--status-blocked)]/5 px-3 py-2 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--status-blocked)] mb-0.5">Last closure rejected</div>
            <p className="text-muted-foreground">{project.rejection_reason}</p>
          </div>
        )}
        <div className="mt-2 border-t border-border pt-3">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {isSupport ? "Update history" : "Weekly history"}
            <span className="ml-2 text-xs font-normal text-muted-foreground">({updates.length})</span>
          </h3>
          {updates.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
              No updates logged yet. Use <span className="font-medium text-foreground">Log update</span> to add the first entry.
            </div>
          ) : (
            <ol className="space-y-3">
              {updates.map((u) => (
                <li key={u.id} className="rounded-md border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">{u.week_label}</span>
                      {u.support_status ? (
                        <SupportStatusBadge status={u.support_status} />
                      ) : u.status ? (
                        <StatusBadge status={u.status} />
                      ) : null}
                      {u.reviewed && (
                        <span className="text-xs rounded px-1.5 py-0.5 bg-secondary text-secondary-foreground">Reviewed</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(u.created_at)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{u.note}</p>
                  {u.blocker && (
                    <p className="mt-1.5 text-sm text-[var(--status-blocked)]">
                      <span className="font-medium">Blocker:</span> {u.blocker}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Logged by {u.author_name ?? "—"}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
