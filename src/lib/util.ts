import type { Project } from "@/db/schema";

/**
 * Effective display fields: owner overrides win, then synced values, then the
 * repo homepage for the live link. Use this everywhere a project is shown.
 */
export function displayFields(p: Project): {
  name: string;
  description: string | null;
  liveUrl: string | null;
} {
  return {
    name: p.customName ?? p.name,
    description: p.customDescription ?? p.description,
    liveUrl: p.customLiveUrl ?? p.liveUrl ?? p.homepage,
  };
}

/** URL-safe slug from a project or repo name. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "project"
  );
}

/** Reserved slugs that collide with app routes. */
export const RESERVED_SLUGS = new Set(["new"]);

/** Pick a slug that avoids collisions with taken (and reserved) slugs. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base;
  for (let i = 2; taken.has(slug) || RESERVED_SLUGS.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

/** Merge string lists, deduplicated, order-preserving. */
export function uniqueMerge(...lists: (string[] | undefined)[]): string[] {
  return [...new Set(lists.flatMap((l) => l ?? []))];
}

/**
 * Constant-time string comparison for secrets. Runtime-agnostic (works in the
 * proxy as well as route handlers). Length differences return early — length
 * is not treated as secret.
 */
export function secureEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
