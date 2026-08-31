import { sql } from "drizzle-orm";
import { db } from "@/db";

export type DailyPoint = { day: string; views: number; visitors: number };
export type StatTotals = { views: number; visitors: number };
export type RankedItem = { label: string; views: number };

export type ProjectStats = {
  totals: StatTotals;
  daily: DailyPoint[];
  topPaths: RankedItem[];
  topReferrers: RankedItem[];
};

type Row = Record<string, unknown>;

function num(v: unknown): number {
  return typeof v === "number" ? v : parseInt(String(v ?? 0), 10) || 0;
}

/**
 * UTC midnight `days - 1` days ago — the start of the oldest calendar day in
 * the window. Every query filters on this same boundary so tiles, charts, and
 * top-lists all agree (a rolling now()-interval would include a partial extra
 * day that the daily series can't show).
 */
function windowStart(days: number): Date {
  const clamped = Math.max(1, Math.min(days, 365));
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (clamped - 1));
  return d;
}

/** Zero-filled daily series for the last `days` days, oldest first. */
function fillDays(days: number, rows: Row[]): DailyPoint[] {
  const byDay = new Map(rows.map((r) => [String(r.day), r]));
  const out: DailyPoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = byDay.get(key);
    out.push({ day: key, views: num(row?.views), visitors: num(row?.visitors) });
  }
  return out;
}

export async function statsForProject(projectId: number, days = 30): Promise<ProjectStats> {
  const start = windowStart(days);

  const [dailyRows, totalRows, pathRows, referrerRows] = await Promise.all([
    db.execute(sql`
      select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day,
             count(*) as views,
             count(distinct visitor_hash) as visitors
      from page_events
      where project_id = ${projectId} and created_at >= ${start}
      group by 1 order by 1
    `),
    db.execute(sql`
      select count(*) as views, count(distinct visitor_hash) as visitors
      from page_events
      where project_id = ${projectId} and created_at >= ${start}
    `),
    db.execute(sql`
      select path as label, count(*) as views
      from page_events
      where project_id = ${projectId} and created_at >= ${start}
      group by 1 order by 2 desc limit 10
    `),
    db.execute(sql`
      select referrer as label, count(*) as views
      from page_events
      where project_id = ${projectId} and created_at >= ${start}
        and referrer is not null
      group by 1 order by 2 desc limit 10
    `),
  ]);

  const total = totalRows.rows[0] as Row | undefined;
  return {
    totals: { views: num(total?.views), visitors: num(total?.visitors) },
    daily: fillDays(days, dailyRows.rows as Row[]),
    topPaths: (pathRows.rows as Row[]).map((r) => ({ label: String(r.label), views: num(r.views) })),
    topReferrers: (referrerRows.rows as Row[]).map((r) => ({
      label: String(r.label),
      views: num(r.views),
    })),
  };
}

export type ProjectSummary = { totals: StatTotals; daily: DailyPoint[] };

/** Per-project totals + daily series for dashboard cards, in one pass. */
export async function statsSummary(days = 14): Promise<Map<number, ProjectSummary>> {
  const start = windowStart(days);
  const rows = await db.execute(sql`
    select project_id,
           to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day,
           count(*) as views,
           count(distinct visitor_hash) as visitors
    from page_events
    where project_id is not null and created_at >= ${start}
    group by 1, 2
  `);

  const grouped = new Map<number, Row[]>();
  for (const r of rows.rows as Row[]) {
    const id = num(r.project_id);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id)!.push(r);
  }

  const out = new Map<number, ProjectSummary>();
  for (const [id, projectRows] of grouped) {
    const daily = fillDays(days, projectRows);
    out.set(id, {
      daily,
      totals: {
        views: daily.reduce((s, d) => s + d.views, 0),
        // Distinct-per-day summed — an approximation, fine for card summaries.
        visitors: daily.reduce((s, d) => s + d.visitors, 0),
      },
    });
  }
  return out;
}
