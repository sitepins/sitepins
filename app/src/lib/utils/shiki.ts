import { languageMap } from "@/app/[locale]/[orgId]/[projectId]/code/[...file]/_components/file-icons";
import { shikiToMonaco } from "@shikijs/monaco";
import { createHighlighter } from "shiki";

// Singleton — reused across editor mounts and HMR cycles.
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;
let cachedHighlighter: Awaited<ReturnType<typeof createHighlighter>> | null =
  null;

/** Start loading Shiki immediately. Safe to call multiple times. */
export function preloadShiki(): Promise<void> {
  if (!highlighterPromise) {
    const langs = Object.values(languageMap);
    highlighterPromise = createHighlighter({
      themes: ["light-plus", "dark-plus"],
      langs,
    }).then((h) => {
      cachedHighlighter = h;
      return h;
    });
  }
  return highlighterPromise.then(() => {});
}

/**
 * Apply the pre-loaded Shiki highlighter to a Monaco instance synchronously.
 * Call this from MonacoEditor's `beforeMount` — by that point `preloadShiki()`
 * must have already resolved (gate Monaco render on the returned promise).
 */
export function applyShikiToMonaco(monaco: any, theme: string) {
  if (!cachedHighlighter) return;
  const langs = Object.values(languageMap);
  langs.forEach((lang) => monaco.languages.register({ id: lang }));
  shikiToMonaco(cachedHighlighter, monaco);
  monaco.editor.setTheme(theme);
}

/** Legacy async helper kept for any other callers. */
export async function initializeShiki(monaco: any, theme?: string) {
  await preloadShiki();
  applyShikiToMonaco(monaco, theme ?? "light-plus");
}
