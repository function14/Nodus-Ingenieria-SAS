# syntax=docker/dockerfile:1
# Imagen de paridad/CI y plan B. En prod la app corre en Vercel (no usa este archivo).
# Monorepo pnpm + Turborepo -> apps/web (Next.js 15).

FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @nodus/db exec prisma generate
RUN pnpm build

FROM node:22-alpine AS runner
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
