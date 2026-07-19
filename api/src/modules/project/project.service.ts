import { checkOrder } from "@/lib/entitlements";
import { paginationHelpers } from "@/lib/paginationHelper";
import { deleteFile } from "@/lib/s3-utils";
import { IPagination } from "@/types";
import { PipelineStage } from "mongoose";
import { Organization } from "../organization/organization.model";
import { ProjectLog } from "../project-log/project-log.model";
import { ProjectPreview } from "../project-preview/project-preview.model";
import { ProjectContent } from "../project-content/project-content.model";
import { Project } from "./project.model";
import { ProjectFilterOptions, ProjectType } from "./project.type";

// get all projects
const getAllProjectService = async (
  paginationOptions: Partial<IPagination>,
  filterOptions: ProjectFilterOptions,
) => {
  const { limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  // Extract search and filter options
  const { search } = filterOptions;

  // Create a text search stage for multiple fields
  let matchStage: any = {
    $match: {},
  };

  // Search condition
  if (search) {
    const searchKeyword = String(search).replace(/\+/g, " ");
    const keywords = searchKeyword.split("|");
    const searchConditions = keywords.map((keyword) => ({
      $or: [{ project_name: { $regex: keyword, $options: "i" } }],
    }));
    matchStage.$match.$or = searchConditions;
  }

  let pipeline: PipelineStage[] = [matchStage];

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

  const owner = singleProject.ownerData?.[0];

  if (owner?.user_id) {
    const { currentPackage } = await checkOrder(owner.user_id);

    singleProject.ownerData[0] = {
      ...owner,
      active_package: currentPackage,
    };
  }

  return singleProject;
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
const createProjectService = async (project: ProjectType & { id: string }) => {
  const query: any = { project_name: project.project_name };
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
  org_id,
}: ProjectType) => {
  const projectData = await Project.findOne({ project_id });
  const project = await Project.findOne({ project_name: project_name, org_id });

  if (!projectData) {
    throw Error("Project not found");
  }

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

  let status = project.status;

  // Check limits if switching to private
  if (visibility === "private" && project.visibility !== "private") {
    let planOwnerId = project.user_id;
    if (project.org_id) {
      const org = await Organization.findOne({ org_id: project.org_id });
      if (org) planOwnerId = org.owner;
    }

    const { limits } = await checkOrder(planOwnerId);
    const limit = limits.org_private_site_limit;

    const privateProjectCount = await Project.countDocuments({
      org_id: project.org_id,
      visibility: "private",
      status: "active",
      project_id: { $ne: project_id }, // Exclude current project
    });

    if (privateProjectCount >= limit) {
      status = "archived";
    }
  }

  return await Project.findOneAndUpdate(
    { project_id },
    { visibility, status },
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

  if (status === "active" && project.status !== "active") {
    let planOwnerId = project.user_id;
    if (project.org_id) {
      const org = await Organization.findOne({ org_id: project.org_id });
      if (org) planOwnerId = org.owner;
    }
    const { limits } = await checkOrder(planOwnerId);

    if (project.visibility === "private") {
      const activePrivateProjects = await Project.countDocuments({
        org_id: project.org_id,
        visibility: "private",
        status: "active",
        project_id: { $ne: project_id },
      });

      if (activePrivateProjects >= limits.org_private_site_limit) {
        throw new Error(
          `You have reached the maximum number of active private projects (${limits.org_private_site_limit}) for your current plan.`,
        );
      }
    }

    const activeProjects = await Project.countDocuments({
      org_id: project.org_id,
      status: "active",
      project_id: { $ne: project_id },
    });

    if (activeProjects >= limits.org_site_limit) {
      throw new Error(
        `You have reached the maximum number of active projects (${limits.org_site_limit}) for your current plan.`,
      );
    }
  }

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
  branch,
  provider,
}: {
  project_id: string;
  repository?: string;
  branch?: string;
  provider?: string;
}) => {
  const project = await Project.findOne({ project_id });
  if (!project) {
    throw new Error("Project not found");
  }

  const updateFields: any = {};
  if (repository !== undefined) updateFields.repository = repository;
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
