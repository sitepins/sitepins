import { Session } from "@/auth";
import { BetterAuthPlugin, generateId } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import * as z from "zod";
import { generateUserId } from "./userIdGenerator";

const schema = z.object({
  email: z.string({
    error: (iss) =>
      iss.input === undefined ? "Email is required" : "Email is invalid",
  }),
  name: z
    .string({
      error: (iss) =>
        iss.input === undefined ? "Name is required" : "Name is invalid",
    })
    .min(2, { error: "Name must be at least 2 characters" }),
});

export const customEndpoints = () => {
  return {
    id: "custom-signup",
    endpoints: {
      createUser: createAuthEndpoint(
        "/custom-signup",
        {
          method: "POST",
        },
        async (ctx) => {
          const { email, name } = ctx?.body || {};

          const { success, error } = schema.safeParse({ email, name });

          if (!success) {
            const tree = z.treeifyError(error);

            const message =
              tree.errors?.[0] ??
              tree.properties?.email?.errors?.[0] ??
              tree.properties?.name?.errors?.[0] ??
              "Invalid input";

            throw new APIError("BAD_REQUEST", {
              message,
              code: "INVALID_INPUT",
            });
          }

          // Check if user exists
          const existingUser = await ctx.context.adapter.findOne({
            model: "user",
            where: [{ field: "email", value: email }],
          });
          if (existingUser) {
            throw new APIError("CONFLICT", {
              message: "User already exists",
              code: "USER_EXISTS",
            });
          }
          // Create user
          const user = await ctx.context.adapter.create({
            model: "user",
            data: {
              id: generateId(),
              user_id: generateUserId(email),
              email,
              role: "user",
              subscribed: false,
              image: null,
              full_name: name,
              emailVerified: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });

          // Create session and set cookie
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
            false,
            ctx.headers,
          );

          // Set session cookie
          const cookie = ctx.context.createAuthCookie("session_token");
          // ctx.setCookie(cookie.name, session.token, cookie.attributes);
          await ctx.setSignedCookie(
            cookie.name,
            session.token,
            ctx.context.secret, // Sign with the auth secret
            cookie.attributes,
          );

          const userUpdateAfterHook =
            ctx.context.options.databaseHooks?.user?.update?.after;

          const sessionCreateAfterHook =
            ctx.context.options.databaseHooks?.session?.create?.after;

          if (typeof userUpdateAfterHook === "function") {
            // await to to ensure create org before signed in.
            await userUpdateAfterHook(user as Session["user"], {
              ...ctx,
              body: {
                ...(ctx.body || {}),
                initDefaultOrg: true,
              },
            });
          }

          if (typeof sessionCreateAfterHook === "function") {
            // intentionally not awaited to avoid delaying the response
            sessionCreateAfterHook(session as Session["session"], ctx);
          }

          return ctx.json({ user, session });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
};
