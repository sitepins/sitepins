import { ENUM_ROLE_ORG } from "@/enums/roles";
import { decrypt, encrypt } from "@/lib/encrypt";
import { checkOrder } from "@/lib/entitlements";
import { sendMail } from "@/lib/mailer";
import { nanoId } from "@/lib/nanoId";
import { assertAssignableRole } from "@/lib/orgRoles";
import { deleteFile } from "@/lib/s3-utils";
import { ProjectContent } from "../project-content/project-content.model";
import { ProjectLog } from "../project-log/project-log.model";
import { ProjectPreview } from "../project-preview/project-preview.model";
import { Project } from "../project/project.model";
import { User } from "../user/user.model";
import { Organization } from "./organization.model";
import { Member, OrganizationType } from "./organization.type";

function decryptOrgSandboxToken(org: any): any {
  if (org?.sandbox?.token) {
    try {
      org.sandbox = { ...org.sandbox, token: decrypt(org.sandbox.token) };
    } catch {
      // token not encrypted (migration) — leave as-is
    }
  }
  return org;
}

// get organizations by user
const getOrganizationsByUserService = async (userId: string) => {
  // get all organizations by user
  const orgs = await Organization.aggregate([
    {
      $match: {
        $or: [
          { owner: userId },
          { members: { $elemMatch: { user_id: userId } } },
        ],
      },
    },
    {
      $lookup: {
        from: "projects",
        localField: "org_id",
        foreignField: "org_id",
        as: "projects",
      },
    },
    {
      $lookup: {
        from: "users",
        let: { memberIds: "$members.user_id" },
        pipeline: [
          {
            $match: {
              $expr: { $in: ["$user_id", "$$memberIds"] },
            },
          },
          {
            $project: {
              password: 0, // Exclude the password field
            },
          },
        ],
        as: "members",
      },
    },
    {
      $lookup: {
        from: "users",
        let: { ownerId: "$owner" },
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
        projectCount: { $size: "$projects" },
      },
    },
  ]);

  for (const org of orgs) {
    decryptOrgSandboxToken(org);
    const owner = org.ownerData?.[0];
    if (owner?.user_id) {
      const { currentPackage } = await checkOrder(owner.user_id);
      org.ownerData[0] = {
        ...owner,
        active_package: currentPackage,
      };
    }
  }

  return orgs;
};

// get organization by id
const getOrganizationService = async ({
  org_id,
  userId,
}: {
  org_id: string;
  userId: string;
}) => {
  const result = await Organization.aggregate([
    {
      $match: {
        $and: [{ org_id }, { members: { $elemMatch: { user_id: userId } } }],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "members.user_id",
        foreignField: "user_id",
        as: "users",
      },
    },
    {
      $addFields: {
        members: {
          $map: {
            input: "$members",
            as: "member",
            in: {
              $mergeObjects: [
                "$$member",
                {
                  $cond: [
                    { $gt: [{ $size: "$users" }, 0] },
                    {
                      $let: {
                        vars: {
                          userDoc: {
                            $arrayElemAt: [
                              {
                                $filter: {
                                  input: "$users",
                                  as: "user",
                                  cond: {
                                    $eq: ["$$user.user_id", "$$member.user_id"],
                                  },
                                },
                              },
                              0,
                            ],
                          },
                        },
                        in: {
                          full_name: "$$userDoc.full_name",
                          image: "$$userDoc.image",
                          email: "$$userDoc.email",
                        },
                      },
                    },
                    {},
                  ],
                },
              ],
            },
          },
        },
      },
    },
    {
      $lookup: {
        from: "users",
        let: { ownerId: "$owner" },
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
        __v: 0,
        users: 0,
      },
    },
  ]);

  const singleOrg = result[0] ?? null;

  if (!singleOrg) {
    return {};
  }

  decryptOrgSandboxToken(singleOrg);

  const owner = singleOrg.ownerData?.[0];

  if (owner?.user_id) {
    const { currentPackage } = await checkOrder(owner.user_id);

    singleOrg.ownerData[0] = {
      ...owner,
      active_package: currentPackage,
    };
  }

  return singleOrg;
};

// create organization
const createOrganizationService = async ({
  org_name,
  email,
  owner,
  default: isDefault,
  org_image,
  org_id,
}: {
  org_name: string;
  email: string;
  owner: string;
  default?: boolean;
  org_image?: string;
  org_id?: string;
}): Promise<OrganizationType | null> => {
  const existing = await Organization.findOne({ org_name, owner });

  if (existing) {
    throw new Error("Organization already exists");
  }

  const generatedOrgId = org_id ?? (await nanoId(10));

  const organizationData: OrganizationType = {
    members: [
      {
        user_id: owner,
        role: ENUM_ROLE_ORG.ADMIN,
        email,
      },
    ],
    org_image: org_image ?? "",
    org_id: generatedOrgId,
    org_name,
    default: isDefault ?? false,
    status: "active",
    owner,
  };

  const newData = new Organization(organizationData);
  const insertedOrganization = await newData.save();
  return insertedOrganization;
};

//  team member operations
const addTeamMemberService = async ({
  org_id,
  teamMember,
  loggedInUserId,
}: {
  org_id: string;
  teamMember: Member;
  loggedInUserId: string;
}) => {
  // Verify admin access
  const loggedInUser = await Organization.findOne({
    org_id,
    members: {
      $elemMatch: {
        user_id: loggedInUserId,
        role: ENUM_ROLE_ORG.ADMIN,
      },
    },
  });

  if (!loggedInUser) {
    throw Error("Only admins can add team members.");
  }

  assertAssignableRole(teamMember.role);

  let userId =
    "@user_" +
    teamMember.user_id?.replace(/[@.!#$%&'*+-/=?^_`{|}~]/g, "_").toLowerCase();

  if (loggedInUserId === userId) {
    throw Error("You cannot add yourself.");
  }
  // Check if user already exists
  const isUserExistOnMember = await Organization.findOne({
    org_id,
    "members.user_id": userId,
  });

  if (isUserExistOnMember) {
    throw Error("User is already a member of this organization.");
  }

  const member = await Organization.findOneAndUpdate(
    { org_id },
    {
      $push: {
        members: {
          user_id: userId,
          role: teamMember.role,
          email: teamMember.email,
        },
      },
    },
  );

  const recipientUser = await User.findOne({ user_id: userId });

  // send mail to the invited member
  const recipientEmail = recipientUser?.email || teamMember.email;

  if (recipientEmail) {
    await sendMail({
      to: recipientEmail,
      kind: "org_member_added",
      params: {
        org_name: member?.org_name!,
        role: teamMember.role,
      },
    });
  }

  return teamMember;
};

const updateRoleService = async ({
  org_id,
  teamMember,
  loggedInUserId,
}: {
  org_id: string;
  teamMember: Omit<Member, "email">;
  loggedInUserId: string;
}) => {
  // Verify admin access
  const loggedInUser = await Organization.findOne({
    org_id,
    members: {
      $elemMatch: {
        user_id: loggedInUserId,
        role: ENUM_ROLE_ORG.ADMIN,
      },
    },
  });

  if (!loggedInUser) {
    throw Error("Only admins can update team members.");
  }

  assertAssignableRole(teamMember.role);

  const userId = teamMember.user_id;

  if (userId === loggedInUserId) {
    throw Error("You cannot change your own role.");
  }

  const isUserExistOnMember = await Organization.findOne({
    org_id,
    "members.user_id": userId,
  });

  if (!isUserExistOnMember) {
    throw Error("User is not a member of this organization.");
  }

  if (isUserExistOnMember.owner === userId) {
    throw Error("You cannot change the owner's role.");
  }

  // update only the role
  await Organization.findOneAndUpdate(
    { org_id, "members.user_id": userId },
    {
      $set: {
        "members.$.role": teamMember.role,
      },
    },
  );

  const recipientUser = await User.findOne({ user_id: userId });
  const user = await User.findOne({ user_id: loggedInUserId });

  // send mail only if both users were found and have emails
  if (recipientUser?.email && user?.email) {
    await sendMail({
      to: recipientUser.email,
      kind: "org_member_updated",
      params: {
        org_name: loggedInUser?.org_name,
        role: teamMember.role,
      },
    });
  }

  return teamMember;
};

// remove team member
const removeTeamMemberService = async ({
  org_id,
  userId,
  loggedInUserId,
}: {
  org_id: string;
  userId: string;
  loggedInUserId: string;
}) => {
  // Verify admin access
  const loggedInUser = await Organization.findOne({
    org_id,
    members: {
      $elemMatch: {
        user_id: loggedInUserId,
        role: ENUM_ROLE_ORG.ADMIN,
      },
    },
  });

  if (!loggedInUser) {
    throw Error("Only admins can remove team members.");
  }

  if (userId === loggedInUserId) {
    throw Error("You cannot remove yourself.");
  }

  const organization = await Organization.findOne({
    org_id,
    "members.user_id": userId,
  });

  if (!organization) {
    throw Error("User is not a member of this organization.");
  }

  if (organization.owner === userId) {
    throw Error("You cannot remove the owner.");
  }

  await Organization.findOneAndUpdate(
    {
      org_id,
      "members.user_id": userId,
    },
    {
      $pull: {
        members: {
          user_id: userId,
        },
      },
    },
  );

  const recipientUser = await User.findOne({ user_id: userId });
  // send mail only when recipient email exists
  if (recipientUser?.email) {
    await sendMail({
      to: recipientUser.email,
      kind: "org_member_removed",
      params: {
        org_name: loggedInUser.org_name,
      },
    });
  } else {
    console.warn(
      "Skipping org removal email: recipient has no email, userId=",
      userId,
    );
  }

  return {
    user_id: userId,
    delete: true,
  };
};

// organization update service
const updateOrganizationService = async ({
  organization,
  org_id,
}: {
  organization: Partial<OrganizationType>;
  org_id: string;
}) => {
  // Build a $set payload with only the defined fields
  const setFields: Record<string, any> = {};
  if (organization.org_name !== undefined)
    setFields.org_name = organization.org_name;
  if (organization.org_image !== undefined) {
    const existingOrg = await Organization.findOne({ org_id });
    if (
      existingOrg?.org_image &&
      existingOrg.org_image !== organization.org_image &&
      !existingOrg.org_image.startsWith("http")
    ) {
      await deleteFile(existingOrg.org_image).catch((err) => {
        console.error(
          `Failed to delete old org image (${existingOrg.org_image}):`,
          err.message,
        );
      });
    }
    setFields.org_image = organization.org_image;
  }
  if (organization.sandbox !== undefined) {
    if (organization.sandbox?.token) {
      setFields.sandbox = {
        ...organization.sandbox,
        token: encrypt(organization.sandbox.token),
      };
    } else {
      setFields.sandbox = organization.sandbox;
    }
  }

  return await Organization.findOneAndUpdate(
    { org_id },
    { $set: setFields },
    { returnDocument: "after" },
  );
};

// update org status (active/archived)
const updateOrganizationStatusService = async ({
  org_id,
  status,
}: {
  org_id: string;
  status: "active" | "archived";
}) => {
  const organization = await Organization.findOne({ org_id });
  if (!organization) {
    throw new Error("Organization not found");
  }

  if (status === "active" && organization.status !== "active") {
    const { limits } = await checkOrder(organization.owner);
    const limit = limits.org_limit;

    const activeOrgCount = await Organization.countDocuments({
      owner: organization.owner,
      status: "active",
      org_id: { $ne: org_id },
    });

    if (activeOrgCount >= limit) {
      throw new Error(
        `You have reached the maximum number of active organizations (${limit}) for your current plan.`,
      );
    }
  }

  return await Organization.findOneAndUpdate(
    { org_id },
    { status },
    { returnDocument: "after" },
  );
};

// delete organization
const deleteOrganizationService = async ({
  org_id,
  userId,
}: {
  org_id: string;
  userId: string;
}) => {
  const organization = await Organization.findOne({ org_id, owner: userId });
  if (!organization) {
    throw Error("Organization not found");
  }

  if (organization.default) {
    throw Error("Default organization cannot be deleted");
  }

  const projects = await Project.find({ org_id }, { project_id: 1 });
  const projectIds = projects.map((p) => p.project_id);

  await ProjectLog.deleteMany({ project_id: { $in: projectIds } });
  await ProjectPreview.deleteMany({ project_id: { $in: projectIds } });
  await ProjectContent.deleteMany({ project_id: { $in: projectIds } });

  const deleteOrganization = await Organization.findOneAndDelete({
    org_id,
    owner: userId,
  });
  await Project.deleteMany({ org_id });
  return deleteOrganization;
};

export const organizationService = {
  getOrganizationsByUserService,
  getOrganizationService,
  createOrganizationService,
  updateOrganizationService,
  addTeamMemberService,
  updateRoleService,
  removeTeamMemberService,
  updateOrganizationStatusService,
  deleteOrganizationService,
};
