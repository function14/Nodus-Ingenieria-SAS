# NODUS — Entrega técnica: alcance, decisiones y riesgos

Documento de cierre de la prueba. Resume **qué se construyó**, **qué quedó diseñado
(no construido)** y los **riesgos/límites conocidos** — de forma honesta, porque la
disciplina de alcance es parte del criterio de arquitectura.

## 1. Resumen
Se llevó el prototipo (SPA con data en memoria) a un **MVP funcional** con backend real:
workflow gobernado, bitácora inmodificable verificable, SLA, plantillas como datos, RBAC,
y un Command Center desde Postgres. TypeScript end-to-end en un monorepo Turborepo + pnpm.

**Verificado:** `pnpm build` + `pnpm lint` + typecheck en verde (17 rutas); **9 tests Vitest**;
smokes de integración contra Postgres (motor de workflow y barrido de SLA).

## 2. Mapa de decisiones (`.md` fuente de verdad → estado)
| Decisión | Estado |
|---|---|
| D1 TypeScript end-to-end | ✅ Implementado |
| D2 tRPC interno | ✅ Implementado (REST/OpenAPI público: no, fuera de MVP) |
| D3 Next 15 + Tailwind + PWA | ✅ Next 15 + Tailwind v4 + "Solar". PWA: manifest + iconos; **offline/push: diseñado, no construido** |
| D4 Modular monolith + outbox | ✅ dominios en `packages/*`; outbox + consumidor **in-process** (BullMQ = roadmap) |
| D5 Workflow as Data | ✅ Implementado (motor transaccional + visor `/workflow`) |
| D6 Plantillas como JSON Schema | ✅ Implementado (T1 render + validación ajv + submission) |
| D7 Audit-first + hash-chain | ✅ Implementado + verificación en vivo |
| D8 Motor de SLA | ✅ timers + WARN/BREACHED + escalamiento; **horas calendario** (hábiles = roadmap) |
| D9 RBAC + visibilidad por rol | ✅ Capa única `packages/rbac`: guards server-side por recurso/acción, masking y nav derivados de una sola tabla. **RLS Postgres: no** (app-layer) |
| D10 Documentos S3 + versionado | ⛔ **No construido** (MinIO en compose listo; presigned URLs = roadmap) |
| D11 Infra (Vercel/Neon/Resend…) | ✅ Terraform Neon+Vercel; **Resend/WhatsApp: no** |
| D12 Vitest + Playwright | ✅ Vitest (unit) + smokes de integración. **Playwright E2E: no** |
| D13 Monorepo | ✅ Implementado |
| D14 Seguridad (JWT/RBAC/RLS…) | Parcial: JWT + RBAC server-side + masking. **RLS, rate-limiting: roadmap** |

## 3. Construido vs Diseñado
**Construido y verificado**
- Auth (Auth.js, JWT, credenciales) + middleware que protege rutas.
- Motor de workflow config-driven: guardas (rol / estado actual / versión optimista CAS),
  cambio de estado, **bitácora encadenada por hash**, evento a outbox — todo transaccional.
- Consumidor de outbox in-process: arranca/detiene SLA timers + notificaciones.
- Barrido de SLA (WARN/BREACHED + escalamiento) manual (botón) y por Vercel Cron (`/api/cron/sla`).
- Forms-as-Data: T1 renderizada desde JSON Schema, validada con ajv, submission versionada.
- Bolsa: postulación (consultor) → asignación (advisory) → cierre/aceptación (mipyme).
- **Capa única de autorización (`packages/rbac`)**: una sola tabla de permisos (recursos +
  acciones) de la que derivan el masking de casos, los guards server-side de cada procedure,
  el alcance de notificaciones y la navegación del cliente. No quedan chequeos de rol ad-hoc.
- Vistas por rol + enmascaramiento de datos del cliente al consultor (lista **y** detalle).
- Command Center (KPIs, pipeline, funnel, heatmap/timers SLA) desde Postgres.
- Visor de la máquina de estados (`/workflow`).
- Verificación de integridad de la bitácora (recomputa la cadena en vivo).

**Diseñado, no construido (roadmap / Fase 2)**
- Documentos (S3/R2 + presigned URLs + versionado de archivos).
- PWA offline (service worker + cola de sync) y Web Push.
- Worker BullMQ/Redis real (hoy el consumidor es in-process).
- RLS en Postgres (hoy el aislamiento por tenant es a nivel de aplicación).
- Playwright E2E, peer review (Fase 2), notificaciones por email/WhatsApp.

## 4. Riesgos y límites conocidos (honestos)
- **Bitácora: tamper-EVIDENTE, no tamper-PROOF.** La cadena de hashes detecta manipulación,
  pero quien tenga escritura total podría reescribir toda la cadena. Endurecimiento: triggers
  DB append-only (bloquear UPDATE/DELETE) + anclaje/firma externa del último hash.
- **SLA en horas calendario**, no hábiles. Falta calendario de negocio (horario + festivos + timezone).
- **Outbox in-process:** el consumidor corre dentro del request/cron; en prod debe ser un worker
  (BullMQ/Redis) leyendo `domain_events` con reintentos.
- **RLS ausente (única capa):** la autorización y el scoping por tenant/rol están centralizados
  en `packages/rbac` y cubiertos por tests, pero se aplican **solo en la capa de aplicación**.
  Falta defensa en profundidad con RLS en Postgres (spike pendiente por la fricción
  Prisma + serverless). Es el último eslabón del control de acceso.
- **Migración en deploy:** decidido llevarlo a CI (no al build de Vercel); pendiente de cablear.
- **RoleSwitcher "Ver como"** usa credenciales demo hardcodeadas — es una ayuda de demo, no producción.

## 5. Cómo se probó
- `pnpm build` / `pnpm lint` / typecheck: verde.
- `pnpm test`: **26 tests unitarios** — reglas de `@nodus/rbac` (acceso por recurso/acción,
  derivación del nav, masking, alcance de notificaciones), validador JSON Schema y hash-chain
  (determinismo, estabilidad ante el orden de claves de jsonb, encadenado, detección de manipulación).
- `pnpm test:integration`: **18 tests contra los resolvers reales** (tRPC `createCaller` + Postgres)
  que cubren G1 (masking en el detalle y sus canales laterales), G2 (FORBIDDEN al forzar rutas
  fuera del nav) y G3 (alertas acotadas), más la no-regresión de la autorización de mutaciones.
- `packages/workflow` / `packages/forms`: smokes de integración contra Postgres (happy path + rechazos
  FORBIDDEN/INVALID_STATE/VERSION_CONFLICT + cadena íntegra; barrido SLA + idempotencia; validador D6).

## 6. Hallazgos de QA cerrados
| Gap | Estado |
|---|---|
| **G1** el detalle de caso no aplicaba el masking de la lista | ✅ Resuelto (regla única + canales laterales redactados) |
| **G2** rutas fuera del nav sin guard server-side | ✅ Resuelto (`resourceProcedure`; el nav deriva de la capa) |
| **G3** alertas sin acotar por rol/empresa | ✅ Resuelto (`notificationScope` + `User.companyId`) |
| **H1** la UI mostraba datos del rol anterior tras "Ver como" | ✅ Resuelto (invalidación del caché + `router.refresh()`) |

Detalle de casos de prueba por vista y rol en **[PRUEBAS.md](./PRUEBAS.md)**.
