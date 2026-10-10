import { upstreamError } from "./errors";

export type THttpResponse<T> = { status: number; headers: Headers; data: T };

export type THttp = <T>(
  method: string,
  path: string,
  body?: unknown,
) => Promise<THttpResponse<T | null>>;

/** Never put the token in a URL; it travels only in headers. */
export const createHttp = ({
  baseUrl,
  headers,
  fetchImpl = fetch,
}: {
  baseUrl: string;
  headers: Record<string, string>;
  fetchImpl?: typeof fetch;
}): THttp => {
  return async <T>(method: string, path: string, body?: unknown) => {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        ...headers,
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 404 && method !== "POST" && method !== "PATCH") {
      return { status: 404, headers: res.headers, data: null };
    }
    if (!res.ok) {
      throw upstreamError(res.status, await res.text().catch(() => ""));
    }
    if (method === "HEAD" || res.status === 204) {
      return { status: res.status, headers: res.headers, data: null };
    }
    return {
      status: res.status,
      headers: res.headers,
      data: (await res.json()) as T,
    };
  };
};

export const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

export const diffTrees = (
  before: Map<string, string>,
  after: Map<string, string>,
): Set<string> => {
  const changed = new Set<string>();
  for (const [path, sha] of before) {
    if (after.get(path) !== sha) changed.add(path);
  }
  for (const path of after.keys()) {
    if (!before.has(path)) changed.add(path);
  }
  return changed;
};
