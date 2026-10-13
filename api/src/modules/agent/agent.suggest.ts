const MAX_COMPARED = 200;

/** Edit distance, giving up (returning max + 1) once it can't stay within `max`. */
export const editDistance = (a: string, b: string, max = Infinity) => {
  a = a.slice(0, MAX_COMPARED);
  b = b.slice(0, MAX_COMPARED);
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
};

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const stem = (name: string) => name.replace(/\.[^.]+$/, "");

/** Paths that look like the one asked for: same file name first, then by spelling. */
export const closestPaths = (wanted: string, paths: string[], limit = 5) => {
  const name = baseName(wanted).toLowerCase();
  const max = Math.max(2, Math.floor(name.length / 2));
  const scored: { path: string; rank: number; distance: number }[] = [];
  for (const path of paths) {
    if (path === wanted) continue;
    const other = baseName(path).toLowerCase();
    const sameName = other === name || stem(other) === stem(name);
    const distance = sameName
      ? editDistance(wanted, path, wanted.length)
      : editDistance(name, other, max);
    if (!sameName && distance > max) continue;
    scored.push({ path, rank: sameName ? 0 : 1, distance });
  }
  return scored
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.distance - b.distance ||
        a.path.localeCompare(b.path),
    )
    .slice(0, limit)
    .map((s) => s.path);
};

const normalizeLine = (line: string) =>
  line
    .replace(/[‘’“”`"]/g, "'")
    .replace(/\s+/g, "")
    .toLowerCase();

/** Lines of `text` most like the first non-blank line of `needle`, ignoring whitespace and quote style. */
export const closestLines = (text: string, needle: string, limit = 3) => {
  const target = normalizeLine(
    needle.split("\n").find((l) => l.trim()) ?? needle,
  );
  if (!target) return [];
  const max = Math.ceil(target.length * 0.6);
  return text
    .split("\n")
    .map((line, i) => {
      const normalized = normalizeLine(line);
      const distance = normalized.includes(target)
        ? 0
        : editDistance(target, normalized, max);
      return { line: i + 1, text: line.trim().slice(0, 200), distance };
    })
    .filter((l) => l.text && l.distance <= max)
    .sort((a, b) => a.distance - b.distance || a.line - b.line)
    .slice(0, limit)
    .map(({ line, text }) => ({ line, text }));
};
