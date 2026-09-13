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

/**
 * Extracts raw item strings from any text format:
 * - JSON array strings: `["tag1", "tag2"]`
 * - Markdown code blocks (e.g. ```yaml\ntags:\n  - tag1\n  - tag2\n```)
 * - YAML / Markdown bullet lists (`- tag`, `* tag`, `• tag`)
 * - Comma, newline, or semicolon delimited strings
 */
export function extractArrayItemsFromText(text: string): string[] {
  if (!text || typeof text !== "string") return [];

  const trimmed = text.trim();

  // 1. If it's a JSON array string: e.g. ["tag1", "tag2"]
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parseArrayItems(parsed);
      }
    } catch {
      // Fall through to other extraction methods
    }
  }

  // 2. Extract content from markdown code fences if present (e.g. ```yaml ... ```)
  const codeBlockMatch = text.match(/```(?:yaml|json)?\s*([\s\S]*?)\s*```/i);
  const targetText = codeBlockMatch ? codeBlockMatch[1] : text;

  // 3. Extract from YAML/markdown bullet points: e.g. "- tag" or "* tag"
  const bulletMatches = targetText.match(/^\s*[-*•]\s*(.+)$/gm);
  if (bulletMatches && bulletMatches.length > 0) {
    return bulletMatches
      .map((line) =>
        line
          .replace(/^\s*[-*•]\s*/, "")
          .replace(/^["']+|["']+$/g, "")
          .trim(),
      )
      .filter((item) => {
        const lower = item.toLowerCase();
        return (
          Boolean(item) &&
          !lower.endsWith(":") &&
          !lower.startsWith("```") &&
          !["yaml", "json", "tags", "keywords", "categories"].includes(lower)
        );
      });
  }

  // 4. Fallback to delimiter splitting (comma, semicolon, newline)
  return targetText
    .split(/[,;\n]+/)
    .map((item) =>
      item
        .trim()
        .replace(/^[\s\-*•"']+|[\s"']+$/g, "")
        .trim(),
    )
    .filter((item) => {
      const lower = item.toLowerCase();
      return (
        Boolean(item) &&
        !lower.endsWith(":") &&
        !lower.startsWith("```") &&
        !["yaml", "json", "tags", "keywords", "categories"].includes(lower)
      );
    });
}

/**
 * Normalizes any array or text payload into a clean string array.
 */
export function parseArrayItems(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (typeof item === "string") {
          return item.trim().replace(/^["']|["']$/g, "");
        }
        if (typeof item === "object" && item !== null && "value" in item) {
          return String((item as { value: unknown }).value)
            .trim()
            .replace(/^["']|["']$/g, "");
        }
        return String(item).trim();
      })
      .filter(Boolean);
  }

  if (typeof val === "string") {
    return extractArrayItemsFromText(val);
  }

  return [];
}
