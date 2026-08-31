import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pageEvents, projects } from "@/db";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|pingdom|monitor|preview|scan|curl|wget|python-requests|axios|node-fetch|go-http/i;

const SITE_ID = /^[a-z0-9][a-z0-9-_.]{0,79}$/;
const REFERRER_HOST = /^[a-z0-9.-]{1,255}$/i;
const MAX_BODY_BYTES = 4096;

// Best-effort in-memory rate limit (per instance): plenty for real pixel
// traffic, stops trivial flooding of this necessarily-public endpoint.
const RATE_LIMIT = 120; // events per IP per minute
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (buckets.size > 50_000) buckets.clear();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_LIMIT;
}

/** Read the body with a hard size cap, regardless of Content-Length honesty. */
async function readBodyCapped(req: Request): Promise<string | null> {
  const declared = parseInt(req.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(merged);
}

function dailyVisitorHash(ip: string, ua: string): string {
  const secret = process.env.PIXEL_SECRET || "dev-pixel-secret";
  const day = new Date().toISOString().slice(0, 10);
  const salt = createHash("sha256").update(`${secret}:${day}`).digest("hex");
  return createHash("sha256").update(`${salt}:${ip}:${ua}`).digest("hex").slice(0, 24);
}

function deviceFromUa(ua: string): string {
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobile|iphone|android/i.test(ua)) return "mobile";
  return "desktop";
}

function referrerHost(referrer: unknown, eventHost: string): string | null {
  if (typeof referrer !== "string" || !referrer) return null;
  try {
    const host = new URL(referrer).hostname;
    // Internal navigation isn't a referral; odd/opaque hosts are dropped —
    // these strings end up in front of the owner's LLM agent via MCP.
    return host && host !== eventHost && REFERRER_HOST.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** Strip control characters and markup-significant characters from stored text. */
function sanitize(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f<>"'`\\]/g, "").slice(0, max);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "0.0.0.0";
  if (rateLimited(ip)) return new Response(null, { status: 429, headers: CORS });

  // sendBeacon posts text/plain to stay a simple CORS request, so parse text.
  const raw = await readBodyCapped(req);
  if (raw === null) return new Response(null, { status: 413, headers: CORS });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400, headers: CORS });
  }

  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return new Response(null, { status: 204, headers: CORS });

  const siteId = typeof body.s === "string" ? body.s.toLowerCase() : "";
  const host = typeof body.h === "string" ? sanitize(body.h, 255) : "";
  const rawPath = typeof body.p === "string" ? body.p : "";
  if (!SITE_ID.test(siteId) || !host || !rawPath.startsWith("/")) {
    return new Response(null, { status: 400, headers: CORS });
  }
  const path = sanitize(rawPath.split(/[?#]/)[0], 512);

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, siteId))
    .limit(1);

  await db.insert(pageEvents).values({
    projectId: project?.id ?? null,
    siteId,
    host,
    path,
    referrer: referrerHost(body.r, host),
    visitorHash: dailyVisitorHash(ip, ua),
    device: deviceFromUa(ua),
  });

  return new Response(null, { status: 204, headers: CORS });
}
