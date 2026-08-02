# syntax=docker/dockerfile:1
#
# Janggi Arena — 온라인 대국 서버 (NestJS + socket.io)
#
# 빌드 컨텍스트는 **모노레포 루트**다. 서버는 `engine/dist`를 import 하므로
# (apps/server/src/engine.ts) engine을 먼저 tsc로 emit 해야 한다 —
# `pnpm --filter server build`가 그 순서를 이미 담고 있다.

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

# ── 의존성 ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# ── 빌드 (engine dist → server dist) ───────────────────────────────────
FROM deps AS builder
COPY packages/engine packages/engine
COPY apps/server apps/server
RUN pnpm --filter server build

# ── 런타임 ─────────────────────────────────────────────────────────────
# 런타임 트리를 새로 깐다: 프로덕션 의존성만 남기고 devDependencies(vitest,
# typescript, @types/*)를 떨군다. engine은 workspace 링크로 다시 연결되고,
# 그 dist는 빌드 스테이지에서 그대로 가져온다.
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --prod --filter server --filter engine

COPY --from=builder /repo/packages/engine/dist packages/engine/dist
COPY --from=builder /repo/apps/server/dist apps/server/dist

RUN addgroup -S -g 1001 janggi \
  && adduser -S -u 1001 -G janggi janggi \
  && chown -R janggi:janggi /repo
USER janggi

WORKDIR /repo/apps/server
EXPOSE 3001
CMD ["node", "dist/main.js"]
