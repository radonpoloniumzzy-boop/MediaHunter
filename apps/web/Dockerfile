FROM node:22-alpine

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --no-frozen-lockfile

EXPOSE 5173

CMD ["pnpm", "--filter", "@lan-ting/web", "dev", "--", "--host", "0.0.0.0"]

