import { api } from "../api-slice";

export interface ProjectContentPayload {
  file: string;
  content: string;
  /** User who saved the draft content. */
  user_id?: string;
  /** File SHA from Git at the time of saving. Used for conflict detection on reload. */
  git_sha?: string;
}

export interface ProjectContentRecord {
  _id: string;
  project_id: string;
  user_id: string;
  file: string;
  content: string;
  /** SHA of the Git file at the time this draft was saved. */
  git_sha?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const projectContentApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // POST /project-content/:project_id — create or replace a file's content
    upsertProjectContent: builder.mutation<
      ProjectContentRecord,
      { projectId: string; orgId: string } & ProjectContentPayload
    >({
      query: ({ projectId, orgId, ...body }) => ({
        url: `/project-content/${projectId}?orgId=${orgId}`,
        method: "POST",
        data: body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        {
          type: "ProjectContent",
          id: `${arg.projectId}:${arg.orgId}:${arg.file}`,
        },
      ],
    }),

    // GET /project-content/:project_id/file?file=<path> — read one file's draft
    getProjectContent: builder.query<
      ProjectContentRecord | null,
      { projectId: string; orgId: string; file: string }
    >({
      query: ({ projectId, orgId, file }) => ({
        url: `/project-content/${projectId}/file`,
        method: "GET",
        params: { file, orgId },
      }),
      providesTags: (_result, _error, arg) => [
        {
          type: "ProjectContent",
          id: `${arg.projectId}:${arg.orgId}:${arg.file}`,
        },
      ],
    }),

    // DELETE /project-content/:project_id/file?file=<path> — remove draft after push
    deleteProjectContent: builder.mutation<
      void,
      { projectId: string; orgId: string; file: string }
    >({
      query: ({ projectId, orgId, file }) => ({
        url: `/project-content/${projectId}/file`,
        method: "DELETE",
        params: { file, orgId },
      }),
      invalidatesTags: (_result, _error, arg) => [
        {
          type: "ProjectContent",
          id: `${arg.projectId}:${arg.orgId}:${arg.file}`,
        },
      ],
    }),
  }),
});

export const {
  useUpsertProjectContentMutation,
  useGetProjectContentQuery,
  useDeleteProjectContentMutation,
} = projectContentApi;
