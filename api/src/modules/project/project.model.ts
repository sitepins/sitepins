import mongoose, { model } from "mongoose";
import { ProjectType } from "./project.type";

const ProjectSchema = new mongoose.Schema<ProjectType>(
  {
    project_id: {
      type: String,
      required: true,
      unique: true,
    },
    user_id: {
      type: String,
      required: true,
    },
    org_id: {
      type: String,
      required: true,
    },
    project_name: {
      type: String,
      required: true,
    },
    project_image: {
      type: String,
    },
    branch: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      required: true,
    },
    repository: {
      type: String,
      required: true,
    },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
    },
    generator: {
      type: String,
      required: false,
    },
    site_url: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Project = model<ProjectType>("project", ProjectSchema);
