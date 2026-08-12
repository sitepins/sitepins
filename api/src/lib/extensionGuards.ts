import type { NextFunction, Request, Response } from "express";

// Optional hosted-product policy hooks. Core never assigns a policy, so
// self-hosted installs stay unmetered and do not expose plan concepts.
export type RequestGuardEvent =
  "organization:create" | "organization:member:add" | "project:create";

export type RequestGuard = (req: Request) => Promise<void> | void;

const requestGuards = new Map<RequestGuardEvent, RequestGuard>();

export const setRequestGuard = (
  event: RequestGuardEvent,
  guard: RequestGuard,
) => {
  requestGuards.set(event, guard);
};

export const runRequestGuard =
  (event: RequestGuardEvent) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      await requestGuards.get(event)?.(req);
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
