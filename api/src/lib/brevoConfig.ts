import config from "@/config/variables";
import { Brevo, BrevoClient } from "@getbrevo/brevo";

// --- CONFIGURATION ---
const BREVO_SENDER = config.mail_from_email
  ? { name: config.mail_from_name, email: config.mail_from_email }
  : undefined;

// Brevo mail template IDs. These reference numeric template IDs configured
// in your own Brevo account (Transactional > Templates). Override any of them
// with the matching BREVO_TEMPLATE_* env var so you don't have to edit code
// to point at your own templates.
const tpl = (envVar: string, fallback: number): number =>
  Number(process.env[envVar]) || fallback;

const BREVO_MAIL_TEMPLATES = {
  welcome: tpl("BREVO_TEMPLATE_WELCOME", 1),
  otp_sender: tpl("BREVO_TEMPLATE_OTP", 59),
  pass_reset: tpl("BREVO_TEMPLATE_PASSWORD_RESET", 60),
  delete_account: tpl("BREVO_TEMPLATE_DELETE_ACCOUNT", 32),
  org_member_added: tpl("BREVO_TEMPLATE_ORG_MEMBER_ADDED", 61),
  org_member_updated: tpl("BREVO_TEMPLATE_ORG_MEMBER_UPDATED", 62),
  org_member_removed: tpl("BREVO_TEMPLATE_ORG_MEMBER_REMOVED", 63),
};

// initialize brevo client
const brevo = new BrevoClient({
  apiKey: config.brevo_api_key || "",
});

// create brevo email
const sendBrevoMail = async ({
  to,
  subject,
  htmlContent,
  templateId,
  params,
}: {
  to: string;
  subject?: string;
  htmlContent?: string;
  templateId?: number;
  params?: object;
}): Promise<Brevo.SendTransacEmailResponse | undefined> => {
  try {
    const data = await brevo.transactionalEmails.sendTransacEmail({
      ...(BREVO_SENDER && { sender: BREVO_SENDER }),
      to: [{ email: to }],
      ...(subject && { subject }),
      ...(htmlContent && { htmlContent }),
      ...(templateId && { templateId }),
      ...(params && { params: params as Record<string, unknown> }),
    });
    return data;
  } catch (error) {
    console.error("Error sending Brevo email: ", error);
  }
};

// get brevo contact
const getBrevoContact = async (
  email: string,
): Promise<Brevo.GetContactInfoResponse | null> => {
  try {
    const data = await brevo.contacts.getContactInfo({ identifier: email });
    return data;
  } catch (error: any) {
    if (error?.response?.statusCode !== 404 && error?.statusCode !== 404) {
      console.error("Error getting contact: ", error);
    }
    return null;
  }
};

// create brevo contact
const createBrevoContact = async ({
  email,
  first_name,
  last_name,
  subscribed,
}: {
  email: string;
  first_name: string;
  last_name: string;
  subscribed?: boolean;
}): Promise<Brevo.CreateContactResponse | undefined> => {
  try {
    const data = await brevo.contacts.createContact({
      email,
      attributes: {
        FIRSTNAME: first_name,
        LASTNAME: last_name,
        ...(subscribed !== undefined && { SUBSCRIBED: subscribed }),
      },
      listIds: [10],
      updateEnabled: true,
    });
    return data;
  } catch (error) {
    console.error("Error creating contact: ", error);
  }
};

// update brevo contact
const updateBrevoContact = async ({
  updateType,
  email,
  country,
  abandoned_date,
  cancel_date,
  last_login_date,
  purchased_plan_name,
  abandoned_plan_name,
  purchased_date,
  last_payment_date,
  expires_date,
  usecase,
  experience,
  preferences,
  company_size,
  channel,
  subscribed,
}: {
  updateType:
    | "login"
    | "country"
    | "abandoned"
    | "purchase"
    | "cancel"
    | "payment"
    | "subscribe"
    | "persona";
  email: string;
  country?: string;
  abandoned_date?: string;
  cancel_date?: string;
  last_login_date?: string;
  purchased_plan_name?: string;
  abandoned_plan_name?: string;
  purchased_date?: string;
  last_payment_date?: string;
  expires_date?: string;
  usecase?: string;
  experience?: string;
  preferences?: string;
  company_size?: string;
  channel?: string;
  subscribed?: boolean;
}): Promise<{
  success: boolean;
  upserted?: boolean;
  data?: unknown;
  error?: unknown;
}> => {
  // Ensure dates are in YYYY-MM-DD format for Brevo "Date" type attributes
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return undefined;
    try {
      return new Date(dateStr).toISOString().split("T")[0];
    } catch (e) {
      return undefined;
    }
  };

  let attributes: Record<string, any> = {};

  if (updateType === "login") {
    attributes = { LAST_LOGIN_DATE: last_login_date };
  } else if (updateType === "country") {
    attributes = { COUNTRY: country };
  } else if (updateType === "abandoned") {
    attributes = {
      ABANDONED_DATE: formatDate(abandoned_date),
      ABANDONED_PLAN_NAME: abandoned_plan_name,
    };
  } else if (updateType === "purchase") {
    attributes = {
      PURCHASED_PLAN_NAME: purchased_plan_name,
      PURCHASED_DATE: formatDate(purchased_date),
      EXPIRES_DATE: formatDate(expires_date),
      ABANDONED_PLAN_NAME: "",
      ABANDONED_DATE: "",
      CANCEL_DATE: "",
    };
  } else if (updateType === "cancel") {
    attributes = { CANCEL_DATE: formatDate(cancel_date) };
  } else if (updateType === "payment") {
    attributes = {
      LAST_PAYMENT_DATE: formatDate(last_payment_date),
      EXPIRES_DATE: formatDate(expires_date),
    };
  } else if (updateType === "subscribe") {
    attributes = {
      SUBSCRIBED: subscribed,
    };
  } else if (updateType === "persona") {
    attributes = {
      USECASE: usecase,
      EXPERIENCE: experience,
      PREFERENCES: preferences,
      COMPANY_SIZE: company_size,
      CHANNEL: channel,
    };
  }

  // Remove undefined attributes to avoid errors
  Object.keys(attributes).forEach((key) => {
    if (attributes[key] === undefined) {
      delete attributes[key];
    }
  });

  try {
    const data = await brevo.contacts.updateContact({
      identifier: email,
      attributes,
    });
    return { success: true, data };
  } catch (error: any) {
    // If contact doesn't exist, try creating it with updateEnabled: true (upsert)
    if (
      error?.statusCode === 404 ||
      error?.status === 404 ||
      error?.response?.body?.code === "document_not_found" ||
      error?.name === "NotFoundError"
    ) {
      try {
        const data = await brevo.contacts.createContact({
          email,
          attributes,
          listIds: [2], // Default to list 2
          updateEnabled: true,
        });
        return { success: true, upserted: true, data };
      } catch (createError) {
        console.error(
          "Error creating contact after update failed: ",
          createError,
        );
        return { success: false, error: createError };
      }
    }
    console.error("Error updating contact: ", error);
    return { success: false, error };
  }
};

// update brevo contact email
const updateBrevoContactEmail = async (oldEmail: string, newEmail: string) => {
  try {
    const data = await brevo.contacts.updateContact({
      identifier: oldEmail,
      attributes: {
        EMAIL: newEmail,
      },
    });
    return data;
  } catch (error) {
    console.error("Error updating contact email: ", error);
    return null;
  }
};

// delete brevo contact
const deleteBrevoContact = async (email: string) => {
  try {
    await brevo.contacts.deleteContact({
      identifier: email,
    });
  } catch (error) {
    console.error("Error deleting contact: ", error);
  }
};

export {
  BREVO_MAIL_TEMPLATES,
  createBrevoContact,
  deleteBrevoContact,
  getBrevoContact,
  sendBrevoMail,
  updateBrevoContact,
  updateBrevoContactEmail,
};
