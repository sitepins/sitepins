import mongoose, { model } from "mongoose";
import {
  ProjectContentModel,
  ProjectContentType,
} from "./project-content.type";

const projectContentSchema = new mongoose.Schema<
  ProjectContentType,
  ProjectContentModel
>(
  {
    project_id: {
      type: String,
      required: true,
    },
    user_id: {
      type: String,
      required: true,
    },
    file: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      default: "",
    },
    git_sha: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Unique content record per project + file path
projectContentSchema.index({ project_id: 1, file: 1 }, { unique: true });

export const ProjectContent = model<ProjectContentType, ProjectContentModel>(
  "project_content",
  projectContentSchema,
);
