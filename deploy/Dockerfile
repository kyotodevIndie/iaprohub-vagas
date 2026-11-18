# Uma imagem só: a API (Fastify, TypeScript direto com tsx) serve também o build do site em /app/web.
FROM node:24-alpine AS web
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter "@iaprohub-vagas/web..." && pnpm --filter @iaprohub-vagas/web build

FROM node:24-alpine
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --prod --filter "@iaprohub-vagas/api..." && pnpm store prune
COPY --from=web /app/apps/web/dist /app/web
WORKDIR /app/apps/api
ENV NODE_ENV=production WEB_DIST=/app/web PORT=4000
USER node
EXPOSE 4000
CMD ["node", "--import", "tsx/esm", "src/server.ts"]
