import mongoose, { model } from "mongoose";
import {
  EProjectLogAction,
  EProjectLogType,
  TProjectLogModel,
  TProjectLogType,
} from "./project-log.type";

const projectLogSchema = new mongoose.Schema<TProjectLogType, TProjectLogModel>(
  {
    project_id: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: Object.values(EProjectLogAction),
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
    file_type: {
      type: String,
      enum: Object.values(EProjectLogType),
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Index for efficient querying by project and date
projectLogSchema.index({ project_id: 1, date: -1 });

export const ProjectLog = model<TProjectLogType, TProjectLogModel>(
  "project_log",
  projectLogSchema,
);
