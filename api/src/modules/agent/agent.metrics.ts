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

/** Logs every call with ok/error_code; a rising not_found, no_match or unknown_field rate means agents are guessing. */
export const measureTool = async <T>(
  tool: string,
  grantId: string,
  fn: () => Promise<{ value: T; code?: string }>,
  sizeOf: (result: T) => number,
): Promise<T> => {
  const metrics: TToolMetrics = { upstream: 0 };
  const started = performance.now();
  const { value, code } = await storage.run(metrics, fn);
  const fields = {
    tool,
    grant_id: grantId,
    ok: !code,
    ...(code && { error_code: code }),
    ms: Math.round(performance.now() - started),
    upstream: metrics.upstream,
    bytes: sizeOf(value),
  };
  if (fields.ms > SLOW_TOOL_MS) logger.warn("[agents] slow tool call", fields);
  else if (code) logger.info("[agents] tool call failed", fields);
  else logger.debug("[agents] tool call", fields);
  return value;
};
