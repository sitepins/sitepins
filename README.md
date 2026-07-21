<div align="center">

# Sitepins

**Open-source, Git-based headless CMS with a visual editor for Astro, Next.js, and Hugo.**

Connect your GitHub or GitLab repo and start editing. No schema setup. No manual config. Every change is a real Git commit, so your repo stays the single source of truth.

[**Live Demo**](https://demo.sitepins.com) · [**Documentation**](https://docs.sitepins.com) · [**Website**](https://sitepins.com) · [**Start for Free**](https://sitepins.com/pricing?ref=github)

![License](https://img.shields.io/badge/license-Elastic%202.0-2b7489)
![Stars](https://img.shields.io/github/stars/sitepins/sitepins?style=social)
![TypeScript](https://img.shields.io/badge/TypeScript-99%25-3178c6)

![Sitepins Git-based headless CMS dashboard](https://sitepins.com/images/sitepins-dark.png)

</div>

## Why Sitepins

Static sites are fast, secure, and cheap to host. Handing one to a non-technical client or teammate is not.

They should not need Markdown, Git, or a code editor to fix a heading or swap an image. Right now they ping you, and you become the bottleneck for every small change.

Sitepins puts a visual editor on top of your existing repo. Your client edits content. Sitepins commits it back to Git. You keep your workflow, your pipeline, and your full version history. Nobody touches code who should not have to.

## Who it's for

- **Agencies and freelancers** handing static sites to clients who cannot use code.
- **Dev teams** who want marketing and content people to edit without a pull request for every typo.
- **Solo developers** who want a clean editing UI for their own Astro, Next.js, or Hugo site.

If your content lives in Markdown files in a Git repo, Sitepins works for you.

## How it works

1. **Connect your repo.** Authorize Sitepins on GitHub or GitLab and pick a repository.
2. **Edit visually.** Sitepins reads your content files and renders a visual editor. No schema or config to write first.
3. **Commit to Git.** Every edit becomes a normal commit in your repo. Your site rebuilds through your existing pipeline. Nothing leaves your Git history.

Your repo is always the single source of truth. Sitepins never locks your content into a proprietary database.

## Features

- **Visual editor.** Edit Markdown, MDX, and structured content without touching code.
- **Git-native versioning.** Every change is tracked and reversible. You always know who changed what.
- **Live preview.** See edits in a sandbox preview before you publish. No rebuild required.
- **Media library.** Drag, drop, and reuse images. Backed by any S3-compatible bucket.
- **Works with your stack.** Astro, Next.js, Hugo, Nuxt, Svelte, Eleventy, and Jekyll.
- **Multiple file formats.** Markdown, MDX, JSON, YAML, and TOML.
- **Shortcodes.** Manage shortcodes and custom content blocks for consistent content.
- **Nested collections.** Keep large sites organized with a clean content hierarchy.
- **Roles and permissions.** Control access per user. Live presence shows who is editing what.
- **12 native languages.** English, Chinese, Japanese, German, French, Spanish, Portuguese, Russian, Korean, Indonesian, Vietnamese, and Bengali.
- **AI assistant.** Bring your own API key (OpenAI, Gemini, Claude, or Grok) to draft and rewrite content inside the editor.

## Supported static site generators

Astro · Next.js · Hugo · Nuxt · Svelte · Eleventy · Jekyll

## Get started

### Sitepins Cloud (fastest)

Skip the setup. Connect a repo and start editing in minutes.

[**Start for free**](https://sitepins.com/pricing?ref=github)

### Self-host

Run the whole thing yourself. The self-hosted build has no plans, billing, or usage limits. Every feature is unlocked.

**Requirements:** Node.js 22+, pnpm 11+, and a MongoDB instance (local or [Atlas](https://www.mongodb.com/atlas) free tier).

```bash
pnpm install

# configure both apps
cp api/.env.example api/.env
cp app/.env.example app/.env
```

Fill in each `.env`. See [app/README.md](https://github.com/sitepins/sitepins/blob/main/app/README.md#environment-variables) and [api/README.md](https://github.com/sitepins/sitepins/blob/main/api/README.md#environment-variables) for what every variable does and how to obtain it. The one shared step is media storage, covered below.

```bash
# run backend and frontend together
pnpm dev

# or separately, in two terminals
pnpm dev:api
pnpm dev:app
```

#### Run with Docker

A `docker-compose.yml` brings up MongoDB, the API, and the web app together.

```bash
cp api/.env.example api/.env
cp app/.env.example app/.env
docker compose up --build
```

Web runs on `http://localhost:3000`. API runs on `http://localhost:4000` with a health check at `/healthz`. MongoDB runs in the `mongo` service, so you can leave `MONGO_URI` unset to use it.

#### Media storage (S3-compatible)

The media library needs an S3-compatible bucket. AWS S3, Cloudflare R2, MinIO, Backblaze B2, and DigitalOcean Spaces all work.

1. Create a bucket and generate an access key and secret.
2. Fill `api/.env`:

```bash
S3_ENDPOINT="https://s3.us-east-1.amazonaws.com"   # provider endpoint
S3_REGION="us-east-1"                              # "auto" for R2
S3_ACCESS_KEY="<access key>"
S3_SECRET_KEY="<secret key>"
S3_BUCKET_NAME="<your bucket name>"
S3_FORCE_PATH_STYLE=false                           # true for MinIO
```

3. Fill `app/.env` with the bucket's public base URL:

```bash
NEXT_PUBLIC_BUCKET_URL="https://<bucket>.s3.<region>.amazonaws.com"
```

4. In your bucket's CORS settings, allow your app origin (`http://localhost:3000` in dev) so uploads are not blocked.

> Existing DigitalOcean Spaces setups keep working. The legacy `DOS_PUBLIC_ACCESS_KEY`, `DOS_PUBLIC_SECRET_KEY`, `DOS_BUCKET_NAME`, and `DOS_REGION` vars are still honored and auto-derive the endpoint.

## Project structure

```
app/   # Next.js app, the CMS UI
api/   # Express + MongoDB backend: auth, orgs, projects, git providers
```

## Documentation

- **Full docs:** [docs.sitepins.com](https://docs.sitepins.com)
- [app/README.md](https://github.com/sitepins/sitepins/blob/main/app/README.md): frontend stack, folder structure, env vars, scripts, GitHub and GitLab app setup.
- [api/README.md](https://github.com/sitepins/sitepins/blob/main/api/README.md): backend stack, module structure, env vars, scripts, secret generation, extension points.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](https://github.com/sitepins/sitepins/blob/main/CONTRIBUTING.md). Please report security issues privately per [SECURITY.md](https://github.com/sitepins/sitepins/blob/main/SECURITY.md).

## License

[Elastic License 2.0](https://github.com/sitepins/sitepins/blob/main/LICENSE). Free to use, modify, and self-host for your own projects and your company's. You may not offer Sitepins itself as a hosted or managed service.

---

<div align="center">

If Sitepins makes your handoffs easier, [**star the repo**](https://github.com/sitepins/sitepins) so more developers find it.

[Website](https://sitepins.com) · [Docs](https://docs.sitepins.com) · [Demo](https://demo.sitepins.com) · [Twitter](https://x.com/sitepinscms)

</div>
