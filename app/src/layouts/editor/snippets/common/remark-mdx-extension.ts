import { mdxToMarkdown } from "mdast-util-mdx";

/**
 * Remark plugin to add mdxToMarkdown extension to the compiler options.
 * This is required for correctly serializing MDX/JSX nodes.
 */
export function remarkMdx(this: any) {
  const data = this.data();
  const extensions =
    data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
  extensions.push(mdxToMarkdown());
}
