import { describe, expect, it } from "vitest";
import { isSiteCreationPlanLimitError } from "./site-creation-error";

describe("isSiteCreationPlanLimitError", () => {
  it("matches the client and API private-limit copy", () => {
    expect(isSiteCreationPlanLimitError("Private site limit reached")).toBe(
      true,
    );
    expect(
      isSiteCreationPlanLimitError(
        "You have reached the maximum number of active private projects (1) for your current plan.",
      ),
    ).toBe(true);
  });

  it("matches total site plan limits", () => {
    expect(
      isSiteCreationPlanLimitError(
        "You have reached the maximum number of active projects (3) for your current plan.",
      ),
    ).toBe(true);
  });

  it("ignores unrelated failures", () => {
    expect(isSiteCreationPlanLimitError("Something went wrong!")).toBe(false);
    expect(isSiteCreationPlanLimitError("Repository not found")).toBe(false);
  });
});
