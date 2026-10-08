// Extension point for the middleware (proxy.ts). Inert here; other builds may
// swap this module for their own.

import type { NextRequest, NextResponse } from "next/server";

export type TProxyGateContext = {
  request: NextRequest;
  userId: string;
  /** The response the proxy will return; a gate may add cookies to it. */
  response: NextResponse;
};

/** Runs on authenticated, non-public routes. Return a response to short-circuit. */
export async function gateProtectedRequest(
  _ctx: TProxyGateContext,
): Promise<NextResponse | null> {
  return null;
}
