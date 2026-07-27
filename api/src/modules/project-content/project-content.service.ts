import { paginationHelpers } from "@/lib/paginationHelper";
import { escapeRegex } from "@/lib/regexEscape";
import { IPagination } from "@/types";
import { PipelineStage } from "mongoose";
import { ProjectContent } from "./project-content.model";
import {
  ProjectContentFilterOptions,
  ProjectContentType,
} from "./project-content.type";

// ─── Get all content files for a project ────────────────────────────────────
const getProjectContentListService = async (
  project_id: string,
  filters: ProjectContentFilterOptions,
  paginationOptions: Partial<IPagination>,
) => {
  const { limit, skip } =
    paginationHelpers.calculatePagination(paginationOptions);

  const { search, file } = filters;

  const matchStage: Record<string, unknown> = { project_id };

  if (file) {
    matchStage.file = file;
  }

  if (search) {
    const safeSearch = escapeRegex(search);
    matchStage.$or = [
      { file: { $regex: safeSearch, $options: "i" } },
      { content: { $regex: safeSearch, $options: "i" } },
    ];
  }

  const pipeline: PipelineStage[] = [
    { $match: matchStage },
    { $sort: { updatedAt: -1 } },
    // Lookup the author's name
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
    { $project: { user: 0, content: 0 } }, // omit raw content in list view
  ];

  const countPipeline: PipelineStage[] = [
    { $match: matchStage },
    { $count: "total" },
  ];

  if (skip) pipeline.push({ $skip: skip });
  if (limit) pipeline.push({ $limit: limit });

  const [result, countResult] = await Promise.all([
    ProjectContent.aggregate(pipeline),
    ProjectContent.aggregate(countPipeline),
  ]);

  const total = countResult.length > 0 ? countResult[0].total : 0;

  return {
    project_id,
    result,
    meta: { total },
  };
};

// ─── Get single file content ─────────────────────────────────────────────────
const getSingleProjectContentService = async (
  project_id: string,
  file: string,
) => {
  const content = await ProjectContent.findOne({ project_id, file }).lean();
  return content;
};

// ─── Create or fully replace a file's content ────────────────────────────────
const upsertProjectContentService = async (
  data: Omit<ProjectContentType, "_id">,
) => {
  const { project_id, user_id, file, content, git_sha } = data;

  const result = await ProjectContent.findOneAndUpdate(
    { project_id, file },
    { project_id, user_id, file, content, git_sha },
    {
      upsert: true,
      returnDocument: "after",
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );

  return result;
};

// ─── Delete a single file ─────────────────────────────────────────────────────
const deleteProjectContentService = async (
  project_id: string,
  file: string,
) => {
  await ProjectContent.deleteOne({ project_id, file });
};

// ─── Delete all content for a project ────────────────────────────────────────
const deleteAllProjectContentService = async (project_id: string) => {
  await ProjectContent.deleteMany({ project_id });
};

export const projectContentService = {
  getProjectContentListService,
  getSingleProjectContentService,
  upsertProjectContentService,
  deleteProjectContentService,
  deleteAllProjectContentService,
};
