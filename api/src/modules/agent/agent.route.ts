import { ENUM_ROLE } from "@/enums/roles";
import { authMiddleware } from "@/middlewares/authMiddleware";
import express from "express";
import { agentErrorHandler, agentGrantController } from "./agent.controller";

// Settings → MCP Connection: the signed-in user manages their access tokens.
export const agentGrantRouter: express.Router = express.Router();
const signedIn = authMiddleware.verifyAuth(
  ENUM_ROLE.ADMIN,
  ENUM_ROLE.USER,
  ENUM_ROLE.MODERATOR,
);

agentGrantRouter.get("/", signedIn, agentGrantController.list);
agentGrantRouter.post("/tokens", signedIn, agentGrantController.createToken);
agentGrantRouter.delete("/:grantId", signedIn, agentGrantController.revoke);
agentGrantRouter.use(agentErrorHandler);
