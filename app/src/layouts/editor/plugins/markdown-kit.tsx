import { MarkdownPlugin } from "@platejs/markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Processor } from "unified";
import { imageSerializationRules } from "../snippets/common/image-serialization";
import { remarkMdx } from "../snippets/common/remark-mdx-extension";
import { htmlSerializationRules } from "../snippets/html/html-serialization";
import { remarkHtml } from "../snippets/html/html-transformer";
import { hugoSerializationRules } from "../snippets/hugo/hugo-serialization";
import { remarkHugo } from "../snippets/hugo/hugo-transformer";
import { jsxSerializationRules } from "../snippets/jsx/jsx-serialization";
import { remarkJsx } from "../snippets/jsx/jsx-transformer";
import { mdxCommentSerializationRules } from "../snippets/mdx-comment/mdx-comment-serialization";
import { remarkMdxComment } from "../snippets/mdx-comment/mdx-comment-transformer";

/**
 * remark-math with single-dollar text math off so currency like `$75` is not
 * treated as math / escaped. Block and `$$…$$` inline math still work.
 * Wrappers are used because Plate types `remarkPlugins` as `Plugin[]` (no tuples).
 */
function remarkMathDoubleDollarOnly(this: Processor) {
  remarkMath.call(this, { singleDollarTextMath: false });
}

/** remark-gfm without table column realignment (keeps default cell padding). */
function remarkGfmNoTableAlign(this: Processor) {
  remarkGfm.call(this, { tablePipeAlign: false });
}

/**
 * Markdown plugin configuration for the rich text editor
 *
 * This configures how markdown is parsed and serialized:
 * - remarkPlugins: Transform markdown AST (e.g., detect Hugo shortcodes)
 * - rules: Convert between Slate nodes and markdown AST nodes
 */
export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      // Remark plugins process the markdown AST
      // Order matters: process custom syntax before standard markdown
      remarkPlugins: [
        remarkMdxComment, // Capture MDX comments before anything reads inside them
        remarkHtml, // Detect and preserve HTML elements
        remarkJsx, // Detect JSX components
        remarkHugo, // Detect Hugo shortcodes
        remarkMathDoubleDollarOnly,
        remarkGfmNoTableAlign,
        remarkMdx, // MDX extension
      ],

      // Plate serializeMd defaults to emphasis: '_' then spreads these options.
      remarkStringifyOptions: {
        emphasis: "*",
        bullet: "-",
      },

      // Serialization rules define how to convert between Slate and markdown
      rules: {
        // HTML snippets (block and inline)
        ...htmlSerializationRules,

        // Hugo shortcodes (also handles JSX during deserialization)
        ...hugoSerializationRules,

        // JSX components (block and inline)
        ...jsxSerializationRules,

        // MDX comments (block and inline)
        ...mdxCommentSerializationRules,

        // Images
        ...imageSerializationRules,
      },
    },
  }),
];
