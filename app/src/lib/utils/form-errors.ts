import { FieldErrors } from "react-hook-form";

/**
 * react-hook-form nests errors one level deep for object fields, so the first
 * useful message can sit either on the field or on one of its children.
 */
export const firstFormErrorMessage = (
  errors: FieldErrors | undefined,
): string | undefined => {
  for (const value of Object.values(errors ?? {})) {
    if (!value) continue;

    const message = (value as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;

    if (typeof value === "object") {
      for (const nested of Object.values(value)) {
        if (typeof nested === "string" && nested) return nested;
        const nestedMessage = (nested as { message?: unknown })?.message;
        if (typeof nestedMessage === "string" && nestedMessage) {
          return nestedMessage;
        }
      }
    }
  }
  return undefined;
};
