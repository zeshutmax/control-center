const API = "https://api.github.com";

export type GithubRepo = {
  fullName: string; // "owner/repo"
  name: string;
  description: string | null;
  homepage: string | null;
  topics: string[];
  archived: boolean;
  fork: boolean;
  defaultBranch: string;
  pushedAt: string | null;
  htmlUrl: string;
};

type RepoResponse = {
  full_name: string;
  name: string;
  description: string | null;
  homepage: string | null;
  topics?: string[];
  archived: boolean;
  fork: boolean;
  default_branch: string;
  pushed_at: string | null;
  html_url: string;
  owner: { login: string };
};

function headers(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "control-center",
  };
}

async function githubFetch(path: string): Promise<Response> {
  const res = await fetch(`${API}${path}`, { headers: headers(), cache: "no-store" });
  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
    throw new Error("GitHub rate limit exceeded");
  }
  return res;
}

/** All repos owned by the authenticated user (or GITHUB_OWNER, if set). */
export async function listRepos(): Promise<GithubRepo[]> {
  const owner = process.env.GITHUB_OWNER?.toLowerCase();
  const repos: GithubRepo[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await githubFetch(
      `/user/repos?per_page=100&page=${page}&affiliation=owner&sort=pushed`,
    );
    if (!res.ok) throw new Error(`GitHub /user/repos failed: ${res.status} ${await res.text()}`);
    const batch = (await res.json()) as RepoResponse[];
    for (const r of batch) {
      if (owner && r.owner.login.toLowerCase() !== owner) continue;
      repos.push({
        fullName: r.full_name,
        name: r.name,
        description: r.description,
        homepage: r.homepage || null,
        topics: r.topics ?? [],
        archived: r.archived,
        fork: r.fork,
        defaultBranch: r.default_branch,
        pushedAt: r.pushed_at,
        htmlUrl: r.html_url,
      });
    }
    if (batch.length < 100) break;
  }
  return repos;
}

/** Fetch and return the raw project.yaml from a repo root, or null if absent. */
export async function fetchManifestFile(fullName: string): Promise<string | null> {
  for (const filename of ["project.yaml", "project.yml"]) {
    const res = await githubFetch(`/repos/${fullName}/contents/${filename}`);
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`GitHub contents failed for ${fullName}: ${res.status}`);
    const data = (await res.json()) as { content?: string; encoding?: string };
    if (data.content && data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
  }
  return null;
}
