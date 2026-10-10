import { GitEngineError } from "./errors";

export type TPathPolicy = {
  /** Repo-relative roots that may be written; "all" when code edits are allowed. */
  writableRoots: string[] | "all";
};

const MAX_PATH_LENGTH = 1024;

// Writing CI or submodule config could run code with the repository's secrets.
const ALWAYS_BLOCKED = [
  ".github/workflows/",
  ".github/actions/",
  ".gitea/workflows/",
  ".gitea/actions/",
  ".forgejo/workflows/",
  ".forgejo/actions/",
  ".gitlab/ci/",
  ".circleci/",
  ".gitlab-ci.yml",
  ".gitmodules",
  "bitbucket-pipelines.yml",
];

export const normalizeRepoPath = (input: unknown): string => {
  if (typeof input !== "string") {
    throw new GitEngineError("Path must be a string", 400, "invalid");
  }
  if (/[\u0000-\u001f\u007f\\]/.test(input)) {
    throw new GitEngineError(
      `Invalid characters in path: ${JSON.stringify(input)}`,
      400,
      "invalid",
    );
  }
  const segments = input.replace(/^\.\//, "").split("/").filter(Boolean);
  if (
    input.startsWith("/") ||
    segments.length === 0 ||
    segments.some((s) => s === "." || s === ".." || s.toLowerCase() === ".git")
  ) {
    throw new GitEngineError(
      `Invalid path: ${JSON.stringify(input)}`,
      400,
      "invalid",
    );
  }
  const path = segments.join("/");
  if (path.length > MAX_PATH_LENGTH) {
    throw new GitEngineError("Path is too long", 400, "invalid");
  }
  return path;
};

const isUnder = (path: string, root: string) =>
  root === "" || path === root || path.startsWith(`${root}/`);

/** Returns why `path` may not be written, or null when it may. */
export const writeDenial = (
  path: string,
  policy: TPathPolicy,
): string | null => {
  const lower = path.toLowerCase();
  const blocked = ALWAYS_BLOCKED.find((rule) =>
    rule.endsWith("/") ? lower.startsWith(rule) : lower === rule,
  );
  if (blocked) return `${blocked} is never writable through Sitepins`;

  if (policy.writableRoots === "all") return null;
  const roots = policy.writableRoots.map((root) =>
    root === "" || root === "." ? "" : normalizeRepoPath(root),
  );
  return roots.some((root) => isUnder(path, root))
    ? null
    : "outside the folders this caller may write";
};
