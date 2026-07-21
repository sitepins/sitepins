import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// verifyToken layers two independent expiry mechanisms: the jwt library's
// own `expiresIn`, and a custom max-age check against the configured
// `jwt_expire` window (parsed from strings like "7d"/"24h"/"3600s"/"30m").
// Fake timers isolate each one without relying on wall-clock sleeps.

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: { jwt_expire: undefined as string | undefined },
}));

vi.mock("@/config/variables", () => ({ default: mockConfig }));

import { jwtHelpers } from "./jwtTokenHelper";

beforeEach(() => {
  mockConfig.jwt_expire = undefined;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createToken / verifyToken", () => {
  it("round trips a valid token", () => {
    const token = jwtHelpers.createToken({ id: "u1", role: "admin" }, "s3cret");
    const decoded = jwtHelpers.verifyToken(token, "s3cret");
    expect(decoded.id).toBe("u1");
    expect(decoded.role).toBe("admin");
  });

  it("rejects a token signed with a different secret", () => {
    const token = jwtHelpers.createToken({ id: "u1", role: "admin" }, "s3cret");
    expect(() => jwtHelpers.verifyToken(token, "wrong-secret")).toThrow();
  });

  it("rejects a token checked against the wrong issuer", () => {
    const token = jwtHelpers.createToken({ id: "u1", role: "admin" }, "s3cret");
    expect(() => jwtHelpers.verifyToken(token, "s3cret", "someone-else")).toThrow();
  });

  it("accepts a token checked against the correct issuer", () => {
    const token = jwtHelpers.createToken({ id: "u1", role: "admin" }, "s3cret");
    const decoded = jwtHelpers.verifyToken(token, "s3cret", "sitepins-backend");
    expect(decoded.id).toBe("u1");
  });

  it("rejects a token missing id or role", () => {
    const token = jwtHelpers.createToken({}, "s3cret");
    expect(() => jwtHelpers.verifyToken(token, "s3cret")).toThrow("Invalid token structure");
  });

  it("rejects once the jwt library's own expiresIn has elapsed", () => {
    const token = jwtHelpers.createToken({ id: "u1", role: "admin" }, "s3cret", "10s");
    vi.advanceTimersByTime(11_000);
    expect(() => jwtHelpers.verifyToken(token, "s3cret")).toThrow(/expired/i);
  });

  it("rejects a token older than the configured jwt_expire max-age window", () => {
    mockConfig.jwt_expire = "1h";
    const token = jwtHelpers.createToken({ id: "u1", role: "admin" }, "s3cret", "365d");
    vi.advanceTimersByTime(2 * 60 * 60 * 1000); // 2h — past the 1h max-age
    expect(() => jwtHelpers.verifyToken(token, "s3cret")).toThrow("Token too old");
  });

  it("accepts a token within the configured jwt_expire max-age window", () => {
    mockConfig.jwt_expire = "1h";
    const token = jwtHelpers.createToken({ id: "u1", role: "admin" }, "s3cret", "365d");
    vi.advanceTimersByTime(30 * 60 * 1000); // 30m — within the 1h max-age
    expect(jwtHelpers.verifyToken(token, "s3cret").id).toBe("u1");
  });

  it("parses a seconds-suffixed jwt_expire for the max-age check", () => {
    mockConfig.jwt_expire = "3600s"; // == 1h
    const token = jwtHelpers.createToken({ id: "u1", role: "admin" }, "s3cret", "365d");
    vi.advanceTimersByTime(59 * 60 * 1000); // 59m — just under 3600s
    expect(() => jwtHelpers.verifyToken(token, "s3cret")).not.toThrow();
    vi.advanceTimersByTime(2 * 60 * 1000); // 61m total — past 3600s
    expect(() => jwtHelpers.verifyToken(token, "s3cret")).toThrow("Token too old");
  });

  it("falls back to a 24h max-age when jwt_expire is unparseable", () => {
    mockConfig.jwt_expire = "not-a-duration";
    const token = jwtHelpers.createToken({ id: "u1", role: "admin" }, "s3cret", "365d");
    vi.advanceTimersByTime(23 * 60 * 60 * 1000); // 23h — under the 24h default
    expect(() => jwtHelpers.verifyToken(token, "s3cret")).not.toThrow();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000); // 25h total — past 24h default
    expect(() => jwtHelpers.verifyToken(token, "s3cret")).toThrow("Token too old");
  });
});
