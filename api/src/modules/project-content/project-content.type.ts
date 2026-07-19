import { Model } from "mongoose";

export type ProjectContentType = {
  _id?: string;
  project_id: string;
  user_id: string;
  file: string;
  content: string;
  git_sha?: string;
};

export type ProjectContentModel = Model<ProjectContentType, object>;

export type ProjectContentFilterOptions = {
  search?: string;
  file?: string;
};
