# NODUS — Auditoría de código (estática) · 2026-09-16

Auditor: code-reviewer (modo 100% lectura). Alcance: monorepo `nodus-app`
(Turborepo + pnpm, Next 15 + tRPC; dominios en `packages/{db,forms,schemas,workflow}`).
Método: revisión estática con Read/Grep/Glob. **No se ejecutó** `pnpm build/lint/test`
ni smokes (los corre el agente de QA en paralelo; correrlos aquí corrompería el caché
de turbo/.next).

Contraste obligatorio: `PRUEBAS.md` §9–§10 y `ENTREGA.md` §4. Los límites ya declarados
por el equipo se listan al final como **roadmap**, no como hallazgos nuevos. El valor de
esta auditoría está en lo que **no** estaba en esa lista.

---

## Resumen ejecutivo

- 🔴 Críticos: **0**. No se encontró fuga entre tenants ni exfiltración de datos sin
  sesión. El scoping por `tenantId` se aplica de forma **consistente** en todos los
  routers (ver "Fortalezas verificadas").
- 🟠 Altos: **2** — `dashboard.pmo` sin guard de rol (bypass del masking del consultor)
  y el cron de SLA que **falla abierto** cuando `CRON_SECRET` no está seteado.
- 🟡 Medios: **3** — carrera en la asignación de `seq`/`humanId` (→ 500 + fuga de mensaje
  interno), `bolsa` expone `company.name` al consultor, y `cases.create` sin revalidación
  de rol.
- 🔵 Bajos/nits: **4** — `listForCase` sin guard, doble barrido de SLA concurrente,
  recompilación de Ajv, y desajuste rol admin (seed vs. matriz).

Prioridad de lectura: **H1** y **H2** primero (autorización).

---

## 🟠 ALTOS

### H1 · [authz / masking] `dashboard.pmo` sin revalidación de rol → bypass del masking del consultor
- **Ubicación:** `apps/web/src/server/routers/dashboard.ts:5` (procedimiento sin guard);
  la fuga concreta está en `:44` (`company: c.company.name`) y `:45` (`assignee`).
  Gate de rol vive **solo en el cliente**: `apps/web/src/app/page.tsx:21-27`
  (`useEffect` redirect + `enabled: isPmo`).
- **Problema:** `dashboard.pmo` es `protectedProcedure` (solo exige sesión) y devuelve el
  Command Center completo — pipeline con **nombres de empresa** y responsables de **todos**
  los casos del tenant — sin verificar el rol y **sin aplicar** el enmascaramiento D9.
- **Escenario de fallo:** un `consultor` (o `mipyme`) inicia sesión, abre DevTools →
  Network → "Copy as fetch" y llama `dashboard.pmo` directamente (exactamente el método de
  `PRUEBAS.md` §9). Recibe `pipeline[].cards[].company` con el nombre real de cada empresa,
  incluidos casos **no asignados a él** — justo lo que `cases.list` sí enmascara
  (`cases.ts:37-38`). El redirect del cliente (`page.tsx:22`) es cosmético y no lo impide.
- **Por qué no es el gap G2 conocido:** los gaps declarados (PRUEBAS §10.2) enumeran
  `/empresas`, `/consultores`, `/bitacora`, `/workflow`; **no** incluyen `/` (Dashboard).
  Además, esto no es "una página PMO sin route-guard": es el **bypass de un control ya
  entregado** (el masking al consultor, marcado ✅ en D9, con la única excepción conocida
  de `cases.byId`). Por eso se reporta como hallazgo nuevo.
- **Fix:** revalidar el rol en el servidor, igual que `sla.sweep`:
  ```ts
  pmo: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'advisory' && ctx.user.role !== 'admin') {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    // ...
  })
  ```
  (Idealmente, extraer un `pmoProcedure` reutilizable para `dashboard`, `companies`,
  `consultants`, `audit`, `workflow` y cerrar de paso G2.)

### H2 · [authz / seguridad] El cron de SLA **falla abierto** si `CRON_SECRET` no está seteado
- **Ubicación:** `apps/web/src/app/api/cron/sla/route.ts:6-9`. Config relacionada:
  `apps/web/src/app/api/cron/sla` está **fuera** del middleware de Auth.js
  (`apps/web/src/middleware.ts:8` excluye `api`), y `apps/web/.env.example:4` documenta
  `CRON_SECRET` como **"opcional"**.
- **Problema:** el guard es `if (secret && req.headers.get('authorization') !== ...)`. La
  condición **solo** se evalúa cuando `secret` es truthy. Si `CRON_SECRET` no está definido
  (el `.env.example` invita a omitirlo), el `if` se salta y la ruta queda **pública**.
- **Escenario de fallo:** deploy sin `CRON_SECRET`. Cualquiera hace `GET /api/cron/sla`
  sin sesión y dispara `sweepSla()` **sin `tenantId`** (`route.ts:10`) → barrido de SLA de
  **todos los tenants**: marca timers BREACHED/WARN, crea `domainEvent` SLA_BREACHED y
  **notificaciones** en cada tenant. Repetible → spam de notificaciones / DoS de escritura.
- **Impacto (honesto):** acotado — **no lee ni exfiltra datos**; el riesgo es escritura
  transversal sin autenticar + patrón *fail-open por defecto*. Se prioriza como alto por
  ser un bypass de autorización en un endpoint mutante alcanzable con la configuración que
  el propio `.env.example` sugiere.
- **Fix:** fallar cerrado. Exigir el secreto y rechazar si falta:
  ```ts
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse('Cron not configured', { status: 503 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  ```

---

## 🟡 MEDIOS

### M1 · [concurrencia / integridad / errores] Carrera en la asignación de `seq` y `humanId` → 500 no gobernado + fuga del mensaje de Prisma
- **Ubicación:** `packages/workflow/src/index.ts:94-99` (lee `last.seq` y calcula
  `seq = (last?.seq ?? 0) + 1`); `apps/web/src/server/routers/cases.ts:184-190`
  (`humanId` = `lastNum + 1`) y `:213-218` (`seq` en `create`). Manejo de error:
  `cases.ts:100-104` y `:145-149` solo mapean `WorkflowError`. Sin `errorFormatter`:
  `apps/web/src/app/api/trpc/[trpc]/route.ts:5-11`.
- **Problema:** `seq` y `humanId` se asignan con un patrón *read-then-write* (`max + 1`)
  dentro de transacciones `ReadCommitted`. Dos transiciones/creaciones de **casos
  distintos** del **mismo tenant**, concurrentes, leen el mismo máximo y chocan contra
  `@@unique([tenantId, seq])` (`schema.prisma:209`) o `@@unique([tenantId, humanId])`
  (`schema.prisma:147`).
- **Escenario de fallo:** dos usuarios advisory del mismo tenant confirman transiciones a
  la vez. Las constraints **evitan la corrupción de la cadena** (bien: uno hace rollback),
  pero el perdedor lanza un `PrismaClientKnownRequestError` **P2002** que **no** es
  `WorkflowError`; el `catch` lo re-lanza (`cases.ts:104`) → tRPC responde
  `INTERNAL_SERVER_ERROR` (500) y, al no haber `errorFormatter`, el `message` de Prisma
  ("Unique constraint failed on the fields: (`tenantId`,`seq`)") llega al cliente.
- **Impacto:** sin pérdida de integridad, pero un fallo de concurrencia se convierte en 500
  en vez de un CONFLICT reintentable, y se filtra estructura interna de la BD.
- **Fix:** (a) asignar `seq`/`humanId` de forma atómica — contador por tenant con
  `SELECT … FOR UPDATE`, o `updateMany` sobre una fila de secuencia, o una `SEQUENCE`
  dedicada; alternativamente capturar P2002 y **reintentar**. (b) Agregar un
  `errorFormatter`/`onError` en el handler tRPC que mapee errores no-`TRPCError` a un
  mensaje genérico (no filtrar `message`/stack en prod).

### M2 · [authz / masking] `postulations.bolsa` expone `company.name` al consultor (contradice el masking D9)
- **Ubicación:** `apps/web/src/server/routers/postulations.ts:62-69` (línea 65:
  `company: c.company.name`).
- **Problema:** `bolsa` devuelve el nombre real de la empresa para casos en estado
  `CLASIFICADO` — que por definición **aún no están asignados** — a cualquier consultor.
  En `cases.list` esos mismos casos salen como "Empresa reservada" (`cases.ts:37-38`).
- **Escenario de fallo:** un consultor abre `/bolsa` (está en su nav) y ve el cliente de
  cada oportunidad, aunque el principio D9 ("el consultor no ve al cliente hasta que se le
  asigna") lo enmascara en el resto de la app. No está en la lista de gaps.
- **Impacto:** exposición de dato de cliente **dentro del tenant**. Puede ser intencional
  (marketplace: mostrar la oportunidad), pero entonces el masking de `cases.list` es
  inconsistente para casos CLASIFICADO. Hay que resolver la política, no dejarla ambigua.
- **Fix:** decidir la intención. Si el consultor no debe ver al cliente antes de asignarse,
  enmascarar también aquí (`company: 'Empresa reservada'`). Si sí debe verlo, documentarlo
  y alinear el criterio con `cases.list`.

### M3 · [authz] `cases.create` sin revalidación de rol server-side
- **Ubicación:** `apps/web/src/server/routers/cases.ts:155-162` (el `.mutation` no
  chequea `ctx.user.role`).
- **Problema:** a diferencia de `transition`, `assign`, `postular` y `sweep`, `create` no
  revalida el rol. Cualquier usuario autenticado del tenant puede crear casos + submission
  T1 + registro génesis de bitácora forzando la llamada tRPC.
- **Escenario de fallo:** un `consultor` (rol enmascarado, sin botón "Nuevo caso" según
  `PRUEBAS.md` §3 TC-CASOS) invoca `cases.create` desde DevTools y crea casos en su tenant,
  contradiciendo `PRUEBAS.md` §9 ("el servidor revalida, no confía en el cliente").
- **Impacto:** bajo (escritura intra-tenant), pero rompe el principio de revalidación y
  `create` es el único mutador sensible sin guard. *Caveat:* el conjunto exacto de roles
  autorizados a crear no está documentado (mipyme sí puede; consultor aparentemente no).
- **Fix:** gate explícito a los roles que la UI habilita (advisory/admin/mipyme):
  ```ts
  if (!['advisory', 'admin', 'mipyme'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  ```

---

## 🔵 BAJOS / NITS

### L1 · [authz / info-disclosure] `postulations.listForCase` sin guard de rol
- **Ubicación:** `apps/web/src/server/routers/postulations.ts:37-53`.
- **Problema:** filtra por `tenantId` (bien) pero no revalida rol; el lector previsto es
  advisory. Cualquier usuario del tenant puede enumerar postulantes (nombre + `note`) de
  cualquier caso.
- **Escenario:** un consultor llama `listForCase` y ve qué otros consultores compiten y sus
  notas. Exposición intra-tenant, de datos no-cliente. Severidad baja.
- **Fix:** gate a advisory (+admin).

### L2 · [concurrencia] Doble barrido de SLA concurrente rompe idempotencia
- **Ubicación:** `packages/workflow/src/index.ts:243-268` (BREACHED) y `:269-282` (WARN);
  el snapshot se toma en el `findMany` de `:226-232`.
- **Problema:** los `update` usan `where: { id: t.id }` sin condicionar al estado actual, y
  operan sobre el snapshot leído al inicio. La idempotencia **secuencial** funciona (el
  `findMany` filtra `status in [RUNNING, WARN]`), pero dos barridos **solapados** (Vercel
  Cron + botón "Revisar SLA") emiten dos veces `SLA_BREACHED` (evento + notificación) y
  doble escalamiento.
- **Escenario:** el cron dispara mientras un advisory pulsa "Revisar SLA": ambos leen el
  mismo timer RUNNING vencido → dos notificaciones/eventos por el mismo breach.
- **Fix:** hacer la transición condicional y verificar el conteo:
  ```ts
  const res = await tx.slaTimer.updateMany({
    where: { id: t.id, status: { in: ['RUNNING', 'WARN'] } },
    data: { status: 'BREACHED', breachedAt: now },
  });
  if (res.count !== 1) return; // otro barrido ya lo tomó
  ```

### L3 · [robustez] `validateSubmission` recompila el schema en cada submission sobre un `Ajv` singleton
- **Ubicación:** `packages/forms/src/validate.ts:4` (`const ajv = new Ajv(...)` a nivel de
  módulo) y `:20` (`ajv.compile(...)` en cada llamada).
- **Problema:** con un `Ajv` de proceso, si el `jsonSchema` de una plantilla trae `$id`,
  el **segundo** `compile` lanza "schema with key or id … already exists"; sin `$id`, cada
  submission acumula un schema compilado (fuga lenta de memoria).
- **Escenario:** se versiona T1 con un `$id` en el JSON Schema → la segunda creación de
  caso falla en runtime. Hoy el T1 sembrado no tiene `$id` (`seed.ts:123-132`), así que es
  latente, no activo.
- **Fix:** cachear por `$id` (`ajv.getSchema(id) ?? ajv.compile(...)`) o instanciar
  `new Ajv()` por validación.

### L4 · [funcional — no seguridad] El rol `admin` no puede ejecutar transiciones ni asignar (seed vs. matriz)
- **Ubicación:** `packages/db/prisma/seed.ts:106-110` (`allowedRoles` de las transiciones
  = solo `advisory`, con `system`/`mipyme` en casos puntuales) y
  `apps/web/src/server/routers/cases.ts:112` (`if (ctx.user.role !== 'advisory')`).
- **Problema:** la matriz de `PRUEBAS.md` §4 promete "advisory / admin" para las
  transiciones y "Asignar consultor", pero ni el motor (allowedRoles) ni `cases.assign`
  incluyen `admin`. Un usuario `admin` recibe FORBIDDEN en toda transición y en `assign`.
- **Impacto:** **más restrictivo** que lo documentado → no es vuln, pero el admin no puede
  operar el workflow (contradice TC-DET para admin).
- **Fix:** agregar `'admin'` a los `allowedRoles` pertinentes del seed y a la guard de
  `assign` (`role !== 'advisory' && role !== 'admin'`), o corregir la matriz de PRUEBAS.

---

## Fortalezas verificadas (para dar contexto a las severidades)

Lo siguiente se revisó y está **correcto**; sostiene que no haya críticos:

- **CAS / versión optimista** bien implementado: el `updateMany` condiciona por
  `currentStateId` **y** `version` y verifica `swap.count === 1`
  (`packages/workflow/src/index.ts:85-91`). Sin ventana de carrera entre lectura y update
  para el mismo caso.
- **Aislamiento por tenant consistente:** todas las consultas de datos de tenant filtran
  por `ctx.user.tenantId` (cases, postulations, dashboard, companies, consultants, audit,
  notifications) o verifican `tenantId` tras `findUnique`
  (`packages/workflow/src/index.ts:61-64`). Las tablas globales legítimas (estados,
  transiciones, plantillas, reglas SLA) se consultan sin `tenantId` a propósito.
- **Bitácora encadenada, transaccional y determinista:** `computeRowHash` usa
  `stableStringify` con claves ordenadas (`packages/db/src/audit.ts:15-38`); el enlace
  `prevHash → rowHash` se escribe **dentro de la misma transacción** que el cambio de
  estado (`workflow/src/index.ts:60-140`). `@@unique([tenantId, seq])` protege la cadena
  ante concurrencia (ver M1 por el efecto colateral en el manejo de errores).
- **Sin `publicProcedure` con datos:** `publicProcedure` se define pero **no se usa** en
  ningún router (grep). Todos los endpoints son `protectedProcedure`.
- **Validación de entrada:** cada procedimiento tiene `.input(zod)`; las submissions se
  validan con ajv antes de persistir (`cases.ts:169-172`).
- **Secretos:** sin secretos hardcodeados en el código; `.gitignore:31-32` ignora `.env*`
  (excepto `.env.example`), así que `AUTH_SECRET`/`DATABASE_URL` de `.env.local` no se
  commitean. Las creds demo del RoleSwitcher son intencionales (roadmap G4).

---

## Gaps conocidos observados (roadmap — NO cuentan como hallazgos)

Revisados y **distinguidos** de los hallazgos nuevos. Alineados con `ENTREGA.md` §4 y
`PRUEBAS.md` §10.

| # | Gap declarado | Dónde se observa en el código | Fuente |
|---|---|---|---|
| G1 | `cases.byId` no enmascara al consultor (la lista sí) | `apps/web/src/server/routers/cases.ts:47-63` | PRUEBAS §10.1 |
| G2 | `/empresas`, `/consultores`, `/bitacora`, `/workflow` nav-gated, sin route guard por rol; los procedimientos `companies.*`, `consultants.list`, `audit.*`, `workflow.graph` no chequean rol (sí filtran por tenant) | `companies.ts`, `consultants.ts`, `audit.ts`, `workflow.ts` | PRUEBAS §10.2 |
| G3 | `/alertas` tenant-wide, no por usuario (`Notification.userId` existe pero no se filtra) | `apps/web/src/server/routers/notifications.ts:4-9` | PRUEBAS §10.3 |
| G4 | SLA en horas calendario; outbox in-process; RoleSwitcher con creds demo; migración en deploy sin cablear | `workflow/src/index.ts:189`, `processOutbox`, `role-switcher.tsx:19-23` | ENTREGA §4 |
| G5 | RLS Postgres ausente (scoping app-layer); defensa en profundidad pendiente | (a nivel de datasource) `schema.prisma` | ENTREGA §4 |
| G6 | Bitácora tamper-**EVIDENTE**, no tamper-PROOF (quien tenga escritura total puede reescribir la cadena) | `audit.ts` / modelo `AuditLog` | ENTREGA §4 |

> Nota transversal: **H1 (dashboard.pmo) y M2 (bolsa)** se solapan temáticamente con G1/G2
> (masking + route guards), pero **no** están cubiertos por los gaps declarados: G1 es solo
> `cases.byId` y G2 enumera cuatro rutas PMO que **no** incluyen `/` ni `/bolsa`. Ambos
> exponen datos de cliente que el control D9 (entregado) pretende ocultar al consultor, por
> eso se reportan como hallazgos.

---

## Recomendación de cierre

Un solo `pmoProcedure` (revalida `advisory`/`admin` en el servidor) aplicado a `dashboard`,
`companies`, `consultants`, `audit` y `workflow` cierra **H1** y el gap **G2** de una vez.
Sumar el fail-closed del cron (**H2**), la asignación atómica de `seq`/`humanId` con un
`errorFormatter` (**M1**), y la decisión de política de masking en `bolsa` (**M2**) deja el
borde de autorización server-side coherente con lo que `PRUEBAS.md` §9 promete.
