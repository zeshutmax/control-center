import { panelCls } from "./ui";

/** Hero-number tile used on the dashboard (lg) and project pages (md). */
export function StatTile({
  label,
  value,
  sub,
  accent = false,
  size = "md",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: boolean;
  size?: "md" | "lg";
}) {
  return (
    <div className={`${panelCls} px-4 py-3`}>
      <div
        className={`font-display font-semibold ${size === "lg" ? "text-3xl" : "text-2xl"} ${accent ? "text-accent" : "text-ink"}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-mute">
        {label}
        {sub ? <span className="ml-1 normal-case">· {sub}</span> : null}
      </div>
    </div>
  );
}
