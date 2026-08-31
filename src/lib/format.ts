export function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function relTime(date: Date | string | null): string {
  if (!date) return "—";
  const t = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 129600) return `${Math.round(s / 3600)}h ago`;
  if (s < 45 * 86400) return `${Math.round(s / 86400)}d ago`;
  return `${Math.round(s / (30 * 86400))}mo ago`;
}

export function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Deploy phase → LED class + label. */
export function phaseLed(phase: string | null): { cls: string; label: string } {
  if (!phase) return { cls: "led-off", label: "not deployed" };
  switch (phase) {
    case "ACTIVE":
      return { cls: "led-active", label: "active" };
    case "ERROR":
    case "CANCELED":
      return { cls: "led-error", label: phase.toLowerCase() };
    case "SUPERSEDED":
      return { cls: "led-off", label: "superseded" };
    default:
      return { cls: "led-building", label: phase.toLowerCase() };
  }
}
