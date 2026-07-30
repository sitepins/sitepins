import type {
  DeserializeMdOptions,
  MdDecoration,
  MdRootContent,
  SerializeMdOptions,
} from "@platejs/markdown";
import {
  convertNodesDeserialize,
  convertNodesSerialize,
} from "@platejs/markdown";
import type { Descendant, TElement, TText } from "platejs";
import type { ShortcodeMeta } from "../snippet-mdast";
import { parseJsxString } from "./jsx-parser";
import { KEY_JSX_BLOCK, KEY_JSX_INLINE } from "../snippet-keys";

/** The Slate element the JSX plugins render. */
export interface JsxSlateElement extends TElement {
  type: typeof KEY_JSX_BLOCK | typeof KEY_JSX_INLINE;
  name: string;
  attributes: Record<string, unknown>;
  content: string;
  isSelfClosing: boolean;
}

/**
 * The mdast side of a JSX component. It travels as a `shortcode` node (see
 * `serializeJsx`), but older trees may still carry the transformer's own
 * `jsx_block` / `jsx_inline` shape, so both sets of fields are optional here.
 */
type JsxMdastNode = {
  content?: string;
  data?: { shortcode?: ShortcodeMeta };
  name?: string;
  attributes?: Record<string, unknown>;
  isSelfClosing?: boolean;
  children?: MdRootContent[];
};

/**
 * Checks if a shortcode mdast node represents a JSX component
 */
export function isJsxComponent(mdastNode: JsxMdastNode): boolean {
  return Boolean(mdastNode.data?.shortcode?.isJsxComponent);
}

/**
 * Deserializes a JSX component from a shortcode mdast node
 *
 * This is used when JSX components are saved as "shortcode" type nodes
 * (with isJsxComponent flag) and need to be deserialized back to JSX types.
 *
 * This happens because jsx-serialization.ts serializes JSX as "shortcode" type
 * to maintain compatibility with the markdown format.
 */
export function deserializeJsxFromShortcode(
  mdastNode: JsxMdastNode,
  deco: MdDecoration,
  options: DeserializeMdOptions,
): JsxSlateElement {
  const shortcodeMeta: Partial<ShortcodeMeta> = mdastNode.data?.shortcode ?? {};

  const content = shortcodeMeta.startContent || mdastNode.content || "";
  const hasMdastChildren =
    Array.isArray(mdastNode?.children) && mdastNode.children.length > 0;
  const isSelfClosing =
    (content.endsWith("/>") || content.endsWith("/ >")) && !hasMdastChildren;

  // Use centralized parseJsxString to extract name and attributes (includes boolean attrs)
  const parsed = parseJsxString(content);
  const name = parsed.name;
  const attributes = parsed.attributes;

  const children = hasMdastChildren
    ? convertNodesDeserialize(mdastNode.children!, deco, options)
    : [{ text: "" }];

  const isBlock = Boolean(shortcodeMeta.isBlock) || hasMdastChildren;

  // Return JSX node
  return {
    type: isBlock ? KEY_JSX_BLOCK : KEY_JSX_INLINE,
    name,
    isSelfClosing,
    attributes,
    content,
    children,
  };
}

/**
 * Deserializes JSX mdast nodes to Slate nodes
 */
export const deserializeJsx = (
  mdastNode: JsxMdastNode,
  deco: MdDecoration,
  options: DeserializeMdOptions,
  type: JsxSlateElement["type"],
): JsxSlateElement => {
  const hasMdastChildren =
    Array.isArray(mdastNode?.children) && mdastNode.children.length > 0;
  // A JSX element with children cannot be self-closing.
  // This also repairs inconsistent mdast produced from older/broken states.
  const isSelfClosing = Boolean(mdastNode?.isSelfClosing) && !hasMdastChildren;

  const children =
    !isSelfClosing && hasMdastChildren
      ? convertNodesDeserialize(mdastNode.children!, deco, options)
      : [{ text: "" }];

  // Parse content to extract name and attributes
  const content = mdastNode.content || "";
  const parsed = parseJsxString(content);
  const mergedAttributes = {
    ...mdastNode.attributes,
    ...parsed.attributes,
  };

  return {
    type,
    name: mdastNode.name || parsed.name,
    isSelfClosing,
    attributes: mergedAttributes,
    content: content,
    children,
  };
};

/**
 * Serializes JSX Slate nodes back to mdast
 */
export const serializeJsx = (
  slateNode: JsxSlateElement,
  options: SerializeMdOptions,
) => {
  const { name, attributes, isSelfClosing, children, content } = slateNode;

  const normalizeTagText = (value: string) =>
    value
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
      .trim()
      // Normalize whitespace around the self-closing slash.
      .replace(/\s*\/\s*>$/, "/>")
      // Normalize whitespace before closing angle.
      .replace(/\s+>/g, ">")
      .trim();

  /** Text of a Slate child, or `undefined` when the child is an element. */
  const childText = (child: Descendant | undefined): string | undefined => {
    const text = (child as TText | undefined)?.text;
    return typeof text === "string" ? text : undefined;
  };

  const isIgnorableTagTextChild = (
    nodeChildren: Descendant[] | undefined,
    expectedTagText: string | undefined,
  ) => {
    if (!Array.isArray(nodeChildren) || nodeChildren.length !== 1) return false;
    const only = childText(nodeChildren[0]);
    if (only === undefined) return false;

    const text = normalizeTagText(only);
    if (!text) return true; // empty placeholder

    const expected = normalizeTagText(expectedTagText ?? "");
    return expected ? text === expected : false;
  };

  // Build the JSX tag string
  const attrParts = Object.entries(attributes || {}).map(([key, value]) => {
    // Boolean attributes (value is true or null) should be output as just the key name
    if (value === true || value === null) {
      return key;
    }
    return `${key}="${value}"`;
  });

  const tagContent = [name, ...attrParts].filter(Boolean).join(" ");
  const openingSelfClosing = `<${tagContent}/>`;
  const openingNonSelfClosing = `<${tagContent}>`;

  // Plate JSX snippets store the editable tag line as a child text node.
  // Treat that as UI state, not semantic children.
  const hasOnlyTagTextChild = isIgnorableTagTextChild(
    children,
    // Prefer the stored content string; fall back to what we would render.
    content || (isSelfClosing ? openingSelfClosing : openingNonSelfClosing),
  );

  // A JSX element with real children cannot be self-closing.
  // (But don't count the tag-text child used for editing.)
  const hasRealChildren =
    Array.isArray(children) && children.length > 0 && !hasOnlyTagTextChild;

  const effectiveIsSelfClosing = Boolean(isSelfClosing) && !hasRealChildren;

  const opening = effectiveIsSelfClosing
    ? openingSelfClosing
    : openingNonSelfClosing;
  const closing = effectiveIsSelfClosing ? "" : `</${name}>`;

  const firstChildText = childText(children?.[0]);
  const childrenForSerialization = effectiveIsSelfClosing
    ? []
    : hasOnlyTagTextChild
      ? []
      : Array.isArray(children) &&
          children.length > 1 &&
          firstChildText !== undefined &&
          normalizeTagText(firstChildText) ===
            normalizeTagText(content || openingNonSelfClosing)
        ? children.slice(1)
        : children;

  const serializedChildren = effectiveIsSelfClosing
    ? []
    : convertNodesSerialize(childrenForSerialization, options);

  // Preserve original Slate node kind: self-closing JSX can be block or inline.
  const isBlock = slateNode?.type === KEY_JSX_BLOCK;

  return {
    type: "shortcode",
    // IMPORTANT: Always set content to the opening tag.
    // Plate/remark pipelines may rely on node.content even when startContent is present,
    // and leaving it empty can cause nested JSX to be lost during stringify.
    content: content || opening,
    children: serializedChildren,
    data: {
      shortcode: {
        definitionIndex: 0, // 0 means < delimiter
        start: "<",
        end: ">",
        startContent: opening,
        closingContent: closing,
        isBlock,
        isJsxComponent: true, // Mark as JSX
      },
      hName: "shortcode",
      hProperties: {
        content: content || opening,
      },
    },
  };
};

/**
 * Markdown serialization rules for JSX component types
 */
export const jsxSerializationRules = {
  [KEY_JSX_BLOCK]: {
    deserialize: (
      mdastNode: JsxMdastNode,
      deco: MdDecoration,
      options: DeserializeMdOptions,
    ) => deserializeJsx(mdastNode, deco, options, KEY_JSX_BLOCK),
    serialize: serializeJsx,
  },
  [KEY_JSX_INLINE]: {
    deserialize: (
      mdastNode: JsxMdastNode,
      deco: MdDecoration,
      options: DeserializeMdOptions,
    ) => deserializeJsx(mdastNode, deco, options, KEY_JSX_INLINE),
    serialize: serializeJsx,
  },
};
