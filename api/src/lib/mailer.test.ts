import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Self-hosted signup depends on this module working with zero mail config
// (console provider). Extensions can plug in custom senders.

const { mockConfig, createTransportMock, transportSendMailMock } = vi.hoisted(
  () => ({
    mockConfig: {
      mail_provider: undefined as string | undefined,
      mail_from_name: "Sitepins",
      mail_from_email: "noreply@example.com",
      smtp_host: undefined as string | undefined,
      smtp_port: 587,
      smtp_secure: false,
      smtp_user: undefined as string | undefined,
      smtp_pass: undefined as string | undefined,
    },
    transportSendMailMock: vi.fn(async (..._args: unknown[]) => undefined),
    createTransportMock: vi.fn(),
  }),
);

vi.mock("@/config/variables", () => ({ default: mockConfig }));

vi.mock("nodemailer", () => ({
  createTransport: (...args: unknown[]) => createTransportMock(...args),
  default: {
    createTransport: (...args: unknown[]) => createTransportMock(...args),
  },
}));

function resetConfig() {
  mockConfig.mail_provider = undefined;
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

// The console provider writes through the shared logger, which lands on
// stderr. NODE_ENV=test would otherwise mute anything below error.
let stderrWrites: string[];
const originalLogLevel = process.env.LOG_LEVEL;

beforeEach(() => {
  resetConfig();
  transportSendMailMock.mockClear();
  createTransportMock.mockReset();
  createTransportMock.mockImplementation(() => ({
    sendMail: transportSendMailMock,
  }));
  process.env.LOG_LEVEL = "warn";
  stderrWrites = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderrWrites.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalLogLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = originalLogLevel;
  }
});

describe("mailer provider auto-detection & custom sender", () => {
  it("falls back to console when no provider is configured", async () => {
    const { sendMail } = await freshMailer();
    await sendMail({ to: "a@b.com", kind: "otp", params: { otp: "123456" } });

    expect(transportSendMailMock).not.toHaveBeenCalled();
    expect(stderrWrites.join("\n")).toContain("123456");
  });

  it("logs the reset link for password_reset on the console provider", async () => {
    const { sendMail } = await freshMailer();
    await sendMail({
      to: "a@b.com",
      kind: "password_reset",
      params: { password_reset: "https://app.example.com/reset/xyz" },
    });

    expect(stderrWrites.join("\n")).toContain(
      "https://app.example.com/reset/xyz",
    );
  });

  it("auto-selects smtp when smtp_host is set", async () => {
    mockConfig.smtp_host = "smtp.example.com";
    const { sendMail } = await freshMailer();
    await sendMail({ to: "a@b.com", kind: "welcome" });

    expect(transportSendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@b.com",
        subject: expect.stringContaining("Welcome"),
      }),
    );
  });

  it("lets an explicit MAIL_PROVIDER override auto-detection", async () => {
    mockConfig.smtp_host = "smtp.example.com"; // would otherwise auto-select smtp
    mockConfig.mail_provider = "console";
    const { sendMail } = await freshMailer();
    await sendMail({ to: "a@b.com", kind: "welcome" });

    expect(transportSendMailMock).not.toHaveBeenCalled();
    expect(stderrWrites.join("\n")).toContain("[mailer]");
  });

  it("delegates to custom mail sender when registered by extensions", async () => {
    const { sendMail, setMailSender } = await freshMailer();
    const customMock = vi.fn(async () => true);
    setMailSender(customMock);

    await sendMail({ to: "user@example.com", kind: "welcome" });

    expect(customMock).toHaveBeenCalledWith({
      to: "user@example.com",
      kind: "welcome",
      params: {},
    });
    expect(transportSendMailMock).not.toHaveBeenCalled();
  });

  it("falls back to standard provider if custom mail sender returns false", async () => {
    mockConfig.smtp_host = "smtp.example.com";
    const { sendMail, setMailSender } = await freshMailer();
    const customMock = vi.fn(async () => false);
    setMailSender(customMock);

    await sendMail({ to: "user@example.com", kind: "welcome" });

    expect(customMock).toHaveBeenCalled();
    expect(transportSendMailMock).toHaveBeenCalled();
  });
});

describe("mailer branding", () => {
  it("uses a per-message brand for sender, subject and footer", async () => {
    mockConfig.smtp_host = "smtp.example.com";
    const { sendMail } = await freshMailer();
    await sendMail({
      to: "a@b.com",
      kind: "welcome",
      brand: { name: "Agency CMS", logo_url: "https://agency.io/logo.png" },
    });

    const mail = transportSendMailMock.mock.calls[0]?.[0] as {
      from: string;
      subject: string;
      html: string;
    };
    expect(mail.from).toBe('"Agency CMS" <noreply@example.com>');
    expect(mail.subject).toBe("Welcome to Agency CMS");
    expect(mail.html).toContain('<img src="https://agency.io/logo.png"');
    expect(mail.html).not.toContain("Sitepins");
  });

  it("passes the brand to a custom sender", async () => {
    const { sendMail, setMailSender } = await freshMailer();
    const sender = vi.fn(async () => true);
    setMailSender(sender);
    await sendMail({ to: "a@b.com", kind: "otp", brand: { name: "Agency" } });
    expect(sender).toHaveBeenCalledWith({
      to: "a@b.com",
      kind: "otp",
      params: {},
      brand: { name: "Agency" },
    });
  });
});
