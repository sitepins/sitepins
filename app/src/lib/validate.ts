import * as z from "zod/v4";
import { OTP_LENGTH } from "./constant";

const MAX_FILE_SIZE = 5000 * 1024;
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

export type TValidationTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

const defaultT: TValidationTranslator = (key, values) => {
  const cleanKey = key.startsWith("validation.")
    ? key.replace("validation.", "")
    : key;
  const fallbacks: Record<string, string> = {
    required: "This field has to be filled.",
    email_invalid: "This is not a valid email.",
    name_required: "Name is required",
    name_min: `Name must be at least ${values?.count ?? 3} characters long`,
    password_min: `Password must be at least ${values?.count ?? 8} characters long`,
    password_max: `Password must be less than ${values?.count ?? 32} characters long`,
    password_letter: "Password must contain at least one letter",
    password_digit: "Password must contain at least one digit",
    password_special: "Password must contain at least one special character",
    password_mismatch: "Passwords do not match",
    otp_length: `OTP must be exactly ${values?.count ?? OTP_LENGTH} digits.`,
    select_provider: "Please select a provider.",
    select_repository: "Please select a repository.",
    select_branch: "Please select a branch.",
    project_required: "project is required",
    select_file_type: "Please select file type",
    select_frontmatter_type: "Please select frontmatter type",
    select_content_folder: "select your content folder.",
    select_media_folder: "select your media folder.",
    select_public_folder: "select your public folder.",
    select_theme: "Please select a theme",
    select_role: "Please select a role.",
    select_preference: "Please select at least one preference.",
    image_requirements:
      "Supported image types: JPEG, JPG, PNG, WebP. Maximum file size allowed is 200 KB.",
    api_key_required: "OpenAI API key is required",
    label_required: "Please enter a label",
    name_min_chars: `name must be at least ${values?.count ?? 2} characters.`,
    heading_min_chars: `heading must be at least ${values?.count ?? 2} characters.`,
  };
  return fallbacks[cleanKey] ?? key;
};

export const getLoginSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    email: z
      .email({ error: t("email_invalid") })
      .min(1, { error: t("required") }),
    password: z
      .string()
      .min(8, { error: t("password_min", { count: 8 }) })
      .max(32, { error: t("password_max", { count: 32 }) })
      .trim()
      .refine((value) => /[a-z]/i.test(value), {
        error: t("password_letter"),
      })
      .refine((value) => /\d/.test(value), {
        error: t("password_digit"),
      })
      .refine((value) => /[!@#$%^&*()_+\-=\[\]{};':",./<>?|\\`~]/.test(value), {
        error: t("password_special"),
      }),
  });

export const loginSchema = getLoginSchema();

export const getRegisterSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    full_name: z
      .string({
        error: t("required"),
      })
      .min(3, { error: t("required") }),
    email: z
      .email({ error: t("email_invalid") })
      .min(1, { error: t("required") }),
    password: z
      .string()
      .min(8, { error: t("password_min", { count: 8 }) })
      .max(32, { error: t("password_max", { count: 32 }) })
      .trim()
      .refine((value) => /[a-z]/i.test(value), {
        error: t("password_letter"),
      })
      .refine((value) => /\d/.test(value), {
        error: t("password_digit"),
      })
      .refine((value) => /[!@#$%^&*()_+\-=\[\]{};':",./<>?|\\`~]/.test(value), {
        error: t("password_special"),
      }),
    isSubscribed: z.boolean(),
  });

export const registerSchema = getRegisterSchema();

export const getConfirmPasswordSchema = (t: TValidationTranslator = defaultT) =>
  z
    .object({
      password: z
        .string()
        .min(8, { error: t("password_min", { count: 8 }) })
        .max(32, { error: t("password_max", { count: 32 }) })
        .trim()
        .refine((value) => /[a-z]/i.test(value), {
          error: t("password_letter"),
        })
        .refine((value) => /\d/.test(value), {
          error: t("password_digit"),
        })
        .refine(
          (value) => /[!@#$%^&*()_+\-=\[\]{};':",./<>?|\\`~]/.test(value),
          {
            error: t("password_special"),
          },
        ),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      error: t("password_mismatch"),
      path: ["confirm_password"],
    });

export const confirmPasswordSchema = getConfirmPasswordSchema();

export const getForgotPasswordSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    email: z
      .email({ error: t("email_invalid") })
      .min(1, { error: t("required") }),
  });

export const forgotPasswordSchema = getForgotPasswordSchema();

export const getOtpSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    otp: z.string().refine((value) => String(value).length === OTP_LENGTH, {
      error: t("otp_length", { count: OTP_LENGTH }),
    }),
  });

export const otpSchema = getOtpSchema();

export const getOrgSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    org_name: z
      .string()
      .min(1, { error: t("name_required") })
      .trim(),
    org_image: z.string().optional(),
    email: z
      .email({ error: t("email_invalid") })
      .min(1, { error: t("required") }),
  });

export const orgSchema = getOrgSchema();

export const getUpdateOrgSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    org_name: z
      .string()
      .min(1, { error: t("name_required") })
      .trim(),
    org_image: z.string().optional(),
  });

export const updateOrgSchema = getUpdateOrgSchema();

export const getProjectSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    provider: z.enum(["Github", "Gitlab"], {
      error: t("select_provider"),
    }),
    repository: z
      .string({
        error: t("select_repository"),
      })
      .min(1, { error: t("select_repository") }),
    visibility: z.enum(["public", "private"]),
    branch: z
      .string({
        error: t("select_branch"),
      })
      .min(1, { error: t("select_branch") }),
    project_name: z
      .string({
        error: t("project_required"),
      })
      .min(1, { error: t("project_required") }),
    project_image: z.string().optional(),
    site_url: z.string().optional(),
    generator: z.string().optional(),
  });

export const projectSchema = getProjectSchema();

export const getCreateSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    file: z.string().optional(),
    name: z.string().min(1, { error: t("name_required") }),
    fileType: z.enum(["json", "md", "mdx", "toml", "yaml"], {
      error: t("select_file_type"),
    }),
    fmType: z.enum(["toml", "yaml", "json"], {
      error: t("select_frontmatter_type"),
    }),
    template: z.array(z.any()),
  });

export const createSchema = getCreateSchema();

export const getCreateFileSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    name: z
      .string({
        error: t("name_required"),
      })
      .trim()
      .min(3, { error: t("name_min", { count: 3 }) }),
    title: z.string().optional(),
  });

export const createFileSchema = getCreateFileSchema();

export const getConfigFormSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    content: z
      .object({
        label: z.string(),
        value: z.string(),
      })
      .refine((data) => data.value, {
        error: t("select_content_folder"),
      }),
    media: z
      .object({
        label: z.string(),
        value: z.string(),
      })
      .refine((data) => data.value, {
        error: t("select_media_folder"),
      }),
    public: z
      .object({
        label: z.string(),
        value: z.string(),
      })
      .refine((data) => data.value, {
        error: t("select_public_folder"),
      }),
    configurations: z.array(
      z.string({
        error: t("select_theme"),
      }),
    ),
    arrangement: z.any().optional(),
  });

export const configFormSchema = getConfigFormSchema();

export const commitDialogSchema = z.object({
  customCommit: z.boolean(),
});

export const getUserDetailsSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    full_name: z
      .string()
      .min(1, { error: t("name_required") })
      .trim(),
    image: z.string().optional(),
    email: z.string().optional(),
  });

export const userDetailsSchema = getUserDetailsSchema();

export const getAddNewTeamMemberSchema = (
  t: TValidationTranslator = defaultT,
) =>
  z.object({
    email: z
      .email({ error: t("email_invalid") })
      .min(1, { error: t("required") }),
    role: z.enum(["admin", "editor"], {
      error: t("select_role"),
    }),
  });

export const addNewTeamMemberSchema = getAddNewTeamMemberSchema();

export const getUpdatePasswordSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    newPassword: z
      .string()
      .min(8, { error: t("password_min", { count: 8 }) })
      .max(32, { error: t("password_max", { count: 32 }) })
      .trim()
      .refine((value) => /[a-z]/i.test(value), {
        error: t("password_letter"),
      })
      .refine((value) => /\d/.test(value), {
        error: t("password_digit"),
      })
      .refine((value) => /[!@#$%^&*()_+\-=[\]{};':",./<>?|\\`~]/.test(value), {
        error: t("password_special"),
      }),
    currentPassword: z
      .string()
      .min(8, { error: t("password_min", { count: 8 }) })
      .max(32, { error: t("password_max", { count: 32 }) })
      .trim()
      .refine((value) => /[a-z]/i.test(value), {
        error: t("password_letter"),
      })
      .refine((value) => /\d/.test(value), {
        error: t("password_digit"),
      })
      .refine((value) => /[!@#$%^&*()_+\-=[\]{};':",./<>?|\\`~]/.test(value), {
        error: t("password_special"),
      }),
  });

export const updatePasswordSchema = getUpdatePasswordSchema();

export const getNewPasswordSchema = (t: TValidationTranslator = defaultT) =>
  getUpdatePasswordSchema(t).omit({
    currentPassword: true,
  });

export const newPasswordSchema = getNewPasswordSchema();

export const getSaveProfilePictureSchema = (
  t: TValidationTranslator = defaultT,
) =>
  z.object({
    image: z.custom<FileList>(
      (fileList) => {
        if (typeof FileList !== "undefined" && fileList instanceof FileList) {
          const file = fileList.item(0);
          return (
            file !== null &&
            file.size <= MAX_FILE_SIZE &&
            ACCEPTED_IMAGE_TYPES.includes(file.type)
          );
        }
        return false;
      },
      {
        error: t("image_requirements"),
      },
    ),
  });

export const saveProfilePictureSchema = getSaveProfilePictureSchema();

const modelSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const getApiConfigSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    openai: z.string().nonempty({ error: t("api_key_required") }),
    model: modelSchema,
    models: z.array(modelSchema),
  });

export const apiConfigSchema = getApiConfigSchema();

export const getSnippetSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    label: z.string().min(1, { error: t("label_required") }),
    schema: z.array(z.string()),
    code: z.string(),
  });

export const snippetSchema = getSnippetSchema();

export const getUserPersonaSchema = (t: TValidationTranslator = defaultT) =>
  z.object({
    usecase: z.string().min(1, { error: t("required") }),
    experience: z.string().min(1, { error: t("required") }),
    preferences: z.array(z.string()).min(1, { error: t("select_preference") }),
    company_size: z.string().min(1, { error: t("required") }),
    channel: z.string().min(1, { error: t("required") }),
  });

export const userPersonaSchema = getUserPersonaSchema();
