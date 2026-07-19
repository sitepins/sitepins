import { API_URL, IS_DEMO } from "@/lib/constant";
import { BetterAuthClientPlugin } from "better-auth";
import {
  emailOTPClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import { BetterFetchOption, createAuthClient } from "better-auth/react";
import { toast } from "sonner";

const customSignupClient = () => {
  return {
    id: "custom-signup",
    getActions: ($fetch) => ({
      createUser: async (
        data: { email: string; name: string },
        fetchOptions?: BetterFetchOption,
      ) => {
        const res = await $fetch<Session>("/custom-signup", {
          method: "POST",
          body: data,
          ...fetchOptions,
        });
        return res;
      },
    }),
  } satisfies BetterAuthClientPlugin;
};

export const authClient = createAuthClient({
  baseURL: `${API_URL}${IS_DEMO ? "/demo/auth" : "/auth"}`,
  plugins: [
    emailOTPClient(),
    inferAdditionalFields({
      session: {
        serverTime: { type: "string" },
      },
      user: {
        user_id: {
          type: "string",
          input: false,
        },
        full_name: {
          type: "string",
          input: false,
        },
        role: {
          type: "string",
          input: false,
        },
        subscribed: {
          type: "boolean",
          input: true,
        },
        country: {
          type: "string",
          input: true,
        },
      },
    }),
    customSignupClient(),
  ],
  fetchOptions: {
    credentials: "include", // Important for cross-domain cookies
    onRequest: (ctx) => {
      const method = ctx.method?.toUpperCase();
      if (IS_DEMO && method && method !== "GET" && method !== "HEAD") {
        // whitelist sign-in and sign-up
        if (
          ctx.url.toString().includes("/sign-in") ||
          ctx.url.toString().includes("/sign-up")
        ) {
          return;
        }
        toast.error("Demo mode: changes are not saved.");
        throw new Error("Demo mode: changes are not saved.");
      }
    },
    onError: (e) => {
      if (e.error.status !== 429 || typeof window === "undefined") return;
      // show toast warning only in client side
      toast.error("Too many requests. Please try again later.");
    },
    headers: {
      "X-App-Context": IS_DEMO ? "demo" : "app",
    },
  },
});

export type Session = typeof authClient.$Infer.Session;
