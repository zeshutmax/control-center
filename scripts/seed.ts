/**
 * Seeds demo projects and ~30 days of synthetic pixel traffic so the dashboard
 * and MCP tools can be explored before GitHub/DO tokens are configured.
 * Only touches rows whose slug starts with "demo-". Run: pnpm seed
 */
import { like, sql } from "drizzle-orm";
import { db, deployments, pageEvents, projects } from "../src/db";

// Deterministic PRNG so reseeding produces the same shape of data.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_PROJECTS = [
  {
    slug: "demo-portfolio",
    name: "Portfolio",
    description: "Personal portfolio and blog",
    githubRepo: "maxzeshut/demo-portfolio",
    kind: "static_site",
    source: "both",
    liveUrl: "https://demo-portfolio.example.com",
    deployPhase: "ACTIVE",
    dailyBase: 40,
    manifest: {
      stack: ["astro", "tailwind"],
      exposes: [{ kind: "content", description: "Blog posts via RSS feed", url: "https://demo-portfolio.example.com/rss.xml" }],
      needs: ["A place to cross-post project launch announcements"],
    },
  },
  {
    slug: "demo-recipe-api",
    name: "Recipe API",
    description: "REST API serving structured recipe data",
    githubRepo: "maxzeshut/demo-recipe-api",
    kind: "app",
    source: "both",
    liveUrl: "https://demo-recipe-api.example.com",
    deployPhase: "ACTIVE",
    dailyBase: 15,
    manifest: {
      stack: ["fastify", "postgres"],
      exposes: [{ kind: "api", description: "JSON API: search recipes, ingredients, nutrition facts" }],
      needs: [],
    },
  },
  {
    slug: "demo-meal-planner",
    name: "Meal Planner",
    description: "Weekly meal planning web app",
    githubRepo: "maxzeshut/demo-meal-planner",
    kind: "app",
    source: "both",
    liveUrl: "https://demo-meal-planner.example.com",
    deployPhase: "ERROR",
    dailyBase: 25,
    manifest: {
      stack: ["nextjs", "postgres"],
      exposes: [],
      needs: ["Recipe data source with nutrition facts", "User auth that could be shared across my apps"],
    },
  },
  {
    slug: "demo-cli-tools",
    name: "CLI Tools",
    description: "Grab-bag of personal command line utilities",
    githubRepo: "maxzeshut/demo-cli-tools",
    kind: "unknown",
    source: "github",
    liveUrl: null,
    deployPhase: null,
    dailyBase: 0,
    manifest: null,
  },
  {
    slug: "demo-legacy-landing",
    name: "legacy-landing",
    description: null,
    githubRepo: null,
    kind: "static_site",
    source: "do",
    liveUrl: "https://demo-legacy-landing.example.com",
    deployPhase: "ACTIVE",
    dailyBase: 5,
    manifest: null,
  },
] as const;

async function main() {
  const rand = mulberry32(20260831);

  await db.delete(pageEvents).where(like(pageEvents.siteId, "demo-%"));
  await db.delete(projects).where(like(projects.slug, "demo-%")); // cascades demo deployments

  for (const p of DEMO_PROJECTS) {
    const now = Date.now();
    const [project] = await db
      .insert(projects)
      .values({
        slug: p.slug,
        name: p.name,
        description: p.description,
        githubRepo: p.githubRepo,
        defaultBranch: p.githubRepo ? "main" : null,
        liveUrl: p.liveUrl,
        doAppId: p.source !== "github" ? `demo-app-${p.slug}` : null,
        kind: p.kind,
        source: p.source,
        topics: ["demo"],
        manifest: p.manifest ? { name: p.name, description: p.description ?? undefined, url: p.liveUrl ?? undefined, ...p.manifest, stack: [...p.manifest.stack], exposes: [...p.manifest.exposes], needs: [...p.manifest.needs] } : null,
        lastCommitAt: p.githubRepo ? new Date(now - rand() * 10 * 86400_000) : null,
        lastDeployAt: p.deployPhase ? new Date(now - rand() * 5 * 86400_000) : null,
        deployPhase: p.deployPhase,
      })
      .returning();

    if (p.deployPhase) {
      for (let i = 0; i < 6; i++) {
        await db.insert(deployments).values({
          projectId: project.id,
          doDeploymentId: `demo-${p.slug}-${i}`,
          phase: i === 0 ? p.deployPhase : rand() < 0.85 ? "ACTIVE" : "ERROR",
          cause: rand() < 0.7 ? "commit pushed to main" : "manual",
          deployedAt: new Date(now - (i * 4 + rand() * 3) * 86400_000),
        });
      }
    }

    if (p.dailyBase > 0) {
      const paths = ["/", "/about", "/blog/launch", "/blog/how-it-works", "/pricing"];
      const referrers = [null, null, null, "news.ycombinator.com", "google.com", "github.com", "x.com"];
      const rows: (typeof pageEvents.$inferInsert)[] = [];
      for (let day = 29; day >= 0; day--) {
        // Weekly rhythm + noise + a small traffic spike mid-month.
        const weekday = 1 - 0.35 * (new Date(now - day * 86400_000).getUTCDay() % 6 === 0 ? 1 : 0);
        const spike = day === 12 ? 3.2 : 1;
        const views = Math.round(p.dailyBase * weekday * spike * (0.7 + rand() * 0.6));
        for (let v = 0; v < views; v++) {
          rows.push({
            projectId: project.id,
            siteId: p.slug,
            host: new URL(p.liveUrl!).hostname,
            path: paths[Math.floor(rand() * paths.length)],
            referrer: referrers[Math.floor(rand() * referrers.length)],
            visitorHash: `demo-${day}-${Math.floor(rand() * Math.max(3, views * 0.6))}`,
            device: rand() < 0.55 ? "desktop" : rand() < 0.85 ? "mobile" : "tablet",
            createdAt: new Date(now - day * 86400_000 - rand() * 80_000_000),
          });
        }
      }
      for (let i = 0; i < rows.length; i += 500) {
        await db.insert(pageEvents).values(rows.slice(i, i + 500));
      }
    }
  }

  const count = await db.execute(sql`select count(*) as n from page_events where site_id like 'demo-%'`);
  console.log(`Seeded ${DEMO_PROJECTS.length} demo projects, ${(count.rows[0] as { n: string }).n} page events.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
