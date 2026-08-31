import type { RankedItem } from "@/lib/stats";
import { fmtNum } from "@/lib/format";
import { panelCls, sectionHeadCls } from "./ui";

/** Ranked horizontal bars for top paths / referrers. Single hue; labels carry identity. */
export function RankedBars({ title, items, empty }: { title: string; items: RankedItem[]; empty: string }) {
  const max = Math.max(...items.map((i) => i.views), 1);
  return (
    <section className={`${panelCls} p-4`}>
      <h3 className={sectionHeadCls}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-mute">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.label} title={`${item.label}: ${item.views} views`}>
              <div className="mb-0.5 flex items-baseline justify-between gap-3">
                <span className="truncate text-ink">{item.label}</span>
                <span className="text-dim">{fmtNum(item.views)}</span>
              </div>
              <div className="h-1.5 bg-panel2">
                <div
                  className="h-full"
                  style={{ width: `${((item.views / max) * 100).toFixed(1)}%`, background: "var(--color-views)" }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
