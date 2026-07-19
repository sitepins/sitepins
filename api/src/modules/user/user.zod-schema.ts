import { z } from "zod";

export const registerSchema = z.object({
  full_name: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Please enter your full name."
          : "Full name must be a valid text.",
    })
    .min(3, { error: "Full name must be at least 3 characters long." }),

  email: z.email({ error: "Please enter a valid email address." }),

  password: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Please enter your password."
          : "Password must be a valid text string.",
    })
    .min(8, { error: "Password must be at least 8 characters long." })
    .max(32, { error: "Password must be fewer than 32 characters long." })
    .trim()
    .refine((value) => /[a-z]/i.test(value), {
      error: "Password must include at least one letter.",
    })
    .refine((value) => /\d/.test(value), {
      error: "Password must include at least one number (0-9).",
    })
    .refine((value) => /[!@#$%^&*()_+\-=\[\]{};':\",./<>?|\\`~]/.test(value), {
      error:
        "Password must include at least one special character (e.g. !, @, #, $).",
    }),

  subscribed: z.boolean({
    error: (issue) =>
      issue.input === undefined
        ? "Please specify your subscription preference."
        : "Subscription status must be true or false.",
  }),
});
