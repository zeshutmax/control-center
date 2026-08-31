import type { DailyPoint } from "@/lib/stats";

/** 14-day views sparkline for registry cards. Single series — no legend. */
export function Sparkline({ daily, width = 120, height = 30 }: { daily: DailyPoint[]; width?: number; height?: number }) {
  const max = Math.max(...daily.map((d) => d.views), 1);
  const step = width / Math.max(daily.length - 1, 1);
  const y = (v: number) => height - 2 - (v / max) * (height - 6);
  const points = daily.map((d, i) => `${(i * step).toFixed(1)},${y(d.views).toFixed(1)}`);
  const flat = daily.every((d) => d.views === 0);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Daily pageviews, last ${daily.length} days`}
      className="shrink-0"
    >
      {flat ? (
        <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke="var(--color-line2)" strokeWidth="1.5" strokeDasharray="2 4" />
      ) : (
        <>
          <polygon
            points={`0,${height} ${points.join(" ")} ${width},${height}`}
            fill="var(--color-views)"
            opacity="0.15"
          />
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke="var(--color-views)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
