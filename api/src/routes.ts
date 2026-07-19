import express from "express";
import bucketRouter from "./modules/common/bucket.route";
import gitProviderRouter from "./modules/git-provider/git-provider.route";
import organizationRouter from "./modules/organization/organization.route";
import projectContentRouter from "./modules/project-content/project-content.route";
import projectLogRouter from "./modules/project-log/project-log.route";
import projectPreviewRouter from "./modules/project-preview/project-preview.route";
import projectRouter from "./modules/project/project.route";
import userPreferenceRouter from "./modules/user-preference/user-preference.route";
import userRouter from "./modules/user/user.route";

const router: express.Router = express.Router();

const moduleRoutes = [
  {
    path: "/user",
    route: userRouter,
  },
  {
    path: "/provider",
    route: gitProviderRouter,
  },
  {
    path: "/project",
    route: projectRouter,
  },
  {
    path: "/user-preference",
    route: userPreferenceRouter,
  },
  {
    path: "/organization",
    route: organizationRouter,
  },
  {
    path: "/project-log",
    route: projectLogRouter,
  },
  {
    path: "/bucket",
    route: bucketRouter,
  },
  {
    path: "/project-preview",
    route: projectPreviewRouter,
  },
  {
    path: "/project-content",
    route: projectContentRouter,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
