import { logger } from "@/lib/logger";
import { AsyncLocalStorage } from "node:async_hooks";

type TToolMetrics = { upstream: number };

const SLOW_TOOL_MS = 2_000;
const storage = new AsyncLocalStorage<TToolMetrics>();

/** Counts a GitHub/GitLab request against the tool call in progress. */
export const countUpstream = () => {
  const metrics = storage.getStore();
  if (metrics) metrics.upstream++;
};

export const measureTool = async <T>(
  tool: string,
  grantId: string,
  fn: () => Promise<T>,
  sizeOf: (result: T) => number,
): Promise<T> => {
  const metrics: TToolMetrics = { upstream: 0 };
  const started = performance.now();
  const result = await storage.run(metrics, fn);
  const fields = {
    tool,
    grant_id: grantId,
    ms: Math.round(performance.now() - started),
    upstream: metrics.upstream,
    bytes: sizeOf(result),
  };
  if (fields.ms > SLOW_TOOL_MS) logger.warn("[agents] slow tool call", fields);
  else logger.debug("[agents] tool call", fields);
  return result;
};
