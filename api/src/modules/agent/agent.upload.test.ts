import ApiError from "@/errors/ApiError";
import express from "express";
import type { Server } from "node:http";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const m = vi.hoisted(() => ({
  redeem: vi.fn(),
  release: vi.fn(),
  commit: vi.fn(),
}));

vi.mock("./agent.auth", () => ({
  redeemUploadTicket: (...a: unknown[]) => m.redeem(...a),
  releaseUploadTicket: (...a: unknown[]) => m.release(...a),
}));
vi.mock("./agent.service", () => ({
  MAX_UPLOAD_BYTES: 16,
  commitUpload: (...a: unknown[]) => m.commit(...a),
}));
vi.mock("@/middlewares/rateLimiters", () => ({
  agentLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { agentUploadRouter } from "./agent.upload";

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  // Same order as app.ts: uploads read the raw body before any JSON parser.
  app.use("/agent-upload", agentUploadRouter);
  app.use(express.json());
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => server.close());

const claims = { f: "public/images/a.png", n: "nonce" };

beforeEach(() => {
  m.redeem.mockReset().mockResolvedValue({ claims, agent: { user_id: "u1" } });
  m.release.mockReset();
  m.commit
    .mockReset()
    .mockResolvedValue({ status: "committed", path: claims.f });
});

const put = (body: string | Buffer, headers: Record<string, string> = {}) =>
  fetch(`${base}/agent-upload/spup_ticket`, { method: "PUT", body, headers });

describe("agent uploads", () => {
  it("commits the raw body whatever its content type", async () => {
    const res = await put("PNGDATA", { "content-type": "application/json" });
    expect(res.status).toBe(200);
    expect((await res.json()) as object).toMatchObject({ status: "committed" });
    const [, sentClaims, body] = m.commit.mock.calls[0];
    expect(sentClaims).toBe(claims);
    expect(Buffer.from(body).toString()).toBe("PNGDATA");
  });

  it("frees the link again when nothing was sent or the commit failed", async () => {
    expect((await put("")).status).toBe(400);
    m.commit.mockRejectedValue(
      Object.assign(new Error("policy"), { statusCode: 403 }),
    );
    expect((await put("x")).status).toBe(500);
    expect(m.release).toHaveBeenCalledTimes(2);
  });

  it("refuses files over the limit in plain words", async () => {
    const res = await put("x".repeat(17));
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toMatch(/at most/);
    expect(m.commit).not.toHaveBeenCalled();
  });

  it("reports an expired or reused link", async () => {
    m.redeem.mockRejectedValue(
      new ApiError("This upload link was already used", 410, ""),
    );
    const res = await put("x");
    expect(res.status).toBe(410);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /already used/,
    );
  });
});
