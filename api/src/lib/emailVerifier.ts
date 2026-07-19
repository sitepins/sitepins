import config from "@/config/variables";
import axios from "axios";

interface EmailVerificationResponse {
  email: string;
  status: string;
  is_valid_syntax: boolean;
  is_disposable: boolean;
  is_role_account: boolean;
  mx_accepts_mail: boolean;
  is_spamtrap: boolean;
  is_free_email: boolean;
  mx_records: string[];
  verification_mode: string;
  // POWER mode specific fields
  is_deliverable?: boolean;
  is_disabled?: boolean;
  is_catch_all?: boolean;
  has_inbox_full?: boolean;
  is_safe_to_send?: boolean;
  overall_score?: number;
  can_connect_smtp?: boolean;
}

interface EmailVerificationResult {
  isValid: boolean;
  email: string;
  reason?: string;
  details?: EmailVerificationResponse;
}

export const verifyEmailWithReoon = async (
  email: string
): Promise<EmailVerificationResult> => {
  try {
    // Reoon is an optional anti-abuse layer. When no key is configured (the
    // default for self-hosted builds) skip verification entirely instead of
    // blocking signup — the account still goes through normal email
    // verification (OTP) before it can be used.
    if (!config.reoon_api_key) {
      return { isValid: true, email };
    }

    // Call Reoon API in POWER mode for deep verification
    const response = await axios.get(
      "https://emailverifier.reoon.com/api/v1/verify",
      {
        params: {
          email: email,
          key: config.reoon_api_key,
          mode: "power", // Use power mode for comprehensive verification including deliverability check
        },
      }
    );

    const data: EmailVerificationResponse = response.data;

    // Check if email is deliverable (POWER mode checks)
    const isDeliverable = data.is_deliverable === true;
    const hasValidSyntax = data.is_valid_syntax;
    const isNotDisposable = !data.is_disposable;
    const isNotSpamtrap = !data.is_spamtrap;
    const isNotDisabled = !data.is_disabled;
    const isSafeToSend = data.is_safe_to_send;

    const isValid =
      isDeliverable &&
      hasValidSyntax &&
      isNotDisposable &&
      isNotSpamtrap &&
      isNotDisabled &&
      isSafeToSend;

    if (!isValid) {
      let reason = "Email verification failed";

      if (!isDeliverable) {
        reason =
          "Email address is not deliverable - inbox may not exist or cannot receive mail";
      } else if (!hasValidSyntax) {
        reason = "Invalid email syntax";
      } else if (isNotDisposable === false) {
        reason = "Disposable email addresses are not allowed";
      } else if (isNotSpamtrap === false) {
        reason = "This email is flagged as a spamtrap";
      } else if (isNotDisabled === false) {
        reason = "This email account is disabled";
      } else if (!isSafeToSend) {
        reason = "This email is not safe to use for registration";
      }

      return {
        isValid: false,
        email,
        reason,
        details: data,
      };
    }

    return {
      isValid: true,
      email,
      details: data,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // If Reoon is down, fail open: log and allow registration rather than
      // taking signup down with the third-party service.
      console.error(
        "Email verification API error:",
        error.response?.data || error.message
      );

      return { isValid: true, email };
    }

    throw error;
  }
};
