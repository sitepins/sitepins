# Build context is the repository root.
FROM node:24-bookworm-slim AS workspace
RUN corepack enable
ENV HUSKY=0
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY app/package.json ./app/package.json
COPY api/package.json ./api/package.json

FROM workspace AS build
RUN pnpm install --frozen-lockfile --filter sitepins-api
COPY api ./api
RUN pnpm --filter sitepins-api build

FROM workspace AS deps
RUN pnpm install --frozen-lockfile --prod --filter sitepins-api

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=4000
WORKDIR /app/api
COPY --from=deps --chown=node:node /app/node_modules ../node_modules
COPY --from=deps --chown=node:node /app/api/node_modules ./node_modules
COPY --from=build --chown=node:node /app/api/dist ./dist
COPY api/package.json ./
USER node

EXPOSE 4000
CMD ["node", "dist/server.js"]
