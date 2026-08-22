import { describe, expect, it, vi } from "vitest";
import {
  cloneRepository,
  getGitAuthUrl,
  gitCloneSource,
  pullLatestCommits,
} from "./git";
import type { Session } from "@vercel/sandbox";

describe("getGitAuthUrl", () => {
  it("builds auth URL for GitHub with and without token", () => {
    expect(getGitAuthUrl("github", "user/repo", "ghp_123")).toBe(
      "https://x-access-token:ghp_123@github.com/user/repo.git",
    );
    expect(getGitAuthUrl("github", "user/repo")).toBe(
      "https://github.com/user/repo.git",
    );
  });

  it("builds auth URL for GitLab with and without token", () => {
    expect(getGitAuthUrl("gitlab", "user/repo", "glpat_123")).toBe(
      "https://oauth2:glpat_123@gitlab.com/user/repo.git",
    );
    expect(getGitAuthUrl("gitlab", "user/repo")).toBe(
      "https://gitlab.com/user/repo.git",
    );
  });
});

describe("gitCloneSource", () => {
  it("creates git clone source descriptor with token", () => {
    expect(gitCloneSource("github", "user/repo", "main", "ghp_123")).toEqual({
      type: "git",
      url: "https://github.com/user/repo.git",
      revision: "main",
      depth: 1,
      username: "x-access-token",
      password: "ghp_123",
    });
  });

  it("creates git clone source descriptor without token", () => {
    expect(gitCloneSource("github", "user/repo", "main")).toEqual({
      type: "git",
      url: "https://github.com/user/repo.git",
      revision: "main",
      depth: 1,
    });
  });
});

describe("cloneRepository", () => {
  it("initializes git and fetches shallow branch into root directory", async () => {
    const executedCommands: Array<{ cmd: string; args?: string[] }> = [];
    const mockSession = {
      runCommand: vi.fn().mockImplementation(async ({ cmd, args }) => {
        executedCommands.push({ cmd, args });
        return {
          exitCode: 0,
          stdout: async () => "",
          stderr: async () => "",
        };
      }),
    } as unknown as Session;

    await cloneRepository(
      mockSession,
      "user/repo",
      "main",
      "github",
      "ghp_123",
    );

    expect(executedCommands).toEqual([
      { cmd: "git", args: ["init"] },
      {
        cmd: "git",
        args: [
          "fetch",
          "--depth",
          "1",
          "--",
          "https://x-access-token:ghp_123@github.com/user/repo.git",
          "main",
        ],
      },
      { cmd: "git", args: ["checkout", "-f", "FETCH_HEAD"] },
    ]);
  });

  it("throws descriptive error when fetch fails", async () => {
    const mockSession = {
      runCommand: vi.fn().mockImplementation(async ({ args }) => {
        if (args?.[0] === "fetch") {
          return {
            exitCode: 128,
            stdout: async () => "",
            stderr: async () => "fatal: repository not found",
          };
        }
        return {
          exitCode: 0,
          stdout: async () => "",
          stderr: async () => "",
        };
      }),
    } as unknown as Session;

    await expect(
      cloneRepository(mockSession, "user/repo", "main", "github", "ghp_123"),
    ).rejects.toThrow(
      "Failed to clone repository (128): fatal: repository not found",
    );
  });
});

describe("pullLatestCommits", () => {
  it("fetches shallow branch and resets hard to FETCH_HEAD", async () => {
    const executedCommands: Array<{ cmd: string; args?: string[] }> = [];
    const mockSession = {
      runCommand: vi.fn().mockImplementation(async ({ cmd, args }) => {
        executedCommands.push({ cmd, args });
        return {
          exitCode: 0,
          stdout: async () => "",
          stderr: async () => "",
        };
      }),
    } as unknown as Session;

    await pullLatestCommits(
      mockSession,
      "user/repo",
      "feat/preview",
      "github",
      "ghp_123",
    );

    expect(executedCommands).toEqual([
      {
        cmd: "git",
        args: [
          "fetch",
          "--depth",
          "1",
          "--",
          "https://x-access-token:ghp_123@github.com/user/repo.git",
          "feat/preview",
        ],
      },
      { cmd: "git", args: ["reset", "--hard", "FETCH_HEAD"] },
    ]);
  });
});
