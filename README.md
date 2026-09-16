# NODUS / 911MiPyme

Plataforma SaaS de **orquestación de casos** entre Mipymes y consultores: workflow gobernado,
bitácora inmodificable, SLA parametrizado y plantillas metodológicas — todo **como datos**.
Monorepo **Turborepo + pnpm**, TypeScript end-to-end.

## Stack
Next.js 15 (App Router) · tRPC 11 · TanStack Query · Auth.js 5 (JWT) · Prisma 6 + PostgreSQL ·
Zod 4 · ajv (JSON Schema) · Tailwind v4 (sistema "Solar") · Vitest · Docker Compose (dev) ·
Terraform (Neon + Vercel).

## Estructura
```
apps/
  web/                Next.js 15 + tRPC (server & client) + UI "Solar"
packages/
  db/                 Prisma schema + client + seed + hash-chain (computeRowHash)
  schemas/            contratos Zod compartidos
  workflow/           motor config-driven (executeTransition, processOutbox, sweepSla)
  forms/              validador JSON Schema (ajv) + derivación de campos (D6)
infra/                Terraform (Neon + Vercel)
docker/               Dockerfiles (web/worker)
docker-compose.yml    Postgres + Redis + MinIO (dev)
```

## Cómo correr (local)
Requiere Docker y pnpm.
```bash
docker compose up -d db                                  # Postgres en :5442
pnpm install
pnpm --filter @nodus/db exec prisma migrate deploy       # aplica migraciones
pnpm --filter @nodus/db run seed                          # datos demo + bitácora génesis
pnpm dev                                                  # http://localhost:3000
```

### Usuarios demo (contraseña `demo1234`)
- `advisory@demo.nodus` — Advisory/PMO (Command Center, clasifica, asigna, cierra)
- `consultor@demo.nodus` — Consultor (bolsa, postulación)
- `mipyme@demo.nodus` — Mipyme (portal, aceptación de cierre)
- `admin@demo.nodus` — Administrador

El botón **"Ver como"** en el shell re-autentica como el usuario demo de cada rol.

## Comandos
```bash
pnpm build      # turbo: build de todos los paquetes
pnpm lint       # turbo: eslint
pnpm test       # vitest (unit): validador D6 + hash-chain
# integración (requieren Postgres arriba):
pnpm --filter @nodus/workflow run smoke   # motor: transiciones + guardas + cadena
```

## Diferenciales
1. **Workflow / SLA / plantillas como datos** (no `if/else` hardcodeado) — ver `/workflow`.
2. **Bitácora con hash-chain** verificable (botón "Verificar integridad" en el expediente).
3. **Command Center** (PMO) + expediente-timeline + Forms-as-Data (T1 desde JSON Schema).

Detalle de alcance, decisiones y riesgos en **[ENTREGA.md](./ENTREGA.md)**.
