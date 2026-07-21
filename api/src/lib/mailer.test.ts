import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Self-hosted signup depends on this module working with zero mail config
// (console provider). Provider auto-detection order and the brevo
// kind->template mapping are the two things most likely to silently regress.

const { mockConfig, sendBrevoMailMock, createTransportMock, transportSendMailMock } =
  vi.hoisted(() => ({
    mockConfig: {
      mail_provider: undefined as string | undefined,
      mail_from_name: "Sitepins",
      mail_from_email: "noreply@example.com",
      brevo_api_key: undefined as string | undefined,
      smtp_host: undefined as string | undefined,
      smtp_port: 587,
      smtp_secure: false,
      smtp_user: undefined as string | undefined,
      smtp_pass: undefined as string | undefined,
    },
    sendBrevoMailMock: vi.fn(async (..._args: unknown[]) => undefined),
    transportSendMailMock: vi.fn(async (..._args: unknown[]) => undefined),
    createTransportMock: vi.fn(),
  }));

vi.mock("@/config/variables", () => ({ default: mockConfig }));

vi.mock("./brevoConfig", () => ({
  sendBrevoMail: (...args: unknown[]) => sendBrevoMailMock(...args),
  BREVO_MAIL_TEMPLATES: {
    welcome: 1,
    otp_sender: 59,
    pass_reset: 60,
    delete_account: 32,
    org_member_added: 61,
    org_member_updated: 62,
    org_member_removed: 63,
  },
}));

vi.mock("nodemailer", () => ({
  createTransport: (...args: unknown[]) => createTransportMock(...args),
  default: {
    createTransport: (...args: unknown[]) => createTransportMock(...args),
  },
}));

function resetConfig() {
  mockConfig.mail_provider = undefined;
  mockConfig.brevo_api_key = undefined;
  mockConfig.smtp_host = undefined;
  mockConfig.smtp_port = 587;
  mockConfig.smtp_secure = false;
  mockConfig.smtp_user = undefined;
  mockConfig.smtp_pass = undefined;
}

async function freshMailer() {
  vi.resetModules();
  return import("./mailer.js");
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetConfig();
  sendBrevoMailMock.mockClear();
  transportSendMailMock.mockClear();
  createTransportMock.mockReset();
  createTransportMock.mockImplementation(() => ({ sendMail: transportSendMailMock }));
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe("mailer provider auto-detection", () => {
  it("falls back to console when no provider is configured", async () => {
    const { sendMail } = await freshMailer();
    await sendMail({ to: "a@b.com", kind: "otp", params: { otp: "123456" } });

    expect(sendBrevoMailMock).not.toHaveBeenCalled();
    expect(transportSendMailMock).not.toHaveBeenCalled();
    const logged = warnSpy.mock.calls.flat().join("\n");
    expect(logged).toContain("123456");
  });

  it("logs the reset link for password_reset on the console provider", async () => {
    const { sendMail } = await freshMailer();
    await sendMail({
      to: "a@b.com",
      kind: "password_reset",
      params: { password_reset: "https://app.example.com/reset/xyz" },
    });

    const logged = warnSpy.mock.calls.flat().join("\n");
    expect(logged).toContain("https://app.example.com/reset/xyz");
  });

  it("auto-selects brevo when an API key is configured", async () => {
    mockConfig.brevo_api_key = "test-key";
    const { sendMail } = await freshMailer();
    await sendMail({ to: "a@b.com", kind: "otp", params: { otp: "000000" } });

    expect(sendBrevoMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "a@b.com", templateId: 59 }),
    );
    expect(transportSendMailMock).not.toHaveBeenCalled();
  });

  it("maps each mail kind to its own brevo template id", async () => {
    mockConfig.brevo_api_key = "test-key";
    const { sendMail } = await freshMailer();
    await sendMail({ to: "a@b.com", kind: "welcome" });

    expect(sendBrevoMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 1 }),
    );
  });

  it("auto-selects smtp when smtp_host is set but no brevo key", async () => {
    mockConfig.smtp_host = "smtp.example.com";
    const { sendMail } = await freshMailer();
    await sendMail({ to: "a@b.com", kind: "welcome" });

    expect(sendBrevoMailMock).not.toHaveBeenCalled();
    expect(transportSendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@b.com",
        subject: expect.stringContaining("Welcome"),
      }),
    );
  });

  it("lets an explicit MAIL_PROVIDER override auto-detection", async () => {
    mockConfig.brevo_api_key = "test-key"; // would otherwise auto-select brevo
    mockConfig.mail_provider = "console";
    const { sendMail } = await freshMailer();
    await sendMail({ to: "a@b.com", kind: "welcome" });

    expect(sendBrevoMailMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
