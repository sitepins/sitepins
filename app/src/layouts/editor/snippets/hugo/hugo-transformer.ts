import {
  Parent,
  Parents,
  PhrasingContent,
  Root,
  RootContent,
  Text,
} from "mdast";
import type {
  Options as ToMarkdownOptions,
  State as ToMarkdownState,
} from "mdast-util-to-markdown";
import { toMarkdown } from "mdast-util-to-markdown";
import remarkParse from "remark-parse";
import { Processor, unified } from "unified";
import { Node } from "unist";
import { visit } from "unist-util-visit";
import {
  nodeValue,
  shortcodeMetaOf,
  type ShortcodeMeta,
  type ShortcodeNode,
} from "../snippet-mdast";

export interface ShortcodeDefinition {
  start: string;
  end: string;
}

export interface ShortcodeOptions {
  definitions?: ShortcodeDefinition[];
  inlineMode?: boolean;
}

/** Extensions handed to `toMarkdown` when re-stringifying a subtree. */
type MarkdownExtensions = NonNullable<ToMarkdownOptions["extensions"]>;

/** Data the unified processor accumulates across plugins. */
type ProcessorData = { toMarkdownExtensions?: MarkdownExtensions };

const DEFAULT_DEFINITIONS: ShortcodeDefinition[] = [
  { start: "<", end: ">" },
  { start: "{{<", end: ">}}" },
  { start: "{{%", end: "%}}" },
];

interface ShortcodeInfo {
  definitionIndex: number;
  name: string;
  params: string;
  isClosing: boolean;
}

const SHORTCODE_META_KEY = "shortcode";

const INVISIBLE_CHARS_REGEX = /[\u200B\u200C\u200D\uFEFF]/g;

function stripInvisibleChars(value: string): string {
  return value.replace(INVISIBLE_CHARS_REGEX, "");
}

function normalizeForTagMatch(value: string): string {
  return stripInvisibleChars(value).trim();
}

// Shared parser instance to avoid recreating it for every block
const _markdownParser = unified().use(remarkParse);

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isParent(node: Node): node is Parent {
  return Array.isArray((node as Parent).children);
}

function getShortcodeMeta(node: Node): ShortcodeMeta | undefined {
  return shortcodeMetaOf(node);
}

function setShortcodeMeta(
  node: ShortcodeNode,
  meta: Partial<ShortcodeMeta>,
): void {
  const data = (node.data || {}) as Record<string, unknown>;
  const existing = (data[SHORTCODE_META_KEY] || {}) as ShortcodeMeta;
  data[SHORTCODE_META_KEY] = {
    ...existing,
    ...meta,
  };
  node.data = data;
}

function parseShortcodeNode(
  node: ShortcodeNode,
  definitions: ShortcodeDefinition[],
): ShortcodeInfo | null {
  const meta = getShortcodeMeta(node);
  if (!meta || typeof meta.definitionIndex !== "number") {
    return null;
  }

  const definition = definitions[meta.definitionIndex];
  if (!definition) return null;

  const raw = node.content;
  if (!raw.startsWith(definition.start) || !raw.endsWith(definition.end)) {
    return null;
  }

  const inner = raw
    .slice(definition.start.length, raw.length - definition.end.length)
    .trim();

  if (!inner) {
    return null;
  }

  const isClosing = inner.startsWith("/");
  const body = (isClosing ? inner.slice(1) : inner).trim();
  const [name, ...rest] = body.split(/\s+/);

  if (!name) {
    return null;
  }

  const params = rest.join(" ").trim();

  setShortcodeMeta(node, {
    name,
    params,
    isClosing,
  });

  return {
    definitionIndex: meta.definitionIndex,
    name,
    params,
    isClosing,
  };
}

function mergeBlockShortcodes(
  node: Node,
  definitions: ShortcodeDefinition[],
  markdownExtensions: MarkdownExtensions,
): void {
  if (!isParent(node)) return;

  const children = node.children;

  let idx = 0;
  while (idx < children.length) {
    const child = children[idx];

    // Recurse into children first (bottom-up merging)
    if (isParent(child)) {
      mergeBlockShortcodes(child, definitions, markdownExtensions);
    }

    if (child.type === "shortcode") {
      const shortcodeNode = child as ShortcodeNode & Parent;
      const existingMeta = getShortcodeMeta(shortcodeNode);
      const isAlreadyMerged =
        existingMeta?.isBlock &&
        shortcodeNode.children &&
        shortcodeNode.children.length > 0;

      if (!isAlreadyMerged) {
        const info = parseShortcodeNode(shortcodeNode, definitions);

        if (info && !info.isClosing) {
          const closingIdx = findMatchingClosing(
            children,
            idx + 1,
            info,
            definitions,
          );

          if (closingIdx !== -1) {
            const closingNode = children[closingIdx] as ShortcodeNode;
            const blockChildren = children
              .slice(idx + 1, closingIdx)
              .filter((c) => !(c.type === "text" && !nodeValue(c).trim()));

            shortcodeNode.children = blockChildren;

            setShortcodeMeta(shortcodeNode, {
              isBlock: true,
              closingContent: closingNode.content,
            });

            // Re-merge this node's new children
            mergeBlockShortcodes(
              shortcodeNode,
              definitions,
              markdownExtensions,
            );

            children.splice(idx, closingIdx - idx + 1, shortcodeNode);

            idx += 1;
            continue;
          }
        }
      }
    }

    idx += 1;
  }
}

function _stringifyNodes(
  nodes: Node[],
  markdownExtensions: MarkdownExtensions,
): string {
  if (!nodes.length) return "";

  const root: Root = {
    type: "root",
    children: nodes as unknown as RootContent[],
  };

  const markdown = toMarkdown(
    root,
    markdownExtensions.length ? { extensions: markdownExtensions } : undefined,
  );

  return markdown.replace(/\n+$/, "");
}

function findMatchingClosing(
  siblings: Node[],
  fromIndex: number,
  target: ShortcodeInfo,
  definitions: ShortcodeDefinition[],
): number {
  let depth = 0;

  for (let i = fromIndex; i < siblings.length; i += 1) {
    const sibling = siblings[i];

    if (sibling.type !== "shortcode") continue;

    const info = parseShortcodeNode(sibling as ShortcodeNode, definitions);
    if (!info || info.definitionIndex !== target.definitionIndex) continue;

    if (info.name !== target.name) continue;

    if (!info.isClosing) {
      depth += 1;
      continue;
    }

    if (depth === 0) {
      return i;
    }

    depth -= 1;
  }

  return -1;
}

export function remarkHugo(this: Processor, options: ShortcodeOptions = {}) {
  const definitions = options.definitions || DEFAULT_DEFINITIONS;
  const data = this.data() as ProcessorData;
  const toMarkdownExtensions =
    data.toMarkdownExtensions || (data.toMarkdownExtensions = []);

  // Pre-compute regex for finding shortcodes
  // Sort definitions by length descending to match longest first
  const sortedDefinitions = definitions.map((def, index) => ({
    ...def,
    index,
  }));
  sortedDefinitions.sort((a, b) => b.start.length - a.start.length);

  const pattern = sortedDefinitions
    .map((def) => escapeRegExp(def.start))
    .join("|");

  const startRegex = new RegExp(pattern, "g");

  // Helper: Stitch shortcodes that remark split into text/html/text
  function stitchSplitShortcodes(node: Node): void {
    if (!isParent(node)) return;

    const children = node.children;
    let i = 0;

    while (i < children.length - 2) {
      const current = children[i];
      const next = children[i + 1];
      const nextNext = children[i + 2];

      const currentText = current.type === "text" ? nodeValue(current) : "";
      const nextHtml = next.type === "html" ? nodeValue(next) : "";
      const nextText = nextNext.type === "text" ? nodeValue(nextNext) : "";

      const startIdx = currentText.lastIndexOf("{{");

      // Check if we have a potential shortcode split across nodes
      const hasOpeningStart =
        startIdx !== -1 && currentText.slice(startIdx).trim() === "{{";
      const hasHtmlNode = next.type === "html" && nextHtml.length > 0;
      const closingSuffixIdx = nextText.indexOf("}}");

      if (hasOpeningStart && hasHtmlNode && closingSuffixIdx !== -1) {
        const prefix = currentText.slice(0, startIdx);
        const shortcodeStart = currentText.slice(startIdx);
        const potentialShortcode = `${shortcodeStart}${nextHtml}${nextText.slice(
          0,
          closingSuffixIdx + 2,
        )}`;
        const remainingText = nextText.slice(closingSuffixIdx + 2);

        // Determine which definition this matches
        let matchedDefinition: ShortcodeDefinition | null = null;
        let matchedIndex = -1;

        for (let defIdx = 0; defIdx < definitions.length; defIdx++) {
          const def = definitions[defIdx];
          if (
            potentialShortcode.startsWith(def.start) &&
            potentialShortcode.endsWith(def.end)
          ) {
            matchedDefinition = def;
            matchedIndex = defIdx;
            break;
          }
        }

        if (matchedDefinition && matchedIndex !== -1) {
          // Additional validation: Ensure this is not a JSX component wrapped in {{ }}
          // JSX components look like: {{<ComponentName>}} with uppercase first letter
          // Hugo shortcodes look like: {{< shortcode-name >}} with lowercase

          // Skip if this looks like a JSX component wrapped in {{ }}
          // (those should be Hugo shortcodes, not pure JSX)
          const isLikelyJsx = nextHtml.match(/^<[A-Z]/);

          if (isLikelyJsx && matchedIndex !== 0) {
            if (isParent(current)) {
              stitchSplitShortcodes(current);
            }
            i += 1;
            continue;
          }

          // Determine if this is a closing tag
          const isClosing = nextHtml.startsWith("</");

          // Mark if this is a JSX component
          const isJsxComponent = matchedDefinition.start === "<";

          const nodeToAdd: ShortcodeNode = {
            type: "shortcode",
            content: potentialShortcode,
            data: {
              shortcode: {
                definitionIndex: matchedIndex,
                start: matchedDefinition.start,
                end: matchedDefinition.end,
                startContent: potentialShortcode,
                isClosing,
                isJsxComponent, // Add metadata to distinguish JSX from Hugo
              },
              hName: "shortcode",
              hProperties: {
                content: potentialShortcode,
              },
            },
          };

          const replacements: RootContent[] = [];
          if (prefix) {
            replacements.push({ type: "text", value: prefix } satisfies Text);
          }
          replacements.push(nodeToAdd);
          if (remainingText) {
            replacements.push({
              type: "text",
              value: remainingText,
            } satisfies Text);
          }

          children.splice(i, 3, ...replacements);

          if (replacements.length === 1) {
            i += 1;
          } else {
            // We need to re-evaluate the last inserted node if it's text
            // (it might be the start of another shortcode)
            i += replacements.length - 1;
          }

          continue;
        }
      }

      if (isParent(current)) {
        stitchSplitShortcodes(current);
      }

      i += 1;
    }

    // Recurse into remaining children even if we hit the end
    while (i < children.length) {
      if (isParent(children[i])) {
        stitchSplitShortcodes(children[i]);
      }
      i += 1;
    }
  }

  // Transformer: Find and replace shortcodes in text nodes
  function transformer(treeNode: Node) {
    // remark always hands a Root here.
    const tree = treeNode as Root;

    visit(tree, ["text", "html"], (node, index, parent) => {
      if (node.type !== "text" && node.type !== "html") return;
      if (!parent || index === undefined) return;

      const value = node.value;

      // Find the first matching start block using regex
      type ShortcodeMatch = {
        start: string;
        end: string;
        index: number;
        definitionIndex: number;
      };

      let bestMatch: ShortcodeMatch | null = null;

      // Reset regex state
      startRegex.lastIndex = 0;

      let match;
      while ((match = startRegex.exec(value)) !== null) {
        const startBlock = match[0];
        const idx = match.index;

        // Find which definition this corresponds to
        const def = definitions.find((d) => d.start === startBlock);
        if (!def) continue;

        const defIndex = definitions.indexOf(def);

        let isValid = true;
        if (def.start === "<") {
          const nextChar = value[idx + def.start.length];

          // For the < delimiter, ONLY match JSX components (uppercase first letter)
          // This distinguishes JSX components like <Button> from HTML like <div>
          // Hugo shortcodes use {{< delimiter so they won't hit this path
          const isJsxOpening = nextChar >= "A" && nextChar <= "Z";
          const isJsxClosing =
            nextChar === "/" &&
            value[idx + def.start.length + 1] >= "A" &&
            value[idx + def.start.length + 1] <= "Z";

          // Reject if it's NOT a JSX component (e.g., reject <hr>, <div>, etc.)
          if (!isJsxOpening && !isJsxClosing) {
            isValid = false;
          }
        }

        if (isValid) {
          bestMatch = {
            start: def.start,
            end: def.end,
            index: idx,
            definitionIndex: defIndex,
          };
          break; // Found the first valid match
        }
      }

      if (!bestMatch) return;

      const matchResult = bestMatch as ShortcodeMatch;

      const startIdx = matchResult.index;
      const startBlock = matchResult.start;
      const endBlock = matchResult.end;

      const endIdx = value.indexOf(endBlock, startIdx + startBlock.length);
      let fullContent = "";
      const nodesToMerge: Node[] = [];
      let postText = "";
      let foundEnd = false;

      if (endIdx !== -1) {
        // Found in current node
        fullContent = value.slice(startIdx, endIdx + endBlock.length);
        postText = value.slice(endIdx + endBlock.length);
        foundEnd = true;
      } else {
        // Look ahead logic for split nodes (e.g. by remark-gfm autolink)
        let tempContent = value.slice(startIdx);
        let siblingIdx = index + 1;

        while (siblingIdx < parent.children.length) {
          const sibling = parent.children[siblingIdx];
          let siblingText = "";

          if (sibling.type === "text" || sibling.type === "html") {
            siblingText = nodeValue(sibling);
          } else if (
            sibling.type === "link" ||
            sibling.type === "strong" ||
            sibling.type === "emphasis"
          ) {
            const firstChild = sibling.children?.[0];
            if (firstChild && nodeValue(firstChild)) {
              siblingText = nodeValue(firstChild);
            } else {
              siblingText = "";
            }
          } else {
            break;
          }

          tempContent += siblingText;
          nodesToMerge.push(sibling);

          const matchPos = tempContent.indexOf(endBlock);
          if (matchPos !== -1) {
            const matchEnd = matchPos + endBlock.length;
            fullContent = tempContent.slice(0, matchEnd);
            postText = tempContent.slice(matchEnd);
            foundEnd = true;
            break;
          }

          siblingIdx++;
        }
      }

      if (!foundEnd) return;

      // Found a shortcode
      const preText = value.slice(0, startIdx);
      // fullContent is the complete shortcode string
      const shortcodeRaw = fullContent;

      const nodes: RootContent[] = [];

      // The fragments keep the split node's own type. Emitting the leftovers
      // of an `html` node as text turns markup like `<br />` into literal
      // characters, which the stringifier then escapes to `\<br />`.
      const fragmentType = node.type === "html" ? "html" : "text";

      if (preText) {
        nodes.push({ type: fragmentType, value: preText });
      }

      // Mark if this is a JSX component
      const isJsxComponent = startBlock === "<";

      nodes.push({
        type: "shortcode",
        content: stripInvisibleChars(shortcodeRaw),
        data: {
          hName: "shortcode",
          hProperties: {
            content: stripInvisibleChars(shortcodeRaw),
          },
          shortcode: {
            definitionIndex: matchResult.definitionIndex,
            start: startBlock,
            end: endBlock,
            startContent: stripInvisibleChars(shortcodeRaw),
            isJsxComponent, // Add metadata to distinguish JSX from Hugo
          },
        },
      });

      if (postText) {
        nodes.push({ type: fragmentType, value: postText });
      }

      // Replace the current node AND any merged siblings
      const removeCount = 1 + nodesToMerge.length;
      parent.children.splice(index, removeCount, ...nodes);

      // Return the next index to visit
      if (postText) {
        return index + nodes.length - 1;
      }
      return index + nodes.length;
    });

    // Second pass: Lift standalone shortcodes out of paragraphs EARLY.
    // This ensures opening/closing tags become siblings at the root so they can be merged.
    stitchSplitShortcodes(tree);

    // Dynamic Discovery: Collect all shortcode names that have closing tags in this document.
    // This allows us to handle user-defined block shortcodes without hardcoding names.
    const closingShortcodeNames = new Set<string>();
    visit(tree, "shortcode", (node) => {
      const info = parseShortcodeNode(node, definitions);
      if (info && info.isClosing) {
        closingShortcodeNames.add(info.name);
      }
    });

    visit(tree, "paragraph", (node, index, parent) => {
      if (!parent || index === undefined) return;

      const children = node.children;
      const hasShortcode = children.some((child) => child.type === "shortcode");

      if (!hasShortcode) return;

      const newNodes: RootContent[] = [];
      let currentParagraphChildren: PhrasingContent[] = [];

      const containsRealText = children.some(
        (c) =>
          c.type === "text" && normalizeForTagMatch(nodeValue(c)).length > 0,
      );

      for (const child of children) {
        if (child.type === "shortcode") {
          // Check if this is a JSX inline component
          const shortcodeMeta = shortcodeMetaOf(child);

          // If it's a JSX component, we MUST lift it if it's standalone or part of a PascalCase pair
          // To be safe and ensure nesting works, we lift if it's PascalCase
          const isPascalCase = shortcodeMeta?.isJsxComponent;

          if (isPascalCase) {
            // Closing JSX tags (</Tab>, </Tabs>, etc.) are ALWAYS lifted.
            const isClosingTag = child.content?.trimStart().startsWith("</");

            if (!isClosingTag) {
              // For opening/self-closing tags, only keep inline if there is
              // real text in the nodes accumulated BEFORE this one.
              const hasRealTextBefore = currentParagraphChildren.some((c) => {
                if (c.type === "text") {
                  return normalizeForTagMatch(nodeValue(c)).length > 0;
                }
                return c.type !== "shortcode";
              });

              if (hasRealTextBefore) {
                currentParagraphChildren.push(child);
                continue;
              }
            }
          } else {
            // Dynamic block identification:
            // If we've seen a closing tag for this name elsewhere in the document, we lift it.
            // Also lift if it's at the start of the paragraph (standard Hugo block behavior).
            const isKnownBlock = closingShortcodeNames.has(
              shortcodeMeta?.name || "",
            );
            const isAtStart = currentParagraphChildren.every(
              (c) => c.type === "text" && !normalizeForTagMatch(nodeValue(c)),
            );

            const shouldLift =
              shortcodeMeta?.isBlock ||
              isKnownBlock ||
              isAtStart ||
              !containsRealText;

            if (!shouldLift) {
              currentParagraphChildren.push(child);
              continue;
            }
          }

          // If we're lifting it, and it's an opening tag, mark as block for merger
          const nodeMeta = getShortcodeMeta(child as ShortcodeNode);
          if (!containsRealText && nodeMeta && !nodeMeta.isClosing) {
            nodeMeta.isBlock = true;
          }

          // Lift block shortcodes out of paragraphs (existing behavior)
          if (currentParagraphChildren.length > 0) {
            const hasMeaningfulText = currentParagraphChildren.some(
              (c) =>
                c.type !== "text" ||
                normalizeForTagMatch(nodeValue(c)).length > 0,
            );

            if (hasMeaningfulText) {
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
        const hasMeaningfulText = currentParagraphChildren.some(
          (c) =>
            c.type !== "text" || normalizeForTagMatch(nodeValue(c)).length > 0,
        );

        if (hasMeaningfulText) {
          newNodes.push({
            type: "paragraph",
            children: currentParagraphChildren,
          });
        }
      }

      parent.children.splice(index, 1, ...newNodes);
      return index + newNodes.length;
    });

    // Third pass: Recursively lift closing shortcodes out of nested structures
    function liftClosingShortcodes(node: Node): void {
      if (!isParent(node)) return;

      const children = node.children;
      let i = 0;

      while (i < children.length) {
        const child = children[i];

        // Recursively process children first
        if (isParent(child)) {
          liftClosingShortcodes(child);
        }

        // Check if this child has a trailing closing shortcode (ignoring ZWSPs/whitespace)
        if (isParent(child) && child.children.length > 0) {
          let lastRealIdx = child.children.length - 1;
          while (lastRealIdx >= 0) {
            const gc = child.children[lastRealIdx];
            if (gc.type === "text") {
              if (normalizeForTagMatch(nodeValue(gc)).length === 0) {
                lastRealIdx--;
                continue;
              }
            }
            break;
          }

          if (lastRealIdx >= 0) {
            const lastGrandchild = child.children[lastRealIdx];

            if (lastGrandchild.type === "shortcode") {
              const info = parseShortcodeNode(
                lastGrandchild as ShortcodeNode,
                definitions,
              );

              if (info && info.isClosing) {
                // ... matching check remains ...
                // Check if there's a matching opening in the same parent
                const hasMatchingOpening = child.children.some((gc) => {
                  if (gc === lastGrandchild || gc.type !== "shortcode")
                    return false;
                  const gcInfo = parseShortcodeNode(
                    gc as ShortcodeNode,
                    definitions,
                  );
                  return (
                    gcInfo &&
                    !gcInfo.isClosing &&
                    gcInfo.name === info.name &&
                    gcInfo.definitionIndex === info.definitionIndex
                  );
                });

                if (!hasMatchingOpening) {
                  // Lift it out along with any trailing ignorable nodes
                  const nodesToLift = child.children.splice(lastRealIdx);

                  // Clean up empty children
                  if (
                    child.children.length === 0 &&
                    child.type === "paragraph"
                  ) {
                    // Remove empty paragraph
                    children.splice(i, 1);
                    i--; // Adjust for removal
                  }

                  // Insert the lifted nodes after the current child
                  children.splice(i + 1, 0, ...nodesToLift);

                  // Don't increment i, re-check this position for more trailing shortcodes
                  continue;
                }
              }
            }
          }
        }

        i++;
      }
    }

    liftClosingShortcodes(tree);

    mergeBlockShortcodes(tree, definitions, toMarkdownExtensions);

    // Final Pass: One more visit to paragraphs to lift any newly merged block shortcodes
    visit(tree, "paragraph", (node, index, parent) => {
      if (!parent || index === undefined) return;
      const hasBlockShortcode = node.children.some(
        (c) => c.type === "shortcode" && c.data?.shortcode?.isBlock,
      );
      if (!hasBlockShortcode) return;

      // If a paragraph contains a block shortcode, we should lift it.
      const newNodes: RootContent[] = [];
      let current: PhrasingContent[] = [];

      for (const child of node.children) {
        if (child.type === "shortcode" && child.data?.shortcode?.isBlock) {
          if (current.length > 0) {
            newNodes.push({ type: "paragraph", children: current });
            current = [];
          }
          newNodes.push(child);
        } else {
          current.push(child);
        }
      }
      if (current.length > 0) {
        newNodes.push({ type: "paragraph", children: current });
      }

      parent.children.splice(index, 1, ...newNodes);
      return index + newNodes.length;
    });

    // Fourth pass: Clean up artifacts at root level:
    // - empty paragraphs injected by the editor
    // - whitespace-only text nodes left over from shortcode extraction
    //   (these disrupt toMarkdown block spacing, causing all blocks to fuse)
    if (tree.type === "root" && tree.children) {
      tree.children = tree.children.filter((node) => {
        if (node.type === "paragraph") {
          const hasContent = node.children.some((c) => {
            if (c.type !== "text") return true;
            return normalizeForTagMatch(nodeValue(c)).length > 0;
          });
          return hasContent;
        }
        // Remove whitespace-only text nodes at root level
        if (node.type === "text") {
          return (
            nodeValue(node).replace(/[\u200B\u200C\u200D\uFEFF\s]/g, "")
              .length > 0
          );
        }
        return true;
      });

      visit(tree, "paragraph", (pNode: Parent) => {
        if (!pNode.children || pNode.children.length === 0) return;
        const lastChild = pNode.children[pNode.children.length - 1] as Text;
        if (
          lastChild &&
          lastChild.type === "text" &&
          typeof lastChild.value === "string"
        ) {
          lastChild.value = lastChild.value.replace(/[\r\n]+$/, "");
        }
      });
    }
  }

  // Compiler: Register visitor for remark-stringify
  toMarkdownExtensions.push({
    join: [
      (left: Node, right: Node) => {
        if (left.type === "shortcode" && right.type === "shortcode") {
          const leftMeta = shortcodeMetaOf(left);
          const rightMeta = shortcodeMetaOf(right);

          // Only force flush (no blank line) for adjacent JSX components.
          if (leftMeta?.isJsxComponent && rightMeta?.isJsxComponent) {
            return 0;
          }
          // For all other adjacent shortcodes (e.g. Hugo), use default spacing.
        }

        // Return undefined for everything else to use the default markdown spacing.
        // IMPORTANT: Do NOT return a number for non-shortcode pairs — this was
        // causing headings/paragraphs inside <Tab> children to be fused together.
        return undefined;
      },
    ],
    handlers: {
      shortcode: (
        node: ShortcodeNode,
        _parent: Parent | undefined,
        state: ToMarkdownState,
      ) => {
        const meta = getShortcodeMeta(node);
        const opening = meta?.startContent || node.content;
        const closing = meta?.closingContent || "";

        // A shortcode is a registered parent, but not one of the built-in
        // unions these state helpers are typed against. The second argument is
        // typed `Info`; passing `state` preserves the existing output.
        const asParent = node as unknown as Parents;
        const asInfo = state as unknown as Parameters<
          typeof state.containerFlow
        >[1];

        if (meta?.isBlock) {
          const body = state.containerFlow(
            asParent as Parameters<typeof state.containerFlow>[0],
            asInfo,
          );
          const trimmedBody = body.trim();

          if (!trimmedBody) {
            return closing ? `${opening}\n${closing}` : opening;
          }

          return `${opening}\n${trimmedBody}\n${closing}`;
        }

        const body = state.containerPhrasing(
          asParent as Parameters<typeof state.containerPhrasing>[0],
          state as unknown as Parameters<typeof state.containerPhrasing>[1],
        );
        return `${opening}${body}${closing}`;
      },
    },
  });

  return transformer;
}
