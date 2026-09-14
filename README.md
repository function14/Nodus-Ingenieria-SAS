# NODUS — monorepo

Plataforma SaaS de orquestación de casos (911MiPyme). Monorepo Turborepo + pnpm.

## Estructura
- `apps/web` — Next.js 15 (App Router) + UI "Solar" (PWA).
- `packages/*` — paquetes compartidos (db, schemas, workflow, … se añaden en el scaffolding).

## Desarrollo
```bash
pnpm install
pnpm dev      # turbo run dev  -> apps/web en http://localhost:3000
pnpm build    # turbo run build
pnpm lint
```
