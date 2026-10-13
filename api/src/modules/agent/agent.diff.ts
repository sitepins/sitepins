const CONTEXT = 3;
// Beyond this many line pairs the middle is shown as replaced wholesale.
const MAX_LCS_CELLS = 4_000_000;

type TOp = { kind: " " | "-" | "+"; text: string };

const lineOps = (a: string[], b: string[]): TOp[] => {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const head = a.slice(0, start).map((text): TOp => ({ kind: " ", text }));
  const tail = a.slice(endA).map((text): TOp => ({ kind: " ", text }));
  if (midA.length * midB.length > MAX_LCS_CELLS) {
    return [
      ...head,
      ...midA.map((text): TOp => ({ kind: "-", text })),
      ...midB.map((text): TOp => ({ kind: "+", text })),
      ...tail,
    ];
  }
  const n = midA.length;
  const m = midB.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        midA[i] === midB[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const mid: TOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && midA[i] === midB[j]) {
      mid.push({ kind: " ", text: midA[i] });
      i++;
      j++;
    } else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) {
      mid.push({ kind: "-", text: midA[i++] });
    } else {
      mid.push({ kind: "+", text: midB[j++] });
    }
  }
  return [...head, ...mid, ...tail];
};

/** Unified diff of two texts, hunks only (no file header). */
export const unifiedDiff = (before: string, after: string) => {
  const lines = (text: string) =>
    text ? text.replace(/\n$/, "").split("\n") : [];
  const ops = lineOps(lines(before), lines(after));
  const changed = ops
    .map((op, i) => (op.kind === " " ? -1 : i))
    .filter((i) => i !== -1);
  if (!changed.length) return "";
  const out: string[] = [];
  let oldLine = 1;
  let newLine = 1;
  const positions = ops.map((op) => {
    const at = { old: oldLine, new: newLine };
    if (op.kind !== "+") oldLine++;
    if (op.kind !== "-") newLine++;
    return at;
  });
  let c = 0;
  while (c < changed.length) {
    const first = changed[c];
    let last = first;
    while (c + 1 < changed.length && changed[c + 1] - last <= CONTEXT * 2) {
      last = changed[++c];
    }
    c++;
    const start = Math.max(0, first - CONTEXT);
    const end = Math.min(ops.length, last + CONTEXT + 1);
    const slice = ops.slice(start, end);
    const oldCount = slice.filter((op) => op.kind !== "+").length;
    const newCount = slice.filter((op) => op.kind !== "-").length;
    const oldStart = oldCount ? positions[start].old : positions[start].old - 1;
    const newStart = newCount ? positions[start].new : positions[start].new - 1;
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const op of slice) out.push(`${op.kind}${op.text}`);
  }
  return out.join("\n");
};
