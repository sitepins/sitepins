export type TTree = {
  path?: string;
  mode?: "100644" | "100755" | "040000" | "160000" | "120000";
  type?: "tree" | "blob" | "commit" | "submodule";
  sha?: string | null;
  size?: number;
  url?: string;
  commitDate?: string;
  createdDate?: string;
};

export type TFiles = {
  name: string;
  sha: string | null;
  path: string;
  isFile: boolean;
  children?: TFiles[];
  isNew?: boolean;
  isReplace?: boolean;
  type?: string;
  realPath?: string;
  commitDate?: string;
  createdDate?: string;
  size?: number;
  isMedia?: boolean;
};

export type TArrangement =
  | {
      id: string;
      type: "folder";
      targetPath: string;
      groupName: string;
      include: string;
      exclude: string;
    }
  | {
      id: string;
      type: "file" | "heading";
      targetPath: string;
      groupName: string;
    };

// Persistent project configuration stored in .sitepins/config.json
export type TConfigFile = {
  content: string;
  media: string;
  public: string;
  configs: string[];
  arrangement: TArrangement[];
  customCommit: boolean;
};

// Full runtime configuration including session and UI state
export type TConfig = TConfigFile & {
  provider: "Github" | "Gitlab" | "";
  currentLoginUserToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number | Date | string;
  refreshTokenExpiresAt?: number | Date | string;
  lastRefreshedAt: number | Date | string;
  token: string;
  owner: string;
  repoName: string;
  /** GitLab's numeric project id, which survives a rename. GitLab only. */
  repositoryId?: string;
  branch: string;
  framework:
    "nextjs" | "astro" | "hugo" | "hugo_examplesite" | "tanstack" | null;
  isRawMode: boolean;
  snippets: MdxSnippet[];
  fullscreen: boolean;
  cursorOffset: number;
};

export type TImage = Omit<TFiles, "children" | "isFile" | "isNew" | "sha"> & {
  isAlreadyExist: boolean;
  content: string;
  isNew?: boolean;
  isReplace?: boolean;
  number: number;
};

export type TNewImage<T = Record<string, never>> = {
  variables: {
    images: TImage[];
  } & T;
};

export type TExtractVariables<T> = T extends { variables: object }
  ? T["variables"]
  : never;

export type TSubmitFormState<T> = {
  data: Omit<T, "variables"> | null;
  error: {
    path: string;
    message: string;
  }[];
  message: string | null;
  isError: boolean;
  isSuccess: boolean;
  statusCode: number | null;
};

export type TInsertionSuccess<T> = {
  success: true;
  message: "data inserted successfully";
  result: T;
} & {
  variables: TExtractVariables<T>;
};

export type TModel = {
  label: string;
  value: string;
};

export type TMenuItem = {
  name:
    | ((context: {
        orgId: string;
        projectId?: string;
        projectName?: string;
        config?: TConfig;
      }) => string)
    | string;
  tKey?: string;
  href:
    | ((context: {
        orgId: string;
        projectId?: string;
        projectName?: string;
        config?: TConfig;
      }) => string)
    | string;
  icon: LucideIcon;
};

type TField = {
  label: string;
  type:
    | "media"
    | "gallery"
    | "number"
    | "Date"
    | "string"
    | "Array"
    | "object"
    | "boolean"
    | "color";
  name: string;
  value: string;
  fields?: TField[];
  description?: string;
  isIgnored?: boolean;
  isRequired?: boolean;
  defaultValue?: string;
  length?: number;
  maxLength?: number;
  /** Date fields only: stamp the commit time instead of the stored value. */
  alwaysUseCurrentDate?: boolean;
  subType?: string;
  isDropdown?: boolean;
  options?: string[];
  referenceType?: "static" | "folder" | "file";
  referencePath?: string;
  referenceInclude?: string;
  referenceExclude?: string;
  referenceField?: string;
};

/**
 * A repository as the picker sees it. GitHub returns this shape directly;
 * GitLab projects are normalised into it by `useAllInstallationRepos`.
 */
export type TGitRepo = {
  id?: number | string;
  name: string;
  full_name: string;
  owner?: { login?: string };
  html_url?: string;
  homepage?: string | null;
  visibility?: string;
  default_branch?: string;
  /** GitLab only, before normalisation. */
  path_with_namespace?: string;
};

/** Frontmatter values are user-defined, so the map stays open. */
export type TFrontmatterData = Record<string, unknown>;

export type TState = {
  data: TFrontmatterData;
  page_content: string;
};
