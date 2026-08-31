"use server";

import { runSync } from "@/lib/sync";

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
