export type TProjectType = {
  project_id: string;
  user_id: string;
  org_id: string;
  project_name: string;
  project_image: string;
  provider: string;
  repository: string;
  /** GitLab's numeric project id, which survives a rename. GitLab only. */
  repository_id?: string;
  branch: string;
  visibility: "public" | "private";
  status: "active" | "archived";
  generator: string;
  site_url: string;
};

export type TProjectFilterOptions = {
  search?: string | number;
};
