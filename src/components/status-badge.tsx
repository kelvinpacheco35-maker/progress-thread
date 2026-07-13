import { Badge } from "@/components/ui/badge";
import { statusClasses, type Status } from "@/lib/ci";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border font-medium", statusClasses(status), className)}>
      {status}
    </Badge>
  );
}
