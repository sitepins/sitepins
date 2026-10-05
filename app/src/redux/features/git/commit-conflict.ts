/** Path → blob sha the caller's edit was based on; a mismatch refuses the commit. */
export type ExpectedShas = Record<string, string>;

export type CommitConflict = {
  path: string;
  /** Null when the file no longer exists on the branch. */
  remoteSha: string | null;
  remoteContent?: string;
};

export type CommitConflictResult = {
  status: 409;
  message: string;
  conflicts: CommitConflict[];
};

export type RemoteFile = { sha: string; content?: string } | null;

export class CommitConflictError extends Error {
  readonly conflicts: CommitConflict[];

  constructor(conflicts: CommitConflict[]) {
    super(
      `${conflicts.map((c) => c.path).join(", ")} changed in the repository since it was opened.`,
    );
    this.name = "CommitConflictError";
    this.conflicts = conflicts;
  }
}

export const toConflictResult = (
  error: CommitConflictError,
): { error: CommitConflictResult } => ({
  error: { status: 409, message: error.message, conflicts: error.conflicts },
});

export const isCommitConflict = (
  error: unknown,
): error is CommitConflictResult => {
  const err = error as { status?: unknown; conflicts?: unknown } | undefined;
  return err?.status === 409 && Array.isArray(err.conflicts);
};

export const guardedPaths = (
  expectedShas: ExpectedShas | undefined,
  paths: string[],
): string[] =>
  expectedShas ? paths.filter((p) => Boolean(expectedShas[p])) : [];

export const findConflicts = async (
  expectedShas: ExpectedShas | undefined,
  paths: string[],
  readRemote: (path: string) => Promise<RemoteFile>,
): Promise<CommitConflict[]> => {
  const conflicts: CommitConflict[] = [];
  for (const path of guardedPaths(expectedShas, paths)) {
    const remote = await readRemote(path);
    if (remote?.sha === expectedShas![path]) continue;
    conflicts.push({
      path,
      remoteSha: remote?.sha ?? null,
      remoteContent: remote?.content,
    });
  }
  return conflicts;
};

export const assertNoConflicts = async (
  expectedShas: ExpectedShas | undefined,
  paths: string[],
  readRemote: (path: string) => Promise<RemoteFile>,
): Promise<void> => {
  const conflicts = await findConflicts(expectedShas, paths, readRemote);
  if (conflicts.length > 0) throw new CommitConflictError(conflicts);
};
