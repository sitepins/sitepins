import { PackageLimit } from "@/config/limits";
import { EPackage } from "@/config/plans";
import type { ClientSession } from "mongoose";

export type PlanLimits = (typeof PackageLimit)[EPackage];

export type Entitlements = {
  currentPackage: EPackage;
  limits: PlanLimits;
};

export type EntitlementsProvider = (userId: string) => Promise<Entitlements>;

// Self-hosted default: every feature unlocked, no limits.
// A hosted deployment can replace this with a billing-backed provider
// via setEntitlementsProvider().
let entitlementsProvider: EntitlementsProvider = async () => ({
  currentPackage: EPackage.ENTERPRISE,
  limits: PackageLimit[EPackage.ENTERPRISE],
});

export const setEntitlementsProvider = (provider: EntitlementsProvider) => {
  entitlementsProvider = provider;
};

export const checkOrder = (userId: string): Promise<Entitlements> =>
  entitlementsProvider(userId);

// Re-applies plan limits after a plan change (archiving excess orgs/projects).
// No-op by default; a billing extension registers the real enforcer.
type PlanEnforcer = (userId: string) => Promise<void>;

let planEnforcer: PlanEnforcer = async () => {};

export const setPlanEnforcer = (enforcer: PlanEnforcer) => {
  planEnforcer = enforcer;
};

export const enforcePlanLimits = (userId: string) => planEnforcer(userId);

// Extensions register hooks here to clean up (or archive) their own
// collections when a user account is deleted.
export type UserDeletionContext = {
  userId: string;
  // the user document/session-user being deleted, as known at deletion time
  user: any;
  reason?: string;
  session: ClientSession;
};

export type UserDeletionHook = (ctx: UserDeletionContext) => Promise<void>;

const userDeletionHooks: UserDeletionHook[] = [];

export const onUserDeletion = (hook: UserDeletionHook) => {
  userDeletionHooks.push(hook);
};

export const runUserDeletionHooks = async (ctx: UserDeletionContext) => {
  for (const hook of userDeletionHooks) {
    await hook(ctx);
  }
};

// Auth lifecycle events (login, password reset). No-op unless an extension
// registers a handler — the cloud edition uses these for activity logging.
export type AuthEvent =
  | { type: "login"; userId: string; ip: string; date: string }
  | { type: "password_reset"; userId: string; date: string };

export type AuthEventHandler = (event: AuthEvent) => Promise<void>;

const authEventHandlers: AuthEventHandler[] = [];

export const onAuthEvent = (handler: AuthEventHandler) => {
  authEventHandlers.push(handler);
};

export const emitAuthEvent = async (event: AuthEvent) => {
  for (const handler of authEventHandlers) {
    try {
      await handler(event);
    } catch (error) {
      console.error(`auth event handler failed (${event.type}):`, error);
    }
  }
};
