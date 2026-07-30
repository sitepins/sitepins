// better-auth's inferred session type does not carry the configured
// `additionalFields`, so `user_id` has to be read defensively. One helper
// keeps that gap in a single place instead of an `as any` per call site.
export const getSessionUserId = (session: unknown): string | undefined => {
  const user = (
    session as { user?: Record<string, unknown> } | null | undefined
  )?.user;
  const userId = user?.user_id;
  return typeof userId === "string" && userId ? userId : undefined;
};

export const getSessionUserRole = (session: unknown): string | undefined => {
  const user = (
    session as { user?: Record<string, unknown> } | null | undefined
  )?.user;
  const role = user?.role;
  return typeof role === "string" ? role : undefined;
};
