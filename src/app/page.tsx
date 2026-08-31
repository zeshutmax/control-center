import { desc } from "drizzle-orm";
import Link from "next/link";
import { db, projects, type Project } from "@/db";
import { Sparkline } from "@/components/Sparkline";
import { SyncButton } from "@/components/SyncButton";
import { fmtNum, phaseLed, relTime } from "@/lib/format";
import { statsSummary, type ProjectSummary } from "@/lib/stats";
import { lastSyncRun } from "@/lib/sync";

export const dynamic = "force-dynamic";

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bracket border border-line bg-panel px-4 py-3">
      <div className={`font-display text-3xl font-semibold ${accent ? "text-accent" : "text-ink"}`}>{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-mute">{label}</div>
    </div>
  );
}

function SourceBadge({ project }: { project: Project }) {
  if (project.source === "do")
    return <span className="border border-amber/40 px-1.5 py-px text-[10px] uppercase text-amber">no repo</span>;
  if (project.source === "github")
    return <span className="border border-line2 px-1.5 py-px text-[10px] uppercase text-mute">not deployed</span>;
  return null;
}

function ProjectCard({ project, summary }: { project: Project; summary?: ProjectSummary }) {
  const led = phaseLed(project.deployPhase);
  const views = summary?.totals.views ?? 0;
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="bracket group flex flex-col gap-3 border border-line bg-panel p-4 transition-colors hover:border-line2 hover:bg-panel2"
    >
      <div className="flex items-center gap-2.5">
        <span className={`led ${led.cls}`} title={led.label} />
        <span className="font-display truncate text-lg font-semibold uppercase tracking-wide text-ink group-hover:text-accent">
          {project.name}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {project.manifest && (
            <span className="border border-line2 px-1.5 py-px text-[10px] uppercase text-dim" title="has project.yaml">
              m
            </span>
          )}
          <SourceBadge project={project} />
        </span>
      </div>
      <p className="line-clamp-2 min-h-[2.6em] text-dim">{project.description ?? "no description"}</p>
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-0.5 text-[11px] text-mute">
          <div>commit {relTime(project.lastCommitAt)}</div>
          <div>deploy {relTime(project.lastDeployAt)}</div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <Sparkline daily={summary?.daily ?? []} />
          <span className="text-[11px] text-dim">{fmtNum(views)} views / 14d</span>
        </div>
      </div>
    </Link>
  );
}

export default async function Dashboard() {
  const [allProjects, summary, lastRun] = await Promise.all([
    db.select().from(projects).orderBy(desc(projects.lastCommitAt)),
    statsSummary(14),
    lastSyncRun(),
  ]);

  const visible = allProjects.filter((p) => !p.isArchived && !p.isFork);
  const hidden = allProjects.length - visible.length;
  const deployed = visible.filter((p) => p.doAppId !== null);
  const repoOnly = visible.filter((p) => p.doAppId === null);
  // Totals over visible projects only, so the tiles match the cards below.
  const visibleSummaries = visible.map((p) => summary.get(p.id)).filter((s) => s !== undefined);
  const totalViews = visibleSummaries.reduce((s, v) => s + v.totals.views, 0);
  const totalVisitors = visibleSummaries.reduce((s, v) => s + v.totals.visitors, 0);
  const failing = deployed.filter((p) => p.deployPhase === "ERROR").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-ink">Registry</h1>
          <p className="mt-1 text-[11px] text-mute">
            {lastRun
              ? `last sync ${relTime(lastRun.startedAt)} · ${lastRun.status}${lastRun.error ? ` — ${lastRun.error}` : ""}`
              : "never synced — configure GITHUB_TOKEN and DO_API_TOKEN, then sync"}
          </p>
        </div>
        <SyncButton />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="projects" value={String(visible.length)} />
        <StatTile label="deployed" value={String(deployed.length)} />
        <StatTile label="views / 14d" value={fmtNum(totalViews)} accent />
        <StatTile label={failing > 0 ? "failing deploys" : "visitors / 14d"} value={failing > 0 ? String(failing) : fmtNum(totalVisitors)} />
      </div>

      {deployed.length > 0 && (
        <section>
          <h2 className="mb-3 text-[11px] uppercase tracking-wider text-dim">
            Deployed <span className="text-mute">/ {deployed.length}</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {deployed.map((p) => (
              <ProjectCard key={p.id} project={p} summary={summary.get(p.id)} />
            ))}
          </div>
        </section>
      )}

      {repoOnly.length > 0 && (
        <section>
          <h2 className="mb-3 text-[11px] uppercase tracking-wider text-dim">
            Repos <span className="text-mute">/ {repoOnly.length}</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {repoOnly.map((p) => (
              <ProjectCard key={p.id} project={p} summary={summary.get(p.id)} />
            ))}
          </div>
        </section>
      )}

      {visible.length === 0 && (
        <div className="border border-line bg-panel p-8 text-center text-mute">
          The registry is empty. Set <code>GITHUB_TOKEN</code> and <code>DO_API_TOKEN</code> in .env, then hit sync —
          or run <code>pnpm seed</code> for demo data.
        </div>
      )}

      {hidden > 0 && <p className="text-[11px] text-mute">{hidden} archived/forked repos hidden</p>}
    </div>
  );
}
