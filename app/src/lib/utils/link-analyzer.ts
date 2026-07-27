export interface LinkInfo {
  text: string;
  url: string;
  isInternal: boolean;
}

export function extractLinks(content: string, baseUrl?: string): LinkInfo[] {
  if (!content) return [];

  const internalDomains = baseUrl
    ? [baseUrl.replace(/^https?:\/\//, "")]
    : ["localhost", "127.0.0.1"];
  const internalDomainsPattern = internalDomains
    .map((domain) => domain.replace(/\./g, "\\."))
    .join("|");

  const links: LinkInfo[] = [];
  const seenUrls = new Set<string>();

  // Helper to categorize and add link
  const addLink = (text: string, url: string) => {
    if (!url || url.startsWith("#") || seenUrls.has(url)) return;

    seenUrls.add(url);

    const isInternal =
      url.startsWith("/") ||
      url.startsWith("./") ||
      url.startsWith("../") ||
      new RegExp(`^https?:\\/\\/(?:${internalDomainsPattern})`, "i").test(url);

    links.push({ text, url, isInternal });
  };

  // 1. Extract Markdown links (ensure not an image)
  const markdownLinkRegex = /(?<!\!)\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = markdownLinkRegex.exec(content)) !== null) {
    addLink(match[1], match[2]);
  }

  // 2. Extract HTML links
  const htmlLinkRegex =
    /<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = htmlLinkRegex.exec(content)) !== null) {
    const url = match[1];
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    addLink(text, url);
  }

  // 3. Extract plain URLs (optional, but good for completeness)
  const urlRegex = /(?:^|\s)(https?:\/\/[^\s]+)/g;
  while ((match = urlRegex.exec(content)) !== null) {
    addLink(match[1], match[1]);
  }

  return links;
}
