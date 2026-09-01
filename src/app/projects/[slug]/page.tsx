import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyBlock } from "@/components/CopyBlock";
import { EditProjectForm } from "@/components/EditProjectForm";
import { RankedBars } from "@/components/RankedBars";
import { RemoveProjectButton } from "@/components/RemoveProjectButton";
import { StatTile } from "@/components/StatTile";
import { TrafficChart } from "@/components/TrafficChart";
import { panelCls, sectionHeadCls } from "@/components/ui";
import { db, deployments, projects } from "@/db";
import { fmtNum, phaseLed, relTime } from "@/lib/format";
import { statsForProject } from "@/lib/stats";
import { displayFields } from "@/lib/util";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  if (!project) notFound();

  const [stats, deploys, headerList] = await Promise.all([
    statsForProject(project.id, 30),
    db
      .select()
      .from(deployments)
      .where(eq(deployments.projectId, project.id))
      .orderBy(desc(deployments.deployedAt))
      .limit(8),
    headers(),
  ]);

  // A DO app carries a real deployment phase; anything else with a URL is
  // deployed elsewhere ("external"); otherwise it's genuinely not deployed.
  const led =
    project.doAppId === null && displayFields(project).liveUrl
      ? { cls: "led-active", label: "external" }
      : phaseLed(project.deployPhase);
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const origin = process.env.CONTROL_CENTER_URL || `${proto}://${host}`;
  const display = displayFields(project);
  const liveUrl = display.liveUrl;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-[11px] uppercase tracking-wider text-mute hover:text-accent">
          ← registry
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className={`led ${led.cls}`} title={led.label} />
          <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-ink">{display.name}</h1>
          <span className="text-mute">{project.slug}</span>
          <span className="ml-auto flex gap-4 text-[11px] uppercase tracking-wider">
            {liveUrl && (
              <a href={liveUrl} target="_blank" rel="noreferrer" className="text-dim hover:text-accent">
                live ↗
              </a>
            )}
            {project.githubRepo && (
              <a
                href={`https://github.com/${project.githubRepo}`}
                target="_blank"
                rel="noreferrer"
                className="text-dim hover:text-accent"
              >
                github ↗
              </a>
            )}
            <RemoveProjectButton slug={project.slug} isManual={project.isManual} />
          </span>
        </div>
        {project.isHidden && (
          <p className="mt-2 text-[11px] uppercase tracking-wider text-amber">
            hidden from the registry — restore it from the dashboard
          </p>
        )}
        {display.description && <p className="mt-2 max-w-2xl text-dim">{display.description}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="views" sub="30d" value={fmtNum(stats.totals.views)} />
        <StatTile label="visitors" sub="30d" value={fmtNum(stats.totals.visitors)} />
        <StatTile
          label="deploy"
          value={
            <span className="flex items-center gap-2">
              <span className={`led ${led.cls}`} />
              <span className="text-lg">{led.label}</span>
            </span>
          }
          sub={relTime(project.lastDeployAt)}
        />
        <StatTile label="last commit" value={<span className="text-lg">{relTime(project.lastCommitAt)}</span>} />
      </div>

      <section className={`${panelCls} p-4`}>
        <h2 className={sectionHeadCls}>Traffic / 30d</h2>
        <TrafficChart daily={stats.daily} />
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <RankedBars title="Top paths / 30d" items={stats.topPaths} empty="no pageviews yet" />
        <RankedBars title="Top referrers / 30d" items={stats.topReferrers} empty="no external referrers yet" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className={`${panelCls} p-4`}>
          <h2 className={sectionHeadCls}>Deployments</h2>
          {deploys.length === 0 ? (
            <p className="text-mute">no deployments recorded{project.doAppId ? " — run a sync" : ""}</p>
          ) : (
            <ul className="space-y-2">
              {deploys.map((d) => {
                const dl = phaseLed(d.phase);
                return (
                  <li key={d.id} className="flex items-center gap-2.5">
                    <span className={`led ${dl.cls}`} />
                    <span className="text-ink">{dl.label}</span>
                    <span className="truncate text-mute">{d.cause ?? ""}</span>
                    <span className="ml-auto shrink-0 text-mute">{relTime(d.deployedAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={`${panelCls} p-4`}>
          <h2 className={sectionHeadCls}>Manifest</h2>
          {project.manifest ? (
            <div className="space-y-3">
              {(project.manifest.stack?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {project.manifest.stack!.map((s) => (
                    <span key={s} className="border border-line2 px-1.5 py-px text-[10px] uppercase text-dim">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {(project.manifest.exposes?.length ?? 0) > 0 && (
                <div>
                  <h3 className="text-[10px] uppercase tracking-wider text-mute">exposes</h3>
                  <ul className="mt-1 space-y-1">
                    {project.manifest.exposes!.map((e, i) => (
                      <li key={i}>
                        <span className="text-accent">{e.kind}</span>{" "}
                        <span className="text-dim">{e.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(project.manifest.needs?.length ?? 0) > 0 && (
                <div>
                  <h3 className="text-[10px] uppercase tracking-wider text-mute">needs</h3>
                  <ul className="mt-1 list-inside list-disc space-y-1 text-dim">
                    {project.manifest.needs!.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-mute">
              No <code>project.yaml</code> in this repo.
              {project.manifestError ? ` (${project.manifestError})` : ""} Add one to describe what this project
              exposes and needs — that&apos;s what powers cross-project collaboration proposals.
            </p>
          )}
        </section>
      </div>

      <section className={`${panelCls} p-4`}>
        <h2 className={sectionHeadCls}>Analytics pixel</h2>
        <CopyBlock text={`<script defer src="${origin}/px.js" data-site="${project.slug}"></script>`} />
        <p className="mt-2 text-[11px] text-mute">
          Place in the site&apos;s &lt;head&gt;. Localhost traffic is ignored unless <code>data-dev</code> is set.
        </p>
      </section>

      <section className={`${panelCls} p-4`}>
        <h2 className={sectionHeadCls}>Edit project</h2>
        <EditProjectForm
          slug={project.slug}
          defaults={{
            name: project.customName ?? "",
            description: project.customDescription ?? "",
            liveUrl: project.customLiveUrl ?? "",
          }}
          synced={{
            name: project.name,
            description: project.description ?? "",
            liveUrl: project.liveUrl ?? project.homepage ?? "",
          }}
        />
      </section>
    </div>
  );
}
