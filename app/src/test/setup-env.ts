// Module-level code in the api slices builds a better-auth client, which
// throws on an undefined base URL. Tests never reach the network, so these
// mirror the documented dev defaults rather than any real deployment.
process.env.NEXT_PUBLIC_BACKEND_URL ??= "http://localhost:4000/api/v1";
process.env.NEXT_PUBLIC_HP_WS_URL ??=
  "ws://localhost:4000/api/v1/editor/collab";
process.env.NEXT_PUBLIC_BUCKET_URL ??= "http://localhost:9000/sitepins-test";
process.env.NEXT_PUBLIC_GITHUB_APP_NAME ??= "sitepins-test";
process.env.NEXT_PUBLIC_GITLAB_APP_NAME ??= "sitepins-test";
