import { paginationHelpers } from "@/lib/paginationHelper";
import { IPagination } from "@/types";
import { PipelineStage } from "mongoose";
import { ProjectLog } from "./project-log.model";
import { ProjectLogType } from "./project-log.type";

// get all project log
const getAllProjectLogService = async (
  paginationOptions: Partial<IPagination>,
) => {
  const { limit, skip } =
    paginationHelpers.calculatePagination(paginationOptions);

  let pipeline: PipelineStage[] = [
    {
      $group: {
        _id: "$project_id",
        project_id: { $first: "$project_id" },
        logs: { $push: "$$ROOT" },
        lastUpdate: { $max: "$updatedAt" },
      },
    },
    {
      $sort: {
        lastUpdate: -1,
      },
    },
  ];

  const limitStage: any = { $limit: limit };
  const skipStage: any = { $skip: skip };
  // skip for pagination
  if (skip) {
    pipeline.push(skipStage);
  }
  // limit data for pagination
  if (limit) {
    pipeline.push(limitStage);
  }

  const result = await ProjectLog.aggregate(pipeline);
  const total = await ProjectLog.distinct("project_id").then(
    (projects) => projects.length,
  );

  return {
    result: result,
    meta: {
      total: total,
    },
  };
};

// get single project log
const getSingleProjectLogService = async (
  project_id: string,
  paginationOptions?: Partial<IPagination>,
) => {
  const { limit, skip } = paginationOptions
    ? paginationHelpers.calculatePagination(paginationOptions)
    : { limit: undefined, skip: undefined };

  const pipeline: PipelineStage[] = [
    {
      $match: { project_id: project_id },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
    {
      $group: {
        _id: {
          action: "$action",
          file: "$file",
          file_type: "$file_type",
        },
        doc: { $first: "$$ROOT" },
      },
    },
    {
      $replaceRoot: { newRoot: "$doc" },
    },
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "user_id",
        as: "user",
      },
    },
    {
      $addFields: {
        user_name: { $arrayElemAt: ["$user.full_name", 0] },
      },
    },
    {
      $project: { user: 0 },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
  ];

  // Add pagination if provided
  if (skip) {
    pipeline.push({ $skip: skip });
  }
  if (limit) {
    pipeline.push({ $limit: limit });
  }

  const logs = await ProjectLog.aggregate(pipeline);

  // Calculate total deduplicated logs
  const totalPipeline: PipelineStage[] = [
    {
      $match: { project_id: project_id },
    },
    {
      $group: {
        _id: {
          action: "$action",
          file: "$file",
          file_type: "$file_type",
        },
      },
    },
    {
      $count: "total",
    },
  ];

  const totalResult = await ProjectLog.aggregate(totalPipeline);
  const total = totalResult.length > 0 ? totalResult[0].total : 0;

  return {
    project_id,
    logs,
    meta: {
      total,
    },
  };
};

// create/add new project log
const createProjectLogService = async (log: Omit<ProjectLogType, "_id">) => {
  const newLog = await ProjectLog.create(log);
  return newLog;
};

// delete all logs for a project
const deleteProjectLogService = async (project_id: string) => {
  await ProjectLog.deleteMany({ project_id: project_id });
};

export const projectLogService = {
  getSingleProjectLogService,
  getAllProjectLogService,
  createProjectLogService,
  deleteProjectLogService,
};
