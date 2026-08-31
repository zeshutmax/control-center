import { checkAuth } from "@/lib/auth";
import { lastSyncRun, runSync } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Trigger a full registry sync (GitHub + DigitalOcean). */
export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;

  try {
    const detail = await runSync();
    return Response.json({ status: "ok", detail });
  } catch (e) {
    return Response.json(
      { status: "error", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** Status of the most recent sync run. */
export async function GET(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  return Response.json({ lastRun: await lastSyncRun() });
}
