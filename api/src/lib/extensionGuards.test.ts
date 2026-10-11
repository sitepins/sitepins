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

  it("runs an optional hosted policy with ids read from the request", async () => {
    const { runRequestGuard, setPolicyGuard } = await freshGuards();
    const guard = vi.fn();
    const next = vi.fn();
    setPolicyGuard("organization:member:add", guard);
    const req = {
      user: { user_id: "user-1" },
      params: { org_id: "org-1" },
    } as unknown as Request;

    await runRequestGuard("organization:member:add")(req, {} as Response, next);

    expect(guard).toHaveBeenCalledWith({
      event: "organization:member:add",
      user_id: "user-1",
      org_id: "org-1",
    });
    expect(next).toHaveBeenCalledOnce();
  });

  it("passes a policy refusal to the error handler", async () => {
    const { runRequestGuard, setPolicyGuard } = await freshGuards();
    const refusal = new Error("Member limit reached");
    setPolicyGuard("project:create", () => {
      throw refusal;
    });
    const next = vi.fn();
    const req = {
      user: { user_id: "user-1" },
      body: { org_id: "org-1", visibility: "private" },
    } as unknown as Request;

    await runRequestGuard("project:create")(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(refusal);
  });

  it("runs the same policy directly, without a request", async () => {
    const { runPolicyGuard, setPolicyGuard } = await freshGuards();
    const guard = vi.fn();
    setPolicyGuard("organization:create", guard);

    await runPolicyGuard({ event: "organization:create", user_id: "u1" });

    expect(guard).toHaveBeenCalledWith({
      event: "organization:create",
      user_id: "u1",
    });
  });
});
