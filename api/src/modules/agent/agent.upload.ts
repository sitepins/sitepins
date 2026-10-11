import ApiError from "@/errors/ApiError";
import { logger } from "@/lib/logger";
import { agentLimiter } from "@/middlewares/rateLimiters";
import express, { Request, Response } from "express";
import {
  redeemUploadTicket,
  releaseUploadTicket,
  TUploadClaims,
} from "./agent.auth";
import { commitUpload, MAX_UPLOAD_BYTES } from "./agent.service";

const reply = (res: Response, status: number, body: Record<string, unknown>) =>
  res.status(status).json(body);

/** `PUT /agent-upload/<ticket>` with the raw file as the body (curl -T). */
export const agentUploadRouter: express.Router = express.Router();
agentUploadRouter.put(
  "/:ticket",
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  async (req: Request, res: Response) => {
    let claims: TUploadClaims | undefined;
    try {
      const redeemed = await redeemUploadTicket(String(req.params.ticket));
      claims = redeemed.claims;
      req.agent = redeemed.agent;
      // The limiter answers 429 itself without calling next.
      await new Promise<void>((resolve, reject) => {
        res.once("finish", resolve);
        agentLimiter(req, res, (error?: unknown) =>
          error ? reject(error) : resolve(),
        );
      });
      if (res.headersSent) {
        releaseUploadTicket(claims);
        return;
      }
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!body.length) {
        releaseUploadTicket(claims);
        reply(res, 400, {
          error:
            "The upload was empty. Send the file as the request body (curl -T <file> <url>).",
        });
        return;
      }
      reply(res, 200, await commitUpload(redeemed.agent, claims, body));
    } catch (error) {
      if (claims) releaseUploadTicket(claims);
      const status = error instanceof ApiError ? error.statusCode : 500;
      if (status >= 500) logger.error("[agents] upload failed", error);
      reply(res, status, {
        error: status >= 500 ? "The upload failed" : (error as Error).message,
        ...((error as { violations?: unknown }).violations !== undefined && {
          violations: (error as { violations?: unknown }).violations,
        }),
      });
    }
  },
);
// Oversized bodies are refused before the handler runs; say so in words.
agentUploadRouter.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    next: express.NextFunction,
  ) => {
    if ((error as { type?: string })?.type === "entity.too.large") {
      reply(res, 413, {
        error: `Files can be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
      });
      return;
    }
    next(error);
  },
);
