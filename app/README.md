# sitepins (app)

Next.js frontend for Sitepins — the CMS UI, git-provider OAuth flows, media library, and the realtime collaborative content editor.

See the [root README](../README.md) for the project overview, self-hosting quickstart, Docker, and S3-compatible media-storage setup.

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **Tailwind CSS v4** — CSS-first config (`@theme` in `src/styles/variables.css`, no `tailwind.config.js`)
- **Redux Toolkit** (RTK Query) — API state
- **better-auth** client — talks to the API's better-auth instance
- **Platejs** — the rich text editor, with `@hocuspocus/provider` for realtime multi-user collaboration against the API's Hocuspocus server
- **`ai` / `@ai-sdk/openai`** — optional AI writing assistance inside the editor
- **next-intl** — i18n, 12 locales under `src/i18n/`
- **Octokit** (`octokit`, `@octokit/auth-app`) — GitHub App authentication

## Folder structure

```
src/
  app/
    [locale]/          # all user-facing routes, locale-prefixed
      (auth)/           # login/signup
      dashboard/         # account, billing (cloud-only), sitepins-ai settings
      [orgId]/           # org + project workspace, the editor, settings
      github-installed/  # GitHub App OAuth callback landing page
      gitlab-installed/  # GitLab OAuth callback landing page
    api/                # Next.js route handlers — git provider OAuth exchange, sandbox control, etc.
  actions/              # server actions
  layouts/              # shared components, editor UI (layouts/editor/), partials
  redux/                # RTK Query API slices, one folder per domain
  lib/                  # config, auth client, utils
  hooks/                # e.g. useGitAuth — drives the GitHub/GitLab popup auth flow
  i18n/                 # translation JSON per locale
  contexts/             # React context providers
  config/               # static app config (e.g. templates.json is cloud-only)
```

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_BACKEND_URL` | ✓ | Base URL of the `api` service |
| `NEXT_PUBLIC_HP_WS_URL` | ✓ | WebSocket URL for the Hocuspocus collaborative editor (`ws://localhost:4000/api/v1/editor/collab` in dev) |
| `NEXT_PUBLIC_BUCKET_URL` | ✓ | Public base URL for uploaded media — your S3-compatible bucket's public URL (must match the API's `S3_*` config) |
| `INTERNAL_API_SECRET` | ✓ | Must match the API's copy — authenticates this app's own internal routes |
| `GITHUB_APP_ID` / `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET` / `GITHUB_APP_PRIVATE_KEY` / `NEXT_PUBLIC_GITHUB_APP_NAME` | ✓ | GitHub App credentials — see [Setting up a GitHub App](#setting-up-a-github-app) below |
| `NEXT_PUBLIC_GITLAB_APP_NAME` / `NEXT_PUBLIC_GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` | ✓ | GitLab OAuth app credentials — see [Setting up a GitLab App](#setting-up-a-gitlab-app) below |
| `AI_GATEWAY_API_KEY` | optional | Server-side fallback key for the editor's AI assistant, used when a user hasn't set their own (see note below) |
| `NEXT_PUBLIC_DASHBOARD_HOME` | optional | Where `/dashboard` redirects (defaults to `/dashboard/account`) |
| `NEXT_PUBLIC_IS_DEMO` / `NEXT_PUBLIC_DEMO_EMAIL` / `NEXT_PUBLIC_DEMO_PASSWORD` | optional | Enables a read-only demo login (pairs with the API's `auth-demo.ts`) |

### Branding

A fork or self-hosted instance can override the upstream Sitepins name and links without editing code — all optional, all with sensible defaults (see `src/lib/brand.ts`):

| Variable | Default |
| --- | --- |
| `NEXT_PUBLIC_BRAND_NAME` | `Sitepins` |
| `NEXT_PUBLIC_BRAND_URL` | `https://sitepins.com` |
| `NEXT_PUBLIC_SUPPORT_URL` | `<BRAND_URL>/contact` |
| `NEXT_PUBLIC_UPDATES_URL` | `https://updates.sitepins.com` |
| `NEXT_PUBLIC_COMMUNITY_URL` | `https://discord.gg/KrpvHfqcNA` |
| `NEXT_PUBLIC_GIT_COMMIT_EMAIL_DOMAIN` | host of `BRAND_URL` |

Note: the AI writing assistant primarily uses a per-user key — each user pastes their own key at `/dashboard/sitepins-ai`, stored server-side per account. `AI_GATEWAY_API_KEY` is only a fallback when a user hasn't set one.

## Scripts

```bash
pnpm dev      # next dev
pnpm build    # next build
pnpm start    # next start
pnpm lint     # eslint src/**/*.{js,jsx,ts,tsx}
pnpm format   # prettier -w ./src
```

## Setting up a GitHub App

Sitepins commits to your repos on your behalf, so it authenticates as a [GitHub App](https://github.com/settings/apps) rather than a plain OAuth app. This is purely an app-side concern — the backend never touches these credentials. Create one at **Settings → Developer settings → GitHub Apps → New GitHub App**:

1. **GitHub App name** — anything unique on GitHub (e.g. `your-name-sitepins`). This exact name goes into `NEXT_PUBLIC_GITHUB_APP_NAME`; the install button links to `github.com/apps/<name>/installations/select_target`, so a typo here breaks the install flow silently.
2. **Homepage URL** — your app's base URL (`http://localhost:3000` for local dev).
3. **Callback URL** — `<APP_URL>/github-installed`, and check **"Request user authorization (OAuth) during installation"**. Without this box checked, GitHub never sends the `code` param and login silently fails.
4. **Setup URL (optional)** — same as the callback URL, `<APP_URL>/github-installed`, with **"Redirect on update"** checked so re-installs/permission changes land on the same page.
5. **Webhook** — uncheck **Active**. Sitepins doesn't listen for webhook events, so leaving it on just means GitHub retries deliveries against an endpoint that doesn't exist.
6. **Repository permissions** — set these to the access level shown (anything narrower and API calls in `src/app/api/auth/github/route.ts` start failing with 403s):

   | Permission | Access |
   | --- | --- |
   | Actions | Read and write |
   | Administration | Read and write |
   | Attestations | Read and write |
   | Checks | Read and write |
   | Codespaces | Read and write |
   | Codespaces lifecycle admin | Read and write |
   | Commit statuses | Read and write |
   | Contents | Read and write |
   | Metadata | Read-only (mandatory) |
   | Pull requests | Read and write |
   | Repository advisories | Read and write |
   | Repository custom properties | Read and write |
   | Security events | Read and write |

7. **Where can this GitHub App be installed?** — "Any account" if you want your users to install it on their own orgs/repos (the normal case); "Only on this account" if you're self-hosting for a single org.

After creating the app:

- Note the **App ID** and **Client ID** shown on the app's settings page.
- Click **Generate a new client secret** and copy it immediately — it's shown once.
- Scroll to **Private keys** → **Generate a private key**. This downloads a `.pem` file.

Fill `.env`:

```bash
GITHUB_APP_ID="<App ID>"
GITHUB_APP_CLIENT_ID="<Client ID>"
GITHUB_APP_CLIENT_SECRET="<Client secret>"
GITHUB_APP_PRIVATE_KEY="<paste the full .pem contents, including the BEGIN/END lines>"
NEXT_PUBLIC_GITHUB_APP_NAME="<GitHub App name from step 1>"
```

`GITHUB_APP_PRIVATE_KEY` is used as-is (no file path, no transform) — quote it so the `.env` loader keeps the embedded newlines intact.

Finally, install the app on your own account/org from its public page (`github.com/apps/<name>`) so there's at least one installation to authenticate against.

## Setting up a GitLab App

Unlike GitHub, GitLab access uses a plain OAuth application, not a GitLab "App" — again, app-side only, nothing the backend needs. Create one at **gitlab.com → your avatar → Edit profile → Applications** (or **Group → Settings → Applications** if you'd rather scope it to an org):

1. **Name** — anything; only cosmetic, used for `NEXT_PUBLIC_GITLAB_APP_NAME` (a display label — it's not part of the OAuth URL, unlike the GitHub App name).
2. **Redirect URI** — exactly `<APP_URL>/gitlab-installed` (e.g. `http://localhost:3000/gitlab-installed`). This must match what `src/app/api/auth/gitlab/route.ts` sends during token exchange, or GitLab will reject the callback.
3. **Confidential** — check this. The client secret is used server-side in the token exchange, never in the browser.
4. **Scopes** — check exactly `api` and `read_user`. Nothing else is requested by the app, and GitLab will reject a token request for scopes the app wasn't granted.

After saving, GitLab shows the **Application ID** and **Secret** once. Fill `.env`:

```bash
NEXT_PUBLIC_GITLAB_APP_NAME="<name from step 1>"
NEXT_PUBLIC_GITLAB_CLIENT_ID="<Application ID>"
GITLAB_CLIENT_SECRET="<Secret>"
```

## Notes for contributors

- Path aliases (`@/components/*`, `@/partials/*`, `@/helpers/*`, `@/editor/*`, `@/*`) are defined in `tsconfig.json` — check there before adding a new one.
- Tailwind has no `tailwind.config.js`; theme tokens, breakpoints, and custom variants all live in `src/styles/*.css`. `.gitignore` must never list any file under `src/` that's actually shipped — Tailwind's source scanner silently drops classes from gitignored files.
- The `github-installed` / `gitlab-installed` pages are opened in a popup by `useGitAuth`, ping the corresponding `/api/auth/*` route once, then `window.close()` themselves.
