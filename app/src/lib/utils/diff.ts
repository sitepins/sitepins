/**
 * Computes a unified Git-style diff between two string versions of a file.
 * Automatically handles common prefixes and suffixes for high performance.
 */
export function computeUnifiedDiff(
  oldStr: string,
  newStr: string,
  fileName = "file",
): {
  diff: string;
  addedLines: number;
  deletedLines: number;
  isNewFile: boolean;
} {
  const oldLines = oldStr ? oldStr.split(/\r?\n/) : [];
  const newLines = newStr ? newStr.split(/\r?\n/) : [];

  if (oldLines.length === 0 && newLines.length > 0) {
    return {
      diff:
        `--- /dev/null\n+++ b/${fileName}\n` +
        newLines.map((l) => `+${l}`).join("\n"),
      addedLines: newLines.length,
      deletedLines: 0,
      isNewFile: true,
    };
  }

  if (oldLines.length > 0 && newLines.length === 0) {
    return {
      diff:
        `--- a/${fileName}\n+++ /dev/null\n` +
        oldLines.map((l) => `-${l}`).join("\n"),
      addedLines: 0,
      deletedLines: oldLines.length,
      isNewFile: false,
    };
  }

  // 1. Strip common prefix lines
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }

  // 2. Strip common suffix lines
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] ===
      newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const midOld = oldLines.slice(prefix, oldLines.length - suffix);
  const midNew = newLines.slice(prefix, newLines.length - suffix);

  if (midOld.length === 0 && midNew.length === 0) {
    return {
      diff: "",
      addedLines: 0,
      deletedLines: 0,
      isNewFile: false,
    };
  }

  // 3. Longest Common Subsequence on changed middle
  const m = midOld.length;
  const n = midNew.length;

  // Protect against DoS / OOM on massive diffs
  const MAX_DP_CELLS = 250_000;
  if (m * n > MAX_DP_CELLS) {
    const diffLines = [
      ...midOld.map((l) => `-${l}`),
      ...midNew.map((l) => `+${l}`),
    ];
    return {
      diff: [
        `--- a/${fileName}`,
        `+++ b/${fileName}`,
        `@@ -${Math.max(1, prefix + 1)},${midOld.length} +${Math.max(1, prefix + 1)},${midNew.length} @@`,
        ...diffLines,
      ].join("\n"),
      addedLines: midNew.length,
      deletedLines: midOld.length,
      isNewFile: false,
    };
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (midOld[i] === midNew[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to assemble diff markers
  let i = m;
  let j = n;
  const diffLines: string[] = [];
  let added = 0;
  let deleted = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && midOld[i - 1] === midNew[j - 1]) {
      diffLines.unshift(` ${midOld[i - 1]}`);
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffLines.unshift(`+${midNew[j - 1]}`);
      added++;
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diffLines.unshift(`-${midOld[i - 1]}`);
      deleted++;
      i--;
    }
  }

  // Add 2 lines of context before and after for LLM comprehension
  const contextBefore = oldLines
    .slice(Math.max(0, prefix - 2), prefix)
    .map((l) => ` ${l}`);
  const contextAfter = oldLines
    .slice(
      oldLines.length - suffix,
      Math.min(oldLines.length, oldLines.length - suffix + 2),
    )
    .map((l) => ` ${l}`);

  const fullDiff = [
    `--- a/${fileName}`,
    `+++ b/${fileName}`,
    `@@ -${Math.max(1, prefix - contextBefore.length + 1)},${contextBefore.length + midOld.length + contextAfter.length} +${Math.max(1, prefix - contextBefore.length + 1)},${contextBefore.length + midNew.length + contextAfter.length} @@`,
    ...contextBefore,
    ...diffLines,
    ...contextAfter,
  ].join("\n");

  return {
    diff: fullDiff,
    addedLines: added,
    deletedLines: deleted,
    isNewFile: false,
  };
}
