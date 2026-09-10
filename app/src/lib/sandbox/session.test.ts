import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isDevServerAlive,
  waitForServerStream,
  waitForServer,
} from "./session";
import type { Session } from "@vercel/sandbox";

describe("isDevServerAlive", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("checks direct container TCP socket and verifies non-502 proxy when session and port are provided", async () => {
    const executedCommands: Array<{ cmd: string; args?: string[] }> = [];
    const mockSession = {
      runCommand: vi.fn().mockImplementation(async ({ cmd, args }) => {
        executedCommands.push({ cmd, args });
        return {
          exitCode: 0,
          stdout: async () => "OPEN\n",
          stderr: async () => "",
        };
      }),
    } as unknown as Session;

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const alive = await isDevServerAlive(
      "https://sbx-123.vercel.run",
      undefined,
      mockSession,
      3000,
    );

    expect(alive).toBe(true);
    expect(mockSession.runCommand).toHaveBeenCalledTimes(1);
    expect(executedCommands[0].cmd).toBe("node");
    expect(executedCommands[0].args?.[1]).toContain("3000");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://sbx-123.vercel.run",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("returns false if container TCP socket is OPEN but Vercel proxy returns 502 SANDBOX_NOT_LISTENING", async () => {
    const mockSession = {
      runCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: async () => "OPEN\n",
        stderr: async () => "",
      }),
    } as unknown as Session;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("This sandbox is not listening on the requested port.", {
        status: 502,
        headers: { "x-vercel-error": "SANDBOX_NOT_LISTENING" },
      }),
    );

    const alive = await isDevServerAlive(
      "https://sbx-123.vercel.run",
      undefined,
      mockSession,
      3000,
    );

    expect(alive).toBe(false);
  });

  it("returns true if container TCP socket is OPEN but public probe times out while server is busy compiling", async () => {
    const mockSession = {
      runCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: async () => "OPEN\n",
        stderr: async () => "",
      }),
    } as unknown as Session;

    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("The operation was aborted due to timeout"),
    );

    const alive = await isDevServerAlive(
      "https://sbx-123.vercel.run",
      undefined,
      mockSession,
      3000,
    );

    expect(alive).toBe(true);
  });

  it("falls back to external HTTP HEAD probe when container TCP check fails", async () => {
    const mockSession = {
      runCommand: vi.fn().mockRejectedValue(new Error("Connection refused")),
    } as unknown as Session;

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const alive = await isDevServerAlive(
      "https://sbx-123.vercel.run",
      undefined,
      mockSession,
      3000,
    );

    expect(alive).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://sbx-123.vercel.run",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("performs external probe when session and port are omitted", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const alive = await isDevServerAlive("https://sbx-123.vercel.run");

    expect(alive).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://sbx-123.vercel.run",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("returns false if both TCP and HTTP probes fail", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network down"));

    const alive = await isDevServerAlive("https://sbx-123.vercel.run");
    expect(alive).toBe(false);
  });
});

describe("waitForServerStream", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("yields ready when container TCP probe succeeds and proxy returns non-502", async () => {
    const mockSession = {
      runCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: async () => "OPEN",
        stderr: async () => "",
      }),
    } as unknown as Session;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 200 }),
    );

    const generator = waitForServerStream(
      "https://sbx-123.vercel.run",
      5000,
      undefined,
      mockSession,
      3000,
    );

    const first = await generator.next();
    expect(first.done).toBe(false);
    expect(first.value).toEqual({ ready: true, attempt: 1, status: 200 });
  });

  it("does not yield ready if proxy returns 502 SANDBOX_NOT_LISTENING", async () => {
    const mockSession = {
      runCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: async () => "OPEN",
        stderr: async () => "",
      }),
    } as unknown as Session;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not listening", {
        status: 502,
        headers: { "x-vercel-error": "SANDBOX_NOT_LISTENING" },
      }),
    );

    const generator = waitForServerStream(
      "https://sbx-123.vercel.run",
      1000,
      undefined,
      mockSession,
      3000,
    );

    const first = await generator.next();
    expect(first.done).toBe(false);
    expect(first.value).toEqual({ ready: false, attempt: 1, status: 502 });
  });

  it("waitForServer returns true when ready", async () => {
    const mockSession = {
      runCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: async () => "OPEN",
        stderr: async () => "",
      }),
    } as unknown as Session;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 200 }),
    );

    const ready = await waitForServer(
      "https://sbx-123.vercel.run",
      5000,
      undefined,
      mockSession,
      3000,
    );

    expect(ready).toBe(true);
  });
});
