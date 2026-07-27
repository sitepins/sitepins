// Per-framework sandbox behavior. Kept free of server-only imports so the
// preview client can read the same descriptors.

export type FrameworkSpec = {
  /** Port the dev server is expected to listen on. */
  port: number;
  /** Rewrite package.json dev scripts (host/draft flags) before starting. */
  patchScripts?: boolean;
  /** Which reload bridge to inject, if any. */
  bridge?: "nextjs" | "tanstack";
  /** Dev command that needs building instead of running the package script. */
  devCommand?: "hugo" | "hugo_examplesite" | "tanstack";
  /** Requires the Go + Hugo toolchain to be installed on cold start. */
  needsHugoToolchain?: boolean;
  /** Pass BUILD_DRAFTS / BUILD_FUTURE to the dev server. */
  draftEnv?: boolean;
  /** Dev server repaints the preview tab by itself on a content write. */
  hmrRefreshesContent?: boolean;
  /** Static generator whose preview tab needs a nudge after a restart. */
  staticGenerator?: boolean;
};

export const FRAMEWORKS: Record<string, FrameworkSpec> = {
  nextjs: { port: 3000, patchScripts: true, bridge: "nextjs", draftEnv: true },
  next: { port: 3000, draftEnv: true },
  tanstack: {
    port: 3000,
    bridge: "tanstack",
    devCommand: "tanstack",
    draftEnv: true,
  },
  astro: { port: 4321, patchScripts: true, hmrRefreshesContent: true },
  hugo: {
    port: 1313,
    patchScripts: true,
    devCommand: "hugo",
    needsHugoToolchain: true,
    hmrRefreshesContent: true,
    staticGenerator: true,
  },
  hugo_examplesite: {
    port: 1313,
    patchScripts: true,
    devCommand: "hugo_examplesite",
    needsHugoToolchain: true,
    hmrRefreshesContent: true,
    staticGenerator: true,
  },
  jekyll: {
    port: 4000,
    patchScripts: true,
    hmrRefreshesContent: true,
    staticGenerator: true,
  },
  hexo: {
    port: 3000,
    patchScripts: true,
    hmrRefreshesContent: true,
    staticGenerator: true,
  },
  gatsby: { port: 8000 },
  nuxt: { port: 3000 },
  remix: { port: 3000 },
  sveltekit: { port: 5173 },
  vite: { port: 5173 },
  react: { port: 5173 },
};

export function frameworkSpec(generator?: string | null): FrameworkSpec | null {
  return FRAMEWORKS[(generator ?? "").toLowerCase()] ?? null;
}

/** Falls back to the Next.js port, matching the sandbox's historical default. */
export function frameworkPort(generator?: string | null): number {
  const key = (generator ?? "nextjs").toLowerCase().replace(/[^a-z_]/g, "");
  return FRAMEWORKS[key]?.port ?? 3000;
}
