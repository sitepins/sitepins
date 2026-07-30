/**
 * mdast type registration for the snippet dialect.
 *
 * The Hugo and JSX transformers rewrite standard mdast trees into a dialect
 * that adds three node types: `shortcode` (Hugo `{{< … >}}` and the serialized
 * form of JSX) and `jsx_block` / `jsx_inline` (PascalCase components lifted out
 * of HTML/text nodes). They are registered with `@types/mdast` here so `visit`,
 * `RootContent` and friends resolve them instead of forcing casts to `any`.
 */
import type { Data, RootContent } from "mdast";
import type { Node, Parent } from "unist";

/** Bookkeeping the transformers attach under `node.data.shortcode`. */
export interface ShortcodeMeta {
  definitionIndex: number;
  start?: string;
  end?: string;
  startContent?: string;
  closingContent?: string;
  name?: string;
  params?: string;
  isBlock?: boolean;
  isClosing?: boolean;
  /** Distinguishes a JSX component serialized as a shortcode from a Hugo one. */
  isJsxComponent?: boolean;
}

/**
 * Hugo shortcode, and the on-disk form of a JSX component.
 *
 * `children` stays optional: inline shortcodes are created without one, and
 * `mergeBlockShortcodes` fills it in only once a closing tag is matched.
 */
export interface ShortcodeNode extends Node {
  type: "shortcode";
  content: string;
  children?: RootContent[];
  data?: Data;
}

/**
 * A PascalCase component. `type` stays a mutable union: the transformer
 * promotes inline nodes to block in place once it knows the surroundings.
 */
export interface JsxNode extends Parent {
  type: "jsx_block" | "jsx_inline";
  /** Component name, e.g. `Notice`. */
  name: string;
  attributes: Record<string, unknown>;
  /** The opening tag as written, e.g. `<Notice type="warn">`. */
  content: string;
  value?: string;
  isSelfClosing: boolean;
  closingTag?: string;
  children: RootContent[];
  data?: Data;
}

/**
 * Both custom kinds are registered as block *and* phrasing content: mid-pass
 * the tree legitimately holds a block shortcode inside a paragraph, which the
 * lifting passes then hoist out.
 */
declare module "mdast" {
  interface RootContentMap {
    shortcode: ShortcodeNode;
    jsx_block: JsxNode;
    jsx_inline: JsxNode;
  }

  interface BlockContentMap {
    shortcode: ShortcodeNode;
    jsx_block: JsxNode;
  }

  interface PhrasingContentMap {
    shortcode: ShortcodeNode;
    jsx_block: JsxNode;
    jsx_inline: JsxNode;
  }

  interface Data {
    shortcode?: ShortcodeMeta;
    /** Set by the html transformer when a tag was found mid-paragraph. */
    isInlineHtml?: boolean;
    hName?: string;
    hProperties?: Record<string, unknown>;
  }
}

/**
 * Reads `.value` off any literal-ish node (`text`, `html`, `code`, …).
 *
 * The transformers walk heterogeneous children where only some members carry a
 * value; this returns `""` for the rest rather than narrowing at every site.
 */
export function nodeValue(node: Node | undefined | null): string {
  if (!node || !("value" in node)) return "";
  const { value } = node as { value?: unknown };
  return typeof value === "string" ? value : "";
}

/**
 * Reads the shortcode bookkeeping off a node.
 *
 * Works on plain `unist` nodes too: the transformers and the `toMarkdown`
 * handlers walk trees typed as `unist.Node`, whose `data` is the un-augmented
 * base interface.
 */
export function shortcodeMetaOf(
  node: Node | undefined | null,
): ShortcodeMeta | undefined {
  const data = node?.data as { shortcode?: ShortcodeMeta } | undefined;
  return data?.shortcode;
}
