import { getAICredential } from "@/editor/plugins/copilot-kit";
import type {
  TSearchAssistResult,
  TSearchIndexFile,
} from "@/lib/ai/search-assist";
import { resolveRepoPath } from "@/lib/utils/common";
import type { TFileMetaCacheEntry } from "@/redux/features/config/meta-slice";
import { getGitProviderAdapter } from "@/redux/features/git/provider-adapter";
import type { AppDispatch } from "@/redux/store";
import { TConfig, TFiles } from "@/types";

/**
 * Client helpers for the global search's Copilot: the file index sent to
 * `/api/ai/search`, the file the user is viewing, and fetching file contents
 * so Copilot answers from what files actually say.
 */

/** Tree nodes carry a virtual `content/` prefix in front of the repo path. */
export const toRepoPath = (file: TFiles): string =>
  file.path.replace(/^content\//, "");

type TCollection = { name: string; path: string };

export const findCollection = <T extends TCollection>(
  repoPath: string,
  collections: T[],
): T | undefined =>
  collections.find(
    (c) => repoPath.startsWith(c.path + "/") || repoPath === c.path,
  );

/**
 * Commit dates only exist for files whose folder has been listed this
 * session (the tree endpoint carries no dates), so they are best-effort.
 */
export function buildSearchIndex(
  files: TFiles[],
  config: TConfig | undefined,
  collections: TCollection[],
  meta: Record<string, TFileMetaCacheEntry>,
): TSearchIndexFile[] {
  const prefix = config
    ? `${getGitProviderAdapter(config.provider).repoId(config)}/${config.branch}/`
    : "";
  return files.map((file, id) => {
    const path = toRepoPath(file);
    const cached = prefix ? meta[prefix + path] : undefined;
    return {
      id,
      path,
      collection: findCollection(path, collections)?.name,
      updated: cached?.commitDate ?? file.commitDate,
      created: cached?.createdDate ?? file.createdDate,
      size: file.size ?? cached?.size,
    };
  });
}

/** Repo path of the file open in the editor, or null on non-file pages. */
export function getViewedFilePath({
  pathname,
  projectId,
  params,
  config,
  knownPaths,
}: {
  pathname: string | null;
  projectId?: string;
  params: Record<string, string | string[] | undefined> | null;
  config?: TConfig;
  knownPaths: Set<string>;
}): string | null {
  if (!pathname || !projectId || !params || !config) return null;
  const marker = `/${projectId}/`;
  const index = pathname.indexOf(marker);
  if (index === -1) return null;
  const section = pathname.slice(index + marker.length).split("/")[0];

  const segments = (key: string) => {
    const value = params[key];
    const list = Array.isArray(value) ? value : value ? [value] : [];
    return decodeURIComponent(list.join("/"));
  };

  let candidate = "";
  if (section === "content") {
    candidate = resolveRepoPath(segments("file"), config);
  } else if (section === "code") {
    candidate = segments("file");
  } else if (section === "config") {
    candidate = segments("path");
  }
  // Folder listings share the `[...file]` route; only real files qualify.
  return candidate && knownPaths.has(candidate) ? candidate : null;
}

/** Body fields that tell an AI route which model to use. */
export type TAiRequestCredential = {
  apiKey: string;
  provider: string;
  model: string;
};

/** The user's configured model, or undefined when none is set up. */
export function resolveAiCredential(): TAiRequestCredential | undefined {
  const cred = getAICredential();
  return cred
    ? { apiKey: cred.apiKey, provider: cred.provider, model: cred.model }
    : undefined;
}

/** Asks the model which indexed files would best answer `query`. */
export async function requestFileMatches({
  query,
  files,
  credential,
  signal,
}: {
  query: string;
  files: TSearchIndexFile[];
  credential: TAiRequestCredential;
  signal?: AbortSignal;
}): Promise<TSearchAssistResult> {
  const response = await fetch("/api/ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ query, files, ...credential }),
  });

  if (!response.ok) {
    let message = `AI file lookup failed (${response.status})`;
    try {
      const json = await response.json();
      if (json?.error) message = json.error;
    } catch {
      // keep the status message
    }
    throw new Error(message);
  }
  return (await response.json()) as TSearchAssistResult;
}

/**
 * Reads raw file contents through the same RTK Query cache the editor uses,
 * skipping files that fail to load.
 */
export async function fetchFileContents({
  dispatch,
  getState,
  config,
  paths,
}: {
  dispatch: AppDispatch;
  getState: () => unknown;
  config: TConfig;
  paths: string[];
}): Promise<Array<{ path: string; content: string }>> {
  const adapter = getGitProviderAdapter(config.provider);
  const results = await Promise.allSettled(
    paths.map(async (path) => {
      const args = adapter.contentArgs(config, path, { parser: false });
      const cached = adapter.selectCachedContent(getState(), args);
      const data =
        cached?.data ?? (await adapter.fetchContent(dispatch, args))?.data;
      return typeof data === "string" ? { path, content: data } : null;
    }),
  );
  return results.flatMap((r) =>
    r.status === "fulfilled" && r.value ? [r.value] : [],
  );
}
