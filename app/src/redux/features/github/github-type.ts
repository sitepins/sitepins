import { Endpoints } from "@octokit/types";

/**
 * GitHub API Types
 *
 * Type definitions for GitHub REST API using Octokit's endpoint definitions.
 */

export type TGitHubEndpoint = keyof Endpoints;

export type TGitHubPromise<E extends TGitHubEndpoint> =
  Endpoints[E]["response"]["data"];

export type TGitHubOption<E extends TGitHubEndpoint> =
  Endpoints[E]["parameters"] & { parser?: boolean; token?: string };

export type TGithubPromise<E extends TGitHubEndpoint> =
  Endpoints[E]["response"]["data"];

export type TGitHubContentResponse =
  | Record<string, unknown>
  | TGitHubPromise<"GET /repos/{owner}/{repo}/contents/{path}">;
