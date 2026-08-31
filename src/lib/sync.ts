import { eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, deployments, pageEvents, projects, syncRuns } from "@/db";
import type { Project, ProjectManifest, SyncDetail } from "@/db/schema";
import { listApps, listDeployments, type DoApp } from "./digitalocean";
import {
  fetchParsedManifest,
  fetchRepo,
  listRepos,
  type GithubRepo,
  type ParsedManifest,
} from "./github";
import { slugify, uniqueMerge, uniqueSlug } from "./util";

type ProjectRecord = {
  slug: string;
  name: string;
  description: string | null;
  githubRepo: string | null;
  defaultBranch: string | null;
  homepage: string | null;
  liveUrl: string | null;
  doAppId: string | null;
  kind: "app" | "static_site" | "unknown";
  source: "github" | "do" | "both";
  topics: string[];
  manifest: ProjectManifest | null;
  manifestError: string | null;
  isArchived: boolean;
  isFork: boolean;
  lastCommitAt: Date | null;
  lastDeployAt: Date | null;
  deployPhase: string | null;
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

function buildRecords(
  repos: GithubRepo[],
  apps: DoApp[],
  manifests: Map<string, ParsedManifest>,
): { records: ProjectRecord[]; orphanApps: string[] } {
  const byRepo = new Map<string, ProjectRecord>();
  const extra: ProjectRecord[] = [];
  const usedSlugs = new Set<string>();

  const claimSlug = (base: string): string => {
    const slug = uniqueSlug(base, usedSlugs);
    usedSlugs.add(slug);
    return slug;
  };

  for (const repo of repos) {
    const parsed = manifests.get(repo.fullName.toLowerCase());
    byRepo.set(repo.fullName.toLowerCase(), {
      slug: claimSlug(slugify(repo.name)),
      name: parsed?.manifest?.name ?? repo.name,
      description: parsed?.manifest?.description ?? repo.description,
      githubRepo: repo.fullName,
      defaultBranch: repo.defaultBranch,
      homepage: repo.homepage,
      liveUrl: parsed?.manifest?.url ?? null,
      doAppId: null,
      kind: "unknown",
      source: "github",
      topics: uniqueMerge(repo.topics, parsed?.manifest?.tags),
      manifest: parsed?.manifest ?? null,
      manifestError: parsed?.error ?? null,
      isArchived: repo.archived,
      isFork: repo.fork,
      lastCommitAt: repo.pushedAt ? new Date(repo.pushedAt) : null,
      lastDeployAt: null,
      deployPhase: null,
    });
  }

  // githubRepo is unique in the registry, so among records that are NOT the
  // repo's own row (extra apps, orphans), only the first may claim a repo name.
  const claimedRepos = new Set(byRepo.keys());
  const claimRepo = (repo: string | null): string | null => {
    if (!repo) return null;
    const key = repo.toLowerCase();
    if (claimedRepos.has(key)) return null;
    claimedRepos.add(key);
    return repo;
  };

  const orphanApps: string[] = [];
  for (const app of apps) {
    const record = app.githubRepo ? byRepo.get(app.githubRepo.toLowerCase()) : undefined;
    if (record && record.doAppId === null) {
      record.source = "both";
      record.doAppId = app.id;
      record.kind = app.kind;
      record.liveUrl = app.liveUrl ?? record.liveUrl;
      record.lastDeployAt = app.activeDeployment ? new Date(app.activeDeployment.updatedAt) : null;
      record.deployPhase = app.activeDeployment?.phase ?? null;
      continue;
    }
    // No matching repo record (orphan), or a second app deployed from the same
    // repo (e.g. staging + prod) — either way it gets its own row.
    if (!record) orphanApps.push(app.name);
    extra.push({
      slug: claimSlug(slugify(app.name)),
      name: app.name,
      description: null,
      githubRepo: record ? null : claimRepo(app.githubRepo),
      defaultBranch: null,
      homepage: null,
      liveUrl: app.liveUrl,
      doAppId: app.id,
      kind: app.kind,
      source: "do",
      topics: [],
      manifest: null,
      manifestError: null,
      isArchived: false,
      isFork: false,
      lastCommitAt: null,
      lastDeployAt: app.activeDeployment ? new Date(app.activeDeployment.updatedAt) : null,
      deployPhase: app.activeDeployment?.phase ?? null,
    });
  }

  return { records: [...byRepo.values(), ...extra], orphanApps };
}

/** DO-side columns, cleared when an app disappears and moved when it changes source repo. */
const DO_FIELDS = {
  doAppId: null as string | null,
  kind: "unknown" as const,
  lastDeployAt: null as Date | null,
  deployPhase: null as string | null,
};

async function upsertRecords(
  records: ProjectRecord[],
  liveRepoNames: Set<string>,
  liveAppIds: Set<string>,
): Promise<{ upserted: number; removed: number }> {
  const existing = await db.select().from(projects);
  const byGithub = new Map(existing.filter((p) => p.githubRepo).map((p) => [p.githubRepo!.toLowerCase(), p]));
  const byAppId = new Map(existing.filter((p) => p.doAppId).map((p) => [p.doAppId!, p]));
  const bySlug = new Map(existing.map((p) => [p.slug, p]));
  const matchedIds = new Set<number>();

  const clearDoFields = async (row: Project) => {
    await db
      .update(projects)
      .set({ ...DO_FIELDS, source: "github", updatedAt: new Date() })
      .where(eq(projects.id, row.id));
    byAppId.delete(row.doAppId!);
    row.doAppId = null;
    row.deployPhase = null;
    row.lastDeployAt = null;
  };

  for (const row of existing) {
    // An app that vanished from DigitalOcean: clear its DO fields up front so
    // stale doAppIds can't break deployment sync or collide on the unique index.
    if (row.doAppId && !liveAppIds.has(row.doAppId)) {
      await clearDoFields(row);
    }
  }

  let upserted = 0;
  for (const r of records) {
    const match =
      (r.githubRepo && byGithub.get(r.githubRepo.toLowerCase())) ||
      (r.doAppId && byAppId.get(r.doAppId)) ||
      undefined;

    // An app that moved to a different repo: the row that used to hold this
    // doAppId loses it, otherwise the update below trips the unique index.
    if (r.doAppId) {
      const holder = byAppId.get(r.doAppId);
      if (holder && holder.id !== match?.id) {
        await clearDoFields(holder);
      }
    }

    if (match) {
      matchedIds.add(match.id);
      // Only overwrite the fields owned by the side(s) that actually reported
      // this record, so a DO-only sighting can't null out GitHub data or vice versa.
      const set: Partial<Project> =
        r.source === "do"
          ? {
              doAppId: r.doAppId,
              kind: r.kind,
              // A manual row's hand-entered URL beats the app's default domain.
              liveUrl: match.isManual ? (match.liveUrl ?? r.liveUrl) : r.liveUrl,
              lastDeployAt: r.lastDeployAt,
              deployPhase: r.deployPhase,
              // Repo listed in the app spec but absent from GitHub → repo was
              // renamed/deleted upstream; surface that instead of pretending.
              source: match.githubRepo && liveRepoNames.has(match.githubRepo.toLowerCase()) ? "both" : "do",
            }
          : r.source === "github"
            ? {
                name: r.name,
                description: r.description,
                githubRepo: r.githubRepo,
                defaultBranch: r.defaultBranch,
                homepage: r.homepage,
                liveUrl: r.liveUrl ?? match.liveUrl,
                topics: r.topics,
                manifest: r.manifest,
                manifestError: r.manifestError,
                isArchived: r.isArchived,
                isFork: r.isFork,
                lastCommitAt: r.lastCommitAt,
                source: match.doAppId ? "both" : "github",
                // A manual row for a repo the autoscan owns graduates to a
                // synced project — the scan manages it (and re-adds it) anyway.
                isManual: false,
              }
            : { ...r, slug: match.slug, isManual: false };
      await db
        .update(projects)
        .set({ ...set, updatedAt: new Date() })
        .where(eq(projects.id, match.id));
      if (r.doAppId) byAppId.set(r.doAppId, match);
    } else {
      const slug = uniqueSlug(r.slug, new Set(bySlug.keys()));
      const [inserted] = await db
        .insert(projects)
        .values({ ...r, slug })
        .returning();
      matchedIds.add(inserted.id);
      bySlug.set(inserted.slug, inserted);
      if (inserted.githubRepo) byGithub.set(inserted.githubRepo.toLowerCase(), inserted);
      if (inserted.doAppId) byAppId.set(inserted.doAppId, inserted);
    }
    upserted++;
  }

  // Rows matched by nothing this run have neither a live repo nor a live app —
  // the upstream project is gone, so the registry lets it go too. Page events
  // survive (keyed by siteId) and re-attach if the slug ever comes back.
  // Manually added projects are exempt: only their owner removes them.
  const dead = existing
    .filter((row) => !matchedIds.has(row.id) && !row.isManual)
    .map((row) => row.id);
  if (dead.length > 0) {
    await db.delete(projects).where(inArray(projects.id, dead));
  }

  return { upserted, removed: dead.length };
}

async function syncDeployments(liveAppIds: Set<string>): Promise<string[]> {
  const deployed = await db.select().from(projects).where(sql`${projects.doAppId} is not null`);
  const targets = deployed.filter((p) => liveAppIds.has(p.doAppId!));
  const errors: string[] = [];
  await mapLimit(targets, 5, async (project) => {
    try {
      const history = await listDeployments(project.doAppId!, 10);
      for (const d of history) {
        await db
          .insert(deployments)
          .values({
            projectId: project.id,
            doDeploymentId: d.id,
            phase: d.phase,
            cause: d.cause,
            deployedAt: new Date(d.createdAt),
          })
          .onConflictDoUpdate({
            target: deployments.doDeploymentId,
            set: { phase: d.phase },
          });
      }
    } catch (e) {
      // One app's history failing shouldn't kill the whole sync.
      errors.push(`${project.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  return errors;
}

/**
 * Manual projects pointing at repos the owned-repo listing can't see (someone
 * else's repo, an org repo) get refreshed one by one so their commit dates,
 * descriptions, and manifests stay current.
 */
async function refreshManualRepos(liveRepoNames: Set<string>): Promise<void> {
  const manual = await db.select().from(projects).where(eq(projects.isManual, true));
  const targets = manual.filter(
    (p) => p.githubRepo && !liveRepoNames.has(p.githubRepo.toLowerCase()),
  );
  await mapLimit(targets, 5, async (project) => {
    try {
      const repo = await fetchRepo(project.githubRepo!);
      if (!repo) return; // gone or inaccessible — keep what we have
      const parsed = await fetchParsedManifest(repo.fullName);
      await db
        .update(projects)
        .set({
          // Hand-entered description wins over GitHub's — refresh only fills gaps.
          description: project.description ?? parsed?.manifest?.description ?? repo.description,
          defaultBranch: repo.defaultBranch,
          homepage: repo.homepage ?? project.homepage,
          topics: uniqueMerge(repo.topics, parsed?.manifest?.tags),
          manifest: parsed?.manifest ?? null,
          manifestError: parsed?.error ?? null,
          isArchived: repo.archived,
          lastCommitAt: repo.pushedAt ? new Date(repo.pushedAt) : null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, project.id));
    } catch {
      // A refresh failure never breaks the sync.
    }
  });
}

/** Attach events that arrived before their project existed in the registry. */
async function adoptOrphanEvents(): Promise<void> {
  await db.execute(sql`
    update page_events set project_id = p.id
    from projects p
    where page_events.project_id is null and page_events.site_id = p.slug
  `);
}

/** Events for site ids that never matched a project don't accumulate forever. */
async function pruneUnmatchedEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 86400_000);
  await db
    .delete(pageEvents)
    .where(sql`${isNull(pageEvents.projectId)} and ${lt(pageEvents.createdAt, cutoff)}`);
}

/**
 * Full read-only sync: GitHub repos + manifests, DO apps + deployments,
 * merged into the project registry. Projects that disappeared upstream are
 * removed; apps that lost their repo (rename/delete) are surfaced as DO-only.
 */
export async function runSync(): Promise<SyncDetail> {
  const [run] = await db.insert(syncRuns).values({ status: "running" }).returning();
  try {
    const [repos, apps] = await Promise.all([listRepos(), listApps()]);
    const liveRepoNames = new Set(repos.map((r) => r.fullName.toLowerCase()));
    const liveAppIds = new Set(apps.map((a) => a.id));

    const manifestCandidates = repos.filter((r) => !r.fork && !r.archived);
    const manifests = new Map<string, ParsedManifest>();
    await mapLimit(manifestCandidates, 8, async (repo) => {
      const parsed = await fetchParsedManifest(repo.fullName);
      if (parsed !== null) manifests.set(repo.fullName.toLowerCase(), parsed);
    });

    const { records, orphanApps } = buildRecords(repos, apps, manifests);
    const { upserted, removed } = await upsertRecords(records, liveRepoNames, liveAppIds);
    const deploymentFetchErrors = await syncDeployments(liveAppIds);
    await refreshManualRepos(liveRepoNames);
    await adoptOrphanEvents();
    await pruneUnmatchedEvents();

    const detail: SyncDetail = {
      reposSeen: repos.length,
      appsSeen: apps.length,
      projectsUpserted: upserted,
      removedProjects: removed,
      manifestsFound: manifests.size,
      orphanApps,
      deploymentFetchErrors,
    };
    await db
      .update(syncRuns)
      .set({ status: "ok", detail, finishedAt: new Date() })
      .where(eq(syncRuns.id, run.id));
    return detail;
  } catch (e) {
    await db
      .update(syncRuns)
      .set({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, run.id));
    throw e;
  }
}

export async function lastSyncRun() {
  const [run] = await db
    .select()
    .from(syncRuns)
    .orderBy(sql`${syncRuns.startedAt} desc`)
    .limit(1);
  return run ?? null;
}
