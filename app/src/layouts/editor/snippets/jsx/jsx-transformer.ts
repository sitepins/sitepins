import { mdxToMarkdown } from "mdast-util-mdx";
import { toMarkdown } from "mdast-util-to-markdown";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { remarkHtml } from "../html/html-transformer";
import { parseJsxString } from "./jsx-parser";

const OPEN_TAG_REGEX = /^<([A-Z]\w*)([^>]*)>/;
const CLOSE_TAG_REGEX = /^<\/([A-Z]\w*)\s*>/;
const NEXT_COMPONENT_REGEX = /<\/?([A-Z]\w*)/;
const markdownParser = unified().use(remarkParse);

const INVISIBLE_CHARS_REGEX = /[\u200B\u200C\u200D\uFEFF]/g;

function stripInvisibleChars(value: string): string {
  return value.replace(INVISIBLE_CHARS_REGEX, "");
}

function normalizeForTagMatch(value: string): string {
  return stripInvisibleChars(value).trim();
}

function parseMarkdownFragment(fragment: string): any[] {
  if (!fragment) return [];

  // Keep pure whitespace as a text node so spacing/newlines aren't lost.
  if (!normalizeForTagMatch(fragment)) {
    return [{ type: "text", value: fragment }];
  }

  const tree = markdownParser.parse(stripInvisibleChars(fragment)) as any;
  const children = Array.isArray(tree?.children) ? tree.children : [];

  // If parsing yields nothing, fall back to plain text.
  if (!children.length) {
    return [{ type: "text", value: fragment }];
  }

  return children;
}

function splitHtmlValue(
  value: string,
  data: Record<string, unknown> | undefined,
): any[] | null {
  const nodes: any[] = [];
  let position = 0;

  while (position < value.length) {
    const remaining = value.slice(position);
    const openTagMatch = remaining.match(OPEN_TAG_REGEX);
    const closeTagMatch = remaining.match(CLOSE_TAG_REGEX);

    if (openTagMatch) {
      const componentName = openTagMatch[1];
      const fullOpenTag = openTagMatch[0];

      if (fullOpenTag.trim().endsWith("/>")) {
        nodes.push({ type: "html", value: fullOpenTag, data });
        position += fullOpenTag.length;
        continue;
      }

      const closingTagRegex = new RegExp(`</${componentName}\\s*>`);
      const searchArea = remaining.slice(fullOpenTag.length);
      const closingMatch = searchArea.match(closingTagRegex);

      if (closingMatch && closingMatch.index !== undefined) {
        const closingEnd =
          fullOpenTag.length + closingMatch.index + closingMatch[0].length;
        const completeBlock = remaining.slice(0, closingEnd);

        nodes.push({ type: "html", value: completeBlock, data });
        position += completeBlock.length;
        continue;
      }

      // No closing tag found; treat the opening tag standalone
      nodes.push({ type: "html", value: fullOpenTag, data });
      position += fullOpenTag.length;
      continue;
    }

    if (closeTagMatch) {
      const closingTag = closeTagMatch[0];
      nodes.push({ type: "html", value: closingTag, data });
      position += closingTag.length;
      continue;
    }

    const nextMatch = remaining.match(NEXT_COMPONENT_REGEX);
    if (!nextMatch || nextMatch.index === undefined) {
      const trailing = remaining;
      if (trailing) {
        nodes.push(...parseMarkdownFragment(trailing));
      }
      break;
    }

    if (nextMatch.index > 0) {
      const textSegment = remaining.slice(0, nextMatch.index);
      nodes.push(...parseMarkdownFragment(textSegment));
      position += nextMatch.index;
    } else {
      // Guard against infinite loops
      position += 1;
    }
  }

  if (!nodes.length) {
    return null;
  }

  if (
    nodes.length === 1 &&
    nodes[0].type === "html" &&
    nodes[0].value === value
  ) {
    return null;
  }

  return nodes;
}

function isOpeningTagFor(name: string, value: string): boolean {
  if (!name) return false;
  // Use a more robust check that handles potential leading invisible characters
  const regex = new RegExp(`<${name}\\b[^>]*>`);
  return regex.test(normalizeForTagMatch(value));
}

function isSelfClosingTagFor(name: string, value: string): boolean {
  if (!name) return false;
  const regex = new RegExp(`<${name}\\b[^>]*\/\\s*>$`);
  return regex.test(normalizeForTagMatch(value));
}

function isClosingTagFor(name: string, value: string): boolean {
  if (!name) return false;
  const regex = new RegExp(`</${name}\\s*>`);
  return regex.test(normalizeForTagMatch(value));
}

function findMatchingClosingIndex(
  children: any[],
  startIndex: number,
  name: string,
): number {
  let depth = 0;

  for (let i = startIndex + 1; i < children.length; i++) {
    const sibling = children[i];
    if (sibling.type !== "html" || typeof sibling.value !== "string") {
      continue;
    }

    const trimmed = normalizeForTagMatch(sibling.value);

    if (isOpeningTagFor(name, trimmed) && !isSelfClosingTagFor(name, trimmed)) {
      depth += 1;
      continue;
    }

    if (isClosingTagFor(name, trimmed)) {
      if (depth === 0) {
        return i;
      }
      depth -= 1;
    }
  }

  return -1;
}

function transformJsxTree(tree: any) {
  // Ensure inline HTML metadata exists even for trees parsed ad-hoc (inner JSX bodies)
  remarkHtml()(tree);

  // Pre-pass: Lift ALL JSX components (opening, closing, self-closing) out of paragraphs
  visit(
    tree,
    "paragraph",
    (node: any, index: number | undefined, parent: any | undefined) => {
      if (!parent || index === undefined) return;

      const children = node.children;
      // Identify PascalCase tags (opening or closing)
      const hasJsxTag = children.some(
        (child: any) =>
          (child.type === "html" || child.type === "text") &&
          (OPEN_TAG_REGEX.test(normalizeForTagMatch(child.value)) ||
            /^<\/[A-Z]/.test(normalizeForTagMatch(child.value))),
      );

      if (!hasJsxTag) return;

      const newNodes: any[] = [];
      let currentParagraphChildren: any[] = [];

      for (const child of children) {
        if (
          (child.type === "html" || child.type === "text") &&
          (OPEN_TAG_REGEX.test(normalizeForTagMatch(child.value)) ||
            /^<\/[A-Z]/.test(normalizeForTagMatch(child.value)))
        ) {
          // Closing JSX tags (</Tab>, </Tabs>) are ALWAYS lifted regardless of surrounding text.
          const isClosingTag = /^<\/[A-Z]/.test(
            normalizeForTagMatch(child.value),
          );

          if (!isClosingTag) {
            // For opening/self-closing tags, only keep inline if real text has been
            // accumulated BEFORE this node in the current paragraph.
            const hasRealTextBefore = currentParagraphChildren.some(
              (c: any) => {
                if (c.type === "text") {
                  return c.value && normalizeForTagMatch(c.value).length > 0;
                }
                // Non-text, non-JSX elements count as real content
                return (
                  (c.type !== "html" && c.type !== "text") ||
                  !(
                    OPEN_TAG_REGEX.test(normalizeForTagMatch(c.value)) ||
                    /^<\/[A-Z]/.test(normalizeForTagMatch(c.value))
                  )
                );
              },
            );

            if (hasRealTextBefore) {
              currentParagraphChildren.push(child);
              continue;
            }
          }

          if (currentParagraphChildren.length > 0) {
            const hasMeaningfulContent = currentParagraphChildren.some(
              (c: any) =>
                c.type !== "text" ||
                (c.value && normalizeForTagMatch(c.value).length > 0),
            );

            if (hasMeaningfulContent) {
              newNodes.push({
                type: "paragraph",
                children: currentParagraphChildren,
              });
            }
            currentParagraphChildren = [];
          }
          newNodes.push(child);
        } else {
          currentParagraphChildren.push(child);
        }
      }

      if (currentParagraphChildren.length > 0) {
        const hasMeaningfulContent = currentParagraphChildren.some(
          (c: any) =>
            c.type !== "text" ||
            (c.value && normalizeForTagMatch(c.value).length > 0),
        );
        if (hasMeaningfulContent) {
          newNodes.push({
            type: "paragraph",
            children: currentParagraphChildren,
          });
        }
      }

      parent.children.splice(index, 1, ...newNodes);
      return index + newNodes.length;
    },
  );

  // First pass: Split HTML/text nodes so JSX and surrounding text become separate nodes
  visit(tree, ["html", "text"], (node, index, parent) => {
    if (index === undefined || !parent) return;

    const value = node.value;
    const jsxTagRegex = /<\/?([A-Z]\w*)\s*[^>]*\/?>/g;
    const matches = [...value.matchAll(jsxTagRegex)];

    if (!matches.length) {
      return;
    }

    const splitNodes = splitHtmlValue(value, node.data);
    if (splitNodes && splitNodes.length) {
      parent.children.splice(index, 1, ...splitNodes);
      return index + splitNodes.length;
    }
  });

  // Second pass: Transform JSX elements
  visit(
    tree,
    ["mdxJsxFlowElement", "mdxJsxTextElement", "html"],
    (node, index, parent) => {
      if (index === undefined || !parent) return;

      let name = "";
      let attributes: Record<string, any> = {};
      let isSelfClosing = false;
      let content = "";
      let type = "";
      let children = node.children || [{ type: "text", value: "" }];

      let closingTagValue = "";

      if (node.type === "html" || node.type === "text") {
        // Handle HTML/text nodes
        const parsed = parseJsxString(node.value);
        name = parsed.name;
        attributes = parsed.attributes;
        content = node.value;

        // If the HTML block contains trailing markdown after the closing tag,
        // split it so the markdown parser can handle the remainder normally.
        if (name) {
          const closingTagRegex = new RegExp(`</${name}\\s*>`, "m");
          const closingMatch = closingTagRegex.exec(content);

          if (
            closingMatch &&
            closingMatch.index !== undefined &&
            closingMatch.index + closingMatch[0].length < content.length
          ) {
            const closingEnd = closingMatch.index + closingMatch[0].length;
            const jsxSegment = content.slice(0, closingEnd);
            const trailingContent = content.slice(closingEnd);

            if (trailingContent.trim().length > 0 && parent) {
              const trailingTree = markdownParser.parse(trailingContent);
              transformJsxTree(trailingTree);
              if (trailingTree.children?.length) {
                parent.children.splice(index + 1, 0, ...trailingTree.children);
              }
            }

            content = jsxSegment;
            node.value = jsxSegment;
          }
        }

        // Check if it's a Component (starts with Uppercase)
        const firstChar = name[0];
        if (!firstChar || firstChar < "A" || firstChar > "Z") {
          return;
        }

        // Nodes inside a paragraph MUST be treated as inline to avoid Slate normalization issues.
        // Plate's Markdown deserializer often strips block elements found inside paragraphs.
        const isInline =
          node.data?.isInlineHtml ||
          node.type === "text" ||
          parent?.type === "paragraph";
        type = isInline ? "jsx_inline" : "jsx_block";

        const cleanContent = stripInvisibleChars(content);
        const normalizedContent = normalizeForTagMatch(cleanContent);
        isSelfClosing = normalizedContent.endsWith("/>");

        // If the opening tag *looks* self-closing but a matching closing tag exists,
        // treat it as a normal opening tag. This guards against accidental `/>` typing
        // (especially when zero-width chars are present) and keeps children intact.
        if (isSelfClosing) {
          const closingIndex = findMatchingClosingIndex(
            parent.children,
            index,
            name,
          );

          if (closingIndex !== -1) {
            isSelfClosing = false;
            // Normalize the tag string so the serialized markdown is valid JSX.
            content = content
              .replace(/\s*\/\s*>\s*$/, "> ")
              .replace(/>\s*$/, ">");
          }
        }

        if (!isSelfClosing) {
          // Check if the node itself contains the closing tag (merged block)
          const closingTagInValueRegex = new RegExp(`</${name}\\s*>$`);
          if (closingTagInValueRegex.test(normalizeForTagMatch(content))) {
            isSelfClosing = false;
            type = isInline ? "jsx_inline" : "jsx_block";

            // Extract inner content
            // We naively match the first opening and LAST closing to get content.
            // Notice \\s*$ in endRegex to capture trailing whitespace left over by remarkParse blocks.
            const startRegex = new RegExp(`^<${name}[^>]*>`);
            const startMatch = content.match(startRegex);
            const endRegex = new RegExp(`</${name}\\s*>\\s*$`);
            const endMatch = content.match(endRegex);

            if (startMatch && endMatch) {
              const innerContent = content.slice(
                startMatch[0].length,
                -endMatch[0].length,
              );

              const parsed = markdownParser.parse(innerContent.trim());
              transformJsxTree(parsed);
              if (parsed.children && parsed.children.length > 0) {
                // For inline elements, flatten nested paragraphs to maintain valid Slate structure (inline cannot contain block)
                if (type === "jsx_inline") {
                  children = parsed.children.flatMap((c: any) =>
                    c.type === "paragraph" ? c.children : c,
                  );
                } else {
                  children = parsed.children;
                }

                // Filter out empty text nodes that can cause Slate normalization bugs
                children = children.filter(
                  (c: any) => !(c.type === "text" && !c.value.trim()),
                );
              } else {
                children = [{ type: "text", value: innerContent }];
              }

              // CRITICAL FIX: Update 'content' to be ONLY the opening tag
              content = startMatch[0];
              closingTagValue = endMatch[0].trim();
            } else {
              children = [{ type: "text", value: "" }];
            }
          } else {
            // Look for closing tag in siblings while keeping nesting intact
            const closingIndex = findMatchingClosingIndex(
              parent.children,
              index,
              name,
            );

            if (closingIndex !== -1) {
              // Found matching closing tag
              // Extract children
              const rawChildren = parent.children.slice(
                index + 1,
                closingIndex,
              );
              const childTree = { type: "root", children: rawChildren } as any;
              transformJsxTree(childTree);

              // For inline elements, flatten nested paragraphs to maintain valid Slate structure
              if (type === "jsx_inline") {
                children = childTree.children.flatMap((c: any) =>
                  c.type === "paragraph" ? c.children : c,
                );
              } else {
                children = childTree.children;
              }

              // Filter out pure whitespace text nodes to prevent Slate's mixed-content normalizer
              // from destroying the block structure.
              children = children.filter(
                (c: any) => !(c.type === "text" && !c.value.trim()),
              );

              const closingSibling = parent.children[closingIndex];
              if (closingSibling && typeof closingSibling.value === "string") {
                closingTagValue = normalizeForTagMatch(closingSibling.value);
              }

              // Remove nodes from index to closingIndex (inclusive) and replace with new node
              const nodesToRemove = closingIndex - index;
              parent.children.splice(index + 1, nodesToRemove);

              type = isInline ? "jsx_inline" : "jsx_block";
            } else {
              // No closing tag found. Treat as self-closing.
              isSelfClosing = true;
            }
          }
        }

        if (isSelfClosing) {
          children = [];
          // If it was forced inline by isInlineHtml, keep inline.
          // standalone self-closing components at root are usually snippets and should be inline.
          const isInline = node.data?.isInlineHtml;
          // self closing can be block or inline depending on context. Default to block if unknown.
          type = isInline ? "jsx_inline" : "jsx_block";
          closingTagValue = "";
        }
      } else {
        // Handle MDX nodes
        name = node.name || "";
        const firstChar = name[0];
        const isJsxComponent = firstChar >= "A" && firstChar <= "Z";

        if (!isJsxComponent) {
          // Skip lowercase HTML elements - let them be handled as HTML
          return;
        }

        type = node.type === "mdxJsxFlowElement" ? "jsx_block" : "jsx_inline";

        isSelfClosing = node?.children?.length === 0;

        // Extract JSX attributes
        if (node.attributes) {
          for (const attr of node.attributes) {
            if (attr.type === "mdxJsxAttribute") {
              attributes[attr.name] = attr.value;
            }
          }
        }

        // Convert the opening tag to string for reference
        content = toMarkdown(
          {
            type: "root",
            children: [
              {
                ...node,
                children: [],
              },
            ],
          },
          { extensions: [mdxToMarkdown()] },
        ).trim();
      }

      const newNode = {
        type,
        isSelfClosing,
        name: name, // Component name (e.g., "Notice", "Accordion")
        attributes, // Parsed attributes
        content: stripInvisibleChars(content),
        // Add value fields to support generation/handling
        value: stripInvisibleChars(content),
        data: {
          hName: type,
          hProperties: {
            content: content,
            closingTag: closingTagValue,
          },
        },
        children: children, // Preserve children as mdast nodes
        closingTag: closingTagValue,
      };

      parent.children[index] = newNode;
    },
  );

  // Third pass: Lift jsx_block nodes out of paragraphs ONLY if they're acting as blocks
  visit(
    tree,
    "paragraph",
    (node: any, index: number | undefined, parent: any | undefined) => {
      if (!parent || index === undefined) return;

      const children = node.children;
      const hasJsxBlock = children.some(
        (child: any) =>
          child.type === "jsx_block" || child.type === "jsx_inline",
      );

      if (!hasJsxBlock) return;

      // Check if the paragraph has meaningful non-JSX content
      const hasNonJsxContent = children.some((child: any) => {
        if (child.type === "jsx_block" || child.type === "jsx_inline")
          return false;
        if (child.type === "text") {
          // Ignore whitespace and invisible characters
          return normalizeForTagMatch(child.value || "").length > 0;
        }
        // Other node types (links, emphasis, etc.) count as content
        return true;
      });

      // If there's other meaningful content, keep all JSX inline
      if (hasNonJsxContent) {
        return;
      }

      const newNodes: any[] = [];
      let currentParagraphChildren: any[] = [];

      for (const child of children) {
        if (child.type === "jsx_block" || child.type === "jsx_inline") {
          // Upgrade inline to block since it's standing alone with no non-JSX content
          child.type = "jsx_block";
          if (child.data && child.data.hName) {
            child.data.hName = "jsx_block";
          }

          // Lift jsx_block out of paragraph
          if (currentParagraphChildren.length > 0) {
            const hasMeaningfulContent = currentParagraphChildren.some(
              (c: any) =>
                c.type !== "text" ||
                (c.value && normalizeForTagMatch(c.value).length > 0),
            );
            if (hasMeaningfulContent) {
              newNodes.push({
                type: "paragraph",
                children: currentParagraphChildren,
              });
            }
            currentParagraphChildren = [];
          }
          newNodes.push(child);
        } else {
          currentParagraphChildren.push(child);
        }
      }

      if (currentParagraphChildren.length > 0) {
        const hasMeaningfulContent = currentParagraphChildren.some(
          (c: any) =>
            c.type !== "text" ||
            (c.value && normalizeForTagMatch(c.value).length > 0),
        );
        if (hasMeaningfulContent) {
          newNodes.push({
            type: "paragraph",
            children: currentParagraphChildren,
          });
        }
      }

      parent.children.splice(index, 1, ...newNodes);
      return index + newNodes.length;
    },
  );
  // Fourth pass: Clean up empty paragraphs at root level introduced by editor normalization
  if (tree.type === "root" && tree.children) {
    tree.children = tree.children.filter((node: any) => {
      if (node.type === "paragraph") {
        const hasContent = node.children.some((c: any) => {
          if (c.type !== "text") return true;
          return normalizeForTagMatch(c.value || "").length > 0;
        });
        return hasContent;
      }
      // Remove whitespace-only text nodes at root level left by shortcode extraction.
      // These disrupt toMarkdown's block spacing causing all blocks to fuse.
      if (node.type === "text") {
        return normalizeForTagMatch(node.value || "").length > 0;
      }
      return true;
    });
  }

  // Final pass: Upgrade root-level jsx_inline to jsx_block
  if (tree.type === "root" && tree.children) {
    tree.children.forEach((node: any) => {
      if (node.type === "jsx_inline") {
        node.type = "jsx_block";
        if (node.data) node.data.hName = "jsx_block";
      }
    });
  }
}

export const remarkJsx = function (this: any) {
  const data = this.data ? this.data() : {};
  const toMarkdownExtensions =
    data.toMarkdownExtensions || (data.toMarkdownExtensions = []);

  toMarkdownExtensions.push({
    handlers: {
      jsx_block: (node: any, _parent: any, state: any) => {
        const opening = node.content || `<${node.name}>`;
        const closing = node.closingTag || `</${node.name}>`;
        const body = state.containerFlow(node, state);
        return body ? `${opening}\n${body}\n${closing}` : opening;
      },
      jsx_inline: (node: any, _parent: any, state: any) => {
        const opening = node.content || `<${node.name}>`;
        const closing = node.closingTag || `</${node.name}>`;
        const body = state.containerPhrasing(node, state);
        return `${opening}${body}${closing}`;
      },
    },
  });

  return (tree: any) => {
    transformJsxTree(tree);
  };
};
