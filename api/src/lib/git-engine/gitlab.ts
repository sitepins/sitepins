import { GitEngineError } from "./errors";
import { createHttp, diffTrees, mapWithConcurrency } from "./http";
import { TGitClient, TGitClientOptions, TTreeEntry } from "./types";

type TGlFile = { content: string; encoding: string; blob_id: string };
type TGlTreeEntry = { path: string; type: string; id: string };
type TGlCompare = {
  compare_timeout?: boolean;
  diffs: { old_path: string; new_path: string }[];
};
type TGlCommitAction = {
  action: "create" | "update" | "delete";
  file_path: string;
  content?: string;
  encoding?: "base64";
  last_commit_id?: string;
};

const PROJECT_PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)+$/;
const COMPARE_FILE_LIMIT = 1000;
const TREE_PAGE_LIMIT = 200;
// GitLab's wording when a file changed or (dis)appeared since the given commit.
const STALE_FILE =
  /changed since|has been modified|already exists|doesn't exist|does not exist/i;

export const assertGitLabRepository = (repository: string) => {
  if (!PROJECT_PATH.test(repository) || repository.split("/").includes("..")) {
    throw new GitEngineError("Invalid GitLab repository", 400, "invalid");
  }
};

export const createGitLabClient = ({
  repository,
  branch,
  token,
  apiBase = "https://gitlab.com/api/v4",
  fetchImpl,
}: TGitClientOptions): TGitClient => {
  assertGitLabRepository(repository);
  const projectBase = `/projects/${encodeURIComponent(repository)}`;
  const base = `${projectBase}/repository`;
  const http = createHttp({
    baseUrl: apiBase,
    fetchImpl,
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "sitepins" },
  });
  const q = encodeURIComponent;
  const fileUrl = (path: string, at: string) =>
    `${base}/files/${q(path)}?ref=${q(at)}`;

  const fileMeta = async (at: string, path: string) => {
    const { status, headers } = await http("HEAD", fileUrl(path, at));
    if (status === 404) return null;
    return {
      sha: headers.get("x-gitlab-blob-id") ?? "",
      lastCommitId: headers.get("x-gitlab-last-commit-id") ?? undefined,
    };
  };

  const readTree = async (at: string, dir?: string) => {
    const entries: TTreeEntry[] = [];
    for (let page = 1; page <= TREE_PAGE_LIMIT; page++) {
      const { data, headers } = await http<TGlTreeEntry[]>(
        "GET",
        `${base}/tree?recursive=true&per_page=100&page=${page}&ref=${q(at)}${dir ? `&path=${q(dir)}` : ""}`,
      );
      for (const e of data ?? []) {
        if (e.type === "blob" || e.type === "tree") {
          entries.push({ path: e.path, type: e.type, sha: e.id });
        }
      }
      if (!headers.get("x-next-page")) return { entries, truncated: false };
    }
    return { entries, truncated: true };
  };

  const blobMap = async (at: string) => {
    const { entries, truncated } = await readTree(at);
    if (truncated) {
      throw new GitEngineError(
        "The repository is too large to compare in one pass",
        413,
        "too_large",
      );
    }
    return new Map(
      entries.filter((e) => e.type === "blob").map((e) => [e.path, e.sha]),
    );
  };

  return {
    host: "Gitlab",
    branch,

    async readHead() {
      const { data } = await http<{ commit: { id: string } }>(
        "GET",
        `${base}/branches/${q(branch)}`,
      );
      return data?.commit.id ?? null;
    },

    async readFile(at, path) {
      const { data } = await http<TGlFile>("GET", fileUrl(path, at));
      if (!data) return null;
      return {
        path,
        sha: data.blob_id,
        content: Buffer.from(
          data.content,
          data.encoding === "base64" ? "base64" : "utf-8",
        ),
      };
    },

    async statFiles(at, paths) {
      const metas = await mapWithConcurrency(paths, 4, (p) => fileMeta(at, p));
      return new Map(paths.map((p, i) => [p, metas[i]?.sha ?? null]));
    },

    readTree,

    async changedPaths(baseSha, headSha) {
      if (baseSha === headSha) return new Set();
      const { data: mergeBase } = await http<{ id: string }>(
        "GET",
        `${base}/merge_base?refs[]=${q(baseSha)}&refs[]=${q(headSha)}`,
      ).catch((error: unknown) => {
        // GitLab answers 400 for a sha it doesn't know.
        if (error instanceof GitEngineError && error.status === 400) {
          return { data: null };
        }
        throw error;
      });
      if (!mergeBase || mergeBase.id !== baseSha) return "diverged";

      const { data } = await http<TGlCompare>(
        "GET",
        `${base}/compare?from=${q(baseSha)}&to=${q(headSha)}&straight=true`,
      );
      const diffs = data?.diffs ?? [];
      if (!data || data.compare_timeout || diffs.length >= COMPARE_FILE_LIMIT) {
        return diffTrees(await blobMap(baseSha), await blobMap(headSha));
      }
      const changed = new Set<string>();
      for (const diff of diffs) {
        changed.add(diff.old_path);
        changed.add(diff.new_path);
      }
      return changed;
    },

    async commit({ parent, changes, message, author }) {
      // Per-file last_commit_id makes GitLab reject the commit if any of these
      // files changed after `parent`, which is the overlap the caller checked.
      const actions = await mapWithConcurrency(
        changes,
        4,
        async (change): Promise<TGlCommitAction> => {
          const meta = await fileMeta(parent, change.path);
          if (change.op === "delete") {
            return {
              action: "delete",
              file_path: change.path,
              last_commit_id: meta?.lastCommitId,
            };
          }
          return {
            action: meta ? "update" : "create",
            file_path: change.path,
            content: change.content.toString("base64"),
            encoding: "base64",
            ...(meta && { last_commit_id: meta.lastCommitId }),
          };
        },
      );

      try {
        const { data } = await http<{ id: string }>("POST", `${base}/commits`, {
          branch,
          commit_message: message,
          actions,
          ...(author && {
            author_name: author.name,
            author_email: author.email,
          }),
        });
        return data!.id;
      } catch (error) {
        if (
          error instanceof GitEngineError &&
          error.status === 400 &&
          STALE_FILE.test(error.message)
        ) {
          throw new GitEngineError("The branch moved", 409, "ref_moved");
        }
        throw error;
      }
    },

    async listCommits({ path, limit }) {
      const { data } = await http<
        {
          id: string;
          message: string;
          author_name: string;
          created_at: string;
        }[]
      >(
        "GET",
        `${base}/commits?ref_name=${q(branch)}&per_page=${limit}${path ? `&path=${q(path)}` : ""}`,
      );
      return (data ?? []).map((c) => ({
        sha: c.id,
        message: c.message,
        author: c.author_name,
        date: c.created_at,
      }));
    },

    async createBranch(name, sha) {
      try {
        await http("POST", `${base}/branches?branch=${q(name)}&ref=${q(sha)}`);
        return true;
      } catch (error) {
        if (
          error instanceof GitEngineError &&
          error.status === 400 &&
          /already exists/i.test(error.message)
        ) {
          return false;
        }
        throw error;
      }
    },

    async openPullRequest({ head, title, body }) {
      const { data: open } = await http<{ iid: number; web_url: string }[]>(
        "GET",
        `${projectBase}/merge_requests?state=opened&source_branch=${q(head)}&target_branch=${q(branch)}`,
      );
      const existing = open?.[0];
      if (existing) return { number: existing.iid, url: existing.web_url };
      const { data } = await http<{ iid: number; web_url: string }>(
        "POST",
        `${projectBase}/merge_requests`,
        {
          source_branch: head,
          target_branch: branch,
          title,
          description: body,
        },
      );
      return { number: data!.iid, url: data!.web_url };
    },
  };
};
