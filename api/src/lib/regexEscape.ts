// Escapes regex metacharacters so user-supplied search input is matched
// literally inside a MongoDB `$regex` query. Without this a crafted pattern
// (e.g. long nested quantifiers) can cause catastrophic backtracking / ReDoS,
// and metacharacters silently change the search semantics.
//
// The length cap bounds worst-case matching cost on very long inputs.
const MAX_LEN = 200;

export const escapeRegex = (input: unknown): string =>
  String(input ?? "")
    .slice(0, MAX_LEN)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
