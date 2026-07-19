import { projectSchema } from "@/lib/validate";
import { z } from "zod/v4";

export type TProject<
  T = z.infer<typeof projectSchema> & {
    org_id?: string;
    project_id?: string;
  },
> = {
  _id: string;
  project_id: string;
  project_name: string;
  provider: "Github" | "Gitlab";
  repository: string;
  project_image?: string;
  branch: string;
  visibility: "public" | "private";
  user_id: string;
  generator?: string | null;
  site_url: string;
  org_id: string;
  status: "active" | "archived";
  variables: T;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  ownerData?: Array<{
    full_name: string;
    email: string;
    image?: string;
    user_id: string;
    active_package?: string;
  }>;
};
