const API = "https://api.digitalocean.com/v2";

export type DoApp = {
  id: string;
  name: string;
  liveUrl: string | null;
  /** "owner/repo" from the app spec's GitHub source, if any */
  githubRepo: string | null;
  kind: "app" | "static_site";
  activeDeployment: {
    id: string;
    phase: string;
    cause: string | null;
    updatedAt: string;
  } | null;
};

export type DoDeployment = {
  id: string;
  phase: string;
  cause: string | null;
  createdAt: string;
};

type SpecComponent = { github?: { repo?: string } };

type AppResponse = {
  id: string;
  spec: {
    name: string;
    services?: SpecComponent[];
    static_sites?: SpecComponent[];
    workers?: SpecComponent[];
    jobs?: SpecComponent[];
  };
  live_url?: string;
  active_deployment?: { id: string; phase: string; cause?: string; updated_at: string };
};

function headers(): HeadersInit {
  const token = process.env.DO_API_TOKEN;
  if (!token) throw new Error("DO_API_TOKEN is not set");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function doFetch(path: string): Promise<unknown> {
  const res = await fetch(`${API}${path}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`DigitalOcean ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function extractGithubRepo(spec: AppResponse["spec"]): string | null {
  const components = [
    ...(spec.services ?? []),
    ...(spec.static_sites ?? []),
    ...(spec.workers ?? []),
    ...(spec.jobs ?? []),
  ];
  for (const c of components) {
    if (c.github?.repo) return c.github.repo;
  }
  return null;
}

/** All App Platform apps (services and static sites) on the account. */
export async function listApps(): Promise<DoApp[]> {
  const data = (await doFetch("/apps?per_page=200")) as { apps?: AppResponse[] };
  return (data.apps ?? []).map((a) => ({
    id: a.id,
    name: a.spec.name,
    liveUrl: a.live_url || null,
    githubRepo: extractGithubRepo(a.spec),
    kind:
      (a.spec.static_sites?.length ?? 0) > 0 && (a.spec.services?.length ?? 0) === 0
        ? "static_site"
        : "app",
    activeDeployment: a.active_deployment
      ? {
          id: a.active_deployment.id,
          phase: a.active_deployment.phase,
          cause: a.active_deployment.cause ?? null,
          updatedAt: a.active_deployment.updated_at,
        }
      : null,
  }));
}

/** Recent deployments for one app, newest first. */
export async function listDeployments(appId: string, limit = 10): Promise<DoDeployment[]> {
  const data = (await doFetch(`/apps/${appId}/deployments?per_page=${limit}`)) as {
    deployments?: { id: string; phase: string; cause?: string; created_at: string }[];
  };
  return (data.deployments ?? []).map((d) => ({
    id: d.id,
    phase: d.phase,
    cause: d.cause ?? null,
    createdAt: d.created_at,
  }));
}
