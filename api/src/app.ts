import config from "@/config/variables";
import { globalErrorhandler } from "@/middlewares/globalErrorHandler";
import router from "@/routes";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express, { Application, NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { auth } from "./auth";
import { authDemo } from "./auth-demo";
import {
  corsProtectedOptions,
  corsUnprotectedOptions,
} from "./config/cors-options";

const app: Application = express();

// Behind a proxy (Vercel, DO App Platform, nginx) so req.ip / req.protocol
// and rate limiting read the real client from X-Forwarded-* rather than the
// proxy. Configurable via TRUST_PROXY; defaults to 1 hop in production.
const tp = config.trust_proxy;
const trustProxyValue =
  tp === "false" || tp === "0"
    ? false
    : /^\d+$/.test(tp ?? "")
      ? Number(tp)
      : tp;
app.set("trust proxy", trustProxyValue);

// Security headers. This is a JSON API behind CORS, so cross-origin resource
// policy is relaxed to allow the separate web origin to read responses.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

const conditionalCors = (req: Request, res: Response, next: NextFunction) => {
  const isUnprotectedRoute = req.path.startsWith("/api/v1/token");
  const options = isUnprotectedRoute
    ? corsUnprotectedOptions
    : corsProtectedOptions;

  cors(options)(req, res, next);
};

app.use(conditionalCors);
// must place better auth handlers before express.json()
app.all("/api/v1/auth/*splat", toNodeHandler(auth));
app.all("/api/v1/demo/auth/*splat", toNodeHandler(authDemo));

// Cap request body size to prevent trivial memory-exhaustion DoS. Override
// with JSON_BODY_LIMIT if your content payloads are larger.
const bodyLimit = process.env.JSON_BODY_LIMIT || "5mb";
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

app.get("/", async (req, res) => {
  res.send("Welcome to Sitepins API");
});

// Liveness/readiness probe for orchestrators (Docker, DO App Platform, k8s).
app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/v1", router);

app.use(globalErrorhandler);

export default app;
