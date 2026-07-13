export const SITES = [
  "Allentown",
  "Modesto",
  "Midlothian",
  "Alexandria",
  "3rd Ave",
  "EPIC",
] as const;
export type Site = (typeof SITES)[number];

export const STATUSES = [
  "On Track",
  "At Risk",
  "Blocked",
  "Complete",
  "On Hold",
] as const;
export type Status = (typeof STATUSES)[number];

export function statusClasses(status: Status): string {
  switch (status) {
    case "On Track":
      return "bg-[var(--status-ontrack)]/10 text-[var(--status-ontrack)] border-[var(--status-ontrack)]/30";
    case "At Risk":
      return "bg-[var(--status-atrisk)]/10 text-[var(--status-atrisk)] border-[var(--status-atrisk)]/30";
    case "Blocked":
      return "bg-[var(--status-blocked)]/10 text-[var(--status-blocked)] border-[var(--status-blocked)]/30";
    case "Complete":
      return "bg-[var(--status-complete)]/10 text-[var(--status-complete)] border-[var(--status-complete)]/30";
    case "On Hold":
      return "bg-[var(--status-hold)]/10 text-[var(--status-hold)] border-[var(--status-hold)]/30";
  }
}

export function statusRank(status: Status): number {
  // Lower = surface first (blocked/at risk on top)
  switch (status) {
    case "Blocked":
      return 0;
    case "At Risk":
      return 1;
    case "On Track":
      return 2;
    case "On Hold":
      return 3;
    case "Complete":
      return 4;
  }
}

// Week label based on ISO week number, e.g. "2026-W28"
export function currentWeekLabel(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// Convert an <input type="week"> value like "2026-W28" to a Date at Monday of that week.
export function weekLabelToDate(label: string): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(label);
  if (!m) return new Date();
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  return monday;
}

export function daysSince(d: string | Date): number {
  const start = typeof d === "string" ? new Date(d) : d;
  return Math.floor((Date.now() - start.getTime()) / 86400000);
}

export function monthLabel(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function weeksBetween(from: string | Date, to: Date = new Date()): number {
  const start = typeof from === "string" ? new Date(from) : from;
  const ms = to.getTime() - start.getTime();
  return Math.max(1, Math.floor(ms / (7 * 86400 * 1000)) + 1);
}
