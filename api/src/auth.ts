import config from "@/config/variables";
import bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { customSession, emailOTP } from "better-auth/plugins";
import mongoose from "mongoose";
import { allowedOrigins } from "./config/cors-options";
import { customEndpoints } from "./lib/autoSignupUser";
import { createBrevoContact, updateBrevoContact } from "./lib/brevoConfig";
import { sendMail } from "./lib/mailer";
import { verifyEmailWithReoon } from "./lib/emailVerifier";
import splitName from "./lib/nameSplitter";
import { deleteFile } from "./lib/s3-utils";
import { generateUserId } from "./lib/userIdGenerator";
import { otpSchema } from "./modules/authentication/authentication.zod";
import { organizationService } from "./modules/organization/organization.service";
import { emitAuthEvent } from "./lib/entitlements";
import { User } from "./modules/user/user.model";
import { registerSchema } from "./modules/user/user.zod-schema";

// Constants
export const OTP_LENGTH = 6; // six digits
const OTP_VALIDITY = 60 * 15; // 15 minutes
const MAX_ALLOWED_ATTEMPTS = 3; // max wrong attempts before invalidating the otp

const authConnection = mongoose.createConnection(process.env.MONGO_URI!);

authConnection.on("error", (err) => {
  console.error("Failed to connect Mongoose client for auth:", err);
  process.exit(1);
});

authConnection.once("open", () => {
  console.log("[+] Mongoose connection established for auth adapter");
});

export const client = authConnection.getClient();
export const db = client.db(authConnection.name); // use MongoClient to obtain db regardless of readyState

// Helper function to check if image is from our bucket
// Handles both S3 keys (e.g., "sitepins/users/123.png") and full URLs
const isOurBucketImage = (imageValue: string): boolean => {
  if (!imageValue) return false;

  // If it starts with our folder prefix, it's a direct S3 key from our bucket
  if (imageValue.startsWith("sitepins/")) {
    return true;
  }

  // If it's a full URL, it's only "ours" when it points at our own bucket —
  // never an external avatar (GitHub/Google), so we don't try to delete those.
  if (imageValue.startsWith("http://") || imageValue.startsWith("https://")) {
    if (!config.s3_bucket_name) return false;
    return imageValue.includes(config.s3_bucket_name);
  }

  return false;
};

// Helper function to extract S3 key from image value
// Handles both S3 keys and full URLs
const getS3Key = (imageValue: string): string | null => {
  if (!imageValue) return null;

  // If it's already an S3 key (no http/https), return as-is
  if (!imageValue.startsWith("http://") && !imageValue.startsWith("https://")) {
    return imageValue;
  }

  // It's a full URL - extract the key from the path
  try {
    const urlObj = new URL(imageValue);
    // Remove leading slash from pathname
    const key = urlObj.pathname.substring(1);
    return key || null;
  } catch (error) {
    console.error("Failed to parse image URL:", error);
    return null;
  }
};

if (!config.better_auth_secret) {
  const secretWarning =
    "BETTER_AUTH_SECRET is not configured. Set it in your environment variables.";
  if (process.env.NODE_ENV === "production") {
    throw new Error(secretWarning);
  } else {
    console.warn(secretWarning);
  }
}

export const auth = betterAuth({
  basePath: "/api/v1/auth",
  baseURL: process.env.BASE_URL,
  secret: config.better_auth_secret,
  trustedOrigins: allowedOrigins,
  database: mongodbAdapter(db, {
    client,
    usePlural: true,
    debugLogs: false,
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day (every 1 day the session expiration is updated)
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache duration in seconds
    },
  },
  appName: "Sitepins",
  rateLimit: {
    // enabled: true, // enabled only if you want to test it in development
    window: parseInt(process.env.RATELIMIT_WINDOW || "10"), // seconds
    max: parseInt(process.env.RATELIMIT_MAX || "100"), // max requests / window
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          return {
            data: {
              ...user,
              user_id: generateUserId(user.email),
              full_name: user.name,
            },
          };
        },
        after: async (user, ctx) => {
          if (
            (user.provider === "Google" || user.provider === "Github") &&
            user.emailVerified
          ) {
            try {
              const orgOwnerName = (user.full_name as string)
                ? (user.full_name as string).split(" ")[0]
                : "User";
              const orgName = `${orgOwnerName}'s Org`;
              await organizationService.createOrganizationService({
                owner: user.user_id as string,
                org_name: orgName,
                email: user.email,
                default: true,
              });
            } catch (error) {
              console.error("Failed to create default organization", error);
            }

            // Subscribe new user to Brevo audience
            try {
              const { first_name, last_name } = splitName(
                (user.full_name as string) || "",
              );
              await createBrevoContact({
                email: user.email,
                first_name,
                last_name,
                subscribed: true,
              });
            } catch (error) {
              console.error(
                "Failed to subscribe user to Brevo audience:",
                error,
              );
            }

            // Send welcome email to new user
            try {
              await sendMail({
                to: user.email,
                kind: "welcome",
              });
            } catch (error) {
              console.error("Failed to send welcome email to new user", error);
            }
          }
        },
      },
      update: {
        before: async (user, ctx) => {
          // Auto-delete old display picture when updating to a new one, or clearing it
          if (user.image !== undefined) {
            try {
              // Get the authenticated user ID from the session context
              const identifier = (ctx as any)?.context?.session?.user?.id;

              if (!identifier) {
                return { data: user };
              }

              // Search by MongoDB _id (which better-auth uses for user.id in session)
              const existingUser = await User.findById(identifier);

              if (existingUser && existingUser.image) {
                const oldImageValue = existingUser.image;
                const newImageValue = user.image;

                if (
                  oldImageValue !== newImageValue &&
                  isOurBucketImage(oldImageValue)
                ) {
                  const key = getS3Key(oldImageValue);

                  if (key) {
                    await deleteFile(key).catch((err) => {
                      console.error(
                        `Failed to delete old image (${key}):`,
                        err.message,
                      );
                    });
                  }
                }
              }
            } catch (error) {
              console.error("Error in image cleanup before update:", error);
            }
          }

          return { data: user };
        },
        after: async (user, ctx) => {
          const initDefaultOrg = (ctx?.body as any)?.initDefaultOrg || false;
          if (
            (ctx?.path === "/email-otp/verify-email" && user.emailVerified) ||
            initDefaultOrg
          ) {
            // Initialize a organization
            try {
              const orgOwnerName = (user.full_name as string)
                ? (user.full_name as string).split(" ")[0]
                : "User";
              const orgName = `${orgOwnerName}'s Org`;
              await organizationService.createOrganizationService({
                owner: user.user_id as string,
                org_name: orgName,
                email: user.email,
                default: true,
              });
            } catch (error) {
              console.error("Failed to create default organization", error);
            }
            // Subscribe new user to Brevo audience
            try {
              const { first_name, last_name } = splitName(
                (user.full_name as string) || "",
              );
              await createBrevoContact({
                email: user.email,
                first_name,
                last_name,
                subscribed: !!(user as any).subscribed,
              });
            } catch (error) {
              console.error(
                "Failed to subscribe user to Brevo audience:",
                error,
              );
            }
            // Send welcome email to new user
            try {
              await sendMail({
                to: user.email,
                kind: "welcome",
              });
            } catch (error) {
              console.error("Failed to send welcome email to new user", error);
            }
          }
        },
      },
    },
    session: {
      create: {
        // called after every successfully login
        after: async (session, ctx) => {
          const user = await User.findById(session.userId);

          if (!user) return;

          try {
            await updateBrevoContact({
              email: user.email,
              updateType: "login",
              last_login_date: session.createdAt.toISOString(),
            });
          } catch (err) {
            console.error("Failed to update Brevo contact on login:", err);
          }

          try {
            await emitAuthEvent({
              type: "login",
              userId: user.user_id as string,
              ip: session.ipAddress || "",
              date: session.createdAt.toISOString(),
            });
          } catch (err) {
            console.error("Failed to update user Log contact on login:", err);
          }
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (process.env.NODE_ENV !== "production") {
        ctx.context.skipOriginCheck = true;
      }
      if (ctx.path === "/sign-up/email") {
        const payload = {
          full_name: ctx.body.name,
          email: ctx.body.email,
          password: ctx.body.password,
          subscribed: !!ctx.body.subscribed,
        };
        const { success, error } = registerSchema.safeParse(payload);
        if (!success) {
          throw new APIError("BAD_REQUEST", {
            message: error.issues.map((issue) => issue.message)[0],
          });
        }
        // Verify email before creating user
        const { isValid, reason } = await verifyEmailWithReoon(payload.email);

        if (!isValid) {
          throw new APIError("BAD_REQUEST", {
            message: reason || "Please use a different email",
          });
        }
      }

      if (ctx.path === "/email-otp/verify-email") {
        // validate otp payload
        const { success, error } = otpSchema.safeParse(ctx.body);
        if (!success) {
          throw new APIError("BAD_REQUEST", {
            message: error.issues.map((issue) => issue.message)[0],
          });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      // console.log({ debugCTX: ctx });
    }),
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },
  user: {
    deleteUser: {
      enabled: true,
    },
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
  account: {
    accountLinking: {
      enabled: true, // same email's google/github login will point to same account
    },
  },
  advanced: {
    cookiePrefix: "sitepins-app",
    // Only share the session cookie across subdomains when COOKIE_DOMAIN is
    // set (e.g. hosted deploys with app + api on different subdomains). A
    // single-host self-hosted deploy leaves it unset and the cookie is scoped
    // to the exact host — no hardcoded domain that breaks other people's sites.
    crossSubDomainCookies: {
      enabled: Boolean(config.cookie_domain),
      domain: config.cookie_domain,
    },
    defaultCookieAttributes: {
      // SameSite=None (needed for cross-subdomain) requires Secure; otherwise
      // Lax is correct and works over plain http in local/self-hosted setups.
      sameSite: config.cookie_domain ? "none" : "lax",
      secure:
        process.env.NODE_ENV === "production" || Boolean(config.cookie_domain),
      path: "/",
    },
  },
  emailAndPassword: {
    enabled: true,
    // Set REQUIRE_EMAIL_VERIFICATION=false to let self-hosted instances skip
    // the OTP step when no mail provider is configured.
    requireEmailVerification: config.require_email_verification,
    autoSignIn: true, // false for not auto signin after signup
    autoSignInAfterVerification: true, // false for not auto signin after email verification
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
    resetPasswordTokenExpiresIn: 15 * 60, // 15 minutes
    sendResetPassword: async ({ user, url }) => {
      try {
        await sendMail({
          to: user.email,
          kind: "password_reset",
          params: {
            password_reset: url,
          },
        });
      } catch (error) {
        throw new APIError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error
              ? error.message
              : "Failed to send mail! Internal Server error",
        });
      }
    },
    onPasswordReset: async ({ user }, request) => {
      try {
        const userId = generateUserId(user.email);
        await emitAuthEvent({
          type: "password_reset",
          userId,
          date: new Date().toISOString(),
        });
      } catch (error) {
        console.error("User log updated failed", error);
      }
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      disableImplicitSignUp: false,
      redirectURI: `${process.env.BASE_URL}/api/v1/auth/callback/github`,
      // Don't override state - let better-auth handle it
      mapProfileToUser: (profile) => {
        return {
          full_name: profile.name || profile.login,
          provider: "Github",
        };
      },
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      disableImplicitSignUp: false, // auto signup when when signin with google
      accessType: "offline", // To always get a refresh token
      prompt: "select_account consent",
      // scope: [""], // custom scopes
      redirectURI: `${process.env.BASE_URL}/api/v1/auth/callback/google`,
      // Don't override state - let better-auth handle it
      mapProfileToUser: (profile) => {
        return {
          full_name: profile.name,
          provider: "Google",
        };
      },
    },
  },
  plugins: [
    emailOTP({
      otpLength: OTP_LENGTH,
      expiresIn: OTP_VALIDITY,
      allowedAttempts: MAX_ALLOWED_ATTEMPTS,
      overrideDefaultEmailVerification: true, // override the token based link verification
      // sendVerificationOnSignUp: true,
      sendVerificationOTP: async ({ email, otp, type }) => {
        try {
          if (type === "sign-in") {
            // Send the OTP for sign in
          }
          if (type === "email-verification") {
            await sendMail({
              to: email,
              kind: "otp",
              params: {
                otp,
              },
            });
          }
          if (type === "forget-password") {
            await sendMail({
              to: email,
              kind: "otp",
              params: {
                otp,
              },
            });
          }
        } catch (error) {
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message:
              error instanceof Error
                ? error.message
                : "Failed to send mail! Internal Server error",
          });
        }
      },
    }),
    customEndpoints(),
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

export type Session = typeof auth.$Infer.Session;
