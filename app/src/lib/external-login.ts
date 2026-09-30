"use client";

// Hands a login off from another site. There are no such integrations here,
// so this is a no-op.

export type TRedirectUser = {
  email: string;
  first_name: string;
  last_name: string;
};

export function useExternalLoginBridge(_args: {
  from: string;
  callbackURL: string;
}): {
  pending: boolean;
  redirectUser: TRedirectUser | null;
} {
  return { pending: false, redirectUser: null };
}
