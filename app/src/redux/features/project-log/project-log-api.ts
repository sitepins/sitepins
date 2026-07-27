import { api } from "../api-slice";
import { TLog, TProjectLog } from "./type";

export const projectLogApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Get a single project log
    getProjectLog: builder.query<TProjectLog, string>({
      query: (project_id) => ({
        url: `/project-log/${project_id}`,
        method: "GET",
      }),
      providesTags: (result, error, project_id) =>
        project_id ? [{ type: "ProjectLog", id: project_id }] : [],
    }),

    // create a project log
    addProjectLog: builder.mutation<TLog, Omit<TLog, "_id">>({
      query: (data) => {
        return {
          url: `/project-log/${data.project_id}`,
          data: data,
          method: "POST",
        };
      },
      invalidatesTags: (result, error, data) =>
        data && data.project_id
          ? [{ type: "ProjectLog", id: data.project_id }]
          : [],
    }),
  }),
});

export const { useGetProjectLogQuery, useAddProjectLogMutation } =
  projectLogApi;
