import { api } from "../api-slice";
import { TOrg } from "./type";

export const orgApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Get all organizations
    getOrgs: builder.query<TOrg[], void>({
      query: () => ({
        method: "GET",
        url: "/organization/user",
      }),
      providesTags: ["Orgs"],
    }),

    // Get single organization by ID
    getOrg: builder.query<TOrg, string>({
      query: (id) => ({
        method: "GET",
        url: `/organization/${id}`,
      }),
      providesTags: (result, error, id) => [{ type: "Org" as const, id }],
    }),

    // Add new organization
    addOrg: builder.mutation<TOrg, Partial<TOrg>>({
      query: (orgData) => ({
        url: "/organization",
        method: "POST",
        data: orgData,
      }),
      // Invalidate the Orgs tag to refetch the list
      invalidatesTags: ["Orgs"],
    }),

    // Update organization
    updateOrg: builder.mutation<TOrg, Partial<TOrg>>({
      query: (orgData) => ({
        url: `/organization/${orgData.org_id || orgData.org_id}`,
        method: "PATCH",
        data: orgData,
      }),
      // Invalidate both the specific Org and the Orgs list
      invalidatesTags: (result, error, { org_id }) => [
        { type: "Org", id: org_id },
        { type: "Orgs" },
      ],
    }),

    addMember: builder.mutation<
      TOrg,
      { email: string; role: string; org_id: string }
    >({
      query: ({ org_id, email, role }) => ({
        url: `/organization/member/${org_id}`,
        method: "PATCH",
        data: { email, role: role || "editor" },
      }),
      invalidatesTags: (result, error, { org_id }) => [
        { type: "Org", id: org_id },
        { type: "Orgs" },
      ],
    }),
    updateMemberRole: builder.mutation<
      TOrg,
      { org_id: string; member_id: string; role: string }
    >({
      query: ({ org_id, member_id, role }) => ({
        url: `/organization/update-role/${org_id}`,
        method: "PATCH",
        data: { member_id, role },
      }),
      invalidatesTags: (result, error, { org_id }) => [
        { type: "Org", id: org_id },
        { type: "Orgs" },
      ],
    }),
    removeMember: builder.mutation<TOrg, { org_id: string; member_id: string }>(
      {
        query: ({ org_id, member_id }) => ({
          url: `/organization/remove-member/${org_id}`,
          method: "PATCH",
          data: { member_id },
        }),
        invalidatesTags: (result, error, { org_id }) => [
          { type: "Org", id: org_id },
          { type: "Orgs" },
        ],
      },
    ),
    // Update organization status (active/archived)
    updateOrgStatus: builder.mutation<
      TOrg,
      { org_id: string; status: "active" | "archived" }
    >({
      query: ({ org_id, status }) => ({
        url: `/organization/status/${org_id}`,
        method: "PATCH",
        data: { status },
      }),
      invalidatesTags: (result, error, { org_id }) =>
        error ? [] : [{ type: "Org", id: org_id }, { type: "Orgs" }],
    }),
    // Delete organization
    deleteOrg: builder.mutation<TOrg, string>({
      query: (id) => ({
        url: `/organization/${id}`,
        method: "DELETE",
      }),
      // Invalidate both the specific Org and the Orgs list
      invalidatesTags: (result, error, id) => [
        { type: "Orgs" },
        { type: "Org", id },
      ],
    }),
  }),
});

// Export hooks for components to use
export const {
  useGetOrgsQuery,
  useGetOrgQuery,
  useAddOrgMutation,
  useAddMemberMutation,
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
  useUpdateOrgStatusMutation,
  useUpdateOrgMutation,
  useDeleteOrgMutation,
} = orgApi;
