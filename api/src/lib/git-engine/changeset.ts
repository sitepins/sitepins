import { createHash } from "node:crypto";
import { GitEngineError } from "./errors";
import { normalizeRepoPath, TPathPolicy, writeDenial } from "./path-policy";
import { TCommitIdentity, TFileChange, TGitClient } from "./types";

export type TChangesetChange =
  | { op: "upsert"; path: string; content: Buffer }
  | { op: "delete"; path: string }
  | { op: "rename"; from: string; path: string; content?: Buffer };

export type TApplyChangesetInput = {
  /** Commit the caller's copy is based on; changes upstream since then conflict. */
  baseCommit?: string;
  /** Blob sha each path is expected to have at the head; null = must not exist. */
  expectedShas?: Record<string, string | null>;
  changes: TChangesetChange[];
  message: string;
  author?: TCommitIdentity;
  policy: TPathPolicy;
  limits?: { maxFiles?: number; maxFileBytes?: number; maxTotalBytes?: number };
  dryRun?: boolean;
};

export type TFileConflict = {
  path: string;
  remoteSha: string | null;
  remoteContentBase64: string | null;
};

export type TPlannedChange = {
  op: "upsert" | "delete";
  path: string;
  bytes?: number;
  /** Whether the path held a file at the head the change applies to. */
  existed: boolean;
};

export type TApplyChangesetResult =
  | {
      status: "committed";
      commitSha: string;
      parentSha: string;
      changes: TPlannedChange[];
    }
  | { status: "dry_run"; headSha: string; changes: TPlannedChange[] }
  | { status: "noop"; headSha: string }
  | { status: "conflict"; headSha: string; conflicts: TFileConflict[] };

export type TPolicyViolation = { path: string; reason: string };

export class ChangesetPolicyError extends GitEngineError {
  constructor(readonly violations: TPolicyViolation[]) {
    super(
      `${violations.length} path(s) can't be written: ${violations
        .map((v) => `${v.path} (${v.reason})`)
        .join("; ")}`,
      403,
      "policy",
    );
  }
}

const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/i;
const DEFAULT_LIMITS = {
  maxFiles: 100,
  maxFileBytes: 25 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
};
const MAX_ATTEMPTS = 3;

const planned = (
  changes: TFileChange[],
  present: Map<string, string | null>,
): TPlannedChange[] =>
  changes.map((c) => {
    const existed = Boolean(present.get(c.path));
    return c.op === "upsert"
      ? { op: "upsert", path: c.path, bytes: c.content.length, existed }
      : { op: "delete", path: c.path, existed };
  });

export const gitBlobSha = (content: Buffer) =>
  createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${content.length}\0`), content]))
    .digest("hex");

/** Validates every path up front so a changeset is accepted or refused as a whole. */
const normalizeChanges = (input: TApplyChangesetInput) => {
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const violations: TPolicyViolation[] = [];
  const check = (raw: unknown) => {
    const path = normalizeRepoPath(raw);
    const reason = writeDenial(path, input.policy);
    if (reason) violations.push({ path, reason });
    return path;
  };

  const renames: { from: string; path: string; content?: Buffer }[] = [];
  const changes: TFileChange[] = [];
  for (const change of input.changes) {
    if (change.op === "rename") {
      renames.push({
        from: check(change.from),
        path: check(change.path),
        content: change.content,
      });
    } else if (change.op === "delete") {
      changes.push({ op: "delete", path: check(change.path) });
    } else {
      changes.push({
        op: "upsert",
        path: check(change.path),
        content: change.content,
      });
    }
  }
  if (violations.length) throw new ChangesetPolicyError(violations);

  const touched = [
    ...changes.map((c) => c.path),
    ...renames.flatMap((r) => [r.from, r.path]),
  ];
  const duplicate = touched.find((p, i) => touched.indexOf(p) !== i);
  if (duplicate) {
    throw new GitEngineError(
      `${duplicate} appears more than once`,
      400,
      "invalid",
    );
  }
  if (touched.length === 0) {
    throw new GitEngineError("The changeset is empty", 400, "invalid");
  }
  if (touched.length > limits.maxFiles) {
    throw new GitEngineError(
      `At most ${limits.maxFiles} files per commit`,
      413,
      "too_large",
    );
  }
  let total = 0;
  for (const c of [...changes, ...renames]) {
    const bytes = "content" in c && c.content ? c.content.length : 0;
    if (bytes > limits.maxFileBytes) {
      throw new GitEngineError(
        `${c.path} is larger than ${limits.maxFileBytes} bytes`,
        413,
        "too_large",
      );
    }
    total += bytes;
  }
  if (total > limits.maxTotalBytes) {
    throw new GitEngineError(
      `The changeset is larger than ${limits.maxTotalBytes} bytes`,
      413,
      "too_large",
    );
  }
  return { changes, renames, touched };
};

const conflictsAt = async (
  client: TGitClient,
  head: string,
  paths: string[],
): Promise<TFileConflict[]> =>
  Promise.all(
    paths.map(async (path) => {
      const file = await client.readFile(head, path);
      return {
        path,
        remoteSha: file?.sha ?? null,
        remoteContentBase64: file ? file.content.toString("base64") : null,
      };
    }),
  );

const overlapSince = async (
  client: TGitClient,
  from: string,
  to: string,
  touched: string[],
): Promise<string[]> => {
  const changed = await client.changedPaths(from, to);
  if (changed === "diverged") {
    throw new GitEngineError(
      `Your copy is based on a commit that isn't on ${client.branch}. Pull and try again.`,
      409,
      "diverged",
    );
  }
  return touched.filter((p) => changed.has(p));
};

export async function applyChangeset(
  client: TGitClient,
  input: TApplyChangesetInput,
): Promise<TApplyChangesetResult> {
  if (input.baseCommit !== undefined && !SHA.test(input.baseCommit)) {
    throw new GitEngineError(
      "baseCommit must be a full commit sha",
      400,
      "invalid",
    );
  }
  const { changes: direct, renames, touched } = normalizeChanges(input);

  let head = await client.readHead();
  if (!head) {
    throw new GitEngineError(
      `Branch ${client.branch} doesn't exist or the repository is empty`,
      404,
      "not_found",
    );
  }

  const conflicting = new Set<string>();
  if (input.baseCommit && input.baseCommit !== head) {
    for (const p of await overlapSince(
      client,
      input.baseCommit,
      head,
      touched,
    )) {
      conflicting.add(p);
    }
  }
  if (input.expectedShas) {
    const expected = Object.entries(input.expectedShas).map(
      ([p, sha]) => [normalizeRepoPath(p), sha] as const,
    );
    const actual = await client.statFiles(
      head,
      expected.map(([p]) => p),
    );
    for (const [p, sha] of expected) {
      if ((actual.get(p) ?? null) !== sha) conflicting.add(p);
    }
  }
  if (conflicting.size) {
    return {
      status: "conflict",
      headSha: head,
      conflicts: await conflictsAt(client, head, [...conflicting]),
    };
  }

  const changes: TFileChange[] = [...direct];
  for (const rename of renames) {
    const content =
      rename.content ?? (await client.readFile(head, rename.from))?.content;
    if (!content) {
      throw new GitEngineError(
        `${rename.from} doesn't exist`,
        404,
        "not_found",
      );
    }
    changes.push(
      { op: "delete", path: rename.from },
      { op: "upsert", path: rename.path, content },
    );
  }

  const present = await client.statFiles(
    head,
    changes.map((c) => c.path),
  );
  // Deleting a missing file or rewriting identical bytes changes nothing.
  const effective = changes.filter((c) =>
    c.op === "delete"
      ? present.get(c.path)
      : present.get(c.path) !== gitBlobSha(c.content),
  );
  if (effective.length === 0) return { status: "noop", headSha: head };
  if (input.dryRun)
    return {
      status: "dry_run",
      headSha: head,
      changes: planned(effective, present),
    };

  for (let attempt = 1; ; attempt++) {
    try {
      const commitSha = await client.commit({
        parent: head,
        changes: effective,
        message: input.message,
        author: input.author,
      });
      return {
        status: "committed",
        commitSha,
        parentSha: head,
        changes: planned(effective, present),
      };
    } catch (error) {
      if (!(error instanceof GitEngineError) || error.code !== "ref_moved")
        throw error;
      if (attempt >= MAX_ATTEMPTS) {
        throw new GitEngineError(
          "The branch is changing too quickly; try again",
          409,
          "busy",
        );
      }
      const previous: string = head;
      const next = await client.readHead();
      if (!next)
        throw new GitEngineError(
          `Branch ${client.branch} was deleted`,
          404,
          "not_found",
        );
      head = next;
      const overlap = await overlapSince(client, previous, head, touched);
      if (overlap.length) {
        return {
          status: "conflict",
          headSha: head,
          conflicts: await conflictsAt(client, head, overlap),
        };
      }
    }
  }
}

// A newline in a caller-supplied value could forge extra trailers.
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

export const buildCommitMessage = ({
  message,
  description,
  trailers = [],
}: {
  message: string;
  description?: string;
  trailers?: [string, string][];
}): string => {
  const lines = trailers
    .map(([key, value]) => [key, oneLine(value)])
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`);
  return [oneLine(message), description?.trim(), lines.join("\n")]
    .filter(Boolean)
    .join("\n\n");
};
