# syntax=docker/dockerfile:1
# Worker BullMQ (Fase 2): SLA, notificaciones, escalamientos, proyecciones KPI.
# Esqueleto: se activa cuando exista apps/worker; hoy corre un placeholder.

FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @nodus/db exec prisma generate

FROM node:22-alpine AS runner
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
CMD ["node", "-e", "console.log('nodus worker placeholder - apps/worker pendiente (Fase 2)')"]
