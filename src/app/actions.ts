"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, projects } from "@/db";
import { fetchManifestFile, fetchRepo } from "@/lib/github";
import { parseManifest } from "@/lib/manifest";
import { runSync } from "@/lib/sync";

export type FormState = { message: string } | null;

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "project"
  );
}

/**
 * Add a project by hand — a GitHub repo, a live URL, or both. Manual projects
 * live alongside synced ones but are never deleted by the sync; when a repo is
 * given (and GITHUB_TOKEN can see it), details are pulled from GitHub.
 */
export async function addProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const githubRepo = String(formData.get("githubRepo") ?? "").trim().replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");
  const liveUrl = String(formData.get("liveUrl") ?? "").trim();
  const nameInput = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!githubRepo && !liveUrl) {
    return { message: "Give the project a GitHub repo, a URL, or both." };
  }
  if (githubRepo && !REPO_RE.test(githubRepo)) {
    return { message: `"${githubRepo}" doesn't look like owner/repo.` };
  }
  let host = "";
  if (liveUrl) {
    try {
      const u = new URL(liveUrl.includes("://") ? liveUrl : `https://${liveUrl}`);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      host = u.hostname;
    } catch {
      return { message: `"${liveUrl}" isn't a valid URL.` };
    }
  }

  if (githubRepo) {
    const [dup] = await db
      .select({ slug: projects.slug })
      .from(projects)
      .where(sql`lower(${projects.githubRepo}) = ${githubRepo.toLowerCase()}`)
      .limit(1);
    if (dup) return { message: `${githubRepo} is already in the registry as "${dup.slug}".` };
  }

  // Enrich from GitHub when possible; a missing repo is a typo worth stopping on,
  // an API hiccup is not.
  let repoInfo = null;
  let manifest = null;
  let manifestError: string | null = null;
  if (githubRepo && process.env.GITHUB_TOKEN) {
    try {
      repoInfo = await fetchRepo(githubRepo);
      if (!repoInfo) {
        return { message: `GitHub can't find ${githubRepo} (or the token can't see it).` };
      }
      // GitHub follows renames: the canonical name may differ from what was
      // typed, so the duplicate check must run again on the real name.
      if (repoInfo.fullName.toLowerCase() !== githubRepo.toLowerCase()) {
        const [dup] = await db
          .select({ slug: projects.slug })
          .from(projects)
          .where(sql`lower(${projects.githubRepo}) = ${repoInfo.fullName.toLowerCase()}`)
          .limit(1);
        if (dup) {
          return {
            message: `${githubRepo} is now ${repoInfo.fullName}, already in the registry as "${dup.slug}".`,
          };
        }
      }
      const raw = await fetchManifestFile(repoInfo.fullName);
      if (raw !== null) {
        const parsed = parseManifest(raw);
        manifest = parsed.manifest;
        manifestError = parsed.error;
      }
    } catch {
      repoInfo = null; // GitHub unreachable — add the project bare, sync enriches later
    }
  }

  const name =
    nameInput || manifest?.name || repoInfo?.name || githubRepo.split("/")[1] || host;
  const base = slugify(name);
  const taken = new Set(
    (await db.select({ slug: projects.slug }).from(projects)).map((p) => p.slug),
  );
  taken.add("new"); // /projects/new is the add-project form route
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;

  try {
    await db.insert(projects).values({
      slug,
      name,
      description: description || manifest?.description || repoInfo?.description || null,
      githubRepo: repoInfo?.fullName ?? (githubRepo || null),
      defaultBranch: repoInfo?.defaultBranch ?? null,
      homepage: repoInfo?.homepage ?? null,
      liveUrl: liveUrl ? (liveUrl.includes("://") ? liveUrl : `https://${liveUrl}`) : manifest?.url ?? null,
      kind: "unknown",
      source: "manual",
      isManual: true,
      topics: [...new Set([...(repoInfo?.topics ?? []), ...(manifest?.tags ?? [])])],
      manifest,
      manifestError,
      isArchived: repoInfo?.archived ?? false,
      isFork: repoInfo?.fork ?? false,
      lastCommitAt: repoInfo?.pushedAt ? new Date(repoInfo.pushedAt) : null,
    });
  } catch {
    // Safety net for races and canonical-name collisions the checks above missed.
    return { message: "That project appears to already be in the registry." };
  }

  redirect(`/projects/${slug}`);
}

/** Remove a manually added project. Synced projects are managed by the sync. */
export async function removeProject(slug: string): Promise<FormState> {
  const [project] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  if (!project) return { message: "Project not found." };
  if (!project.isManual) {
    return { message: "Only manually added projects can be removed here — synced ones come back on the next sync." };
  }
  await db.delete(projects).where(eq(projects.id, project.id));
  redirect("/");
}

/**
 * Sync trigger for the dashboard button. Runs server-side, so it works in
 * production without the browser needing the bearer token — the dashboard
 * itself (and therefore this action's endpoint) sits behind proxy.ts auth.
 */
export async function syncNow(): Promise<{ ok: boolean; message: string }> {
  try {
    const d = await runSync();
    return {
      ok: true,
      message: `ok — ${d.reposSeen} repos, ${d.appsSeen} apps, ${d.manifestsFound} manifests, ${d.removedProjects} removed`,
    };
  } catch (e) {
    return { ok: false, message: `sync failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
