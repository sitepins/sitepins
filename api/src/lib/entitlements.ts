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

// User registration lifecycle events (OAuth signup, email-otp verification).
export type UserRegistrationEvent = {
  user: {
    id?: string;
    email: string;
    full_name?: string;
    subscribed?: boolean;
    provider?: string;
  };
};

export type UserRegistrationHook = (
  event: UserRegistrationEvent,
) => Promise<void>;

const userRegistrationHooks: UserRegistrationHook[] = [];

export const onUserRegistration = (hook: UserRegistrationHook) => {
  userRegistrationHooks.push(hook);
};

export const emitUserRegistration = async (event: UserRegistrationEvent) => {
  for (const hook of userRegistrationHooks) {
    try {
      await hook(event);
    } catch (error) {
      logger.error("user registration hook failed", error);
    }
  }
};

// User profile update events (country change, email change).
// user_id is frozen at signup, so the email event carries it — handlers must
// not re-derive one from either address.
export type UserUpdateEvent =
  | { type: "country"; email: string; country: string }
  | { type: "email"; userId: string; oldEmail: string; newEmail: string };

export type UserUpdateHook = (event: UserUpdateEvent) => Promise<void>;

const userUpdateHooks: UserUpdateHook[] = [];

export const onUserUpdate = (hook: UserUpdateHook) => {
  userUpdateHooks.push(hook);
};

export const emitUserUpdate = async (event: UserUpdateEvent) => {
  for (const hook of userUpdateHooks) {
    try {
      await hook(event);
    } catch (error) {
      logger.error(`user update hook failed (${event.type})`, error);
    }
  }
};
