import { Badge } from "@/components/ui/badge";
import { statusClasses, supportStatusClasses, type Status, type SupportStatus, type EntryType } from "@/lib/ci";
import { cn } from "@/lib/utils";
import { Wrench, TrendingUp, Clock } from "lucide-react";

export function PendingApprovalBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border font-medium bg-[var(--status-atrisk)]/10 text-[var(--status-atrisk)] border-[var(--status-atrisk)]/40 gap-1",
        className,
      )}
    >
      <Clock className="w-3 h-3" />
      Pending approval
    </Badge>
  );
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border font-medium", statusClasses(status), className)}>
      {status}
    </Badge>
  );
}

export function SupportStatusBadge({ status, className }: { status: SupportStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border font-medium", supportStatusClasses(status), className)}>
      {status}
    </Badge>
  );
}

export function EntryTypeBadge({ type, className }: { type: EntryType; className?: string }) {
  const isSupport = type === "support";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border",
        isSupport
          ? "bg-[var(--support-inprogress)]/10 text-[var(--support-inprogress)] border-[var(--support-inprogress)]/30"
          : "bg-primary/10 text-primary border-primary/30",
        className,
      )}
      title={isSupport ? "Support request" : "CI Project"}
    >
      {isSupport ? <Wrench className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
      {isSupport ? "Support" : "Project"}
    </span>
  );
}
