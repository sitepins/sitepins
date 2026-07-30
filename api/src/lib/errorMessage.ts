export const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
};

// Third-party SDKs (Brevo, axios) attach the HTTP status either at the top
// level or under `response`. Read both without widening the catch to `any`.
export const errorStatusCode = (error: unknown): number | undefined => {
  const err = error as
    | { statusCode?: unknown; response?: { statusCode?: unknown } }
    | null
    | undefined;
  const status = err?.statusCode ?? err?.response?.statusCode;
  return typeof status === "number" ? status : undefined;
};
