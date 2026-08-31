"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, projects } from "@/db";
import { fetchParsedManifest, fetchRepo } from "@/lib/github";
import { runSync } from "@/lib/sync";
import { slugify, uniqueMerge, uniqueSlug } from "@/lib/util";

export type FormState = { ok?: boolean; message: string } | null;

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

/** "" → null; anything else trimmed. */
function nullable(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

/** Normalize a user-typed URL; null when empty, undefined when invalid. */
function normalizeUrl(raw: string | null): string | null | undefined {
  if (!raw) return null;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (!/^https?:$/.test(u.protocol)) return undefined;
    return u.href.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

/**
 * Add a project by hand — a GitHub repo, a live URL, or both. Manual projects
 * live alongside synced ones but are never deleted by the sync; when a repo is
 * given (and GITHUB_TOKEN can see it), details are pulled from GitHub.
 */
export async function addProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const githubRepo = String(formData.get("githubRepo") ?? "").trim().replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");
  const rawLiveUrl = nullable(formData.get("liveUrl"));
  const nameInput = nullable(formData.get("name"));
  const description = nullable(formData.get("description"));

  if (!githubRepo && !rawLiveUrl) {
    return { message: "Give the project a GitHub repo, a URL, or both." };
  }
  if (githubRepo && !REPO_RE.test(githubRepo)) {
    return { message: `"${githubRepo}" doesn't look like owner/repo.` };
  }
  const liveUrl = normalizeUrl(rawLiveUrl);
  if (liveUrl === undefined) {
    return { message: `"${rawLiveUrl}" isn't a valid URL.` };
  }
  const host = liveUrl ? new URL(liveUrl).hostname : "";

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
      const parsed = await fetchParsedManifest(repoInfo.fullName);
      manifest = parsed?.manifest ?? null;
      manifestError = parsed?.error ?? null;
    } catch {
      repoInfo = null; // GitHub unreachable — add the project bare, sync enriches later
    }
  }

  // Typed values go into custom* overrides so no future sync (or graduation to
  // a synced project) can clobber them; base fields hold GitHub-derived data.
  const name =
    nameInput ?? manifest?.name ?? repoInfo?.name ?? githubRepo.split("/")[1] ?? host;
  const taken = new Set(
    (await db.select({ slug: projects.slug }).from(projects)).map((p) => p.slug),
  );
  const slug = uniqueSlug(slugify(name), taken);

  try {
    await db.insert(projects).values({
      slug,
      name: manifest?.name ?? repoInfo?.name ?? githubRepo.split("/")[1] ?? host,
      customName: nameInput,
      description: manifest?.description ?? repoInfo?.description ?? null,
      customDescription: description,
      githubRepo: repoInfo?.fullName ?? (githubRepo || null),
      defaultBranch: repoInfo?.defaultBranch ?? null,
      homepage: repoInfo?.homepage ?? null,
      liveUrl: manifest?.url ?? null,
      customLiveUrl: liveUrl,
      kind: "unknown",
      source: "manual",
      isManual: true,
      topics: uniqueMerge(repoInfo?.topics, manifest?.tags),
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

/**
 * Remove a project. Manual projects are deleted outright; synced projects are
 * hidden instead — the autoscan would re-discover a deleted one on the next
 * run, so hiding (restorable from the dashboard) is the honest removal.
 */
export async function removeProject(slug: string): Promise<FormState> {
  const [project] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  if (!project) return { message: "Project not found." };
  if (project.isManual) {
    await db.delete(projects).where(eq(projects.id, project.id));
  } else {
    await db
      .update(projects)
      .set({ isHidden: true, updatedAt: new Date() })
      .where(eq(projects.id, project.id));
  }
  revalidatePath("/");
  redirect("/");
}

/**
 * Save owner edits as overrides. Empty fields clear the override, falling back
 * to whatever the sync reports. The slug (= pixel site id) never changes.
 */
export async function updateProject(
  slug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const [project] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  if (!project) return { message: "Project not found." };

  const customLiveUrl = normalizeUrl(nullable(formData.get("liveUrl")));
  if (customLiveUrl === undefined) {
    return { message: "That live URL doesn't look valid." };
  }

  await db
    .update(projects)
    .set({
      customName: nullable(formData.get("name")),
      customDescription: nullable(formData.get("description")),
      customLiveUrl,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, project.id));

  revalidatePath("/");
  revalidatePath(`/projects/${slug}`);
  return { ok: true, message: "Saved." };
}

/** Bring a hidden project back onto the dashboard and into MCP results. */
export async function restoreProject(slug: string): Promise<void> {
  await db
    .update(projects)
    .set({ isHidden: false, updatedAt: new Date() })
    .where(eq(projects.slug, slug));
  revalidatePath("/");
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
