"use client";

import { useRef, useState } from "react";
import type { DailyPoint } from "@/lib/stats";
import { fmtDay, fmtNum } from "@/lib/format";

const W = 720;
const H = 200;
const PAD = { top: 14, right: 8, bottom: 22, left: 40 };

/**
 * Daily traffic: views as baseline-anchored bars, visitors as a line.
 * Both are counts on one shared axis. Crosshair tooltip on hover.
 */
export function TrafficChart({ daily }: { daily: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = Math.max(...daily.map((d) => Math.max(d.views, d.visitors)), 1);
  const n = daily.length;
  const slot = plotW / n;
  const barW = Math.max(2, Math.min(slot - 2, slot * 0.62));

  const x = (i: number) => PAD.left + i * slot + slot / 2;
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const empty = daily.every((d) => d.views === 0);
  if (empty) {
    return (
      <div className="flex h-40 items-center justify-center border border-line bg-panel text-mute">
        no traffic recorded — embed the pixel below to start collecting
      </div>
    );
  }

  const visitorPath = daily.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.visitors).toFixed(1)}`).join(" ");
  const gridLines = [0.5, 1];
  const hovered = hover !== null ? daily[hover] : null;

  return (
    <div ref={wrapRef} className="relative">
      <div className="mb-1 flex items-center justify-end gap-4 text-[11px] text-dim">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2" style={{ background: "var(--color-views)" }} />
          views
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2" style={{ background: "var(--color-visitors)" }} />
          visitors
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Daily views and visitors"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const i = Math.round((px - PAD.left - slot / 2) / slot);
          setHover(i >= 0 && i < n ? i : null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {gridLines.map((g) => (
          <g key={g}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(max * g)}
              y2={y(max * g)}
              stroke="var(--color-line)"
              strokeWidth="1"
            />
            <text x={PAD.left - 6} y={y(max * g) + 3} textAnchor="end" fontSize="10" fill="var(--color-mute)">
              {fmtNum(Math.round(max * g))}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--color-line2)" strokeWidth="1" />

        {daily.map((d, i) =>
          d.views > 0 ? (
            <rect
              key={d.day}
              x={x(i) - barW / 2}
              y={y(d.views)}
              width={barW}
              height={y(0) - y(d.views)}
              rx={Math.min(3, barW / 2)}
              fill="var(--color-views)"
              opacity={hover === null || hover === i ? 1 : 0.45}
            />
          ) : null,
        )}

        <path d={visitorPath} fill="none" stroke="var(--color-visitors)" strokeWidth="2" strokeLinejoin="round" />
        {hovered && (
          <>
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={PAD.top}
              y2={y(0)}
              stroke="var(--color-line2)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle cx={x(hover!)} cy={y(hovered.visitors)} r="4" fill="var(--color-visitors)" stroke="var(--color-panel)" strokeWidth="2" />
          </>
        )}

        {[0, Math.floor(n / 2), n - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--color-mute)">
            {fmtDay(daily[i].day)}
          </text>
        ))}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-8 z-10 border border-line2 bg-panel2 px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{
            left: `${((x(hover!) / W) * 100).toFixed(1)}%`,
            transform: hover! > n / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
          }}
        >
          <div className="text-dim">{fmtDay(hovered.day)}</div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2" style={{ background: "var(--color-views)" }} />
            {hovered.views} views
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2" style={{ background: "var(--color-visitors)" }} />
            {hovered.visitors} visitors
          </div>
        </div>
      )}

      <details className="mt-2 text-[11px] text-mute">
        <summary className="cursor-pointer hover:text-dim">data table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-dim">
              <th className="py-0.5 pr-4 font-normal">day</th>
              <th className="py-0.5 pr-4 font-normal">views</th>
              <th className="py-0.5 font-normal">visitors</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.day}>
                <td className="py-0.5 pr-4">{d.day}</td>
                <td className="py-0.5 pr-4">{d.views}</td>
                <td className="py-0.5">{d.visitors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
