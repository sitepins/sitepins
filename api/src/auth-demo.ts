import config from "@/config/variables";
import bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { customSession } from "better-auth/plugins";
import { client, db } from "./auth";
import { allowedOrigins } from "./config/cors-options";

export const authDemo = betterAuth({
  basePath: "/api/v1/demo/auth",
  baseURL: process.env.BASE_URL,
  secret: config.better_auth_secret,
  trustedOrigins: allowedOrigins,
  database: mongodbAdapter(db, {
    client,
    usePlural: true,
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day (every 1 day the session expiration is updated)
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache duration in seconds
    },
  },
  appName: "Sitepins Demo",
  rateLimit: {
    // enabled: true, // enabled only if you want to test it in development
    window: parseInt(process.env.RATELIMIT_WINDOW!), // time window in seconds
    max: parseInt(process.env.RATELIMIT_MAX!), // max requests in the window
  },
  user: {
    modelName: "user",
    fields: {
      name: "full_name",
      emailVerified: "verified",
    },
    additionalFields: {
      full_name: {
        type: "string",
        required: true,
        input: false,
        defaultValue: "",
      },
      user_id: {
        type: "string",
        required: true,
        input: false,
        defaultValue: "",
      },
      provider: {
        type: "string",
        required: true,
        input: false,
        defaultValue: "Credentials",
      },
      role: {
        type: "string",
        required: true,
        input: false,
        defaultValue: "user",
      },
      password: {
        type: "string",
        input: true,
      },
      subscribed: {
        type: "boolean",
        required: true,
        input: true,
      },
      country: {
        type: "string",
        input: true,
      },
    },
  },
  advanced: {
    cookiePrefix: "sitepins-demo",
    crossSubDomainCookies: {
      enabled: process.env.NODE_ENV === "production",
      domain:
        process.env.NODE_ENV === "production" ? ".sitepins.com" : undefined,
    },
    defaultCookieAttributes: {
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  },
  emailAndPassword: {
    enabled: true,
    password: {
      // your custom password hashing function
      hash: async (password: string) => {
        const hashPass = await bcrypt.hash(password, config.salt);
        return hashPass;
      },
      // your custom password verification function
      verify: async ({ password, hash }) => {
        const isValidPassword = await bcrypt.compare(password, hash);
        return isValidPassword;
      },
    },
  },
  plugins: [
    customSession(async ({ user, session }) => {
      return {
        user,
        session: {
          ...session,
          serverTime: new Date().toISOString(),
        },
      };
    }),
  ],
});
