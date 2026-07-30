/**
 * Readers for values caught in a `catch`. TypeScript types those as `unknown`;
 * these pull out the fields the UI actually needs (an RTK Query rejection, a
 * fetch failure and a plain Error all differ) without widening back to `any`.
 */

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;

export const errorStatus = (error: unknown): number | undefined => {
  const err = asRecord(error);
  const status = err?.status ?? asRecord(err?.response)?.status;
  return typeof status === "number" ? status : undefined;
};

/** Prefers an RTK Query `error.data.message` over the thrown message. */
export const errorMessage = (error: unknown): string | undefined => {
  const err = asRecord(error);
  const data = asRecord(err?.data);
  const candidates = [data?.message, err?.message, err?.error];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return undefined;
};

export const errorMessageOr = (error: unknown, fallback: string): string =>
  errorMessage(error) ?? fallback;
