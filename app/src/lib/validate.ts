import * as z from "zod/v4";
import { OTP_LENGTH } from "./constant";

const MAX_FILE_SIZE = 5000 * 1024;
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

export const loginSchema = z.object({
  email: z
    .email({ error: "This is not a valid email." })
    .min(1, { error: "This field has to be filled." }),
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters long" })
    .max(32, { error: "Password must be less than 32 characters long" })
    .trim() // Remove leading and trailing whitespace
    .refine((value) => /[a-z]/i.test(value), {
      error: "Password must contain at least one letter",
    })
    .refine((value) => /\d/.test(value), {
      error: "Password must contain at least one digit",
    })
    .refine((value) => /[!@#$%^&*()_+\-=\[\]{};':",./<>?|\\`~]/.test(value), {
      error: "Password must contain at least one special character",
    }),
});

export const registerSchema = z.object({
  full_name: z
    .string({
      error: "This field has to be filled.",
    })
    .min(3, { error: "This field has to be filled." }),
  email: z
    .email({ error: "This is not a valid email." })
    .min(1, { error: "This field has to be filled." }),
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters long" })
    .max(32, { error: "Password must be less than 32 characters long" })
    .trim() // Remove leading and trailing whitespace
    .refine((value) => /[a-z]/i.test(value), {
      error: "Password must contain at least one letter",
    })
    .refine((value) => /\d/.test(value), {
      error: "Password must contain at least one digit",
    })
    .refine((value) => /[!@#$%^&*()_+\-=\[\]{};':",./<>?|\\`~]/.test(value), {
      error: "Password must contain at least one special character",
    }),
  isSubscribed: z.boolean(),
});

export const confirmPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, { error: "Password must be at least 8 characters long" })
      .max(32, { error: "Password must be less than 32 characters long" })
      .trim() // Remove leading and trailing whitespace
      .refine((value) => /[a-z]/i.test(value), {
        error: "Password must contain at least one letter",
      })
      .refine((value) => /\d/.test(value), {
        error: "Password must contain at least one digit",
      })
      .refine((value) => /[!@#$%^&*()_+\-=\[\]{};':",./<>?|\\`~]/.test(value), {
        error: "Password must contain at least one special character",
      }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirm_password"],
  });

export const forgotPasswordSchema = z.object({
  email: z
    .email({ error: "This is not a valid email." })
    .min(1, { error: "This field has to be filled." }),
});

export const otpSchema = z.object({
  otp: z.string().refine((value) => String(value).length === OTP_LENGTH, {
    error: `OTP must be exactly ${OTP_LENGTH} digits.`,
  }),
});

export const orgSchema = z.object({
  org_name: z.string().min(1, { error: "Name is required" }).trim(),
  org_image: z.string().optional(),
  email: z
    .email({ error: "This is not a valid email." })
    .min(1, { error: "This field has to be filled." }),
});

export const updateOrgSchema = z.object({
  org_name: z.string().min(1, { error: "Name is required" }).trim(),
  org_image: z.string().optional(),
});

export const projectSchema = z.object({
  provider: z.enum(["Github", "Gitlab"], {
    error: "Please select a provider.",
  }),
  repository: z
    .string({
      error: "Please select a repository.",
    })
    .min(1, { error: "Please select a repository." }),
  visibility: z.enum(["public", "private"]),
  branch: z
    .string({
      error: "Please select a branch.",
    })
    .min(1, { error: "Please select a branch." }),
  project_name: z
    .string({
      error: "project  is required",
    })
    .min(1, { error: "project  is required" }),
  project_image: z.string().optional(),
  site_url: z.string().optional(),
  generator: z.string().optional(),
});

export const createSchema = z.object({
  // `file` is optional so users can create a schema by adding fields
  // without selecting an existing template file.
  file: z.string().optional(),
  name: z.string().min(1, { error: "Please enter a name" }),
  fileType: z.enum(["json", "md", "mdx", "toml", "yaml"], {
    error: "Please select file type",
  }),
  fmType: z.enum(["toml", "yaml", "json"], {
    error: "Please select frontmatter type",
  }),
  template: z.array(z.any()),
});

export const createFileSchema = z.object({
  name: z
    .string({
      error: "Please enter a name",
    })
    .trim()
    .min(3, { error: "Name must be at least 3 characters long" }),
  title: z.string().optional(),
});

export const configFormSchema = z.object({
  content: z
    .object({
      label: z.string(),
      value: z.string(),
    })
    .refine((data) => data.value, {
      error: "select your content folder.",
    }),
  media: z
    .object({
      label: z.string(),
      value: z.string(),
    })
    .refine((data) => data.value, {
      error: "select your media folder.",
    }),
  public: z
    .object({
      label: z.string(),
      value: z.string(),
    })
    .refine((data) => data.value, {
      error: "select your public folder.",
    }),
  configurations: z.array(
    z.string({
      error: "Please select a theme",
    }),
  ),
  arrangement: z.any().optional(),
});

export const commitDialogSchema = z.object({
  customCommit: z.boolean(),
});

export const userDetailsSchema = z.object({
  full_name: z.string().min(1, { error: "Name is required" }).trim(),
  image: z.string().optional(),
  email: z.string().optional(),
});

export const addNewTeamMemberSchema = z.object({
  email: z
    .email({ error: "This is not a valid email." })
    .min(1, { error: "This field has to be filled." }),
  role: z.enum(["admin", "editor"], {
    error: "Please select a role.",
  }),
});

export const updatePasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, { error: "Password must be at least 8 characters long" })
    .max(32, { error: "Password must be less than 32 characters long" })
    .trim() // Remove leading and trailing whitespace
    .refine((value) => /[a-z]/i.test(value), {
      error: "Password must contain at least one letter",
    })
    .refine((value) => /\d/.test(value), {
      error: "Password must contain at least one digit",
    })
    .refine((value) => /[!@#$%^&*()_+\-=[\]{};':",./<>?|\\`~]/.test(value), {
      error: "Password must contain at least one special character",
    }),
  currentPassword: z
    .string()
    .min(8, { error: "Password must be at least 8 characters long" })
    .max(32, { error: "Password must be less than 32 characters long" })
    .trim() // Remove leading and trailing whitespace
    .refine((value) => /[a-z]/i.test(value), {
      error: "Password must contain at least one letter",
    })
    .refine((value) => /\d/.test(value), {
      error: "Password must contain at least one digit",
    })
    .refine((value) => /[!@#$%^&*()_+\-=[\]{};':",./<>?|\\`~]/.test(value), {
      error: "Password must contain at least one special character",
    }),
});

export const newPasswordSchema = updatePasswordSchema.omit({
  currentPassword: true,
});

export const saveProfilePictureSchema = z.object({
  image: z.custom<FileList>(
    (fileList) => {
      if (typeof FileList !== "undefined" && fileList instanceof FileList) {
        return (
          fileList.length > 0 &&
          fileList.item(0)?.size! <= MAX_FILE_SIZE &&
          ACCEPTED_IMAGE_TYPES.includes(fileList.item(0)?.type!)
        );
      }
      return false;
    },
    {
      error:
        "Supported image types: JPEG, JPG, PNG, WebP. Maximum file size allowed is 200 KB.",
    },
  ),
});

const modelSchema = z.object({
  value: z.string(), // Represents the model value
  label: z.string(), // Represents the model label
});

export const apiConfigSchema = z.object({
  openai: z.string().nonempty({ error: "OpenAI API key is required" }), // API key validation
  model: modelSchema,
  models: z.array(modelSchema),
});

// Snippet Schema
export const snippetSchema = z.object({
  label: z.string().min(1, { error: "Please enter a label" }),
  schema: z.array(z.string()),
  code: z.string(),
});

// user persona
export const userPersonaSchema = z.object({
  usecase: z.string().min(1, { error: "This field has to be filled." }),
  experience: z.string().min(1, { error: "This field has to be filled." }),
  preferences: z
    .array(z.string())
    .min(1, { error: "Please select at least one preference." }),
  company_size: z.string().min(1, { error: "This field has to be filled." }),
  channel: z.string().min(1, { error: "This field has to be filled." }),
});
