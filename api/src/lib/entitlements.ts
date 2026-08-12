import { TAuthUser } from "@/types";
import type { ClientSession } from "mongoose";
import { logger } from "@/lib/logger";

// Extensions register hooks here to clean up (or archive) their own
// collections when a user account is deleted.
export type UserDeletionContext = {
  userId: string;
  // the user document/session-user being deleted, as known at deletion time
  user: TAuthUser;
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
      logger.error(`auth event handler failed (${event.type})`, error);
    }
  }
};
