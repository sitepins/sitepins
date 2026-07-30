import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "./logger";

let calls: Record<string, unknown[][]>;

beforeEach(() => {
  calls = { debug: [], info: [], warn: [], error: [] };
  for (const level of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      calls[level].push(args);
    });
  }
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_LOG_LEVEL", undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("createLogger", () => {
  it("routes each level to the matching console method", () => {
    const log = createLogger();

    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");

    expect(calls.debug).toEqual([["d"]]);
    expect(calls.info).toEqual([["i"]]);
    expect(calls.warn).toEqual([["w"]]);
    expect(calls.error).toEqual([["e"]]);
  });

  it("suppresses records below the configured level", () => {
    vi.stubEnv("NEXT_PUBLIC_LOG_LEVEL", "warn");
    const log = createLogger();

    log.debug("dropped");
    log.info("dropped");
    log.warn("kept");

    expect(calls.debug).toEqual([]);
    expect(calls.info).toEqual([]);
    expect(calls.warn).toEqual([["kept"]]);
  });

  it("defaults to warn and above in production builds", () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = createLogger();

    log.info("dropped");
    log.error("kept");

    expect(calls.info).toEqual([]);
    expect(calls.error).toEqual([["kept"]]);
  });

  it("passes the caught value through after the message", () => {
    const log = createLogger();
    const boom = new Error("boom");

    log.error("failed", boom, { path: "a.md" });

    expect(calls.error).toEqual([["failed", boom, { path: "a.md" }]]);
  });

  it("omits an undefined error so the console line stays clean", () => {
    const log = createLogger();

    log.warn("just a warning");
    log.warn("with fields", undefined, { count: 2 });

    expect(calls.warn).toEqual([
      ["just a warning"],
      ["with fields", { count: 2 }],
    ]);
  });

  it("prefixes messages with nested child scopes", () => {
    const log = createLogger("git").child("github");

    log.info("fetched");

    expect(calls.info).toEqual([["[git:github] fetched"]]);
  });
});
