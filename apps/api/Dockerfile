FROM node:22-alpine

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --no-frozen-lockfile

EXPOSE 3001

CMD ["pnpm", "--filter", "@lan-ting/api", "dev"]

