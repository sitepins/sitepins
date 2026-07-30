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

/**
 * One entry of `GET /contents/{path}`. The endpoint returns a single entry for
 * a file and an array of them for a directory.
 */
export type TGitHubContentEntry = {
  type: "file" | "dir" | "submodule" | "symlink";
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string | null;
  git_url: string | null;
  download_url: string | null;
  /** Base64 on a file response; absent for directory entries. */
  content?: string;
  encoding?: string;
};
