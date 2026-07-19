import { ENUM_ROLE_ORG } from "@/enums/roles";
import mongoose, { model } from "mongoose";
import { OrganizationType } from "./organization.type";

const organizationSchema = new mongoose.Schema<OrganizationType>(
  {
    org_name: {
      type: String,
      required: true,
    },
    org_id: {
      type: String,
      required: true,
    },
    org_image: {
      type: String,
    },
    default: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
    },
    owner: {
      type: String,
      required: true,
    },
    members: [
      {
        email: {
          type: String,
          required: true,
        },
        user_id: {
          type: String,
          required: true,
        },
        role: {
          type: String,
          required: true,
          enum: [ENUM_ROLE_ORG.ADMIN, ENUM_ROLE_ORG.EDITOR],
        },
      },
    ],
    sandbox: {
      type: {
        token: { type: String, required: true },
        team_id: { type: String, default: "" },
        project_id: { type: String, required: true },
        project_name: { type: String },
        username: { type: String },
      },
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const Organization = model<OrganizationType>(
  "organization",
  organizationSchema
);
