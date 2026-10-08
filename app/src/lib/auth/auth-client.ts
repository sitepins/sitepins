import { toast } from "@/components/ui/toast";
import { API_URL, IS_DEMO } from "@/lib/constant";
import {
  emailOTPClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

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

let signingOut = false;

export const isSigningOut = () => signingOut;

// A full reload drops the previous account's RTK cache; the flag stops ProtectedLayoutWrapper from adding `?from=`.
export async function signOutToLogin() {
  signingOut = true;
  try {
    localStorage.removeItem("sitepins_cached_session");
  } catch {
    // Silently catch storage errors
  }
  const { error } = await authClient.signOut();
  if (error) {
    signingOut = false;
    return;
  }
  window.location.replace("/login");
}
