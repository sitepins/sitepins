/**
 * Frontmatter values reach the editor either raw (as parsed from the file) or
 * wrapped as `{ value, id }` by the form layer. Readers have to handle both.
 */

export type TWrappedValue = { value?: unknown; id?: string };

export const isWrappedValue = (value: unknown): value is TWrappedValue =>
  typeof value === "object" && value !== null && "value" in value;

/** Unwraps `{ value }` to its payload, recursively. Raw values pass through. */
export const unwrapValue = (value: unknown): unknown =>
  isWrappedValue(value) ? unwrapValue(value.value) : value;

/** The array a field holds, whether stored raw or wrapped. */
export const arrayValue = (value: unknown): unknown[] | undefined => {
  const inner = unwrapValue(value);
  return Array.isArray(inner) ? inner : undefined;
};

export const stringValue = (value: unknown): string | undefined => {
  const inner = unwrapValue(value);
  return typeof inner === "string" ? inner : undefined;
};

/** The record a nested field holds, for recursing into sub-schemas. */
export const recordValue = (
  value: unknown,
): Record<string, unknown> | undefined => {
  const inner = unwrapValue(value);
  return typeof inner === "object" && inner !== null && !Array.isArray(inner)
    ? (inner as Record<string, unknown>)
    : undefined;
};

/** A node reached while walking the frontmatter tree by string path. */
export type TMutableNode = Record<string | number, unknown>;

/** Treats a walked value as a mutable node; non-objects become empty. */
export const asNode = (value: unknown): TMutableNode =>
  (typeof value === "object" && value !== null ? value : {}) as TMutableNode;

/** The stable `id` the form layer attaches to a wrapped value. */
export const idOf = (value: unknown): string | undefined => {
  const id = asNode(value).id;
  return typeof id === "string" ? id : undefined;
};

/** The array at `key`, or undefined when it holds something else. */
export const arrayAt = (
  node: TMutableNode,
  key: string | number,
): unknown[] | undefined =>
  Array.isArray(node[key]) ? (node[key] as unknown[]) : undefined;
