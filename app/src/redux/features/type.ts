import { Endpoints } from "@octokit/types";

export type TGitHubEndpoint = keyof Endpoints;
export type TGitHubPromise<E extends TGitHubEndpoint> =
  Endpoints[E]["response"]["data"];
export type TGitHubOption<E extends TGitHubEndpoint> =
  Endpoints[E]["parameters"] & { parser?: boolean };
