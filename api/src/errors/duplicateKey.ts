// E11000 helpers. The driver's message names the database and index, so
// replies are built from `keyPattern` field names only.

type DuplicateKeyError = {
  code?: number;
  keyPattern?: Record<string, unknown>;
};

export const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as DuplicateKeyError).code === 11000;

export const duplicateKeyFields = (error: unknown): string[] => {
  const keyPattern = (error as DuplicateKeyError | null)?.keyPattern;
  return keyPattern && typeof keyPattern === "object"
    ? Object.keys(keyPattern)
    : [];
};

const FIELD_MESSAGES: Record<string, string> = {
  email: "An account with this email already exists",
  user_id: "An account with this identifier already exists",
  org_id: "An organization with this identifier already exists",
  order_id: "This order has already been recorded",
};

export const duplicateKeyMessage = (error: unknown): string => {
  for (const field of duplicateKeyFields(error)) {
    const message = FIELD_MESSAGES[field];
    if (message) return message;
  }
  return "That value is already in use";
};
