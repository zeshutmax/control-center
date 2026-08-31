import { secureEquals } from "./util";

/**
 * Bearer-token guard for /api/mcp and /api/sync.
 *
 * - CONTROL_CENTER_TOKEN set: require `Authorization: Bearer <token>`.
 * - Not set in development: allow (local convenience).
 * - Not set in production: refuse — never deploy these endpoints open.
 */
export function checkAuth(req: Request): Response | null {
  const expected = process.env.CONTROL_CENTER_TOKEN;

  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        { error: "CONTROL_CENTER_TOKEN is not configured; refusing unauthenticated access" },
        { status: 503 },
      );
    }
    return null;
  }

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secureEquals(provided, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
