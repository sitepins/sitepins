# Sitepins

Open-source, git-based CMS. Edit your Markdown/MDX content visually and commit changes straight to your GitHub or GitLab repository — your repo stays the single source of truth.

## Repository layout

```
app/   # Next.js app — the CMS UI
api/   # Express + MongoDB backend — auth, orgs, projects, git providers
```

## Documentation

- [app/README.md](./app/README.md) — frontend tech stack, folder structure, env vars, scripts, GitHub/GitLab app setup
- [api/README.md](./api/README.md) — backend tech stack, module structure, env vars, scripts, secret generation, extension points

## Self-hosting quickstart

Requirements: Node.js 20+ (CI runs on 22), pnpm 11+, a MongoDB instance (local or [Atlas](https://www.mongodb.com/atlas) free tier).

```bash
pnpm install

# configure both apps
cp api/.env.example api/.env
cp app/.env.example app/.env
```

Fill in each `.env` — see [app/README.md](./app/README.md#environment-variables) and [api/README.md](./api/README.md#environment-variables) for what every variable does and how to obtain it. The one shared setup step is media storage, below; everything else (secrets, GitHub/GitLab apps) is documented in the app or api README specifically.

```bash
# run backend + frontend together
pnpm dev
# or separately, in two terminals:
pnpm dev:api
pnpm dev:app
```

The self-hosted build has no plans, billing, or usage limits — every feature is unlocked.

### Run with Docker

A `docker-compose.yml` brings up MongoDB, the API, and the web app together:

```bash
cp api/.env.example api/.env      # fill in secrets + media bucket
cp app/.env.example app/.env
docker compose up --build
```

Web on `http://localhost:3000`, API on `http://localhost:4000` (health check at `/healthz`). Mongo runs in the `mongo` service, so you can leave `MONGO_URI` unset to use it.

## Setting up media storage (S3-compatible)

The media library (image/asset uploads) needs an S3-compatible bucket. Any provider works — AWS S3, Cloudflare R2, MinIO, Backblaze B2, or DigitalOcean Spaces. Both apps read config from the same bucket, which is why this lives here rather than in `app/README.md` or `api/README.md`.

1. Create a bucket with your provider and generate an access key / secret.
2. Fill `api/.env`:
   ```bash
   S3_ENDPOINT="https://s3.us-east-1.amazonaws.com"   # provider endpoint
   S3_REGION="us-east-1"                              # "auto" for R2
   S3_ACCESS_KEY="<access key>"
   S3_SECRET_KEY="<secret key>"
   S3_BUCKET_NAME="<your bucket name>"
   S3_FORCE_PATH_STYLE=false                           # true for MinIO
   ```
   Provider endpoints: AWS `https://s3.<region>.amazonaws.com`, Cloudflare R2 `https://<account>.r2.cloudflarestorage.com`, DigitalOcean Spaces `https://<region>.digitaloceanspaces.com`, MinIO your own host.
3. Fill `app/.env` with the bucket's public base URL:
   ```bash
   NEXT_PUBLIC_BUCKET_URL="https://<bucket>.s3.<region>.amazonaws.com"
   ```
4. In your bucket's **CORS** settings, allow your app's origin (`http://localhost:3000` for dev) so browser-rendered uploads aren't blocked.

> Existing DigitalOcean Spaces setups keep working: the legacy `DOS_PUBLIC_ACCESS_KEY` / `DOS_PUBLIC_SECRET_KEY` / `DOS_BUCKET_NAME` / `DOS_REGION` vars are still honored and auto-derive the endpoint.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Please report security issues privately per [SECURITY.md](./SECURITY.md).

## License

[Elastic License 2.0](./LICENSE). In short: free to use, modify, and self-host for your own projects and your company's — but you may not offer Sitepins itself as a hosted or managed service.
