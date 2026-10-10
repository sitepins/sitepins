import { describe, expect, it } from "vitest";
import {
  COLLABORATOR_PERMISSIONS,
  narrowPermissions,
} from "./installation-permissions";

describe("narrowPermissions", () => {
  it("requests exactly the editor set when the installation grants it", () => {
    expect(
      narrowPermissions({
        contents: "write",
        pull_requests: "write",
        metadata: "read",
        statuses: "write",
        deployments: "write",
        administration: "write",
        workflows: "write",
      }),
    ).toEqual(COLLABORATOR_PERMISSIONS);
  });

  it("drops permissions the installation lacks", () => {
    expect(narrowPermissions({ contents: "write", metadata: "read" })).toEqual({
      contents: "write",
      metadata: "read",
    });
  });

  it("caps at the granted level", () => {
    expect(narrowPermissions({ pull_requests: "read" })).toEqual({
      pull_requests: "read",
    });
  });

  it("handles a missing permission map", () => {
    expect(narrowPermissions(undefined)).toEqual({});
  });
});
