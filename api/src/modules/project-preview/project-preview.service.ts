import { ProjectPreview } from "./project-preview.model";
import { ProjectPreviewType } from "./project-preview.type";

const getByProjectIdService = async (project_id: string) => {
  return ProjectPreview.findOne({ project_id });
};

const upsertService = async (
  project_id: string,
  data: Partial<Omit<ProjectPreviewType, "project_id">>,
) => {
  return ProjectPreview.findOneAndUpdate(
    { project_id },
    {
      $set: {
        ...data,
        project_id,
        last_used_at: data.last_used_at ?? new Date(),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
};

const deleteByProjectIdService = async (project_id: string) => {
  return ProjectPreview.deleteOne({ project_id });
};

export const projectPreviewService = {
  getByProjectIdService,
  upsertService,
  deleteByProjectIdService,
};
