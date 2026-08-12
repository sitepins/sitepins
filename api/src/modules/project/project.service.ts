import {
  decorateProject,
  runProjectMutationGuard,
} from "@/lib/extensionGuards";
import { paginationHelpers } from "@/lib/paginationHelper";
import { escapeRegex } from "@/lib/regexEscape";
import { deleteFile } from "@/lib/s3-utils";
import { TPagination } from "@/types";
import type { QueryFilter, UpdateQuery } from "mongoose";
import { PipelineStage } from "mongoose";
import { ProjectContent } from "../project-content/project-content.model";
import { ProjectLog } from "../project-log/project-log.model";
import { ProjectPreview } from "../project-preview/project-preview.model";
import { Project } from "./project.model";
import { TProjectFilterOptions, TProjectType } from "./project.type";

// get all projects
const getAllProjectService = async (
  paginationOptions: Partial<TPagination>,
  filterOptions: TProjectFilterOptions,
) => {
  const { limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  // Extract search and filter options
  const { search } = filterOptions;

  // Create a text search stage for multiple fields
  const matchStage: PipelineStage.Match = {
    $match: {},
  };

  // Search condition
  if (search) {
    const searchKeyword = String(search).replace(/\+/g, " ");
    const keywords = searchKeyword.split("|");
    const searchConditions = keywords.map((keyword) => ({
      $or: [{ project_name: { $regex: escapeRegex(keyword), $options: "i" } }],
    }));
    matchStage.$match.$or = searchConditions;
  }

  const pipeline: PipelineStage[] = [matchStage];

  pipeline.push({
    $sort: {
      [sortBy || "createdAt"]: sortOrder === "asc" ? 1 : -1,
      _id: 1,
    },
  });
  if (skip) {
    pipeline.push({ $skip: skip });
  }
  if (limit) {
    pipeline.push({ $limit: limit });
  }

  pipeline.push(
    {
      $lookup: {
        from: "organizations",
        localField: "org_id",
        foreignField: "org_id",
        as: "orgData",
      },
    },
    {
      $addFields: {
        resolvedOwnerId: {
          $cond: {
            if: { $gt: [{ $size: "$orgData" }, 0] },
            then: { $arrayElemAt: ["$orgData.owner", 0] },
            else: "$user_id",
          },
        },
      },
    },
    {
      $lookup: {
        from: "users",
        let: { ownerId: "$resolvedOwnerId" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$user_id", "$$ownerId"] },
            },
          },
          {
            $project: {
              user_id: 1,
              email: 1,
              image: 1,
              full_name: 1,
              _id: 0,
            },
          },
        ],
        as: "ownerData",
      },
    },
    {
      $addFields: {
        owner: { $arrayElemAt: ["$ownerData", 0] },
      },
    },
  );
  pipeline.push(
    {
      $project: {
        project_id: 1,
        org_id: 1,
        project_name: 1,
        project_image: 1,
        repository: 1,
        repository_id: 1,
        site_url: 1,
        createdAt: 1,
        visibility: 1,
        status: 1,
        generator: 1,
        ownerData: 1,
      },
    },
    {
      $project: {
        __v: 0,
      },
    },
  );

  const result = await Project.aggregate(pipeline);
  const total = await Project.countDocuments(matchStage.$match);

  return {
    result: result,
    meta: {
      total: total,
    },
  };
};

// get single project
const getSingleProjectService = async ({
  project_id,
}: {
  project_id: string;
}) => {
  const project = await Project.aggregate([
    { $match: { project_id } },
    {
      $lookup: {
        from: "organizations",
        localField: "org_id",
        foreignField: "org_id",
        as: "orgData",
      },
    },
    {
      $addFields: {
        resolvedOwnerId: {
          $cond: {
            if: { $gt: [{ $size: "$orgData" }, 0] },
            then: { $arrayElemAt: ["$orgData.owner", 0] },
            else: "$user_id",
          },
        },
      },
    },
    {
      $lookup: {
        from: "users",
        let: { ownerId: "$resolvedOwnerId" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$user_id", "$$ownerId"] },
            },
          },
          {
            $project: {
              user_id: 1,
              email: 1,
              image: 1,
              full_name: 1,
              _id: 0,
            },
          },
        ],
        as: "ownerData",
      },
    },
    {
      $project: {
        orgData: 0,
        resolvedOwnerId: 0,
      },
    },
  ]);

  const singleProject = project[0] ?? null;

  if (!singleProject) {
    return null;
  }

  return decorateProject(singleProject);
};

// get project by org id
const getProjectByOrgId = async ({ org_id }: { org_id: string }) => {
  const project = await Project.aggregate([
    {
      $match: {
        org_id,
      },
    },
  ]);
  return project;
};

// get own project
const getProjectByUserIdService = async ({ user_id }: { user_id: string }) => {
  const project = await Project.find({ user_id });
  return project;
};

// create project
const createProjectService = async (
  project: Omit<TProjectType, "status" | "visibility"> &
    Partial<Pick<TProjectType, "status" | "visibility">>,
) => {
  const query: QueryFilter<TProjectType> = {
    project_name: project.project_name,
  };
  if (project.org_id) {
    query.org_id = project.org_id;
  } else {
    query.user_id = project.user_id;
  }
  const isProjectAdded = await Project.findOne(query);

  if (isProjectAdded) {
    throw Error("Project already exist");
  }

  const newProvider = new Project(project);
  await newProvider.save();
  return newProvider;
};

// update project
const updateProjectService = async ({
  project_id,
  project_name,
  project_image,
  site_url,
}: Pick<
  TProjectType,
  "project_id" | "project_name" | "project_image" | "site_url"
>) => {
  const projectData = await Project.findOne({ project_id });

  if (!projectData) {
    throw Error("Project not found");
  }

  // Name uniqueness is scoped to the project's OWN org, read from the stored
  // document — a caller-supplied org id would scope the check to the wrong
  // tenant.
  const project = await Project.findOne({
    project_name: project_name,
    org_id: projectData.org_id,
  });

  if (project && project.project_name !== project_name) {
    throw Error("Site name already exist");
  }

  if (
    projectData?.project_image !== project_image &&
    projectData?.project_image &&
    !projectData.project_image.startsWith("http")
  ) {
    await deleteFile(projectData?.project_image);
  }

  return await Project.findOneAndUpdate(
    { project_id },
    { project_name, project_image, site_url },
    { returnDocument: "after" },
  );
};

// update project visibility (private/public)
const updateProjectVisibilityService = async ({
  project_id,
  visibility,
}: {
  project_id: string;
  visibility: "public" | "private";
}) => {
  const project = await Project.findOne({ project_id });

  if (!project) {
    throw new Error("Project not found");
  }

  await runProjectMutationGuard({
    type: "visibility",
    projectId: project_id,
    visibility,
  });

  return await Project.findOneAndUpdate(
    { project_id },
    { visibility },
    { returnDocument: "after" },
  );
};

// update project status (active/archived)
const updateProjectStatusService = async ({
  project_id,
  status,
}: {
  project_id: string;
  status: "active" | "archived";
}) => {
  const project = await Project.findOne({ project_id });
  if (!project) {
    throw new Error("Project not found");
  }

  await runProjectMutationGuard({
    type: "status",
    projectId: project_id,
    status,
  });

  return await Project.findOneAndUpdate(
    { project_id },
    { status },
    { returnDocument: "after" },
  );
};

// update project generator
const updateProjectGeneratorService = async ({
  project_id,
  generator,
}: {
  project_id: string;
  generator: string;
}) => {
  const project = await Project.findOne({ project_id });
  if (!project) {
    throw new Error("Project not found");
  }

  return await Project.findOneAndUpdate(
    { project_id },
    { generator },
    { returnDocument: "after", upsert: true },
  );
};

// update git connection (repository and branch)
const updateGitConnectionService = async ({
  project_id,
  repository,
  repository_id,
  branch,
  provider,
}: {
  project_id: string;
  repository?: string;
  repository_id?: string;
  branch?: string;
  provider?: string;
}) => {
  const project = await Project.findOne({ project_id });
  if (!project) {
    throw new Error("Project not found");
  }

  const updateFields: UpdateQuery<TProjectType> = {};
  if (repository !== undefined) updateFields.repository = repository;
  if (repository_id !== undefined) updateFields.repository_id = repository_id;
  if (branch !== undefined) updateFields.branch = branch;
  if (provider !== undefined) updateFields.provider = provider;

  return await Project.findOneAndUpdate({ project_id }, updateFields, {
    returnDocument: "after",
  });
};

// move project to another org
const moveProjectService = async ({
  project_id,
  org_id,
}: {
  project_id: string;
  org_id: string;
}) => {
  return await Project.findOneAndUpdate(
    { project_id },
    {
      org_id,
    },
  );
};

// delete project
const deleteProjectService = async ({ project_id }: { project_id: string }) => {
  const project = await Project.findOne({ project_id });

  if (project?.project_image && !project?.project_image.startsWith("http")) {
    await deleteFile(project?.project_image);
  }

  await Promise.all([
    ProjectLog.deleteMany({ project_id }),
    ProjectPreview.deleteOne({ project_id }),
    ProjectContent.deleteMany({ project_id }),
  ]);

  return await Project.findOneAndDelete({ project_id });
};

export const projectService = {
  getAllProjectService,
  getProjectByOrgId,
  getSingleProjectService,
  getProjectByUserIdService,
  createProjectService,
  updateProjectService,
  updateProjectVisibilityService,
  updateProjectStatusService,
  updateProjectGeneratorService,
  updateGitConnectionService,
  moveProjectService,
  deleteProjectService,
};
