---
name: sitepins-architecture
description: Architecture & Core Patterns
---

Sitepins is a Git-driven CMS platform built with Next.js 16. It supports GitHub and GitLab workflows, locale-aware UI via next-intl, and collaborative content editing with PlateJS.

## Architecture & Core Patterns

### State Management Strategy
- **RTK Query for API**: API integrations are split by provider with custom base queries in [`../../src/redux/features/api-slice.ts`](../../src/redux/features/api-slice.ts), [`../../src/redux/features/github/github-api.ts`](../../src/redux/features/github/github-api.ts), and [`../../src/redux/features/gitlab/gitlab-api.ts`](../../src/redux/features/gitlab/gitlab-api.ts).
  - Backend API: Axios base query (`withCredentials: true`) to backend `API_URL`.
  - GitHub API: Octokit-based base query, token from Redux state (with refresh support).
  - GitLab API: fetch-based base query with Bearer auth (with refresh support).
  - Cache invalidation is provider-specific via explicit RTK Query tag types.
- **Redux Toolkit slices**: UI/config state is composed in [`../../src/redux/store.ts`](../../src/redux/store.ts).
  - `configSlice`: Project config, Git state (token, userName, repo), raw/rich editor mode
  - `mediaSlice`: Media library state, image selections
  - `packageSlice`: Subscription and billing state
- **Server Actions**: File operations and backend mutations live in [`../../src/actions/`](../../src/actions/) and must start with `"use server"`.
  - Pattern: Export async functions that call `fetchApi()` or `mutate()` helpers from [`../../src/actions/utils/index.ts`](../../src/actions/utils/index.ts).
  - Server actions include auth headers via `authCookies()` from [`../../src/lib/auth/auth-server.ts`](../../src/lib/auth/auth-server.ts).

### i18n & Routing (next-intl)
- **Core i18n files**:
  - Routing config: [`../../src/lib/i18n/routing.ts`](../../src/lib/i18n/routing.ts)
  - Request config / namespace loading: [`../../src/lib/i18n/request.ts`](../../src/lib/i18n/request.ts)
  - Locale-aware navigation helpers: [`../../src/lib/i18n/navigation.ts`](../../src/lib/i18n/navigation.ts)
- **Locale source of truth**: Locales are derived from [`../../src/config/languages.json`](../../src/config/languages.json) via [`../../src/lib/utils/localized-text.ts`](../../src/lib/utils/localized-text.ts).
- **Locale prefix behavior**: `localePrefix: "never"` is enabled, so user-facing URLs stay unprefixed while locale is still resolved by next-intl.
- **Route tree**: App routes are organized under [`../../src/app/[locale]/`](../../src/app/[locale]/), including locale-level `layout.tsx`, `loading.tsx`, and `error.tsx`.
- **Messages**: `request.ts` dynamically imports namespace JSON files from [`../../src/i18n/{locale}/`](../../src/i18n/en/).
- **Navigation rule**: Prefer imports from `@/lib/i18n/navigation` for locale-aware link/router helpers when needed.

### Authentication Flow
- **Better Auth** powers authentication (client: [`../../src/lib/auth/auth-client.ts`](../../src/lib/auth/auth-client.ts)).
- **Proxy middleware**: [`../../src/proxy.ts`](../../src/proxy.ts) composes next-intl middleware with auth and onboarding guards.
  - Public routes: `/login`, `/register`, `/forgot-password`, `/templates`
  - Auth routes (redirect away if already signed in): `/login`, `/register`, `/forgot-password`
  - Protected routes redirect to `/login?from=...` when unauthenticated
  - Safe redirect validation prevents open redirects
  - Matcher excludes internals and probes: `api`, `_next/static`, `_next/image`, `images`, `favicon.ico`, `.well-known`
- **Email OTP plugin** for passwordless auth alongside traditional credentials
- **Session type**: Export from auth-client as `Session` for consistent typing

### Path Aliases (tsconfig.json)
```typescript
"@/components/*": ["./src/layouts/components/*"]
"@/partials/*": ["./src/layouts/partials/*"]
"@/helpers/*": ["./src/layouts/helpers/*"]
"@/editor/*": ["./src/layouts/editor/*"]
"@/*": ["./src/*"]
```
**Critical**: Components live in `src/layouts/components/`, not `src/components/`. UI components are in `@/components/ui/` following shadcn/ui pattern.

### PlateJS Rich Text Editor
- **Dual mode editing**: Rich editor ([`../../src/layouts/editor/rich-editor.tsx`](../../src/layouts/editor/rich-editor.tsx)) and raw markdown editor ([`../../src/layouts/editor/raw-editor.tsx`](../../src/layouts/editor/raw-editor.tsx)).
- **Plugin architecture**: [`../../src/layouts/editor/plugins/editor-kit.tsx`](../../src/layouts/editor/plugins/editor-kit.tsx) includes AI, markdown, block/inline nodes, and custom snippets.
- **Markdown serialization**: Uses `MarkdownPlugin` API for bidirectional conversion
  - `markdown.deserialize(markdownContent)` → PlateJS value
  - `markdown.serialize(plateValue)` → markdown string
- **Custom snippets**: Snippet kits live under [`../../src/layouts/editor/snippets`](../../src/layouts/editor/snippets) and are wired through kits such as [`ShortcodeKit`](../../src/layouts/editor/snippets/common/snippet-plugin.tsx), [`HtmlBlockKit/HtmlInlineKit`](../../src/layouts/editor/snippets/html/html-plugin.tsx), and [`JsxBlockKit/JsxInlineKit`](../../src/layouts/editor/snippets/jsx/jsx-plugin.tsx).
  - Shared UI/behavior comes from `BaseSnippetBlock`, `SnippetControls`, and `EditableTagLine`; extend these for consistency.
  - Inline kits intercept `Enter` (see JSX/html kits) to insert clean paragraphs after snippets; block kits often add custom `rules.break` configs to keep cursor flow predictable.
- Self-closing JSX snippets parse and mirror attributes into Plate nodes through [`parseJsxString`](../../src/layouts/editor/snippets/jsx/jsx-parser.ts), so keep `element.content` synchronized when editing snippet fields.
- **Hugo/shortcode support**: `SnippetElement` toggles block vs inline renderers using `element.isBlock` metadata.
- **Error handling**: Falls back to raw mode on parse errors with toast notification

### GitHub Integration Patterns
- **Git operations**: Core utilities live in [`../../src/actions/utils/index.ts`](../../src/actions/utils/index.ts).
  - `commitFilesToGit()`: Multi-file commits using Git Tree API for atomic operations
  - Batching with `chunk()` and concurrency control via `runWithConcurrency()`
  - Deduplication with `dedupeFiles()` to prevent conflicts
  - Retry logic with exponential backoff using `retry()` helper
- **GitHub App naming**: Uses env-backed constants in [`../../src/lib/constant.ts`](../../src/lib/constant.ts) (`GITHUB_APP_NAME`).
- **Token management**: GitHub token is stored in Redux config state and consumed by `octokitBaseQuery`.

### GitLab Integration Patterns
- **GitLab API**: Managed via RTK Query in [`../../src/redux/features/gitlab/gitlab-api.ts`](../../src/redux/features/gitlab/gitlab-api.ts).
  - Uses `gitlabBaseQuery` with `Bearer` token authentication.
  - **Project IDs**: GitLab requires project paths/IDs to be URL-encoded (e.g., "namespace/repo" -> "namespace%2Frepo"). Use `encodeProjectPath()` helper.
- **Commit operations**: See [`../../src/redux/features/gitlab/gitlab-commit-api.ts`](../../src/redux/features/gitlab/gitlab-commit-api.ts).
  - Uses GitLab Commits API with an array of `actions` (`create`, `update`, `delete`, `move`).
  - Binary files (images) must be `base64` encoded with `encoding: "base64"`.
- **Token Refresh**: Automatic OAuth2 token refresh logic is built into the base query, triggered when tokens are near expiry.
- **Shared Utilities**: Common Git helpers live in [`../../src/lib/utils/git-utils.ts`](../../src/lib/utils/git-utils.ts).

### Form Validation & Server Actions
- **Zod schemas**: Validation lives in [`../../src/lib/validate.ts`](../../src/lib/validate.ts).
  - Password requirements: 8-32 chars, letter, digit, special character
  - Export schemas for login, register, project config, etc.
- **Error handling pattern**: Server actions return `TSubmitFormState<T>` type
  ```typescript
  { data, error: [{path, message}], message, isError, isSuccess, statusCode }
  ```
- **Form error component**: [`../../src/layouts/components/form-error.tsx`](../../src/layouts/components/form-error.tsx) handles field and form-level errors.

### Permission System
- **Role-based**: See [`../../src/lib/roles.ts`](../../src/lib/roles.ts).
  - Roles: `owner`, `admin`, `editor`
  - Permissions: `manage_org`, `delete_org`, `manage_members`, `view_members`, `manage_projects`, `view_projects`
  - `ROLE_PERMISSIONS` maps roles to permission arrays
- **Hook**: `usePermission(ENUM_PERMISSIONS.MANAGE_PROJECTS)` in components
  - Conditionally render UI based on permission checks
  - Example: Settings tabs only visible to users with `MANAGE_PROJECTS`

## Development Workflows

### Running the Application
```bash
pnpm dev          # Start development server
pnpm build        # Production build
pnpm start        # Run production build
```

### Environment & Setup
- Use Node.js 20+ and copy `.env.example` → `.env` before running scripts.
- Package manager is `pnpm` (see [`../../package.json`](../../package.json) `packageManager`).
- Required providers: GitHub/GitLab OAuth and S3-compatible media storage (`NEXT_PUBLIC_BUCKET_URL`) from [`../../src/lib/constant.ts`](../../src/lib/constant.ts).
- When onboarding, users must install the Sitepins GitHub App from the dashboard (“Add New Site” flow) so Octokit requests have valid installation permissions.

### Key Configuration Files
- **Global app config**: [`../../src/config/global.json`](../../src/config/global.json)
  - `frameworks` maps config file patterns for framework detection
  - `allowExtensions` controls editable/uploadable file extensions
- **Special folders**: `.sitepins/schema` for frontmatter schemas, `.sitepins/snippet` for reusable snippets
- **Image remote patterns**: [`../../next.config.mjs`](../../next.config.mjs) lists allowed image domains.

### API Endpoint Pattern
- Backend API URL comes from `NEXT_PUBLIC_BACKEND_URL` (`API_URL`) in [`../../src/lib/constant.ts`](../../src/lib/constant.ts).
- All requests auto-inject auth cookies via `authCookies()` helper
- Error structure: `{ message, errorMessage?: [{path, message}] }`
- Type guards: `isApiError()` and `isSerializedError()` in [`../../src/redux/features/api-slice.ts`](../../src/redux/features/api-slice.ts).

### Route Structure
- **Locale-segmented app routes**: Organized under [`../../src/app/[locale]/`](../../src/app/[locale]/).
- **Dynamic routes**: `/[locale]/[orgId]/[projectId]` for project-scoped pages.
- **Route groups**: `(auth)` under locale segment for auth pages.
- **API routes**: `/api/auth/`, `/api/ai/`, `/api/paddlehooks/`, `/api/mailjethooks/`, etc.
- **Middleware protection**: All routes require auth except public routes and Next.js internals

## Project-Specific Conventions

### Component Patterns
- **Client components**: Use `"use client"` directive, common for interactive UI
- **Server components**: Default for layouts and pages, fetch data directly
- **Layouts hierarchy**: Root layout → auth/org layout → project layout
- **Loading states**: `loading.tsx` files for Suspense boundaries
- **Error boundaries**: `error.tsx` files for error handling

### Styling
- **Tailwind CSS**: Main styles in [`../../src/styles/main.css`](../../src/styles/main.css)
- **CSS modules**: Separate files for base, components, navigation, theme, utilities
- **Dark mode**: `next-themes` provider in root layout, class-based theme switching
- **Size indicator**: `TwSizeIndicator` helper shows breakpoints in dev (see [`../../src/layouts/helpers/tw-size-indicator.tsx`](../../src/layouts/helpers/tw-size-indicator.tsx))

### Content Management
- **Content folder**: Configurable per project (default: `src/content`)
- **Media root**: Configurable per project (default: `public/images`)
- **Site config**: Project-specific theme/menu JSON files (default: `src/config/theme.json`)
- **Arrangements**: Virtual sidebar structure via folder/file/heading arrangements (see project dashboard)
- **Media workflow**: `ImageProvider` caches uploads for previews ([`../../src/contexts/image-context.tsx`](../../src/contexts/image-context.tsx)) and `ImageUpload` enforces `AcceptImages` + `MAX_SIZE` via Dropzone ([`../../src/layouts/components/image-upload.tsx`](../../src/layouts/components/image-upload.tsx)).

### AI Integration
- **Multiple AI providers**: Anthropic, Google, OpenAI, XAI via `@ai-sdk/*` packages
- **AI features**: Content generation, SEO suggestions, Copilot plugin in editor
- **AI API route**: [`../../src/app/api/ai/`](../../src/app/api/ai/) handles streaming responses.
- **Per-user settings**: Locale dashboard page [`../../src/app/[locale]/dashboard/sitepins-ai/page.tsx`](../../src/app/[locale]/dashboard/sitepins-ai/page.tsx) stores API keys + preferred model/provider configuration.

### Billing & Subscriptions
- **Paddle integration**: Payment processing with `@paddle/paddle-js` and `@paddle/paddle-node-sdk`
- **Webhook handling**: [`../../src/app/api/paddlehooks/`](../../src/app/api/paddlehooks/) for subscription events.
- **Package API**: RTK Query endpoints in [`../../src/redux/features/order/order-api.ts`](../../src/redux/features/order/order-api.ts).

## Agent Operating Playbook

### Start Here (Fast Map)
- **Root app shell**: [`../../src/app/layout.tsx`](../../src/app/layout.tsx)
- **Global provider stack**: [`../../src/layouts/helpers/app-providers.tsx`](../../src/layouts/helpers/app-providers.tsx)
- **Locale layout boundary**: [`../../src/app/[locale]/layout.tsx`](../../src/app/[locale]/layout.tsx)
- **Route protection and onboarding redirects**: [`../../src/proxy.ts`](../../src/proxy.ts)
- **App-wide config assembly**: [`../../src/lib/config.ts`](../../src/lib/config.ts)
- **Constants/env contract**: [`../../src/lib/constant.ts`](../../src/lib/constant.ts)

### If Task Is X, Read Y First
- **Auth/login/session bugs**: [`../../src/lib/auth/auth-client.ts`](../../src/lib/auth/auth-client.ts), [`../../src/lib/auth/auth-server.ts`](../../src/lib/auth/auth-server.ts), [`../../src/proxy.ts`](../../src/proxy.ts)
- **Locale/i18n bugs or untranslated UI**: [`../../src/lib/i18n/request.ts`](../../src/lib/i18n/request.ts), [`../../src/lib/i18n/routing.ts`](../../src/lib/i18n/routing.ts), [`../../src/i18n/en/`](../../src/i18n/en/)
- **Navigation path/redirect bugs**: [`../../src/lib/i18n/navigation.ts`](../../src/lib/i18n/navigation.ts), [`../../src/proxy.ts`](../../src/proxy.ts)
- **Redux state not updating**: [`../../src/redux/store.ts`](../../src/redux/store.ts), [`../../src/redux/features/config/slice.ts`](../../src/redux/features/config/slice.ts)
- **Backend API errors**: [`../../src/redux/features/api-slice.ts`](../../src/redux/features/api-slice.ts), [`../../src/actions/utils/index.ts`](../../src/actions/utils/index.ts)
- **GitHub repository/commit issues**: [`../../src/redux/features/github/github-api.ts`](../../src/redux/features/github/github-api.ts), [`../../src/redux/features/github/github-commit-api.ts`](../../src/redux/features/github/github-commit-api.ts), [`../../src/actions/utils/index.ts`](../../src/actions/utils/index.ts)
- **GitLab repository/commit issues**: [`../../src/redux/features/gitlab/gitlab-api.ts`](../../src/redux/features/gitlab/gitlab-api.ts), [`../../src/redux/features/gitlab/gitlab-commit-api.ts`](../../src/redux/features/gitlab/gitlab-commit-api.ts)
- **Editor/snippet behavior bugs**: [`../../src/layouts/editor/plugins/editor-kit.tsx`](../../src/layouts/editor/plugins/editor-kit.tsx), [`../../src/layouts/editor/snippets/`](../../src/layouts/editor/snippets/)
- **Media upload limits/types**: [`../../src/lib/constant.ts`](../../src/lib/constant.ts), [`../../src/layouts/components/image-upload.tsx`](../../src/layouts/components/image-upload.tsx), [`../../src/contexts/image-context.tsx`](../../src/contexts/image-context.tsx)
- **Plans/billing bugs**: [`../../src/redux/features/order/order-api.ts`](../../src/redux/features/order/order-api.ts), [`../../src/app/api/paddlehooks/`](../../src/app/api/paddlehooks/)

### Non-Negotiable Invariants
- Keep locale behavior compatible with next-intl routing in [`../../src/lib/i18n/routing.ts`](../../src/lib/i18n/routing.ts).
- Do not bypass middleware auth/onboarding semantics in [`../../src/proxy.ts`](../../src/proxy.ts) when changing route flow.
- Keep server-side mutations inside `src/actions` with `"use server"` and shared helpers from [`../../src/actions/utils/index.ts`](../../src/actions/utils/index.ts).
- Preserve provider-specific RTK Query boundaries (backend vs GitHub vs GitLab) rather than mixing transport logic.
- Do not introduce imports from `src/components`; continue using aliases mapped to `src/layouts/components`.
- When adding user-facing text, update i18n namespaces instead of hardcoding strings.

### Verification Before Finishing
- Run `pnpm lint` for static checks.
- Run `pnpm build` after non-trivial route, type, i18n, or config changes.
- For auth/route updates, manually verify: unauthenticated redirect, authenticated auth-route redirect, onboarding redirect behavior.
- For i18n updates, verify at least two locales and one fallback path.
- For Git provider updates, verify both GitHub and GitLab paths when shared helpers are changed.

### High-Risk Change Zones
- [`../../src/proxy.ts`](../../src/proxy.ts): Redirect loops and auth bypass risk.
- [`../../src/lib/i18n/request.ts`](../../src/lib/i18n/request.ts): Missing namespace imports can break locale rendering.
- [`../../src/actions/utils/index.ts`](../../src/actions/utils/index.ts): Commit/upload logic impacts core content writes.
- [`../../src/redux/features/api-slice.ts`](../../src/redux/features/api-slice.ts): Error shape changes can break many UI handlers.
- [`../../src/redux/store.ts`](../../src/redux/store.ts): Reducer/middleware wiring affects entire app state.

### Useful Commands
```bash
pnpm dev
pnpm lint
pnpm build
pnpm start
```

## Domain Ownership Map (Code-Level)

- **Routing + auth gates**: [`../../src/proxy.ts`](../../src/proxy.ts), [`../../src/lib/auth/`](../../src/lib/auth/)
- **Locale/i18n**: [`../../src/lib/i18n/`](../../src/lib/i18n/), [`../../src/i18n/`](../../src/i18n/), [`../../src/config/languages.json`](../../src/config/languages.json)
- **Global app composition/providers**: [`../../src/app/layout.tsx`](../../src/app/layout.tsx), [`../../src/layouts/helpers/app-providers.tsx`](../../src/layouts/helpers/app-providers.tsx)
- **State + API access layer**: [`../../src/redux/store.ts`](../../src/redux/store.ts), [`../../src/redux/features/`](../../src/redux/features/)
- **Server mutations + git write paths**: [`../../src/actions/`](../../src/actions/), [`../../src/actions/utils/index.ts`](../../src/actions/utils/index.ts)
- **Editor + snippets**: [`../../src/layouts/editor/`](../../src/layouts/editor/)
- **Media + uploads**: [`../../src/contexts/image-context.tsx`](../../src/contexts/image-context.tsx), [`../../src/layouts/components/image-upload.tsx`](../../src/layouts/components/image-upload.tsx)
- **Billing + plan state**: [`../../src/app/api/paddlehooks/`](../../src/app/api/paddlehooks/), [`../../src/redux/features/order/`](../../src/redux/features/order/), [`../../src/lib/paddle/`](../../src/lib/paddle/)

## Environment Matrix (Required vs Optional)

### Core Runtime
- `NEXT_PUBLIC_BACKEND_URL` (required): backend API base URL for RTK/server actions.
- `NEXT_PUBLIC_BUCKET_URL` (required for media): public bucket base for uploaded media.
- `NEXT_PUBLIC_IS_DEMO` (optional): enables read-only demo guardrails.
- `NEXT_PUBLIC_DEMO_EMAIL`, `NEXT_PUBLIC_DEMO_PASSWORD` (optional): demo credentials.

### OAuth / Git Providers
- `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY` (required for GitHub install/auth flow).
- `NEXT_PUBLIC_GITHUB_APP_NAME` (required for install URL UX; defaults to `Sitepins` if omitted).
- `NEXT_PUBLIC_GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET` (required for GitLab OAuth flow).
- `NEXT_PUBLIC_GITLAB_APP_NAME` (required for UI naming; defaults to `Sitepins` if omitted).

### Billing / Paddle
- `PADDLE_API_KEY` (required server-side by Paddle SDK in `src/lib/paddle`).
- `PADDLE_NOTIFICATION_WEBHOOK_SECRET` (required for webhook verification).
- `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` (required for client checkout).
- `NEXT_PUBLIC_PADDLE_ENV` (required for sandbox/production behavior in billing services).

### Analytics / Integrations
- `NEXT_PUBLIC_POSTHOG_API_KEY` (required to enable PostHog client init).
- `NEXT_PUBLIC_POSTHOG_HOST` (optional; defaults to `https://app.posthog.com`).
- `NEXT_PUBLIC_MIXPANEL_TOKEN` (optional; enables Mixpanel tracking).
- `PARTNERO_API_KEY`, `PARTNERO_WEBHOOK_KEY` (required for Partnero endpoints).

### Security / Tokens
- `PURCHASE_TOKEN_SECRET` (required in production; fallback value exists for development only).
- `AI_GATEWAY_API_KEY` (optional fallback for AI route when user key is missing).

## API Surface Index (Route -> Consumer)

- `/api/auth/github`, `/api/auth/github/refresh`: GitHub OAuth + token refresh; consumed by GitHub RTK base query and auth flows.
- `/api/auth/gitlab`, `/api/auth/gitlab/refresh`: GitLab OAuth + token refresh; consumed by GitLab RTK base query and auth flows.
- `/api/ai/command`, `/api/ai/copilot`: AI generation/assistant endpoints; consumed by editor/AI UI hooks.
- `/api/paddlehooks`: Paddle subscription events; updates billing state.
- `/api/purchase-token`: purchase token generation/validation flow.
- `/api/templates`, `/api/download-theme`: template/theme fetch and import flows.
- `/api/partnero`, `/api/partnerowebhooks`: affiliate sync and webhook ingestion.
- `/api/mailjethooks`, `/api/brevohooks`: email delivery/provider webhooks.
- `/api/health`: health probe endpoint.

Primary backend API abstractions:
- REST backend via [`../../src/redux/features/api-slice.ts`](../../src/redux/features/api-slice.ts) and [`../../src/actions/utils/index.ts`](../../src/actions/utils/index.ts).
- GitHub provider API via [`../../src/redux/features/github/`](../../src/redux/features/github/).
- GitLab provider API via [`../../src/redux/features/gitlab/`](../../src/redux/features/gitlab/).

## Smoke Test Checklist (Post-Change)

### Auth + Routing
- Logged-out request to protected page redirects to `/login?from=...`.
- Logged-in request to auth routes (`/login`, `/register`) redirects away.
- Onboarding redirect/cookie flow remains intact for new users.

### i18n
- Validate UI in at least two locales from [`../../src/config/languages.json`](../../src/config/languages.json).
- Confirm next-intl namespace loads do not throw on modified pages.
- Confirm locale fallback behavior still works for unknown/unsupported locale values.

### Editor + Content
- Rich editor opens, edits, and serializes markdown.
- Raw mode toggle works without losing content.
- Snippet insertion/editing still preserves node content integrity.

### Git Providers
- GitHub branch/content read still works with valid token.
- GitLab branch/content read still works with valid token.
- One commit flow per provider succeeds after shared git helper changes.

### Billing + Media
- Paddle pricing/checkout surfaces load without env/runtime errors.
- Media upload respects type + size limits (`AcceptImages`, `MAX_SIZE`, `MAX_VIDEO_SIZE`).

## Change Impact Matrix

- **Edit in `src/proxy.ts`**
  - Potential impact: auth bypass, redirect loops, onboarding lockout.
  - Must verify: auth route redirects + protected route guard + onboarding branch.
- **Edit in `src/lib/i18n/request.ts` or `src/lib/i18n/routing.ts`**
  - Potential impact: untranslated pages, runtime import failures, wrong locale resolution.
  - Must verify: at least two locales + fallback path + navigation helpers.
- **Edit in `src/actions/utils/index.ts`**
  - Potential impact: content write failures, partial commits, git API regressions.
  - Must verify: template import and one real commit flow.
- **Edit in `src/redux/features/api-slice.ts`**
  - Potential impact: global data fetching/error handling regressions.
  - Must verify: one successful query + one handled error scenario.
- **Edit in `src/redux/store.ts`**
  - Potential impact: app-wide state breakage.
  - Must verify: app boots + RTK hooks resolve + middleware still active.

## Documentation Freshness Rules

- Whenever changing any of these files, update this SKILL in the same PR:
  - [`../../src/proxy.ts`](../../src/proxy.ts)
  - [`../../src/lib/i18n/routing.ts`](../../src/lib/i18n/routing.ts)
  - [`../../src/lib/i18n/request.ts`](../../src/lib/i18n/request.ts)
  - [`../../src/redux/store.ts`](../../src/redux/store.ts)
  - [`../../src/actions/utils/index.ts`](../../src/actions/utils/index.ts)
  - [`../../src/lib/constant.ts`](../../src/lib/constant.ts)
  - [`../../src/config/global.json`](../../src/config/global.json)
- If you add/remove env vars, update:
  - `.env.example`
  - Environment Matrix section in this file
  - Any related onboarding/setup documentation
- If you add an API route under `src/app/api`, also update API Surface Index in this file.

## Common Pitfalls

- **Don't use `src/components/`**: Components live in `src/layouts/components/`, use `@/components/*` alias
- **Server actions require `"use server"`**: All files in `src/actions/` must have directive at top
- **Git operations are atomic**: Use `commitFilesToGit()` for multi-file changes, not individual API calls
- **RTK Query cache tags**: Always specify appropriate tags for mutations to invalidate related queries
- **Markdown editor mode**: Check `config.rawMode` in Redux before rendering rich/raw editor
- **Permission checks**: Always verify permissions before showing destructive actions or settings
- **Auth cookies**: Server-side API calls need `await authCookies()` to include session headers
- **i18n navigation**: For locale-aware behavior, prefer helpers from `@/lib/i18n/navigation` over ad-hoc path handling
- **Config source**: Use `src/config/global.json` (not legacy `config.json`) for frameworks/extensions defaults
