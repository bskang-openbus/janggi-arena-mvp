# syntax=docker/dockerfile:1
#
# Janggi Arena — 웹 (Next.js 15 standalone)
#
# 빌드 컨텍스트는 **모노레포 루트**다 (`docker compose build` / `docker build -f
# apps/web/Dockerfile .`). `engine`이 workspace 의존성이라 apps/web만으로는
# 빌드가 성립하지 않는다.
#
# RUN.md 3절: 이미지는 빌드 확인까지만이 P6 범위이고, 실배포는 사람이 아침에
# 직접 확인한 뒤 진행한다.

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

# ── 의존성 ─────────────────────────────────────────────────────────────
# package.json / lockfile만 먼저 복사해 소스 변경이 install 캐시를 깨지 않게 한다.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/engine/package.json packages/engine/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile

# ── 빌드 ───────────────────────────────────────────────────────────────
# 서버 URL은 NEXT_PUBLIC_* 이라 **빌드 시점에 번들로 들어간다**. 값을 바꾸려면
# 이미지를 다시 빌드해야 한다 (compose가 build.args로 넘긴다).
FROM deps AS builder
ARG NEXT_PUBLIC_SERVER_URL=http://localhost:3001
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY packages/engine packages/engine
COPY apps/web apps/web
RUN pnpm --filter web build

# ── 런타임 ─────────────────────────────────────────────────────────────
# standalone 산출물만 옮긴다 — pnpm도, workspace 심볼릭 링크도 필요 없다.
FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN addgroup -S -g 1001 janggi && adduser -S -u 1001 -G janggi janggi

COPY --from=builder --chown=janggi:janggi /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=janggi:janggi /repo/apps/web/.next/static ./apps/web/.next/static

USER janggi
EXPOSE 3002
CMD ["node", "apps/web/server.js"]
