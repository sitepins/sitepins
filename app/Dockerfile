# Sitepins web (Next.js) image. Build context is the repo root:
#   docker build -f app/Dockerfile -t sitepins-web .
#
# NEXT_PUBLIC_* values are inlined at build time, so pass the ones your
# deployment needs as build args (see docker-compose.yml).
FROM node:24-bookworm-slim AS build
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY app/package.json ./app/package.json
COPY api/package.json ./api/package.json
RUN pnpm install --frozen-lockfile --filter sitepins-app

COPY app ./app

# Public, build-time-inlined config
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_HP_WS_URL
ARG NEXT_PUBLIC_BUCKET_URL
ARG NEXT_PUBLIC_BRAND_NAME
ARG NEXT_PUBLIC_BRAND_URL
ARG NEXT_PUBLIC_GITHUB_APP_NAME
ARG NEXT_PUBLIC_GITLAB_APP_NAME
ARG NEXT_PUBLIC_GITLAB_CLIENT_ID
ARG NEXT_PUBLIC_GIT_COMMIT_EMAIL_DOMAIN
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL \
    NEXT_PUBLIC_HP_WS_URL=$NEXT_PUBLIC_HP_WS_URL \
    NEXT_PUBLIC_BUCKET_URL=$NEXT_PUBLIC_BUCKET_URL \
    NEXT_PUBLIC_BRAND_NAME=$NEXT_PUBLIC_BRAND_NAME \
    NEXT_PUBLIC_BRAND_URL=$NEXT_PUBLIC_BRAND_URL \
    NEXT_PUBLIC_GITHUB_APP_NAME=$NEXT_PUBLIC_GITHUB_APP_NAME \
    NEXT_PUBLIC_GITLAB_APP_NAME=$NEXT_PUBLIC_GITLAB_APP_NAME \
    NEXT_PUBLIC_GITLAB_CLIENT_ID=$NEXT_PUBLIC_GITLAB_CLIENT_ID \
    NEXT_PUBLIC_GIT_COMMIT_EMAIL_DOMAIN=$NEXT_PUBLIC_GIT_COMMIT_EMAIL_DOMAIN

RUN pnpm --filter sitepins-app build

FROM node:24-bookworm-slim
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app

EXPOSE 3000
CMD ["pnpm", "--filter", "sitepins-app", "start"]
