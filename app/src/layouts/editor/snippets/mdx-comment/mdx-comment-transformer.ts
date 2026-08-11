import type { Parent, PhrasingContent, Root, RootContent } from "mdast";
import type { Options as ToMarkdownOptions } from "mdast-util-to-markdown";
import remarkParse from "remark-parse";
import { unified, type Processor } from "unified";
import type { Node } from "unist";
import type { MdxCommentNode } from "../snippet-mdast";

type MarkdownExtensions = NonNullable<ToMarkdownOptions["extensions"]>;
type ProcessorData = { toMarkdownExtensions?: MarkdownExtensions };

const OPEN = "{/*";
const CLOSE = "*/}";

/** Source offsets a node occupies, when remark recorded them. */
type Span = { start: number; end: number };

/**
 * Containers whose children are phrasing content, so a comment found inside one
 * is rebuilt at this level. Anything else that can hold a comment — a
 * blockquote, a list item — holds it inside one of these.
 */
const PHRASING_CONTAINERS = new Set(["heading", "paragraph", "tableCell"]);

const fragmentParser = unified().use(remarkParse);

function spanOf(node: Node): Span | null {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") return null;
  return { start, end };
}

function isParent(node: Node): node is Parent {
  return Array.isArray((node as Parent).children);
}

/**
 * Locates every complete comment in the source.
 *
 * Scanning the raw text rather than the parsed tree is what keeps the capture
 * byte-intact, and it is also the only view in which a comment is still whole:
 * remark pairs the asterisk that closes one comment with the asterisk that
 * opens the next, so two comments in one paragraph arrive with an emphasis node
 * stretched across the prose between them.
 *
 * An unterminated opener is skipped — it is not a comment, so it keeps whatever
 * treatment markdown already gave it.
 */
function findCommentSpans(source: string): Span[] {
  const spans: Span[] = [];
  let from = 0;

  while (from < source.length) {
    const start = source.indexOf(OPEN, from);
    if (start === -1) break;

    const close = source.indexOf(CLOSE, start + OPEN.length);
    if (close === -1) break;

    const end = close + CLOSE.length;
    spans.push({ start, end });
    from = end;
  }

  return spans;
}

/** Comments start inline; `liftBlockComments` promotes the standalone ones. */
function makeComment(value: string): MdxCommentNode {
  return { type: "mdx_comment_inline", value };
}

/**
 * Emits a run of whitespace, as a break wherever it crossed a line.
 *
 * Remark trims the edges of a paragraph, so the space on either side of a
 * comment has to be put back by hand or the comment ends up glued to the words
 * around it.
 */
function pushWhitespace(out: PhrasingContent[], whitespace: string): void {
  if (!whitespace) return;

  whitespace.split("\n").forEach((part, index) => {
    if (index > 0) out.push({ type: "break" });
    if (part) out.push({ type: "text", value: part });
  });
}

/**
 * Parses a stretch of source that sits between comments.
 *
 * Each stretch is parsed on its own, which is the point: the asterisks that
 * belong to the delimiters are never in the text handed to remark, so they
 * cannot pair with anything to form emphasis that was not written.
 */
function parseFragment(fragment: string): PhrasingContent[] {
  if (!fragment) return [];

  const leading = /^\s*/.exec(fragment)?.[0] ?? "";
  const rest = fragment.slice(leading.length);
  const trailing = /\s*$/.exec(rest)?.[0] ?? "";
  const core = rest.slice(0, rest.length - trailing.length);

  const out: PhrasingContent[] = [];
  pushWhitespace(out, leading);

  if (core) {
    const root = fragmentParser.parse(core) as Root;
    const [first] = root.children;

    if (!first || first.type !== "paragraph") {
      out.push({ type: "text", value: core });
    } else {
      out.push(...first.children);
    }
  }

  pushWhitespace(out, trailing);

  return out;
}

/**
 * Rebuilds a phrasing container's children from the source, so that every
 * comment inside it becomes exactly one node.
 *
 * The parsed children are discarded rather than patched. Splicing comments into
 * the existing tree means walking nodes that already straddle the comment
 * boundaries, and a span reachable from more than one of them gets emitted once
 * per path — which compounds on every save until the document is nothing but
 * copies of the same comment.
 */
function rebuildContainer(node: Parent, spans: Span[], source: string): void {
  const nodeSpan = spanOf(node);
  if (!nodeSpan) return;

  const inside = spans.filter(
    (s) => s.start >= nodeSpan.start && s.end <= nodeSpan.end,
  );
  if (inside.length === 0) return;

  const children: PhrasingContent[] = [];
  let cursor = nodeSpan.start;

  for (const span of inside) {
    children.push(...parseFragment(source.slice(cursor, span.start)));
    children.push(makeComment(source.slice(span.start, span.end)));
    cursor = span.end;
  }

  children.push(...parseFragment(source.slice(cursor, nodeSpan.end)));

  node.children = children;
}

/** True once nothing is left but the comment and blank text. */
function holdsOnlyComment(node: Parent): boolean {
  let seenComment = false;

  for (const child of node.children) {
    if (child.type === "mdx_comment_inline") {
      seenComment = true;
      continue;
    }
    if (child.type === "text" && !child.value.trim()) continue;
    return false;
  }

  return seenComment;
}

/**
 * Hoists comments that stood on their own line out of the paragraph remark
 * wrapped them in, so they serialize as blocks separated by blank lines rather
 * than being folded into neighbouring prose.
 *
 * The type has to change with the position: Plate keys its rules off the mdast
 * type, and an inline element left at the root is deleted outright by Slate
 * normalisation the moment the value enters the editor.
 */
function liftBlockComments(tree: Root): void {
  const out: RootContent[] = [];
  let changed = false;

  for (const child of tree.children) {
    if (child.type !== "paragraph" || !holdsOnlyComment(child)) {
      out.push(child);
      continue;
    }

    changed = true;
    for (const grandchild of child.children) {
      if (grandchild.type !== "mdx_comment_inline") continue;
      out.push({ ...grandchild, type: "mdx_comment" });
    }
  }

  if (changed) tree.children = out;
}

/**
 * Captures MDX comments as opaque leaf nodes.
 *
 * Must run before the html/jsx/hugo transformers: they scan `text` and `html`
 * nodes for their own delimiters, and a comment body can contain anything.
 * Once it is a comment node none of them look inside it.
 *
 * Without this the braces reach the stringifier as ordinary text, where the
 * `mdxToMarkdown` extension has registered `{` as unsafe — so they come back
 * escaped, and an escaped comment is visible text on the published page.
 */
export function remarkMdxComment(this: Processor) {
  const data = this.data() as ProcessorData;
  const toMarkdownExtensions =
    data.toMarkdownExtensions || (data.toMarkdownExtensions = []);

  toMarkdownExtensions.push({
    handlers: {
      mdx_comment: (node: MdxCommentNode) => node.value,
      mdx_comment_inline: (node: MdxCommentNode) => node.value,
    },
  });

  return function transformer(tree: Root, file: { value?: unknown }) {
    const source = typeof file?.value === "string" ? file.value : "";
    if (!source) return;

    const spans = findCommentSpans(source);
    if (spans.length === 0) return;

    // Outermost first, and never into what was just rebuilt: the fragments are
    // parsed standalone, so their offsets no longer refer to this document.
    const walk = (node: Node) => {
      if (!isParent(node)) return;

      if (PHRASING_CONTAINERS.has(node.type)) {
        rebuildContainer(node, spans, source);
        return;
      }

      for (const child of node.children) walk(child);
    };

    walk(tree);
    liftBlockComments(tree);
  };
}
