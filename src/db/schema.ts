import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * The project registry — one row per project, merged from GitHub repos and
 * DigitalOcean apps. `source` records which side(s) a project was found on,
 * so orphans (deployed app with no repo, repo with no deployment) are visible.
 */
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    // "owner/repo", null for DO apps with no GitHub source
    githubRepo: text("github_repo"),
    defaultBranch: text("default_branch"),
    homepage: text("homepage"),
    liveUrl: text("live_url"),
    doAppId: text("do_app_id"),
    // "app" | "static_site" | "unknown"
    kind: text("kind").notNull().default("unknown"),
    // "github" | "do" | "both" | "manual" (manual = added by hand, no synced counterpart yet)
    source: text("source").notNull().default("github"),
    // Added by hand via the dashboard: sync may enrich it but never deletes it.
    isManual: boolean("is_manual").notNull().default(false),
    // "Removed" by the owner: hidden from the dashboard and MCP, still synced
    // in the background (deleting a synced row would just come back), restorable.
    isHidden: boolean("is_hidden").notNull().default(false),
    // Owner-edited overrides. The sync owns the base columns and rewrites them
    // freely; these always win at display time and null means "use synced".
    customName: text("custom_name"),
    customDescription: text("custom_description"),
    customLiveUrl: text("custom_live_url"),
    topics: jsonb("topics").$type<string[]>().notNull().default([]),
    // Parsed project.yaml from the repo root, if present
    manifest: jsonb("manifest").$type<ProjectManifest | null>(),
    manifestError: text("manifest_error"),
    isArchived: boolean("is_archived").notNull().default(false),
    isFork: boolean("is_fork").notNull().default(false),
    lastCommitAt: timestamp("last_commit_at", { withTimezone: true }),
    lastDeployAt: timestamp("last_deploy_at", { withTimezone: true }),
    // DO deployment phase of the latest deployment, e.g. ACTIVE, ERROR
    deployPhase: text("deploy_phase"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("projects_slug_idx").on(t.slug),
    uniqueIndex("projects_github_repo_idx").on(t.githubRepo),
    uniqueIndex("projects_do_app_id_idx").on(t.doAppId),
  ],
);

/**
 * Raw pageview events from the pixel. `siteId` is the value the pixel was
 * embedded with (the project slug); events for unknown sites are kept and
 * matched up later once the project exists.
 */
export const pageEvents = pgTable(
  "page_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
    siteId: text("site_id").notNull(),
    host: text("host").notNull(),
    path: text("path").notNull(),
    referrer: text("referrer"),
    // sha256(dailySalt + ip + ua), truncated — resets every UTC day
    visitorHash: text("visitor_hash").notNull(),
    // "desktop" | "mobile" | "tablet" | "unknown"
    device: text("device").notNull().default("unknown"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("page_events_project_created_idx").on(t.projectId, t.createdAt),
    index("page_events_site_created_idx").on(t.siteId, t.createdAt),
  ],
);

/** DigitalOcean deployment history, fetched during sync. */
export const deployments = pgTable(
  "deployments",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    doDeploymentId: text("do_deployment_id").notNull(),
    phase: text("phase").notNull(),
    cause: text("cause"),
    deployedAt: timestamp("deployed_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("deployments_do_id_idx").on(t.doDeploymentId),
    index("deployments_project_idx").on(t.projectId, t.deployedAt),
  ],
);

/** Log of registry sync runs. */
export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  // "ok" | "error" | "running"
  status: text("status").notNull().default("running"),
  detail: jsonb("detail").$type<SyncDetail | null>(),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

/**
 * project.yaml — the manifest each repo can declare at its root. This is what
 * makes the registry agent-readable: `exposes`/`needs` power collaboration
 * reasoning across projects.
 */
export type ProjectManifest = {
  name?: string;
  description?: string;
  stack?: string[];
  url?: string;
  tags?: string[];
  exposes?: { kind: string; description: string; url?: string }[];
  needs?: string[];
  notes?: string;
};

export type SyncDetail = {
  reposSeen: number;
  appsSeen: number;
  projectsUpserted: number;
  removedProjects: number;
  manifestsFound: number;
  orphanApps: string[];
  deploymentFetchErrors: string[];
};

export type Project = typeof projects.$inferSelect;
export type PageEvent = typeof pageEvents.$inferSelect;
export type Deployment = typeof deployments.$inferSelect;
