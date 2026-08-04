import { Model } from "mongoose";

export type TProjectContentType = {
  _id?: string;
  project_id: string;
  user_id: string;
  file: string;
  content: string;
  git_sha?: string;
};

export type TProjectContentModel = Model<TProjectContentType, object>;

export type TProjectContentFilterOptions = {
  search?: string;
  file?: string;
};
