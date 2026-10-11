import { mapWithConcurrency } from "@/lib/git-engine/http";
import { TGitClient, TGitFile, TTreeEntry } from "@/lib/git-engine/types";
import { TAgentContext } from "./agent.type";

type TLruOptions<V> = {
  maxEntries: number;
  maxBytes?: number;
  ttlMs?: number;
  sizeOf?: (value: V) => number;
};

type TLruEntry<V> = { value: V; size: number; expires: number };

export class LruCache<K, V> {
  private entries = new Map<K, TLruEntry<V>>();
  private bytes = 0;

  constructor(private options: TLruOptions<V>) {}

  get(key: K): V | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expires && hit.expires <= Date.now()) {
      this.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: K, value: V) {
    this.delete(key);
    const size = this.options.sizeOf?.(value) ?? 0;
    if (this.options.maxBytes && size > this.options.maxBytes) return;
    const expires = this.options.ttlMs ? Date.now() + this.options.ttlMs : 0;
    this.entries.set(key, { value, size, expires });
    this.bytes += size;
    for (const oldest of this.entries.keys()) {
      const overCount = this.entries.size > this.options.maxEntries;
      const overBytes =
        this.options.maxBytes !== undefined &&
        this.bytes > this.options.maxBytes;
      if (!overCount && !overBytes) break;
      this.delete(oldest);
    }
  }

  delete(key: K) {
    const hit = this.entries.get(key);
    if (!hit) return;
    this.bytes -= hit.size;
    this.entries.delete(key);
  }

  deleteWhere(match: (key: K, value: V) => boolean) {
    for (const [key, entry] of [...this.entries]) {
      if (match(key, entry.value)) this.delete(key);
    }
  }

  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}

const MAX_CACHED_BLOB = 1024 * 1024;

type TCachedAgent = Omit<TAgentContext, "token">;

export type TCachedGitClient = TGitClient & {
  readFiles: NonNullable<TGitClient["readFiles"]>;
};
type TTree = { entries: TTreeEntry[]; truncated: boolean };

const agents = new LruCache<string, TCachedAgent>({
  maxEntries: 1000,
  ttlMs: 30_000,
});
const heads = new LruCache<string, string>({
  maxEntries: 2000,
  ttlMs: 5_000,
});
const trees = new LruCache<string, TTree>({ maxEntries: 200 });
const blobs = new LruCache<string, Buffer>({
  maxEntries: 20_000,
  maxBytes: 64 * 1024 * 1024,
  sizeOf: (b) => b.length,
});
// Blob sha of a path at a commit; null when the path isn't a file there.
const blobAt = new LruCache<string, string | null>({ maxEntries: 50_000 });
const contexts = new LruCache<string, unknown>({ maxEntries: 100 });

export const agentCache = {
  getAgent: (tokenIndex: string) => agents.get(tokenIndex),
  setAgent: (tokenIndex: string, agent: TCachedAgent) =>
    agents.set(tokenIndex, agent),
  getContext: <T>(key: string) => contexts.get(key) as T | undefined,
  setContext: (key: string, value: unknown) => contexts.set(key, value),
};

/** Drops cached agent identities so the next call re-checks the token and membership. */
export const forgetAgents = (match: {
  grant_id?: string;
  user_id?: string;
  org_id?: string;
}) => {
  agents.deleteWhere(
    (_, agent) =>
      (!match.grant_id || agent.grant.grant_id === match.grant_id) &&
      (!match.user_id || agent.user_id === match.user_id) &&
      (!match.org_id || agent.grant.org_id === match.org_id),
  );
};

/** The branch moved (a commit from the editor or an agent). */
export const forgetHead = (projectId: string) => {
  heads.deleteWhere((key) => key.startsWith(`${projectId}:`));
};

export const clearAgentCaches = () => {
  for (const cache of [agents, heads, trees, blobs, blobAt, contexts]) {
    cache.clear();
  }
};

const COMMIT_SHA = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;
const isCommitSha = (ref: string) => COMMIT_SHA.test(ref);

const under = (path: string, dir: string) =>
  path === dir || path.startsWith(`${dir}/`);

/**
 * Serves reads from memory where git makes that safe: trees and blobs never
 * change for a given sha, and the branch head is trusted for a few seconds.
 * Writes must use the raw client, which always reads the live head.
 */
export const withCache = (
  client: TGitClient,
  scope: { repoKey: string; projectId: string },
): TCachedGitClient => {
  const treeKey = (at: string, dir?: string) =>
    `${scope.repoKey}@${at}:${dir ?? ""}`;
  const pathKey = (at: string, path: string) =>
    `${scope.repoKey}@${at}|${path}`;

  const knownBlob = (at: string, path: string): string | null | undefined => {
    const known = blobAt.get(pathKey(at, path));
    if (known !== undefined) return known;
    const full = trees.get(treeKey(at));
    if (!full || full.truncated) return undefined;
    return (
      full.entries.find((e) => e.type === "blob" && e.path === path)?.sha ??
      null
    );
  };

  const fromCache = (at: string, path: string): TGitFile | null | undefined => {
    const sha = knownBlob(at, path);
    if (sha === null) return null;
    const content = sha ? blobs.get(sha) : undefined;
    return sha && content ? { path, sha, content } : undefined;
  };

  const remember = (at: string, path: string, file: TGitFile | null) => {
    blobAt.set(pathKey(at, path), file?.sha ?? null);
    if (file && file.content.length <= MAX_CACHED_BLOB) {
      blobs.set(file.sha, file.content);
    }
  };

  const readFile = async (at: string, path: string) => {
    if (!isCommitSha(at)) return client.readFile(at, path);
    const hit = fromCache(at, path);
    if (hit !== undefined) return hit;
    const file = await client.readFile(at, path);
    remember(at, path, file);
    return file;
  };

  return {
    ...client,

    async readHead() {
      const key = `${scope.projectId}:${client.branch}`;
      const hit = heads.get(key);
      if (hit) return hit;
      const head = await client.readHead();
      if (head) heads.set(key, head);
      return head;
    },

    async readTree(at, dir) {
      if (!isCommitSha(at)) return client.readTree(at, dir);
      const full = trees.get(treeKey(at));
      if (full && !full.truncated) {
        return dir
          ? {
              entries: full.entries.filter(
                (e) => e.path !== dir && under(e.path, dir),
              ),
              truncated: false,
            }
          : full;
      }
      const hit = trees.get(treeKey(at, dir));
      if (hit) return hit;
      const tree = await client.readTree(at, dir);
      trees.set(treeKey(at, dir), tree);
      return tree;
    },

    readFile,

    async readFiles(at, paths) {
      const result = new Map<string, TGitFile | null>();
      const misses: string[] = [];
      for (const path of paths) {
        const hit = isCommitSha(at) ? fromCache(at, path) : undefined;
        if (hit === undefined) misses.push(path);
        else result.set(path, hit);
      }
      if (misses.length) {
        const fetched = client.readFiles
          ? await client.readFiles(at, misses)
          : new Map(
              await mapWithConcurrency(misses, 6, async (path) => {
                const file = await client.readFile(at, path);
                return [path, file] as const;
              }),
            );
        for (const path of misses) {
          const file = fetched.get(path) ?? null;
          if (isCommitSha(at)) remember(at, path, file);
          result.set(path, file);
        }
      }
      return result;
    },
  };
};
