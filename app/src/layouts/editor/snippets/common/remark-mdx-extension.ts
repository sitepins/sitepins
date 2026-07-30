import { mdxToMarkdown } from "mdast-util-mdx";
import type { Options as ToMarkdownOptions } from "mdast-util-to-markdown";
import type { Processor } from "unified";

type ProcessorData = {
  toMarkdownExtensions?: NonNullable<ToMarkdownOptions["extensions"]>;
};

/**
 * Remark plugin to add mdxToMarkdown extension to the compiler options.
 * This is required for correctly serializing MDX/JSX nodes.
 */
export function remarkMdx(this: Processor) {
  const data = this.data() as ProcessorData;
  const extensions =
    data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
  extensions.push(mdxToMarkdown());
}
