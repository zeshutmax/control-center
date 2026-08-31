import { parse } from "yaml";
import { z } from "zod";
import type { ProjectManifest } from "@/db/schema";

/**
 * Schema for project.yaml — the optional manifest a repo declares at its root.
 * `exposes` and `needs` are the interesting parts: they describe what a project
 * offers to / wants from other projects, which is what lets an agent propose
 * collaborations across the portfolio.
 */
const manifestSchema = z.object({
  name: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
  stack: z.array(z.string().max(60)).max(30).optional(),
  url: z.string().url().optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  exposes: z
    .array(
      z.object({
        kind: z.string().max(60),
        description: z.string().max(1000),
        url: z.string().url().optional(),
      }),
    )
    .max(30)
    .optional(),
  needs: z.array(z.string().max(500)).max(30).optional(),
  notes: z.string().max(5000).optional(),
});

export function parseManifest(
  raw: string,
): { manifest: ProjectManifest; error: null } | { manifest: null; error: string } {
  try {
    const data = parse(raw);
    const result = manifestSchema.safeParse(data);
    if (!result.success) {
      const issue = result.error.issues[0];
      return {
        manifest: null,
        error: `invalid manifest: ${issue.path.join(".")}: ${issue.message}`,
      };
    }
    return { manifest: result.data, error: null };
  } catch (e) {
    return { manifest: null, error: `invalid YAML: ${e instanceof Error ? e.message : String(e)}` };
  }
}
