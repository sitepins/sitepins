import { slug } from "github-slugger";
import { marked } from "marked";

// slugify
export const slugify = (content: string) => {
  return slug(content);
};

// markdownify
export const markdownify = (content: string, div?: boolean) => {
  const markdownContent: any = div
    ? marked.parse(content)
    : marked.parseInline(content);
  return { __html: markdownContent };
};

// humanize
export const humanize = (content: string) => {
  return content
    .replace(/^[\s_]+|[\s_]+$/g, "")
    .replace(/[_\s]+/g, " ")
    .replace(/^[a-z]/, function (m) {
      return m.toUpperCase();
    });
};

// titleify
export const titleify = (content: string) => {
  const humanized = humanize(content);
  return humanized
    .replace(/-/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// plainify
export const plainify = (content: string) => {
  const parseMarkdown: any = marked.parse(content);
  const filterBrackets = parseMarkdown.replace(/<\/?[^>]+(>|$)/gm, "");
  const filterSpaces = filterBrackets.replace(/[\r\n]\s*[\r\n]/gm, "");
  const stripHTML = htmlEntityDecoder(filterSpaces);
  return stripHTML;
};

// strip entities for plainify
const htmlEntityDecoder = (htmlWithEntities: string): string => {
  const entityList: { [key: string]: string } = {
    "&nbsp;": " ",
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
    "&quot;": '"',
    "&#39;": "'",
  };
  const htmlWithoutEntities: string = htmlWithEntities.replace(
    /(&amp;|&lt;|&gt;|&quot;|&#39;)/g,
    (entity: string): string => {
      return entityList[entity];
    },
  );
  return htmlWithoutEntities;
};

// slugify with filename extension preservation
export function slugifyFilename(
  filename: string = "media -" + Date.now(),
): string {
  // Trim and normalize unicode spaces
  const normalized = filename.trim();

  // Find the last dot (to preserve multi-dot names)
  const lastDotIndex = normalized.lastIndexOf(".");

  // No extension case
  if (lastDotIndex === -1) {
    return slug(normalized);
  }

  const name = normalized.slice(0, lastDotIndex);
  const ext = normalized.slice(lastDotIndex + 1);

  // Slugify only the name, keep extension lowercase
  const safeName = slug(name);
  const safeExt = ext.toLowerCase();

  return `${safeName}.${safeExt}`;
}
