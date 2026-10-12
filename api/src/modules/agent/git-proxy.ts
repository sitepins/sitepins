import brand from "@/config/brand";
import ApiError from "@/errors/ApiError";
import { logger } from "@/lib/logger";
import { agentGitLimiter } from "@/middlewares/rateLimiters";
import express, { NextFunction, Request, Response } from "express";
import { Readable } from "node:stream";
import type { ReadableStream as TWebReadableStream } from "node:stream/web";
import {
  AgentAuthError,
  authenticateGitReadToken,
  authenticateRequest,
  GIT_READ_TOKEN_PREFIX,
} from "./agent.auth";
import { gitRemoteFor } from "./agent.git";
import { resolveProject } from "./agent.service";
import { EAgentScope } from "./agent.type";

const UPLOAD_PACK = "git-upload-pack";
const MAX_BYTES = 2 * 1024 ** 3;
const FORWARDED_REQUEST_HEADERS = [
  "content-type",
  "content-encoding",
  "accept",
  "git-protocol",
];
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "expires",
  "pragma",
];

const plain = (res: Response, status: number, message: string) => {
  res.status(status).type("text/plain").send(`${message}\n`);
};

/** A token in the Basic password (git's credential prompt) works as well as a Bearer header. */
const normalizeAuthorization = (header: string | undefined) => {
  const basic = header?.match(/^Basic\s+(.+)$/i);
  if (!basic) return header;
  const decoded = Buffer.from(basic[1], "base64").toString("utf-8");
  const password = decoded.slice(decoded.indexOf(":") + 1);
  return password ? `Bearer ${password}` : undefined;
};

const repoParam = (req: Request) =>
  String(req.params.repo ?? "").replace(/\.git$/, "");

const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authorization = normalizeAuthorization(req.headers.authorization);
    const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    req.agent = bearer?.startsWith(GIT_READ_TOKEN_PREFIX)
      ? await authenticateGitReadToken(bearer, repoParam(req))
      : await authenticateRequest(req, authorization);
    next();
  } catch (error) {
    if (error instanceof AgentAuthError && error.statusCode === 401) {
      res.setHeader(
        "WWW-Authenticate",
        `Basic realm="${brand.name.replace(/["\\]/g, "")}"`,
      );
      plain(
        res,
        401,
        `${brand.name}: ${error.message}. Call the get_clone_command tool for fresh commands.`,
      );
      return;
    }
    const status = error instanceof ApiError ? error.statusCode : 500;
    plain(
      res,
      status,
      `${brand.name}: ${error instanceof Error ? error.message : "request failed"}`,
    );
  }
};

const proxy =
  (path: "info/refs" | typeof UPLOAD_PACK) =>
  async (req: Request, res: Response) => {
    try {
      const project = await resolveProject(
        req.agent!,
        repoParam(req),
        EAgentScope.CONTENT_READ,
      );
      const remote = await gitRemoteFor(project, req.agent!.user_id);
      const search = path === "info/refs" ? `?service=${UPLOAD_PACK}` : "";

      const headers: Record<string, string> = {
        Authorization: `Basic ${Buffer.from(`${remote.username}:${remote.password}`).toString("base64")}`,
        "User-Agent": "sitepins-git-proxy",
      };
      for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = req.headers[name];
        if (typeof value === "string") headers[name] = value;
      }

      const upstream = await fetch(`${remote.url}/${path}${search}`, {
        method: req.method,
        headers,
        ...(req.method === "POST" && {
          body: Readable.toWeb(req) as unknown as RequestInit["body"],
          duplex: "half",
        }),
      } as RequestInit);

      if (!upstream.ok || !upstream.body) {
        logger.warn("[agents] git proxy upstream refused", {
          status: upstream.status,
          project: project.project_id,
        });
        plain(
          res,
          upstream.status === 404 ? 404 : 502,
          `${brand.name}: the git host refused the request`,
        );
        return;
      }

      res.status(upstream.status);
      for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) res.setHeader(name, value);
      }

      let sent = 0;
      const body = Readable.fromWeb(
        upstream.body as unknown as TWebReadableStream,
      );
      body.on("data", (chunk: Buffer) => {
        sent += chunk.length;
        if (sent > MAX_BYTES)
          body.destroy(new Error("clone size limit reached"));
      });
      body.on("error", (error) => {
        logger.warn("[agents] git proxy stream ended early", {
          error: error.message,
        });
        res.destroy();
      });
      body.pipe(res);
    } catch (error) {
      const status = error instanceof ApiError ? error.statusCode : 502;
      if (!(error instanceof ApiError))
        logger.error("[agents] git proxy failed", error);
      plain(
        res,
        status,
        `${brand.name}: ${error instanceof Error ? error.message : "request failed"}`,
      );
    }
  };

const readOnly = (_req: Request, res: Response) =>
  plain(
    res,
    403,
    `${brand.name}: this remote is read-only. Save changes with the ${brand.name} write_files tool.`,
  );

const uploadPackOnly = (req: Request, res: Response, next: NextFunction) =>
  req.query.service === UPLOAD_PACK ? next() : readOnly(req, res);

/** Read-only smart-HTTP remote: `git clone <api>/git/<projectId>.git`. Pushing is refused. */
export const gitProxyRouter: express.Router = express.Router();
gitProxyRouter.get(
  "/:repo/info/refs",
  uploadPackOnly,
  authenticate,
  agentGitLimiter,
  proxy("info/refs"),
);
gitProxyRouter.post(
  `/:repo/${UPLOAD_PACK}`,
  authenticate,
  agentGitLimiter,
  proxy(UPLOAD_PACK),
);
gitProxyRouter.all("/:repo/git-receive-pack", readOnly);
