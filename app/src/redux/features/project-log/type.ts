export enum EAction {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  RENAME = "rename",
  DUPLICATE = "duplicate",
}

export enum EProjectLogType {
  CONTENT = "content",
  CODE = "code",
  CONFIG = "config",
  MEDIA = "media",
  SCHEMA = "schema",
  SNIPPET = "snippet",
}

export type TLog = {
  _id?: string;
  project_id: string;
  action: EAction;
  user_id: string;
  file: string;
  file_type: EProjectLogType;
  user_name?: string;
  createdAt?: string | Date;
};

export type TProjectLog = {
  project_id: string;
  logs: TLog[];
  meta?: {
    total: number;
  };
};

export type TProjectLogQuery = {
  data?: TProjectLog;
  isLoading: boolean;
};
