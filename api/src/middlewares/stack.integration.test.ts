import express from "express";
import type { AddressInfo } from "net";
import { describe, expect, it } from "vitest";
import { apiLimiter, authLimiter } from "./rateLimiters";
import { sanitizeInput } from "./sanitizeInput";

// Boots a real Express 5 app with the middleware added in this change, behind
// a simulated proxy, and drives real HTTP through it. Guards against the
// stack throwing on startup or silently mangling normal traffic.
const withServer = async (
  build: (app: express.Application) => void,
  run: (base: string) => Promise<void>,
) => {
  const app = express();
  app.set("trust proxy", 1);
  app.set("query parser", "simple");
  app.use(express.json());
  build(app);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
};

describe("request middleware stack", () => {
  it("passes normal traffic through untouched", async () => {
    await withServer(
      (app) => {
        app.use(sanitizeInput, apiLimiter);
        app.post("/p/:project_id", (req, res) =>
          res.json({ body: req.body, params: req.params, query: req.query }),
        );
      },
      async (base) => {
        const payload = {
          project_name: "My Site",
          site_url: "https://a.example.com",
          content: "---\ntitle: A.B\n---\n$100",
        };
        const res = await fetch(`${base}/p/abc123?orgId=org_1&limit=10`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as {
          body: unknown;
          params: unknown;
          query: unknown;
        };
        expect(res.status).toBe(200);
        expect(json.body).toEqual(payload);
        expect(json.params).toEqual({ project_id: "abc123" });
        expect(json.query).toEqual({ orgId: "org_1", limit: "10" });
      },
    );
  });

  it("strips Mongo operators from a JSON body", async () => {
    await withServer(
      (app) => {
        app.use(sanitizeInput);
        app.post("/r", (req, res) => res.json(req.body));
      },
      async (base) => {
        const res = await fetch(`${base}/r`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            old_refresh_token: { $ne: "" },
            provider: "Github",
          }),
        });
        const json = (await res.json()) as {
          old_refresh_token: unknown;
          provider: unknown;
        };
        expect(json.old_refresh_token).toEqual({});
        expect(json.provider).toBe("Github");
      },
    );
  });

  it("keeps query values as strings so they can never be operators", async () => {
    await withServer(
      (app) => {
        app.use(sanitizeInput);
        app.get("/q", (req, res) =>
          res.json(
            Object.fromEntries(
              Object.entries(req.query).map(([k, v]) => [k, typeof v]),
            ),
          ),
        );
      },
      async (base) => {
        const res = await fetch(`${base}/q?org_id[$ne]=x&ok=1`);
        const types = (await res.json()) as Record<string, string>;
        expect(Object.values(types).every((t) => t === "string")).toBe(true);
      },
    );
  });

  it("does not throttle a realistic burst of editor requests", async () => {
    await withServer(
      (app) => {
        app.use(apiLimiter);
        app.get("/ok", (_req, res) => res.json({ ok: true }));
      },
      async (base) => {
        const codes = await Promise.all(
          Array.from({ length: 200 }, () =>
            fetch(`${base}/ok`, {
              headers: { "X-Forwarded-For": "203.0.113.9" },
            }).then((r) => r.status),
          ),
        );
        expect(codes.every((c) => c === 200)).toBe(true);
      },
    );
  });

  it("blocks OTP/credential brute force after the auth budget", async () => {
    await withServer(
      (app) => {
        app.use(authLimiter);
        app.post("/login", (_req, res) => res.status(401).json({ ok: false }));
      },
      async (base) => {
        const codes: number[] = [];
        for (let i = 0; i < 14; i++) {
          const r = await fetch(`${base}/login`, {
            method: "POST",
            headers: { "X-Forwarded-For": "198.51.100.7" },
          });
          codes.push(r.status);
        }
        expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
      },
    );
  });

  it("keys the limiter on the forwarded client IP, not the proxy", async () => {
    await withServer(
      (app) => {
        app.use(authLimiter);
        app.post("/login", (_req, res) => res.status(401).json({ ok: false }));
      },
      async (base) => {
        // exhaust one client
        for (let i = 0; i < 12; i++) {
          await fetch(`${base}/login`, {
            method: "POST",
            headers: { "X-Forwarded-For": "198.51.100.20" },
          });
        }
        // a different client behind the same proxy must be unaffected
        const other = await fetch(`${base}/login`, {
          method: "POST",
          headers: { "X-Forwarded-For": "198.51.100.21" },
        });
        expect(other.status).toBe(401);
      },
    );
  });
});
