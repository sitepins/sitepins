"use client";

// Partner-store login bridge. The open-source build has no partner store
// integrations, so this is a no-op. A hosted deployment can override this
// module (partner-login.cloud.ts) to verify purchases made on partner
// stores and pre-create accounts for those customers.

export type TRedirectUser = {
  email: string;
  first_name: string;
  last_name: string;
};

export function usePartnerLoginBridge(_args: {
  from: string;
  callbackURL: string;
}): {
  pending: boolean;
  redirectUser: TRedirectUser | null;
} {
  return { pending: false, redirectUser: null };
}
