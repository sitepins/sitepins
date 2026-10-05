import { gitBlobSha } from "@/lib/utils/git-utils";

export const ORIGINAL = "---\ntitle: Hello\n---\n\nBody\n";
export const EDITED = "---\ntitle: Hello, edited\n---\n\nBody\n";
export const THEIRS =
  "---\ntitle: Hello\n---\n\nBody\n\nAppended by a developer.\n";

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");
const unb64 = (s: string) => Buffer.from(s, "base64").toString("utf-8");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

// ---------------------------------------------------------------------------
// In-memory GitHub, enough of the REST API for updateGitHubFiles.
// ---------------------------------------------------------------------------

type GhCommit = { tree: string; parents: string[] };

export const createFakeGitHub = (initial: Record<string, string>) => {
  const blobs = new Map<string, string>();
  const trees = new Map<string, Map<string, string>>();
  const commits = new Map<string, GhCommit>();
  let seq = 0;
  let head: string | null = null;

  const writeTree = (entries: Map<string, string>) => {
    const sha = `tree${++seq}`;
    trees.set(sha, entries);
    return sha;
  };
  const writeCommit = (tree: string, parents: string[]) => {
    const sha = `commit${++seq}`;
    commits.set(sha, { tree, parents });
    return sha;
  };
  const writeBlob = (content: string) => {
    const sha = gitBlobSha(content);
    blobs.set(sha, content);
    return sha;
  };
  const headTree = () =>
    new Map(head ? trees.get(commits.get(head)!.tree)! : []);

  /** Simulates someone else pushing to the branch. */
  const push = (changes: Record<string, string | null>) => {
    const entries = headTree();
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) entries.delete(path);
      else entries.set(path, writeBlob(content));
    }
    head = writeCommit(writeTree(entries), head ? [head] : []);
    return head;
  };

  const isAncestor = (ancestor: string, sha: string): boolean => {
    if (ancestor === sha) return true;
    return (commits.get(sha)?.parents ?? []).some((p) =>
      isAncestor(ancestor, p),
    );
  };

  const fileAt = (ref: string, path: string) => {
    const commit = commits.get(ref === "main" ? (head ?? "") : ref);
    const sha = commit ? trees.get(commit.tree)!.get(path) : undefined;
    return sha ? { sha, content: blobs.get(sha)! } : null;
  };

  push(initial);

  const state = {
    beforeRefUpdate: undefined as (() => void) | undefined,
    failBlobs: false,
    /** Tree creations allowed before every later one fails, e.g. 1 fails the second batch. */
    failTreesAfter: undefined as number | undefined,
    failContentWrites: new Set<string>(),
    treesCreated: 0,
    refUpdates: [] as Record<string, unknown>[],
    contentWrites: [] as Record<string, unknown>[],
  };

  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const route = decodeURIComponent(url.pathname).replace(
      "/repos/acme/site",
      "",
    );

    if (route === "/user") return json(200, { login: "editor" });

    if (method === "GET" && route === "/branches/main") {
      if (!head) return json(404, { message: "Branch not found" });
      const tree = commits.get(head)!.tree;
      return json(200, {
        name: "main",
        commit: { sha: head, commit: { tree: { sha: tree } } },
      });
    }

    if (route.startsWith("/contents/")) {
      const path = route.slice("/contents/".length);
      const current = fileAt("main", path);
      if (method === "GET") {
        const file = fileAt(url.searchParams.get("ref") ?? "main", path);
        if (!file) return json(404, { message: "Not Found" });
        return json(200, {
          type: "file",
          sha: file.sha,
          encoding: "base64",
          content: b64(file.content),
        });
      }
      state.contentWrites.push({ method, path, ...body });
      if (state.failContentWrites.has(path))
        return json(422, { message: `Cannot write ${path}` });
      if (current?.sha !== body.sha)
        return json(409, { message: `${path} does not match ${body.sha}` });
      const sha = push({
        [path]: method === "DELETE" ? null : unb64(body.content),
      });
      return json(200, {
        content: method === "DELETE" ? null : { sha: fileAt(sha, path)!.sha },
        commit: { sha },
      });
    }

    if (method === "POST" && route === "/git/blobs") {
      if (state.failBlobs)
        return json(403, { message: "Resource not accessible" });
      return json(201, { sha: writeBlob(body.content) });
    }

    if (method === "POST" && route === "/git/trees") {
      if (
        state.failTreesAfter !== undefined &&
        state.treesCreated >= state.failTreesAfter
      )
        return json(403, { message: "Resource not accessible" });
      state.treesCreated++;
      const entries = new Map(body.base_tree ? trees.get(body.base_tree)! : []);
      for (const entry of body.tree) {
        if (entry.sha === null) entries.delete(entry.path);
        else entries.set(entry.path, entry.sha);
      }
      return json(201, { sha: writeTree(entries) });
    }

    if (method === "POST" && route === "/git/commits") {
      const sha = writeCommit(body.tree, body.parents ?? []);
      return json(201, { sha, tree: { sha: body.tree } });
    }

    if (method === "PATCH" && route === "/git/refs/heads/main") {
      state.refUpdates.push(body);
      const hook = state.beforeRefUpdate;
      state.beforeRefUpdate = undefined;
      hook?.();
      if (!body.force && head && !isAncestor(head, body.sha)) {
        return json(422, { message: "Update is not a fast forward" });
      }
      head = body.sha;
      return json(200, { object: { sha: head } });
    }

    return json(404, { message: `Unhandled ${method} ${route}` });
  };

  return {
    fetch,
    push,
    state,
    fileAt,
    head: () => head!,
    parentsOf: (sha: string) => commits.get(sha)!.parents,
  };
};

// ---------------------------------------------------------------------------
// In-memory GitLab: files API plus the commits endpoint's last_commit_id check.
// ---------------------------------------------------------------------------

export const createFakeGitLab = (initial: Record<string, string>) => {
  const files = new Map<string, { content: string; lastCommit: string }>();
  let seq = 0;
  const commit = (changes: Record<string, string>) => {
    const id = `glcommit${++seq}`;
    for (const [path, content] of Object.entries(changes)) {
      files.set(path, { content, lastCommit: id });
    }
    return id;
  };
  commit(initial);

  const state = {
    beforeCommit: undefined as (() => void) | undefined,
    commitBodies: [] as { actions: Record<string, unknown>[] }[],
  };

  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const route = decodeURIComponent(
      url.pathname.replace("/api/v4/projects/acme%2Fsite", ""),
    );

    if (url.pathname === "/api/v4/user")
      return json(200, { username: "editor" });

    if (route === "/repository/tree") {
      return json(
        200,
        [...files.keys()].map((path) => ({ path, type: "blob" })),
      );
    }

    if (route.startsWith("/repository/files/")) {
      const file = files.get(route.slice("/repository/files/".length));
      if (!file) return json(404, { message: "404 File Not Found" });
      return json(200, {
        blob_id: gitBlobSha(file.content),
        last_commit_id: file.lastCommit,
        encoding: "base64",
        content: b64(file.content),
      });
    }

    if (method === "POST" && route === "/repository/commits") {
      const body = JSON.parse(String(init!.body));
      state.commitBodies.push(body);
      const hook = state.beforeCommit;
      state.beforeCommit = undefined;
      hook?.();
      for (const action of body.actions) {
        const current = files.get(action.file_path);
        if (
          action.last_commit_id &&
          current?.lastCommit !== action.last_commit_id
        ) {
          return json(400, {
            message: `The file has changed since you started editing it: ${action.file_path}`,
          });
        }
      }
      const id = commit(
        Object.fromEntries(
          body.actions.map((a: { file_path: string; content: string }) => [
            a.file_path,
            a.content,
          ]),
        ),
      );
      return json(201, { id });
    }

    return json(404, { message: `Unhandled ${method} ${route}` });
  };

  return {
    fetch,
    commit,
    state,
    read: (path: string) => files.get(path)?.content,
  };
};
