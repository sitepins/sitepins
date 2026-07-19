import config from "@/config/variables";
import { BREVO_MAIL_TEMPLATES, sendBrevoMail } from "./brevoConfig";

// ---------------------------------------------------------------------------
// Provider-agnostic transactional mailer.
//
// The open-source build must work with zero external mail config. Callers
// send by logical `kind` (never a hardcoded Brevo template id), and the
// active provider decides how to deliver it:
//
//   - brevo   : uses your Brevo transactional templates (numeric ids)
//   - smtp    : renders a built-in HTML email and sends via nodemailer
//   - console : logs the message (incl. OTP / reset link) to stdout so a
//               self-hoster can complete signup with no mail provider at all
//
// Provider is chosen by MAIL_PROVIDER, or auto-detected: Brevo if an API key
// is set, else SMTP if SMTP_HOST is set, else console.
// ---------------------------------------------------------------------------

export type MailKind =
  | "welcome"
  | "otp"
  | "password_reset"
  | "delete_account"
  | "org_member_added"
  | "org_member_updated"
  | "org_member_removed";

type MailParams = Record<string, unknown>;

type MailProvider = "brevo" | "smtp" | "console";

const FROM_NAME = config.mail_from_name || "Sitepins";
const FROM_EMAIL = config.mail_from_email || "noreply@example.com";

function resolveProvider(): MailProvider {
  const explicit = config.mail_provider as MailProvider | undefined;
  if (explicit === "brevo" || explicit === "smtp" || explicit === "console") {
    return explicit;
  }
  if (config.brevo_api_key) return "brevo";
  if (config.smtp_host) return "smtp";
  return "console";
}

// Maps each logical kind to its Brevo transactional template id.
const BREVO_TEMPLATE_BY_KIND: Record<MailKind, number> = {
  welcome: BREVO_MAIL_TEMPLATES.welcome,
  otp: BREVO_MAIL_TEMPLATES.otp_sender,
  password_reset: BREVO_MAIL_TEMPLATES.pass_reset,
  delete_account: BREVO_MAIL_TEMPLATES.delete_account,
  org_member_added: BREVO_MAIL_TEMPLATES.org_member_added,
  org_member_updated: BREVO_MAIL_TEMPLATES.org_member_updated,
  org_member_removed: BREVO_MAIL_TEMPLATES.org_member_removed,
};

// ---------------------------------------------------------------------------
// Built-in HTML templates (used by the smtp + console providers). Deliberately
// minimal and dependency-free — the hosted edition uses richer Brevo designs.
// ---------------------------------------------------------------------------

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f6f7f9;padding:24px;color:#111">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
      <h1 style="font-size:18px;margin:0 0 16px">${title}</h1>
      ${bodyHtml}
      <p style="color:#6b7280;font-size:12px;margin-top:24px">${FROM_NAME}</p>
    </div>
  </body></html>`;
}

function render(
  kind: MailKind,
  params: MailParams,
): { subject: string; html: string } {
  switch (kind) {
    case "otp":
      return {
        subject: `${FROM_NAME} verification code`,
        html: layout(
          "Your verification code",
          `<p>Use this code to continue. It expires shortly.</p>
           <p style="font-size:28px;font-weight:700;letter-spacing:4px">${String(params.otp ?? "")}</p>`,
        ),
      };
    case "password_reset":
      return {
        subject: `Reset your ${FROM_NAME} password`,
        html: layout(
          "Reset your password",
          `<p>Click the button below to set a new password. If you didn't request this, ignore this email.</p>
           <p><a href="${String(params.password_reset ?? "#")}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reset password</a></p>`,
        ),
      };
    case "welcome":
      return {
        subject: `Welcome to ${FROM_NAME}`,
        html: layout(
          `Welcome to ${FROM_NAME}`,
          `<p>Your account is ready. You can now create a project and start editing your content.</p>`,
        ),
      };
    case "delete_account":
      return {
        subject: `Your ${FROM_NAME} account was deleted`,
        html: layout(
          "Account deleted",
          `<p>Your account and its data have been removed. If this wasn't you, contact support immediately.</p>`,
        ),
      };
    case "org_member_added":
      return {
        subject: `You were added to ${String(params.org_name ?? "an organization")}`,
        html: layout(
          "Added to an organization",
          `<p>You've been added to <strong>${String(params.org_name ?? "")}</strong> as <strong>${String(params.role ?? "member")}</strong>.</p>`,
        ),
      };
    case "org_member_updated":
      return {
        subject: `Your role in ${String(params.org_name ?? "an organization")} changed`,
        html: layout(
          "Role updated",
          `<p>Your role in <strong>${String(params.org_name ?? "")}</strong> is now <strong>${String(params.role ?? "member")}</strong>.</p>`,
        ),
      };
    case "org_member_removed":
      return {
        subject: `You were removed from ${String(params.org_name ?? "an organization")}`,
        html: layout(
          "Removed from an organization",
          `<p>You no longer have access to <strong>${String(params.org_name ?? "")}</strong>.</p>`,
        ),
      };
  }
}

// nodemailer transport is created lazily so the dependency is only touched
// when SMTP is actually the active provider.
let smtpTransport: unknown;
async function getSmtpTransport() {
  if (!smtpTransport) {
    const nodemailer = await import("nodemailer");
    smtpTransport = nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_secure,
      auth:
        config.smtp_user && config.smtp_pass
          ? { user: config.smtp_user, pass: config.smtp_pass }
          : undefined,
    });
  }
  return smtpTransport as {
    sendMail: (opts: {
      from: string;
      to: string;
      subject: string;
      html: string;
    }) => Promise<unknown>;
  };
}

/**
 * Send a transactional email by logical kind. Throws on hard failure so
 * callers that must not proceed on delivery failure (OTP, password reset)
 * can surface the error; fire-and-forget callers should catch.
 */
export async function sendMail({
  to,
  kind,
  params = {},
}: {
  to: string;
  kind: MailKind;
  params?: MailParams;
}): Promise<void> {
  const provider = resolveProvider();

  if (provider === "brevo") {
    await sendBrevoMail({
      to,
      templateId: BREVO_TEMPLATE_BY_KIND[kind],
      params,
    });
    return;
  }

  const { subject, html } = render(kind, params);

  if (provider === "smtp") {
    const transport = await getSmtpTransport();
    await transport.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    });
    return;
  }

  // console provider — no external mail configured.
  console.warn(
    `[mailer] No mail provider configured (MAIL_PROVIDER/BREVO_API_KEY/SMTP_HOST unset).\n` +
      `[mailer] Would send "${kind}" to ${to} — "${subject}"` +
      (kind === "otp" ? `\n[mailer] OTP: ${String(params.otp ?? "")}` : "") +
      (kind === "password_reset"
        ? `\n[mailer] Reset link: ${String(params.password_reset ?? "")}`
        : ""),
  );
}
