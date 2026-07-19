# sitepins-backend

Express + MongoDB API for Sitepins: authentication, organizations, projects, git provider tokens, and the realtime collaborative editing server.

See the [root README](../README.md) for the project overview, self-hosting quickstart, Docker, and media-storage setup. GitHub/GitLab app setup lives in [app/README.md](../app/README.md) — this service never touches those credentials.

## Tech stack

- **Express 5** — HTTP API, secured with [helmet](https://helmetjs.github.io/) and a request-body size limit
- **MongoDB / Mongoose** — persistence
- **better-auth** — session auth, with GitHub and Google OAuth sign-in
- **Hocuspocus** (`@hocuspocus/server`) — Yjs-backed realtime collaboration server for the content editor
- **Socket.IO** — presence + commit notifications (authenticated per connection)
- **TypeScript**, built with `tsc` + `tsc-alias` for path-alias resolution
- **Vitest** — test runner

## Folder structure

```
src/
  server.ts         # process entrypoint — boots Express + Socket.IO + Hocuspocus
  app.ts            # Express app: helmet, CORS, body limits, routes, /healthz
  auth.ts           # better-auth instance (real sign-in)
  auth-demo.ts      # separate better-auth instance for demo-mode accounts
  routes.ts         # top-level route aggregation
  config/           # env var parsing (config/variables.ts is the single source of truth)
  enums/            # shared enums (roles, statuses, etc.)
  errors/           # typed error classes
  lib/
    mailer.ts       #   provider-agnostic transactional email (brevo | smtp | console)
    s3-utils.ts     #   S3-compatible media storage client
    orgAccess.ts    #   org-membership checks for the realtime gateways
    socketAuth.ts   #   Socket.IO connection authentication
    entitlements.ts #   extension points (see "Extending without forking core")
    authIssuers.ts  #   external JWT issuer registry
  middlewares/      # auth, rate limiting, error handling
  modules/          # one folder per domain (.route/.controller/.service/.model)
    common/         #   bucket (media) upload, presence + editor gateways
    git-provider/   #   GitHub/GitLab token storage + refresh
    organization/ · project/ · project-content/ · project-log/
    project-preview/ #   og:image fallback for project cards (screenshots are cloud-only)
    user/ · user-preference/
```

## Environment variables

Copy `.env.example` to `.env` and fill in. The file is grouped and commented; this table summarizes what's required.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | | Local port (defaults to `4000`) |
| `NODE_ENV` | | `development` / `production` |
| `BASE_URL` | ✓ | This API's own public URL |
| `MONGO_URI` | ✓ | MongoDB connection string |
| `CORS_ORIGINS` | ✓ (prod) | Comma-separated list of allowed browser origins |
| `BETTER_AUTH_SECRET` | ✓ | Session signing secret — see [Generating secrets](#generating-secrets) |
| `JWT_SECRET` | ✓ | Signs internal action tokens — see [Generating secrets](#generating-secrets) |
| `JWT_TOKEN_EXPIRE` | ✓ | e.g. `7d` |
| `SANDBOX_ENCRYPTION_KEY` | ✓ | AES-256-GCM key encrypting sandbox tokens at rest — see [Generating secrets](#generating-secrets) |
| `INTERNAL_API_SECRET` | ✓ | Shared secret between this API and the app's internal routes — must match the app's copy exactly |
| `SALT` | | bcrypt cost factor, defaults to `10` |
| `COOKIE_DOMAIN` | | Leave **unset** for single-host deploys. Set to a leading-dot domain (e.g. `.example.com`) only when the app and API are on different subdomains and must share the session cookie |
| `TRUST_PROXY` | | Proxy hops in front of the API (Vercel/DO/nginx). Defaults to `1` in production, off in dev; set `false` if exposed directly |
| `JSON_BODY_LIMIT` | | Max request body size, defaults to `5mb` |
| `RATELIMIT_WINDOW` / `RATELIMIT_MAX` | | Auth rate-limit window (seconds) and max requests, defaults to 100 req / 10s |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | ✓ | OAuth **sign-in** with GitHub — a plain [GitHub OAuth app](https://github.com/settings/developers), unrelated to the GitHub *App* the frontend uses for repo access (see [app/README.md](../app/README.md#setting-up-a-github-app)). Callback URL: `<BASE_URL>/api/v1/auth/callback/github` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | | OAuth sign-in with Google. Callback URL: `<BASE_URL>/api/v1/auth/callback/google` |
| `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET_NAME` | ✓ | S3-compatible media storage (AWS S3, Cloudflare R2, MinIO, Backblaze B2, DigitalOcean Spaces) — see [Setting up media storage](../README.md#setting-up-media-storage-s3-compatible) |
| `S3_FORCE_PATH_STYLE` | | `true` for MinIO / path-style gateways |

### Email (optional)

Transactional email (welcome, OTP, password reset, org invites) is sent through a provider-agnostic mailer. The provider is chosen by `MAIL_PROVIDER`, or auto-detected:

- **`brevo`** — set `BREVO_API_KEY` (uses [Brevo](https://www.brevo.com/) transactional templates; ids overridable via `BREVO_TEMPLATE_*`)
- **`smtp`** — set `SMTP_HOST` (+ `SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS`); renders built-in HTML emails via nodemailer
- **`console`** — the default when nothing is configured: logs the message (including OTP / reset link) to stdout, so signup works with zero mail setup

| Variable | Purpose |
| --- | --- |
| `MAIL_PROVIDER` | Force a provider; unset = auto-detect |
| `MAIL_FROM_NAME` / `MAIL_FROM_EMAIL` | Sender identity, defaults to `Sitepins` / `noreply@example.com` |
| `REQUIRE_EMAIL_VERIFICATION` | Set `false` to skip the OTP step entirely (default `true`) |
| `REOON_API_KEY` | Optional anti-abuse email check at signup ([Reoon](https://www.reoon.com/)); unset = skipped, fails open if the service is down |

## Generating secrets

Some variables are raw secrets you generate yourself, not third-party credentials:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -hex 32      # JWT_SECRET
openssl rand -hex 32      # SANDBOX_ENCRYPTION_KEY
```

`INTERNAL_API_SECRET` is also self-generated the same way, but shared with the app — generate it once and paste the identical value into both `api/.env` and `app/.env`.

## Health check

`GET /healthz` returns `{ "status": "ok", "uptime": <seconds> }` for load balancers and orchestrators.

## Scripts

```bash
pnpm dev      # ts-node-dev with hot reload
pnpm build    # tsc && tsc-alias
pnpm start    # run the built dist/server.js
pnpm test     # vitest run
pnpm format   # prettier -w ./src
```

## Extending without forking core

Two hooks exist specifically so a wrapper project can add billing/admin/custom-auth on top without touching this repo:

- `src/lib/entitlements.ts` — `setEntitlementsProvider`, `setPlanEnforcer`, `onUserDeletion`, `onAuthEvent` (login, password reset)
- `src/lib/authIssuers.ts` — `registerJwtIssuer`, for accepting tokens minted by an external auth system

A wrapper's own `register.ts` wires these up, mounts its own routes, then calls this package's exported `startServer()`.
