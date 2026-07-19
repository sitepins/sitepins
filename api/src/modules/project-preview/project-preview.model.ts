import mongoose, { model } from "mongoose";
import { ProjectPreviewType } from "./project-preview.type";

const projectPreviewSchema = new mongoose.Schema<ProjectPreviewType>(
  {
    project_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sandbox_name: {
      type: String,
      default: "",
    },
    preview_url: {
      type: String,
      default: "",
    },
    commit_sha: {
      type: String,
      default: "",
    },
    last_used_at: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

export const ProjectPreview = model<ProjectPreviewType>(
  "project_preview",
  projectPreviewSchema,
);
