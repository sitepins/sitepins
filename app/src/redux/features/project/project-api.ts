import { TExtractVariables } from "@/actions/utils";
import { projectSchema } from "@/lib/validate";
import { api } from "../api-slice";
import { updateConfig } from "../config/slice";
import { TProject } from "./type";

export const projectApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Get projects by organization ID
    getProjects: builder.query<TProject[], string>({
      query: (orgId) => ({
        method: "GET",
        url: `/project/orgs/${orgId}`,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ project_id }) => ({
                type: "Project" as const,
                id: project_id,
              })),
              { type: "Projects", id: "LIST" },
            ]
          : [{ type: "Projects", id: "LIST" }],
    }),

    // Get a single project
    getProject: builder.query<TProject, { projectId: string; orgId: string }>({
      query: ({ projectId, orgId }) => ({
        method: "GET",
        url: `/project/${projectId}?orgId=${orgId}`,
      }),
      async onQueryStarted(arg, { queryFulfilled, dispatch }) {
        try {
          const { data } = await queryFulfilled;
          const repoPath = data?.repository || "";
          const [userName, repoName] = repoPath.includes("/")
            ? (repoPath.split("/") as string[])
            : [repoPath, ""];
          dispatch(
            updateConfig({
              owner: userName,
              repoName: repoName,
              branch: data.branch,
              provider: data.provider as "Github" | "Gitlab",
              framework: data.generator as any,
            }),
          );
        } catch (error) {}
      },
      providesTags: (result, error, { projectId }) =>
        result ? [{ type: "Project" as const, id: projectId }] : [],
    }),

    // Add new project with Zod validation
    addProject: builder.mutation<
      TProject,
      Partial<TExtractVariables<TProject>>
    >({
      query: (projectData) => {
        // Perform Zod validation
        const validated = projectSchema.safeParse(projectData);

        if (!validated.success) {
          // Throw validation error (Zod v4 uses `issues` instead of `errors`)
          throw new Error(JSON.stringify(validated.error.issues));
        }
        return {
          url: "/project/create",
          method: "POST",
          data: projectData,
        };
      },
      invalidatesTags: ["Projects", "Project"],
    }),

    // Update project
    updateProject: builder.mutation<TProject, Partial<TProject>>({
      query: (projectData) => {
        const { project_id, org_id, ...rest } = projectData;
        return {
          url: `/project/${project_id}?orgId=${org_id}`,
          method: "PATCH",
          data: rest,
        };
      },
      invalidatesTags: (result, error, { project_id }) =>
        error ? [] : ["Projects", { type: "Project", id: project_id }],
    }),

    // Update project visibility (sync with GitHub visibility)
    updateProjectVisibility: builder.mutation<
      TProject,
      { project_id: string; org_id?: string; visibility: "public" | "private" }
    >({
      query: ({ project_id, org_id, visibility }) => ({
        url: `/project/visibility/${project_id}${`?orgId=${org_id}`}`,
        method: "PATCH",
        data: { visibility },
      }),
      invalidatesTags: (result, error, { project_id }) =>
        error ? [] : ["Projects", { type: "Project", id: project_id }],
    }),

    // Update project status (active/archived)
    updateProjectStatus: builder.mutation<
      TProject,
      { project_id: string; org_id?: string; status: "active" | "archived" }
    >({
      query: ({ project_id, org_id, status }) => ({
        url: `/project/status/${project_id}${`?orgId=${org_id}`}`,
        method: "PATCH",
        data: { status },
      }),
      invalidatesTags: (result, error, { project_id }) =>
        error ? [] : ["Projects", { type: "Project", id: project_id }],
    }),

    // update project generator
    updateProjectGenerator: builder.mutation<
      TProject,
      { project_id: string; org_id?: string; generator: string }
    >({
      query: ({ project_id, org_id, generator }) => ({
        url: `/project/generator/${project_id}${`?orgId=${org_id}`}`,
        method: "PATCH",
        data: { generator },
      }),
      invalidatesTags: (result, error, { project_id }) =>
        error ? [] : ["Projects", { type: "Project", id: project_id }],
    }),

    // Delete project
    deleteProject: builder.mutation<TProject, { id: string; org_id: string }>({
      query: ({ id, org_id }) => ({
        url: `/project/${id}?orgId=${org_id}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, { id }) => [
        "Projects",
        "Orgs",
        { type: "Project", id },
      ],
    }),

    // Move project to another organization
    moveProject: builder.mutation<
      TProject,
      { projectId: string; orgId: string }
    >({
      query: ({ projectId, orgId }) => ({
        url: `/project/move/${orgId}/${projectId}`,
        method: "PATCH",
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: "Project", id: projectId },
        { type: "Projects", id: "LIST" },
      ],
    }),

    // Disconnect git repository
    disconnectGitRepo: builder.mutation<
      TProject,
      { project_id: string; org_id: string }
    >({
      query: ({ project_id, org_id }) => ({
        url: `/project/git/${project_id}?orgId=${org_id}`,
        method: "PATCH",
        data: { repository: "", branch: "" },
      }),
      async onQueryStarted(arg, { queryFulfilled, dispatch }) {
        try {
          await queryFulfilled;
          dispatch(
            updateConfig({
              owner: "",
              repoName: "",
              branch: "",
            }),
          );
        } catch (error) {}
      },
      invalidatesTags: (result, error, { project_id }) =>
        error ? [] : ["Projects", { type: "Project", id: project_id }],
    }),

    // Update git connection (repository and branch)
    updateGitConnection: builder.mutation<
      TProject,
      {
        project_id: string;
        org_id: string;
        repository?: string;
        branch?: string;
        provider?: "Github" | "Gitlab";
      }
    >({
      query: ({ project_id, org_id, repository, branch, provider }) => ({
        url: `/project/git/${project_id}?orgId=${org_id}`,
        method: "PATCH",
        data: { repository, branch, ...(provider && { provider }) },
      }),
      async onQueryStarted(arg, { queryFulfilled, dispatch }) {
        try {
          const { data } = await queryFulfilled;
          const repoPath = data?.repository || "";
          const [userName, repoName] = repoPath.includes("/")
            ? (repoPath.split("/") as string[])
            : [repoPath, ""];
          dispatch(
            updateConfig({
              owner: userName,
              repoName: repoName,
              branch: data.branch,
              provider: data.provider as "Github" | "Gitlab",
              framework: data.generator as any,
            }),
          );
        } catch (error) {}
      },
      invalidatesTags: (result, error, { project_id }) =>
        error ? [] : ["Projects", { type: "Project", id: project_id }],
    }),

    getAllSitesOwnedByUser: builder.query<TProject[], { userId: string }>({
      query: ({ userId }) => ({
        url: `/project/user/${userId}`,
        method: "GET",
      }),
      providesTags: (result, error, { userId }) => [
        { type: "Project", id: userId },
      ],
    }),
  }),
});

export const {
  useGetProjectsQuery,
  useGetProjectQuery,
  useAddProjectMutation,
  useUpdateProjectMutation,
  useUpdateProjectStatusMutation,
  useUpdateProjectVisibilityMutation,
  useUpdateProjectGeneratorMutation,
  useDeleteProjectMutation,
  useMoveProjectMutation,
  useDisconnectGitRepoMutation,
  useUpdateGitConnectionMutation,
  useGetAllSitesOwnedByUserQuery,
} = projectApi;
