import { createHash } from "node:crypto";

type TCommit = {
  tree: Map<string, string>;
  parents: string[];
  message: string;
  author?: unknown;
};

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const blobSha = (content: Buffer) =>
  createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${content.length}\0`), content]))
    .digest("hex");

/** Commit graph shared by both fakes; enough git to exercise the engine. */
const createRepo = (branch: string, initial: Record<string, string>) => {
  const blobs = new Map<string, Buffer>();
  const commits = new Map<string, TCommit>();
  const refs = new Map<string, string>();
  let seq = 0;

  const writeBlob = (content: Buffer) => {
    const sha = blobSha(content);
    blobs.set(sha, content);
    return sha;
  };
  const writeCommit = (commit: TCommit) => {
    const sha = createHash("sha1").update(`commit${++seq}`).digest("hex");
    commits.set(sha, commit);
    return sha;
  };
  const resolve = (ref: string) =>
    refs.get(ref) ?? (commits.has(ref) ? ref : undefined);
  const treeAt = (ref: string) => {
    const sha = resolve(ref);
    return sha ? commits.get(sha)!.tree : undefined;
  };
  const isAncestor = (ancestor: string, sha: string): boolean =>
    ancestor === sha ||
    (commits.get(sha)?.parents ?? []).some((p) => isAncestor(ancestor, p));

  /** Simulates someone else pushing to the branch. */
  const push = (
    changes: Record<string, string | null>,
    message = "external",
  ) => {
    const parent = refs.get(branch);
    const tree = new Map(parent ? commits.get(parent)!.tree : []);
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) tree.delete(path);
      else tree.set(path, writeBlob(Buffer.from(content)));
    }
    const sha = writeCommit({ tree, parents: parent ? [parent] : [], message });
    refs.set(branch, sha);
    return sha;
  };

  const lastCommitFor = (ref: string, path: string): string | undefined => {
    let sha = resolve(ref);
    while (sha) {
      const commit = commits.get(sha)!;
      const parent = commit.parents[0];
      const before = parent ? commits.get(parent)!.tree.get(path) : undefined;
      if (commit.tree.get(path) !== before) return sha;
      sha = parent;
    }
    return undefined;
  };

  push(initial, "initial");

  return {
    blobs,
    commits,
    refs,
    writeBlob,
    writeCommit,
    resolve,
    treeAt,
    isAncestor,
    push,
    lastCommitFor,
    head: () => refs.get(branch)!,
    text: (path: string, ref = branch) => {
      const sha = treeAt(ref)?.get(path);
      return sha ? blobs.get(sha)!.toString() : null;
    },
    lastCommit: () => commits.get(refs.get(branch)!)!,
    history: (ref: string, path?: string) => {
      const out: string[] = [];
      let sha = resolve(ref);
      while (sha) {
        const commit = commits.get(sha)!;
        const parent = commit.parents[0];
        const before = parent
          ? commits.get(parent)!.tree.get(path ?? "")
          : undefined;
        if (!path || commit.tree.get(path) !== before) out.push(sha);
        sha = parent;
      }
      return out;
    },
  };
};

export const createFakeGitHub = (
  initial: Record<string, string>,
  { owner = "acme", repo = "site", branch = "main" } = {},
) => {
  const git = createRepo(branch, initial);
  const state = {
    requests: [] as string[],
    beforeRefUpdate: undefined as (() => void) | undefined,
    authHeader: undefined as string | undefined,
    pulls: [] as { number: number; head: string; base: string }[],
  };
  const prefix = `/repos/${owner}/${repo}`;

  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    state.authHeader = (init?.headers as Record<string, string>)?.Authorization;
    state.requests.push(`${method} ${url.pathname}`);
    if (!url.pathname.startsWith(prefix))
      return json(404, { message: "Not Found" });
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    const ref = url.searchParams.get("ref") ?? branch;

    let m: RegExpMatchArray | null;
    if (method === "GET" && (m = path.match(/^\/branches\/(.+)$/))) {
      const sha = git.refs.get(m[1]);
      return sha
        ? json(200, { commit: { sha } })
        : json(404, { message: "Branch not found" });
    }
    if (method === "GET" && (m = path.match(/^\/contents\/?(.*)$/))) {
      const tree = git.treeAt(ref);
      if (!tree) return json(404, { message: "No commit found for the ref" });
      const target = m[1];
      const sha = tree.get(target);
      if (sha) {
        return json(200, {
          type: "file",
          path: target,
          sha,
          encoding: "base64",
          content: git.blobs.get(sha)!.toString("base64"),
        });
      }
      const dirPrefix = target ? `${target}/` : "";
      const children = [...tree].filter(
        ([p]) =>
          p.startsWith(dirPrefix) && !p.slice(dirPrefix.length).includes("/"),
      );
      if (!children.length) return json(404, { message: "Not Found" });
      return json(
        200,
        children.map(([p, s]) => ({
          name: p.slice(dirPrefix.length),
          path: p,
          sha: s,
          type: "file",
        })),
      );
    }
    if (method === "GET" && (m = path.match(/^\/git\/blobs\/(.+)$/))) {
      const blob = git.blobs.get(m[1]);
      return blob
        ? json(200, { content: blob.toString("base64"), encoding: "base64" })
        : json(404, {});
    }
    if (method === "GET" && (m = path.match(/^\/git\/trees\/(.+)$/))) {
      const tree = git.treeAt(m[1]);
      if (!tree) return json(404, {});
      return json(200, {
        truncated: false,
        tree: [...tree].map(([p, s]) => ({ path: p, type: "blob", sha: s })),
      });
    }
    if (method === "GET" && (m = path.match(/^\/git\/commits\/(.+)$/))) {
      const commit = git.commits.get(m[1]);
      return commit
        ? json(200, { sha: m[1], tree: { sha: `tree:${m[1]}` } })
        : json(404, {});
    }
    if (method === "GET" && (m = path.match(/^\/compare\/(.+)\.\.\.(.+)$/))) {
      const [base, head] = [git.resolve(m[1]), git.resolve(m[2])];
      if (!base || !head) return json(404, { message: "Not Found" });
      const status =
        base === head
          ? "identical"
          : git.isAncestor(base, head)
            ? "ahead"
            : git.isAncestor(head, base)
              ? "behind"
              : "diverged";
      const [a, b] = [git.commits.get(base)!.tree, git.commits.get(head)!.tree];
      const files = [...new Set([...a.keys(), ...b.keys()])]
        .filter((p) => a.get(p) !== b.get(p))
        .map((filename) => ({ filename }));
      return json(200, { status, files });
    }
    if (method === "POST" && path === "/git/blobs") {
      return json(201, {
        sha: git.writeBlob(Buffer.from(body.content, "base64")),
      });
    }
    if (method === "POST" && path === "/git/trees") {
      const base = git.commits.get(
        String(body.base_tree).replace(/^tree:/, ""),
      )!.tree;
      const tree = new Map(base);
      for (const entry of body.tree) {
        if (entry.sha === null) tree.delete(entry.path);
        else tree.set(entry.path, entry.sha);
      }
      const holder = git.writeCommit({ tree, parents: [], message: "<tree>" });
      return json(201, { sha: `tree:${holder}` });
    }
    if (method === "POST" && path === "/git/commits") {
      const tree = git.commits.get(
        String(body.tree).replace(/^tree:/, ""),
      )!.tree;
      const sha = git.writeCommit({
        tree,
        parents: body.parents,
        message: body.message,
        author: body.author,
      });
      return json(201, { sha });
    }
    if (method === "PATCH" && (m = path.match(/^\/git\/refs\/heads\/(.+)$/))) {
      state.beforeRefUpdate?.();
      state.beforeRefUpdate = undefined;
      const current = git.refs.get(m[1]);
      if (current && !body.force && !git.isAncestor(current, body.sha)) {
        return json(422, { message: "Update is not a fast forward" });
      }
      git.refs.set(m[1], body.sha);
      return json(200, { object: { sha: body.sha } });
    }
    if (method === "GET" && path === "/commits") {
      const shas = git.history(
        url.searchParams.get("sha") ?? branch,
        url.searchParams.get("path") ?? undefined,
      );
      return json(
        200,
        shas
          .slice(0, Number(url.searchParams.get("per_page") ?? 30))
          .map((sha) => ({
            sha,
            commit: {
              message: git.commits.get(sha)!.message,
              author: { name: "dev", date: "2026-01-01T00:00:00Z" },
            },
          })),
      );
    }
    if (method === "POST" && path === "/git/refs") {
      const name = String(body.ref).replace(/^refs\/heads\//, "");
      if (git.refs.has(name))
        return json(422, { message: "Reference already exists" });
      git.refs.set(name, body.sha);
      return json(201, { ref: body.ref });
    }
    if (method === "GET" && path === "/pulls") {
      const head = url.searchParams.get("head")?.split(":")[1];
      return json(
        200,
        state.pulls
          .filter(
            (p) => p.head === head && p.base === url.searchParams.get("base"),
          )
          .map((p) => ({
            number: p.number,
            html_url: `https://github.test/pull/${p.number}`,
          })),
      );
    }
    if (method === "POST" && path === "/pulls") {
      const pull = {
        number: state.pulls.length + 1,
        head: body.head,
        base: body.base,
      };
      state.pulls.push(pull);
      return json(201, {
        number: pull.number,
        html_url: `https://github.test/pull/${pull.number}`,
      });
    }
    return json(404, { message: `unhandled ${method} ${path}` });
  }) as typeof fetch;

  return { git, state, fetchImpl, repository: `${owner}/${repo}`, branch };
};

export const createFakeGitLab = (
  initial: Record<string, string>,
  { project = "group/site", branch = "main" } = {},
) => {
  const git = createRepo(branch, initial);
  const state = {
    requests: [] as string[],
    beforeCommit: undefined as (() => void) | undefined,
    commitBodies: [] as Record<string, unknown>[],
    mergeRequests: [] as { iid: number; source: string; target: string }[],
  };
  const projectPrefix = `/api/v4/projects/${encodeURIComponent(project)}`;
  const prefix = `${projectPrefix}/repository`;

  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const raw = String(input);
    const url = new URL(raw);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    state.requests.push(`${method} ${url.pathname}`);
    const rawPath = raw.slice(raw.indexOf("/api/v4")).split("?")[0];
    if (rawPath === `${projectPrefix}/merge_requests`) {
      if (method === "POST") {
        const mr = {
          iid: state.mergeRequests.length + 1,
          source: body.source_branch,
          target: body.target_branch,
        };
        state.mergeRequests.push(mr);
        return json(201, {
          iid: mr.iid,
          web_url: `https://gitlab.test/mr/${mr.iid}`,
        });
      }
      return json(
        200,
        state.mergeRequests
          .filter(
            (m) =>
              m.source === url.searchParams.get("source_branch") &&
              m.target === url.searchParams.get("target_branch"),
          )
          .map((m) => ({
            iid: m.iid,
            web_url: `https://gitlab.test/mr/${m.iid}`,
          })),
      );
    }
    if (!rawPath.startsWith(prefix))
      return json(404, { message: "404 Project Not Found" });
    const path = rawPath.slice(prefix.length);
    const ref = url.searchParams.get("ref") ?? branch;

    let m: RegExpMatchArray | null;
    if (method === "GET" && (m = path.match(/^\/branches\/(.+)$/))) {
      const sha = git.refs.get(decodeURIComponent(m[1]));
      return sha
        ? json(200, { commit: { id: sha } })
        : json(404, { message: "404 Branch Not Found" });
    }
    if ((m = path.match(/^\/files\/(.+)$/))) {
      const filePath = decodeURIComponent(m[1]);
      const sha = git.treeAt(ref)?.get(filePath);
      if (!sha) return json(404, { message: "404 File Not Found" });
      const headers = {
        "x-gitlab-blob-id": sha,
        "x-gitlab-last-commit-id": git.lastCommitFor(ref, filePath)!,
      };
      if (method === "HEAD")
        return new Response(null, { status: 200, headers });
      return json(
        200,
        {
          content: git.blobs.get(sha)!.toString("base64"),
          encoding: "base64",
          blob_id: sha,
          last_commit_id: headers["x-gitlab-last-commit-id"],
        },
        headers,
      );
    }
    if (method === "GET" && path === "/merge_base") {
      const [a, b] = url.searchParams
        .getAll("refs[]")
        .map((r) => git.resolve(r));
      if (!a || !b) return json(400, { message: "Invalid refs" });
      if (git.isAncestor(a, b)) return json(200, { id: a });
      if (git.isAncestor(b, a)) return json(200, { id: b });
      return json(200, { id: "0".repeat(40) });
    }
    if (method === "GET" && path === "/compare") {
      const a = git.treeAt(url.searchParams.get("from")!)!;
      const b = git.treeAt(url.searchParams.get("to")!)!;
      const diffs = [...new Set([...a.keys(), ...b.keys()])]
        .filter((p) => a.get(p) !== b.get(p))
        .map((p) => ({ old_path: p, new_path: p }));
      return json(200, { diffs, compare_timeout: false });
    }
    if (method === "GET" && path === "/tree") {
      const tree = git.treeAt(ref);
      if (!tree) return json(404, {});
      const dir = url.searchParams.get("path");
      const entries = [...tree]
        .filter(([p]) => !dir || p.startsWith(`${dir}/`))
        .map(([p, s]) => ({ path: p, type: "blob", id: s }));
      return json(200, entries, { "x-next-page": "" });
    }
    if (method === "GET" && path === "/commits") {
      const shas = git.history(
        url.searchParams.get("ref_name") ?? branch,
        url.searchParams.get("path") ?? undefined,
      );
      return json(
        200,
        shas
          .slice(0, Number(url.searchParams.get("per_page") ?? 20))
          .map((id) => ({
            id,
            message: git.commits.get(id)!.message,
            author_name: "dev",
            created_at: "2026-01-01T00:00:00Z",
          })),
      );
    }
    if (method === "POST" && path === "/branches") {
      const name = url.searchParams.get("branch")!;
      if (git.refs.has(name))
        return json(400, { message: "Branch already exists" });
      git.refs.set(name, git.resolve(url.searchParams.get("ref")!)!);
      return json(201, { name });
    }
    if (method === "POST" && path === "/commits") {
      state.beforeCommit?.();
      state.beforeCommit = undefined;
      state.commitBodies.push(body);
      const parent = git.refs.get(body.branch)!;
      const tree = new Map(git.commits.get(parent)!.tree);
      for (const action of body.actions) {
        const exists = tree.has(action.file_path);
        if (action.action === "create" && exists) {
          return json(400, { message: "A file with this name already exists" });
        }
        if (action.action !== "create" && !exists) {
          return json(400, { message: "A file with this name doesn't exist" });
        }
        if (
          action.last_commit_id &&
          git.lastCommitFor(parent, action.file_path) !== action.last_commit_id
        ) {
          return json(400, {
            message:
              "You are attempting to update a file that has changed since you started editing it.",
          });
        }
        if (action.action === "delete") tree.delete(action.file_path);
        else
          tree.set(
            action.file_path,
            git.writeBlob(Buffer.from(action.content, "base64")),
          );
      }
      const sha = git.writeCommit({
        tree,
        parents: [parent],
        message: body.commit_message,
        author: body.author_name
          ? { name: body.author_name, email: body.author_email }
          : undefined,
      });
      git.refs.set(body.branch, sha);
      return json(201, { id: sha });
    }
    return json(404, { message: `unhandled ${method} ${path}` });
  }) as typeof fetch;

  return {
    git,
    state,
    fetchImpl,
    repository: project,
    branch,
    apiBase: "https://gitlab.test/api/v4",
  };
};
