import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  OTP_LENGTH: 6,
}));

describe("Authentication Module", () => {
  describe("Zod Schemas", () => {
    describe("otpSchema", () => {
      it("validates a 6-digit string successfully", async () => {
        const { otpSchema } = await import("./authentication.zod.js");
        const result = otpSchema.safeParse({ otp: "123456" });
        expect(result.success).toBe(true);
      });

      it("fails when otp is not exactly 6 digits", async () => {
        const { otpSchema } = await import("./authentication.zod.js");
        const tooShort = otpSchema.safeParse({ otp: "123" });
        expect(tooShort.success).toBe(false);

        const tooLong = otpSchema.safeParse({ otp: "1234567" });
        expect(tooLong.success).toBe(false);
      });

      it("fails when otp is missing or not a string", async () => {
        const { otpSchema } = await import("./authentication.zod.js");
        const missing = otpSchema.safeParse({});
        expect(missing.success).toBe(false);

        const numberVal = otpSchema.safeParse({ otp: 123456 });
        expect(numberVal.success).toBe(false);
      });
    });
  });
});
