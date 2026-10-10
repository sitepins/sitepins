import { GitEngineError } from "./errors";
import { createHttp, diffTrees, encodePath, mapWithConcurrency } from "./http";
import { TGitClient, TGitClientOptions, TGitFile, TTreeEntry } from "./types";

type TGhContentFile = {
  type: string;
  path: string;
  sha: string;
  encoding?: string;
  content?: string;
};
type TGhDirEntry = { name: string; path: string; sha: string; type: string };
type TGhTree = {
  truncated: boolean;
  tree: { path: string; type: string; sha: string }[];
};
type TGhCompare = {
  status: "identical" | "ahead" | "behind" | "diverged";
  files?: { filename: string; previous_filename?: string }[];
};

const NAME = /^[A-Za-z0-9_.-]+$/;
// GitHub's compare API stops listing files at 300.
const COMPARE_FILE_LIMIT = 300;
const DIR_LISTING_LIMIT = 1000;

export const parseGitHubRepository = (repository: string) => {
  const [owner, repo, ...rest] = repository.split("/");
  if (!owner || !repo || rest.length || !NAME.test(owner) || !NAME.test(repo)) {
    throw new GitEngineError("Invalid GitHub repository", 400, "invalid");
  }
  return { owner, repo };
};

export const createGitHubClient = ({
  repository,
  branch,
  token,
  apiBase = "https://api.github.com",
  fetchImpl,
}: TGitClientOptions): TGitClient => {
  const { owner, repo } = parseGitHubRepository(repository);
  const base = `/repos/${owner}/${repo}`;
  const http = createHttp({
    baseUrl: apiBase,
    fetchImpl,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "sitepins",
    },
  });
  const ref = encodeURIComponent;

  const readTreeMap = async (sha: string) => {
    const { data } = await http<TGhTree>(
      "GET",
      `${base}/git/trees/${ref(sha)}?recursive=1`,
    );
    if (!data) throw new GitEngineError("Commit not found", 404, "not_found");
    if (data.truncated) {
      throw new GitEngineError(
        "The repository is too large to compare in one pass",
        413,
        "too_large",
      );
    }
    return new Map(
      data.tree.filter((e) => e.type === "blob").map((e) => [e.path, e.sha]),
    );
  };

  const readFile = async (
    at: string,
    path: string,
  ): Promise<TGitFile | null> => {
    const { data } = await http<TGhContentFile | TGhDirEntry[]>(
      "GET",
      `${base}/contents/${encodePath(path)}?ref=${ref(at)}`,
    );
    if (!data || Array.isArray(data) || data.type !== "file") return null;
    if (data.encoding === "base64" && data.content !== undefined) {
      return {
        path,
        sha: data.sha,
        content: Buffer.from(data.content, "base64"),
      };
    }
    // Files over 1 MB come back without content.
    const { data: blob } = await http<{ content: string; encoding: string }>(
      "GET",
      `${base}/git/blobs/${data.sha}`,
    );
    if (!blob) return null;
    return {
      path,
      sha: data.sha,
      content: Buffer.from(
        blob.content,
        blob.encoding === "base64" ? "base64" : "utf-8",
      ),
    };
  };

  return {
    host: "Github",
    branch,

    async readHead() {
      const { data } = await http<{ commit: { sha: string } }>(
        "GET",
        `${base}/branches/${ref(branch)}`,
      );
      return data?.commit.sha ?? null;
    },

    readFile,

    async statFiles(at, paths) {
      const result = new Map<string, string | null>();
      const byDir = new Map<string, string[]>();
      for (const path of paths) {
        const dir = path.includes("/")
          ? path.slice(0, path.lastIndexOf("/"))
          : "";
        byDir.set(dir, [...(byDir.get(dir) ?? []), path]);
      }
      await mapWithConcurrency([...byDir], 4, async ([dir, dirPaths]) => {
        const { data } = await http<TGhDirEntry[] | TGhContentFile>(
          "GET",
          `${base}/contents/${encodePath(dir)}?ref=${ref(at)}`,
        );
        const listing = Array.isArray(data) ? data : [];
        const files = new Map(
          listing.filter((e) => e.type === "file").map((e) => [e.path, e.sha]),
        );
        for (const path of dirPaths) {
          if (files.has(path) || listing.length < DIR_LISTING_LIMIT) {
            result.set(path, files.get(path) ?? null);
          } else {
            result.set(path, (await readFile(at, path))?.sha ?? null);
          }
        }
      });
      return result;
    },

    async readTree(at, dir) {
      const { data } = await http<TGhTree>(
        "GET",
        `${base}/git/trees/${ref(at)}?recursive=1`,
      );
      if (!data) throw new GitEngineError("Ref not found", 404, "not_found");
      const prefix = dir ? `${dir}/` : "";
      const entries: TTreeEntry[] = data.tree
        .filter(
          (e) =>
            (e.type === "blob" || e.type === "tree") &&
            e.path.startsWith(prefix),
        )
        .map((e) => ({
          path: e.path,
          type: e.type as TTreeEntry["type"],
          sha: e.sha,
        }));
      return { entries, truncated: data.truncated };
    },

    async changedPaths(baseSha, headSha) {
      if (baseSha === headSha) return new Set();
      const { data } = await http<TGhCompare>(
        "GET",
        `${base}/compare/${ref(baseSha)}...${ref(headSha)}`,
      );
      if (!data || (data.status !== "ahead" && data.status !== "identical")) {
        return "diverged";
      }
      const files = data.files ?? [];
      if (files.length >= COMPARE_FILE_LIMIT) {
        return diffTrees(
          await readTreeMap(baseSha),
          await readTreeMap(headSha),
        );
      }
      const changed = new Set<string>();
      for (const file of files) {
        changed.add(file.filename);
        if (file.previous_filename) changed.add(file.previous_filename);
      }
      return changed;
    },

    async commit({ parent, changes, message, author }) {
      const { data: parentCommit } = await http<{ tree: { sha: string } }>(
        "GET",
        `${base}/git/commits/${ref(parent)}`,
      );
      if (!parentCommit) {
        throw new GitEngineError("Parent commit not found", 404, "not_found");
      }

      const tree = await mapWithConcurrency(changes, 4, async (change) => {
        if (change.op === "delete") {
          return { path: change.path, mode: "100644", type: "blob", sha: null };
        }
        const { data: blob } = await http<{ sha: string }>(
          "POST",
          `${base}/git/blobs`,
          { content: change.content.toString("base64"), encoding: "base64" },
        );
        return {
          path: change.path,
          mode: "100644",
          type: "blob",
          sha: blob!.sha,
        };
      });

      const { data: newTree } = await http<{ sha: string }>(
        "POST",
        `${base}/git/trees`,
        { base_tree: parentCommit.tree.sha, tree },
      );
      // No author with an installation token: GitHub then signs it as the app.
      const { data: commit } = await http<{ sha: string }>(
        "POST",
        `${base}/git/commits`,
        {
          message,
          tree: newTree!.sha,
          parents: [parent],
          ...(author && { author, committer: author }),
        },
      );

      try {
        await http("PATCH", `${base}/git/refs/heads/${encodePath(branch)}`, {
          sha: commit!.sha,
          force: false,
        });
      } catch (error) {
        if (error instanceof GitEngineError && error.status === 422) {
          throw new GitEngineError("The branch moved", 409, "ref_moved");
        }
        throw error;
      }
      return commit!.sha;
    },

    async listCommits({ path, limit }) {
      const { data } = await http<
        {
          sha: string;
          commit: {
            message: string;
            author: { name: string; date: string } | null;
          };
        }[]
      >(
        "GET",
        `${base}/commits?sha=${ref(branch)}&per_page=${limit}${path ? `&path=${ref(path)}` : ""}`,
      );
      return (data ?? []).map((c) => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author?.name ?? "",
        date: c.commit.author?.date ?? "",
      }));
    },

    async createBranch(name, sha) {
      try {
        await http("POST", `${base}/git/refs`, {
          ref: `refs/heads/${name}`,
          sha,
        });
        return true;
      } catch (error) {
        if (error instanceof GitEngineError && error.status === 422)
          return false;
        throw error;
      }
    },

    async openPullRequest({ head, title, body }) {
      const { data: open } = await http<{ number: number; html_url: string }[]>(
        "GET",
        `${base}/pulls?state=open&head=${ref(`${owner}:${head}`)}&base=${ref(branch)}`,
      );
      const existing = open?.[0];
      if (existing) return { number: existing.number, url: existing.html_url };
      const { data } = await http<{ number: number; html_url: string }>(
        "POST",
        `${base}/pulls`,
        { title, head, base: branch, body },
      );
      return { number: data!.number, url: data!.html_url };
    },
  };
};
