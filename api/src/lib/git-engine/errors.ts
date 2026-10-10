export type TGitEngineErrorCode =
  | "ref_moved"
  | "diverged"
  | "busy"
  | "not_found"
  | "too_large"
  | "invalid"
  | "policy"
  | "forbidden"
  | "upstream";

export class GitEngineError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: TGitEngineErrorCode,
  ) {
    super(message);
    this.name = "GitEngineError";
  }
}

const upstreamMessage = (body: string): string => {
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
    const message = parsed.message ?? parsed.error;
    if (typeof message === "string") return message;
    if (message) return JSON.stringify(message);
  } catch {
    // not JSON
  }
  return body;
};

export const upstreamError = (status: number, body: string): GitEngineError => {
  const detail = upstreamMessage(body).slice(0, 300);
  if (status === 401 || status === 403) {
    return new GitEngineError(
      `The git host refused access (${status}): ${detail}`,
      403,
      "forbidden",
    );
  }
  if (status === 404) {
    return new GitEngineError(
      `Not found on the git host: ${detail}`,
      404,
      "not_found",
    );
  }
  if (status === 409 || status === 422 || status === 400) {
    return new GitEngineError(
      `The git host rejected the request: ${detail}`,
      status,
      "upstream",
    );
  }
  return new GitEngineError(
    `The git host failed (${status}): ${detail}`,
    502,
    "upstream",
  );
};
