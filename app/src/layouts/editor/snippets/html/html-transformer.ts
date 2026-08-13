import { Node, Parent } from "unist";
import { visit } from "unist-util-visit";
import { nodeValue } from "../snippet-mdast";

type HtmlNode = Node & {
  type: "html";
  value?: string;
  data?: Record<string, unknown> & {
    isInlineHtml?: boolean;
  };
};

function isParent(node: Node): node is Parent {
  return !!(node as Partial<Parent>).children;
}

const getTagName = (html: string): string | null => {
  const match = html.match(/<\/?([a-zA-Z0-9-]+)/);
  return match ? match[1].toLowerCase() : null;
};

const isClosingTag = (html: string): boolean => {
  return html.trim().startsWith("</");
};

const htmlValue = (node: Node): string => (node as HtmlNode).value || "";

const isHtmlDocumentStart = (node: Node): node is HtmlNode =>
  node.type === "html" && /^\s*<html\b/i.test(htmlValue(node));

const isHtmlDocumentEnd = (node: Node): node is HtmlNode =>
  node.type === "html" && /<\/html\s*>\s*$/i.test(htmlValue(node));

const sourceLineGap = (previous: Node, next: Node): string => {
  const previousEnd = previous.position?.end.line;
  const nextStart = next.position?.start.line;

  if (!previousEnd || !nextStart) return "\n";
  return "\n".repeat(Math.max(1, nextStart - previousEnd));
};

/** Merges a document-level `<html>…</html>` sequence split at blank lines. */
const stitchHtmlDocuments = (tree: Node) => {
  if (!isParent(tree)) return;

  const children = tree.children;
  let index = 0;

  while (index < children.length) {
    const start = children[index];
    if (!isHtmlDocumentStart(start)) {
      index += 1;
      continue;
    }

    let endIndex = index;
    while (
      endIndex < children.length &&
      !isHtmlDocumentEnd(children[endIndex])
    ) {
      if (children[endIndex].type !== "html") break;
      endIndex += 1;
    }

    if (endIndex >= children.length || !isHtmlDocumentEnd(children[endIndex])) {
      index += 1;
      continue;
    }

    let value = "";
    for (let childIndex = index; childIndex <= endIndex; childIndex += 1) {
      const child = children[childIndex] as HtmlNode;
      if (childIndex > index) {
        value += sourceLineGap(children[childIndex - 1], child);
      }
      value += child.value || "";
    }

    children.splice(index, endIndex - index + 1, {
      type: "html",
      value,
      data: { isInlineHtml: false },
    } as HtmlNode);
    index += 1;
  }
};

/**
 * Stitches together HTML nodes that Remark splits into (Start Tag, Text, End Tag).
 * e.g. <a href="..."> + label + </a>  ->  <a href="...">label</a>
 */
const stitchSplitHtmlNodes = (tree: Node) => {
  visit(tree, (node) => {
    if (!isParent(node)) return;

    const children = node.children;
    let i = 0;

    while (i < children.length - 2) {
      const current = children[i];
      const next = children[i + 1];
      const nextNext = children[i + 2];

      // Check for pattern: HTML(start) + Text + HTML(end)
      if (
        current.type === "html" &&
        next.type === "text" &&
        nextNext.type === "html"
      ) {
        const startHtml = (current as HtmlNode).value || "";
        const endHtml = (nextNext as HtmlNode).value || "";

        const startTag = getTagName(startHtml);
        const endTag = getTagName(endHtml);

        // Ensure tags match (e.g. <a> and </a>) and it's a proper closing tag
        if (
          startTag &&
          endTag === startTag &&
          !isClosingTag(startHtml) &&
          isClosingTag(endHtml)
        ) {
          const textContent = nodeValue(next);
          const mergedValue = `${startHtml}${textContent}${endHtml}`;

          // Create combined node
          const mergedNode: HtmlNode = {
            type: "html",
            value: mergedValue,
            data: {
              ...current.data,
              isInlineHtml: true, // It was split, so it must have been inline
            },
          };

          // Replace the 3 nodes with the 1 merged node
          children.splice(i, 3, mergedNode);
          // Don't increment i, verify current position again
          continue;
        }
      }
      i++;
    }
  });
};

export const remarkHtml = () => {
  return (tree: Node) => {
    // Phase 1: Preserve full HTML documents before handling inline tags.
    stitchHtmlDocuments(tree);

    // Phase 2: Stitch split inline HTML nodes back together.
    stitchSplitHtmlNodes(tree);

    // Phase 3: Tag regular HTML nodes
    visit(
      tree,
      "html",
      (node: HtmlNode, _index, parent: Parent | undefined) => {
        // If we haven't already marked it in phase 1
        if (!node.data?.isInlineHtml) {
          type HtmlNodeData = NonNullable<HtmlNode["data"]>;
          const data = (node.data ?? {}) as HtmlNodeData;
          data.isInlineHtml = parent?.type === "paragraph";
          node.data = data;
        }
      },
    );
  };
};
