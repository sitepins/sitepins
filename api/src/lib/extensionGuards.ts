import type { NextFunction, Request, Response } from "express";

// Optional policy hooks. Core never assigns a policy, so installs stay
// unmetered. Checks carry plain ids so they run the same from HTTP routes and
// from agent tools.
export type TPolicyCheck =
  | { event: "organization:create"; user_id: string }
  | { event: "organization:member:add"; user_id: string; org_id: string }
  | {
      event: "project:create";
      user_id: string;
      org_id: string;
      visibility?: string;
    };

export type TPolicyEvent = TPolicyCheck["event"];

export type TPolicyGuard<E extends TPolicyEvent = TPolicyEvent> = (
  check: Extract<TPolicyCheck, { event: E }>,
) => Promise<void> | void;

const policyGuards = new Map<
  TPolicyEvent,
  (check: TPolicyCheck) => Promise<void> | void
>();

export const setPolicyGuard = <E extends TPolicyEvent>(
  event: E,
  guard: TPolicyGuard<E>,
) => {
  policyGuards.set(event, guard as (check: TPolicyCheck) => void);
};

export const runPolicyGuard = async (check: TPolicyCheck) =>
  policyGuards.get(check.event)?.(check);

const readString = (value: unknown) => (typeof value === "string" ? value : "");

const checkFromRequest = (
  event: TPolicyEvent,
  req: Request,
): TPolicyCheck | undefined => {
  const user_id = req.user?.user_id;
  if (!user_id) return undefined;
  switch (event) {
    case "organization:create":
      return { event, user_id };
    case "organization:member:add":
      return { event, user_id, org_id: readString(req.params.org_id) };
    case "project:create":
      return {
        event,
        user_id,
        org_id: readString(req.body?.org_id),
        visibility: req.body?.visibility,
      };
  }
};

export const runRequestGuard =
  (event: TPolicyEvent) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const check = checkFromRequest(event, req);
      if (check) await runPolicyGuard(check);
      next();
    } catch (error) {
      next(error);
    }
  };

export type ProjectMutation =
  | { type: "visibility"; projectId: string; visibility: "public" | "private" }
  | { type: "status"; projectId: string; status: "active" | "archived" };

export type ProjectMutationGuard = (
  mutation: ProjectMutation,
) => Promise<void> | void;

let projectMutationGuard: ProjectMutationGuard | undefined;

export const setProjectMutationGuard = (guard: ProjectMutationGuard) => {
  projectMutationGuard = guard;
};

export const runProjectMutationGuard = (mutation: ProjectMutation) =>
  projectMutationGuard?.(mutation);

export type TAgentAccessCheck = {
  user_id: string;
  org_id: string;
  project_id?: string;
  project_owner_id: string;
  write: boolean;
};

export type TAgentAccessGuard = (
  check: TAgentAccessCheck,
) => Promise<void> | void;

let agentAccessGuard: TAgentAccessGuard | undefined;

export const setAgentAccessGuard = (guard: TAgentAccessGuard) => {
  agentAccessGuard = guard;
};

export const runAgentAccessGuard = async (check: TAgentAccessCheck) =>
  agentAccessGuard?.(check);

export type EntityDecorator<T> = (entity: T) => Promise<T> | T;

let organizationDecorator: EntityDecorator<Record<string, unknown>> | undefined;
let projectDecorator: EntityDecorator<Record<string, unknown>> | undefined;

export const setOrganizationDecorator = (
  decorator: EntityDecorator<Record<string, unknown>>,
) => {
  organizationDecorator = decorator;
};

export const setProjectDecorator = (
  decorator: EntityDecorator<Record<string, unknown>>,
) => {
  projectDecorator = decorator;
};

export const decorateOrganization = (organization: Record<string, unknown>) =>
  organizationDecorator ? organizationDecorator(organization) : organization;

export const decorateProject = (project: Record<string, unknown>) =>
  projectDecorator ? projectDecorator(project) : project;
