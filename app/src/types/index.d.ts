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
  branch: string;
  framework: "nextjs" | "astro" | "hugo" | "hugo_examplesite" | null;
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

export type TNewImage<T = {}> = {
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
};

export type TState = {
  data: {
    [index: string]: any;
  };
  page_content: string;
};
