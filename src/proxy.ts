import { NextResponse, type NextRequest } from "next/server";

/**
 * Dashboard auth. The registry contains private-repo names, manifests, and
 * analytics, so every page is protected by HTTP Basic auth (any username,
 * password = CONTROL_CENTER_TOKEN). Excluded from the matcher below:
 *
 * - /api/collect and /px.js — public by design (sites post pageviews here)
 * - /api/mcp and /api/sync — bearer-guarded in src/lib/auth.ts
 *
 * Same fail-closed policy as the API guard: token unset → open in dev,
 * refused in production.
 */

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default function proxy(req: NextRequest) {
  const expected = process.env.CONTROL_CENTER_TOKEN;

  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("CONTROL_CENTER_TOKEN is not configured; refusing to serve.", {
        status: 503,
      });
    }
    return NextResponse.next();
  }

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const password = decoded.slice(decoded.indexOf(":") + 1);
      if (constantTimeEqual(password, expected)) return NextResponse.next();
    } catch {
      // fall through to the challenge
    }
  }
  if (header.startsWith("Bearer ") && constantTimeEqual(header.slice(7), expected)) {
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
