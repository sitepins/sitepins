import { MarkdownPlugin } from "@platejs/markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { imageSerializationRules } from "../snippets/common/image-serialization";
import { remarkMdx } from "../snippets/common/remark-mdx-extension";
import { htmlSerializationRules } from "../snippets/html/html-serialization";
import { remarkHtml } from "../snippets/html/html-transformer";
import { hugoSerializationRules } from "../snippets/hugo/hugo-serialization";
import { remarkHugo } from "../snippets/hugo/hugo-transformer";
import { jsxSerializationRules } from "../snippets/jsx/jsx-serialization";
import { remarkJsx } from "../snippets/jsx/jsx-transformer";

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
        remarkHtml, // Detect and preserve HTML elements
        remarkJsx, // Detect JSX components
        remarkHugo, // Detect Hugo shortcodes
        remarkMath, // Math notation support
        remarkGfm, // GitHub Flavored Markdown
        remarkMdx, // MDX extension
      ],

      // Serialization rules define how to convert between Slate and markdown
      rules: {
        // HTML snippets (block and inline)
        ...htmlSerializationRules,

        // Hugo shortcodes (also handles JSX during deserialization)
        ...hugoSerializationRules,

        // JSX components (block and inline)
        ...jsxSerializationRules,

        // Images
        ...imageSerializationRules,
      },
    },
  }),
];
