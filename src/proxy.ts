import { NextResponse, type NextRequest } from "next/server";
import { secureEquals } from "@/lib/util";

/**
 * Dashboard auth. The registry contains private-repo names, manifests, and
 * analytics, so every page is protected by HTTP Basic auth:
 *
 * - DASHBOARD_PASSWORD set: log in as DASHBOARD_USER (default "admin") with
 *   that password.
 * - Otherwise: any username, password = CONTROL_CENTER_TOKEN.
 * - `Authorization: Bearer CONTROL_CENTER_TOKEN` is always accepted too.
 *
 * Excluded from the matcher below:
 * - /api/collect and /px.js — public by design (sites post pageviews here)
 * - /api/mcp and /api/sync — bearer-guarded in src/lib/auth.ts
 *
 * Fail-closed policy: no credentials configured → open in dev, refused in
 * production.
 */

export default function proxy(req: NextRequest) {
  const token = process.env.CONTROL_CENTER_TOKEN;
  const dashUser = process.env.DASHBOARD_USER || "admin";
  const dashPass = process.env.DASHBOARD_PASSWORD;

  if (!token && !dashPass) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Neither DASHBOARD_PASSWORD nor CONTROL_CENTER_TOKEN is configured; refusing to serve.",
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(":");
      const user = decoded.slice(0, sep);
      const password = decoded.slice(sep + 1);
      const ok = dashPass
        ? secureEquals(user, dashUser) && secureEquals(password, dashPass)
        : secureEquals(password, token!);
      if (ok) return NextResponse.next();
    } catch {
      // fall through to the challenge
    }
  }
  if (token && header.startsWith("Bearer ") && secureEquals(header.slice(7), token)) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="control-center"' },
  });
}

export const config = {
  matcher: ["/((?!api/collect|api/mcp|api/sync|px\\.js|_next|favicon\\.ico).*)"],
};
