import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { authClient } from "./auth-client";

/**
 * getAuth optionally accepts a request (middleware/edge) to extract headers from.
 * When no request is provided (server components), it falls back to `headers()`.
 */
export const getAuth = async (request?: Request | NextRequest) => {
  const fetchHeaders = request ? request.headers : await headers();

  const { data } = await authClient.getSession({
    fetchOptions: {
      headers: fetchHeaders,
    },
  });

  return data;
};

export const getListAccounts = async (request?: Request | NextRequest) => {
  const fetchHeaders = request ? request.headers : await headers();
  const { data } = await authClient.listAccounts({
    fetchOptions: {
      headers: fetchHeaders,
    },
  });
  return data;
};

export const authCookies = async (request?: Request | NextRequest) => {
  if (request) {
    return {
      headers: {
        cookie: (request.headers && request.headers.get("cookie")) || "",
      },
    };
  }

  const cookieStore = await cookies();
  return {
    headers: {
      cookie: cookieStore.toString(),
    },
  };
};
