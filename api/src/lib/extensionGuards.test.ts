import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

async function freshGuards() {
  vi.resetModules();
  return import("./extensionGuards.js");
}

describe("hosted extension guards", () => {
  it("does nothing in core when no hosted policy is registered", async () => {
    const { runRequestGuard, runProjectMutationGuard } = await freshGuards();
    const next = vi.fn();

    await runRequestGuard("project:create")(
      {} as Request,
      {} as Response,
      next,
    );
    expect(
      runProjectMutationGuard({
        type: "status",
        projectId: "project-1",
        status: "active",
      }),
    ).toBeUndefined();

    expect(next).toHaveBeenCalledOnce();
  });

  it("runs an optional hosted policy without making core policy-aware", async () => {
    const { runRequestGuard, setRequestGuard } = await freshGuards();
    const guard = vi.fn();
    const next = vi.fn();
    setRequestGuard("organization:create", guard);
    const req = { user: { user_id: "user-1" } } as Request;

    await runRequestGuard("organization:create")(req, {} as Response, next);

    expect(guard).toHaveBeenCalledWith(req);
    expect(next).toHaveBeenCalledOnce();
  });
});
