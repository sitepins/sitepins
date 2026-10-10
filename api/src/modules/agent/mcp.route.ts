import { allowedOrigins } from "@/config/cors-options";
import ApiError from "@/errors/ApiError";
import { logger } from "@/lib/logger";
import { agentLimiter } from "@/middlewares/rateLimiters";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { NextFunction, Request, Response } from "express";
import {
  AgentAuthError,
  authenticateRequest,
  BEARER_CHALLENGE,
} from "./agent.auth";
import { TAgentContext } from "./agent.type";
import { buildMcpServer } from "./mcp.server";

const jsonRpcError = (res: Response, status: number, message: string) => {
  res
    .status(status)
    .json({ jsonrpc: "2.0", error: { code: -32001, message }, id: null });
};

const handler = createMcpHandler(
  ({ authInfo }) => buildMcpServer(authInfo?.extra?.agent as TAgentContext),
  { legacy: "stateless", responseMode: "json" },
);
const nodeHandler = toNodeHandler(handler, {
  onerror: (error) => logger.error("[agents] MCP request failed", error),
  maxRequestBodySize: 70 * 1024 * 1024,
});

/** Browsers send Origin; native agents don't. A foreign Origin is a DNS-rebinding attempt. */
const originAllowed = (origin: string | undefined) =>
  !origin || allowedOrigins.includes(origin);

export const mcpRoute = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!originAllowed(req.headers.origin)) {
    jsonRpcError(res, 403, "Origin not allowed");
    return;
  }
  let agent: TAgentContext;
  try {
    agent = await authenticateRequest(req);
  } catch (error) {
    if (error instanceof AgentAuthError && error.statusCode === 401) {
      res.setHeader("WWW-Authenticate", BEARER_CHALLENGE);
    }
    const status = error instanceof ApiError ? error.statusCode : 500;
    jsonRpcError(
      res,
      status,
      error instanceof Error ? error.message : "Unauthorized",
    );
    return;
  }

  req.agent = agent;
  agentLimiter(req, res, (limitError?: unknown) => {
    if (limitError) return next(limitError);
    const authed = req as Request & { auth?: unknown };
    authed.auth = {
      token: agent.token,
      clientId: agent.grant.grant_id,
      scopes: [...agent.scopes],
      extra: { agent },
    };
    nodeHandler(authed as Parameters<typeof nodeHandler>[0], res).catch(next);
  });
};
