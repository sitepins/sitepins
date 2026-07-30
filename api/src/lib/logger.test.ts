import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "./logger";

const originalEnv = { ...process.env };

let stdout: string[];
let stderr: string[];

beforeEach(() => {
  stdout = [];
  stderr = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  process.env.NODE_ENV = "development";
  delete process.env.LOG_LEVEL;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe("createLogger", () => {
  it("writes info to stdout and warn/error to stderr", () => {
    const log = createLogger();

    log.info("started");
    log.warn("slow");
    log.error("boom");

    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain("started");
    expect(stderr).toHaveLength(2);
    expect(stderr[0]).toContain("slow");
    expect(stderr[1]).toContain("boom");
  });

  it("suppresses records below the configured level", () => {
    process.env.LOG_LEVEL = "warn";
    const log = createLogger();

    log.debug("noise");
    log.info("noise");
    log.warn("kept");

    expect(stdout).toEqual([]);
    expect(stderr).toHaveLength(1);
  });

  it("defaults to error-only under NODE_ENV=test", () => {
    process.env.NODE_ENV = "test";
    const log = createLogger();

    log.warn("dropped");
    log.error("kept");

    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain("kept");
  });

  it("emits JSON with serialized error details in production", () => {
    process.env.NODE_ENV = "production";
    const log = createLogger("mailer");

    log.error("send failed", new Error("smtp down"), { to: "a@b.c" });

    const record = JSON.parse(stderr[0]);
    expect(record).toMatchObject({
      level: "error",
      scope: "mailer",
      message: "send failed",
      to: "a@b.c",
      error: { name: "Error", message: "smtp down" },
    });
    expect(record.error.stack).toContain("smtp down");
  });

  it("serializes non-Error throwables", () => {
    process.env.NODE_ENV = "production";
    const log = createLogger();

    log.error("odd", "just a string");

    expect(JSON.parse(stderr[0]).error).toBe("just a string");
  });

  it("omits the error key when no error is passed", () => {
    process.env.NODE_ENV = "production";
    const log = createLogger();

    log.error("plain");

    expect(JSON.parse(stderr[0])).not.toHaveProperty("error");
  });

  it("nests child scopes", () => {
    process.env.NODE_ENV = "production";
    const log = createLogger("api").child("auth").child("jwt");

    log.info("verified");

    expect(JSON.parse(stdout[0]).scope).toBe("api:auth:jwt");
  });

  it("re-reads LOG_LEVEL per call so runtime changes take effect", () => {
    const log = createLogger();

    process.env.LOG_LEVEL = "error";
    log.info("dropped");
    process.env.LOG_LEVEL = "debug";
    log.info("kept");

    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain("kept");
  });
});
