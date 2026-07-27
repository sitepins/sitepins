import { OTP_LENGTH } from "@/auth";
import { z } from "zod";

export const otpSchema = z.object({
  otp: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "OTP is required."
          : "OTP must be a string.",
    })
    .refine((value) => value.length === OTP_LENGTH, {
      error: `OTP must be exactly ${OTP_LENGTH} digits.`,
    }),
});
