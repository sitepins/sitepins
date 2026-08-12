import { describe, expect, it, vi } from "vitest";
import type { ClientSession } from "mongoose";

// entitlements holds module-level registries — re-import a fresh copy per
// test so registrations from one test never leak into the next.
async function freshEntitlements() {
  vi.resetModules();
  return import("./entitlements.js");
}

describe("user deletion hooks", () => {
  it("runs all hooks in registration order with the full context", async () => {
    const { onUserDeletion, runUserDeletionHooks } = await freshEntitlements();
    const calls: string[] = [];
    onUserDeletion(async (ctx) => {
      calls.push(`first:${ctx.userId}:${ctx.reason}`);
    });
    onUserDeletion(async (ctx) => {
      calls.push(`second:${ctx.user.email}`);
    });

    await runUserDeletionHooks({
      userId: "u1",
      user: { user_id: "u1", email: "a@b.c" },
      reason: "gdpr",
      session: {} as ClientSession,
    });

    expect(calls).toEqual(["first:u1:gdpr", "second:a@b.c"]);
  });

  it("propagates hook failures so the deletion transaction can abort", async () => {
    const { onUserDeletion, runUserDeletionHooks } = await freshEntitlements();
    onUserDeletion(async () => {
      throw new Error("cleanup failed");
    });

    await expect(
      runUserDeletionHooks({
        userId: "u1",
        user: { user_id: "u1" },
        session: {} as ClientSession,
      }),
    ).rejects.toThrow("cleanup failed");
  });
});

describe("auth events", () => {
  it("delivers events to all handlers", async () => {
    const { onAuthEvent, emitAuthEvent } = await freshEntitlements();
    const seen: string[] = [];
    onAuthEvent(async (e) => {
      seen.push(`a:${e.type}`);
    });
    onAuthEvent(async (e) => {
      seen.push(`b:${e.type}`);
    });

    await emitAuthEvent({
      type: "login",
      userId: "u1",
      ip: "127.0.0.1",
      date: "2026-01-01T00:00:00.000Z",
    });

    expect(seen).toEqual(["a:login", "b:login"]);
  });

  it("isolates handler failures — one broken handler must not break auth", async () => {
    const { onAuthEvent, emitAuthEvent } = await freshEntitlements();
    const seen: string[] = [];
    onAuthEvent(async () => {
      throw new Error("logger down");
    });
    onAuthEvent(async (e) => {
      seen.push(e.type);
    });

    await expect(
      emitAuthEvent({
        type: "password_reset",
        userId: "u1",
        date: "2026-01-01T00:00:00.000Z",
      }),
    ).resolves.toBeUndefined();
    expect(seen).toEqual(["password_reset"]);
  });
});
