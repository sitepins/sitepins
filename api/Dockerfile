# Sitepins API image. Build context is the repo root:
#   docker build -f api/Dockerfile -t sitepins-api .
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app

# Install deps against the workspace lockfile (both package.json manifests are
# needed for pnpm workspace resolution; only backend deps are installed).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY app/package.json ./app/package.json
COPY api/package.json ./api/package.json
RUN pnpm install --frozen-lockfile --filter sitepins-backend

COPY api ./api
RUN pnpm --filter sitepins-backend build
RUN pnpm prune --prod

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/api
COPY --from=build /app /app

EXPOSE 4000
CMD ["node", "dist/server.js"]
