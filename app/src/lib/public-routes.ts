// Routes reachable without authentication, shared by the middleware
// (proxy.ts) and robots.ts. The hosted cloud edition overrides this module
// (public-routes.cloud.ts) to add its public pages (template catalog).

export const BASE_PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
] as const;

export const EXTRA_PUBLIC_ROUTES: string[] = [];

export const PUBLIC_ROUTES: string[] = [
  ...BASE_PUBLIC_ROUTES,
  ...EXTRA_PUBLIC_ROUTES,
];
