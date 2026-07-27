import { Model } from "mongoose";

export enum EProjectLogType {
  CONTENT = "content",
  CODE = "code",
  CONFIG = "config",
  MEDIA = "media",
  SCHEMA = "schema",
  SNIPPET = "snippet",
}

export enum EProjectLogAction {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  RENAME = "rename",
  DUPLICATE = "duplicate",
}

export type ProjectLogType = {
  _id?: string;
  project_id: string;
  action: EProjectLogAction;
  user_id: string;
  file: string;
  file_type: EProjectLogType;
};

export type ProjectLogModel = Model<ProjectLogType, object>;
