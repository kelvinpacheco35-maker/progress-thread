import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/ci";
import type { Status } from "@/lib/ci";

export type UpdateRow = {
  id: string;
  week_label: string;
  status: Status;
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {project.name}
            <StatusBadge status={project.status} />
          </DialogTitle>
          <DialogDescription>
            {project.site} · Owner {project.owner_name ?? "—"} · Created {formatDate(project.created_at)}
          </DialogDescription>
        </DialogHeader>
        {project.description && (
          <p className="text-sm text-muted-foreground border-l-2 border-border pl-3">{project.description}</p>
        )}
        <div className="mt-2">
          <h3 className="text-sm font-semibold text-foreground mb-3">Weekly history</h3>
          {updates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No weekly updates logged yet.</p>
          ) : (
            <ol className="space-y-3">
              {updates.map((u) => (
                <li key={u.id} className="rounded-md border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">{u.week_label}</span>
                      <StatusBadge status={u.status} />
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
