import ApiError from "@/errors/ApiError";
import { logger } from "@/lib/logger";
import { requireOrgAccess } from "@/lib/resourceAuth";
import { User } from "@/modules/user/user.model";
import { createHash, randomBytes } from "crypto";
import type { Request } from "express";
import { AgentGrant } from "./agent-grant.model";
import {
  AGENT_SCOPES,
  EAgentScope,
  TAgentContext,
  TAgentGrant,
} from "./agent.type";

export const AGENT_TOKEN_PREFIX = "spat_";
const LAST_USED_THROTTLE_MS = 60_000;

export const generateAgentToken = () =>
  `${AGENT_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;

// The token is 256 random bits, so an unsalted hash can't be brute-forced.
export const agentTokenIndex = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const BEARER_CHALLENGE = 'Bearer realm="Sitepins"';

export class AgentAuthError extends ApiError {
  constructor(message: string, statusCode = 401) {
    super(message, statusCode, "");
  }
}

const bearerOf = (authorization: string | undefined) =>
  authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

// The TTL index removes expired tokens within a minute; this covers that gap.
const isExpired = (grant: TAgentGrant) =>
  Boolean(grant.expires_at && grant.expires_at <= new Date());

const touch = (grant: TAgentGrant) => {
  const last = grant.last_used_at?.getTime() ?? 0;
  if (Date.now() - last < LAST_USED_THROTTLE_MS) return;
  AgentGrant.updateOne(
    { grant_id: grant.grant_id },
    { $set: { last_used_at: new Date() } },
  ).catch((error) => logger.error("[agents] last-used update failed", error));
};

/** Resolves and re-checks the caller on every request; revocation and membership changes apply immediately. */
export async function authenticateAgent(
  authorization: string | undefined,
): Promise<TAgentContext> {
  const token = bearerOf(authorization);
  if (!token?.startsWith(AGENT_TOKEN_PREFIX)) {
    throw new AgentAuthError(
      "Missing Sitepins access token. Create one in Settings → MCP Connection.",
    );
  }

  const grant = await AgentGrant.findOne({
    token_index: agentTokenIndex(token),
  }).lean();
  if (!grant) {
    throw new AgentAuthError("This access token was revoked or doesn't exist");
  }
  if (isExpired(grant))
    throw new AgentAuthError("This access token has expired");

  const user = await User.findOne({ user_id: grant.user_id })
    .select("user_id full_name email")
    .lean();
  if (!user) throw new AgentAuthError("The account no longer exists");

  // Removing a member from the org cuts off their tokens at once.
  await requireOrgAccess(user.user_id, grant.org_id).catch(() => {
    throw new AgentAuthError(
      "You no longer belong to this token's organization",
      403,
    );
  });

  touch(grant);
  return {
    user_id: user.user_id,
    user_name: user.full_name,
    user_email: user.email,
    grant,
    scopes: new Set(grant.scopes.filter((s) => AGENT_SCOPES.includes(s))),
    client_name: grant.name,
    token,
  };
}

export const authenticateRequest = (
  req: Request,
  authorization = req.headers.authorization,
) => authenticateAgent(authorization);

export const requireScope = (agent: TAgentContext, scope: EAgentScope) => {
  if (!agent.scopes.has(scope)) {
    throw new ApiError(`This token lacks the ${scope} permission`, 403, "");
  }
};
