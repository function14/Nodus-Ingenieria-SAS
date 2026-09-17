# NODUS — Casos de prueba por vista y scope (rol)

**Precondición:** `docker compose up -d db` · `pnpm --filter @nodus/db run seed` · `pnpm dev`.
Usuarios demo (contraseña `demo1234`): `advisory@demo.nodus`, `consultor@demo.nodus`,
`mipyme@demo.nodus`, `admin@demo.nodus`. Para cambiar de scope: botón **"Ver como"** o login directo.

Leyenda: ✅ esperado · 🔒 enmascarado · ⛔ bloqueado con **FORBIDDEN server-side**.

> **Actualización (G1/G2/G3 resueltos).** La lógica de "qué ve este rol" dejó de estar
> duplicada endpoint por endpoint y vive en una capa única: **`packages/rbac`**. El nav,
> el masking, los guards de recurso y los de acción derivan todos de esa tabla, y están
> cubiertos por tests automatizados:
> `pnpm test` (26 unitarios) y `pnpm test:integration` (18 contra los resolvers reales).

## Matriz de visibilidad en la navegación
| Vista | advisory | admin | consultor | mipyme |
|---|:--:|:--:|:--:|:--:|
| / (Dashboard PMO) | ✅ | ✅ | — (redirige a /casos) | — (redirige) |
| /casos | ✅ | ✅ | ✅ (🔒) | ✅ |
| /casos/[id] | ✅ | ✅ | ✅ | ✅ |
| /bolsa | ✅ | ✅ | ✅ | — |
| /empresas | ✅ | ✅ | — | — |
| /consultores | ✅ | ✅ | — | — |
| /bitacora | ✅ | ✅ | — | — |
| /workflow | ✅ | ✅ | — | — |
| /alertas | ✅ | ✅ | ✅ | ✅ |
| /perfil | ✅ | ✅ | ✅ | ✅ |

---

## 1. Login (/login)
- **TC-LOGIN-1** creds válidas (advisory) → redirige a `/`.
- **TC-LOGIN-2** contraseña incorrecta → "Credenciales inválidas".
- **TC-LOGIN-3** abrir `/` sin sesión → 307 a `/login?callbackUrl=…`.

## 2. Dashboard (/)
- **TC-DASH-advisory/admin** ✅ ve KPIs, heatmap SLA, timers, funnel y kanban con datos reales.
- **TC-DASH-sweep** (advisory) pulsar **"Revisar SLA"** → sube "SLA críticos", el timer vencido pasa a rojo y aparecen notificaciones en `/alertas`. Segundo click → 0/0 (idempotente).
- **TC-DASH-consultor / mipyme** ✅ son redirigidos a `/casos` (no está en su nav).

## 3. Casos (/casos)
- **TC-CASOS-advisory/admin/mipyme** ✅ ven todos los casos con la empresa visible + botón "Nuevo caso".
- **TC-CASOS-consultor-mask** 🔒 la empresa/título salen como "🔒 Empresa reservada" **salvo** en casos asignados a ese consultor.
- **TC-CASOS-consultor-unmask** asignarte un caso desde la bolsa → ese caso deja de estar enmascarado en tu lista.

## 4. Detalle del caso (/casos/[id])
Transiciones que aparecen según estado + rol:
| Estado actual | advisory / admin | mipyme | consultor |
|---|---|---|---|
| CREADO | "Enviar a revisión" | — | — |
| EN_REVISION | "Clasificar" | — | — |
| CLASIFICADO | "Asignar consultor" | — | — |
| ASIGNADO | "Autorizar ejecución" | — | — |
| EN_EJECUCION | "Cerrar / aceptar cierre" | "Cerrar / aceptar cierre" | — |
| CERRADO | (sin acciones) | — | — |

- **TC-DET-transición** ejecutar una transición permitida → cambia el chip de estado, crece el timeline (nuevo `#seq`) y se puede "Verificar integridad" → "Cadena íntegra".
- **TC-DET-consultor** el consultor ve el expediente pero "No hay transiciones disponibles para tu rol".
- **TC-DET-T1** el caso muestra la tarjeta "Datos de apertura" con la submission T1.
- **TC-DET-verify** cualquier rol pulsa "Verificar integridad" → íntegra (N registros).
- ✅ **TC-DET-mask (G1 resuelto)** el consultor abre el detalle de un caso NO asignado → ve "Empresa reservada" / "Caso reservado", igual que en la lista. Además no se filtran datos por los canales laterales: `submissions` llega vacío y el `payload` de la bitácora va redactado. Automatizado en `authz.integration.test.ts`.

## 5. Bolsa (/bolsa)
- **TC-BOLSA-consultor** ✅ ve casos CLASIFICADO; "Postularme" → "Ya te postulaste". Reintento → CONFLICT ("Ya te postulaste a este caso").
- **TC-BOLSA-advisory** ✅ ve los postulantes por caso; "Asignar" → el caso pasa a ASIGNADO, el consultor queda como responsable y el resto de postulaciones quedan RECHAZADO.
- **TC-BOLSA-admin** ve las tarjetas en solo-lectura + mensaje (no es consultor ni advisory).
- **TC-BOLSA-mipyme** no está en su nav; si fuerza la URL, ve solo-lectura.

## 6. Empresas / Consultores / Bitácora / Workflow (PMO/Admin)
- **TC-EMP** (advisory/admin) ✅ empresas + dominio + nº de casos.
- **TC-CONS** (advisory/admin) ✅ consultores + correo + asignados + postulaciones.
- **TC-BITA** (advisory/admin) ✅ ledger; "Verificar integridad" → íntegra. Si se edita una fila con SQL directo → "Cadena rota en el registro #N".
- **TC-WF** (advisory/admin) ✅ diagrama con 6 estados, 5 transiciones y roles por arista.
- ⛔ **TC-route-guard (G2 resuelto)** consultor/mipyme no las ven en el nav **y** el servidor las rechaza: forzar la URL devuelve **FORBIDDEN** (`companies.overview`, `consultants.list`, `audit.list`, `workflow.graph`, `dashboard.pmo`, `postulations.bolsa`). El nav es ahora un *reflejo* de `@nodus/rbac`, no la restricción.

## 7. Alertas (/alertas) — todos
- **TC-ALERT** ✅ lista las notificaciones recientes (transiciones, SLA).
- ✅ **TC-alert-scope (G3 resuelto)** las notificaciones se acotan por rol: **advisory/admin** ven todo el tenant; **consultor** solo las de casos asignados a él; **mipyme** solo las de casos de su empresa (`User.companyId`). Automatizado en `authz.integration.test.ts`.

## 8. Perfil (/perfil) — todos
- **TC-PERFIL** ✅ muestra nombre/correo/rol de la sesión; "Cerrar sesión" → `/login`.
- **TC-VERCOMO** el botón "Ver como" cambia el rol real (re-autentica): la nav, el masking y el dashboard cambian en consecuencia.

## 9. Autorización server-side (el borde real, no solo la UI)
Estos se prueban forzando la llamada tRPC (DevTools → Network → "Copy as fetch" y cambiar el input):
- **TC-AUTHZ-1** `cases.transition` con un rol no permitido → **FORBIDDEN** (el motor revalida, no confía en el cliente).
- **TC-AUTHZ-2** `postulations.postular` por un no-consultor → **FORBIDDEN**.
- **TC-AUTHZ-3** `cases.assign` por un no-advisory → **FORBIDDEN**.
- **TC-AUTHZ-4** `sla.sweep` por un no-advisory/admin → **FORBIDDEN**.
- **TC-AUTHZ-5** cualquier procedimiento sin sesión → **UNAUTHORIZED**.
- **TC-CONC-1** abrir el mismo caso en 2 pestañas; transición en una → la otra (versión vieja) → **VERSION_CONFLICT** ("El caso cambió; recarga").

## 10. Estado de los gaps

| Gap | Estado | Cómo se cerró |
|---|---|---|
| **G1** detalle de caso no enmascaraba | ✅ **Resuelto** | Lista y detalle usan `applyCaseMask` de `@nodus/rbac`; se redactan además `submissions` y el `payload` de bitácora |
| **G2** rutas nav-gated sin guard server-side | ✅ **Resuelto** | `resourceProcedure(<recurso>)` en los 6 procedures; el nav deriva de `allowedRoutes()` |
| **G3** alertas tenant-wide | ✅ **Resuelto** | `notificationScope()` por rol (todo / casos asignados / empresa propia) + `User.companyId` |

**Cambio de comportamiento deliberado:** el consultor ya no puede crear casos
(`case.create` = advisory/admin/mipyme) y por eso tampoco lee `companies.list`. Sin esto,
el selector de empresas era un canal lateral para saltarse el masking de G1.

### Lo que sigue pendiente (no es un gap de esta capa)
**RLS en Postgres.** El aislamiento por tenant y el scoping por rol se aplican en la capa de
aplicación (única y testeada), pero **no hay defensa en profundidad a nivel de base de datos**.
Sigue en el roadmap de `ENTREGA.md`.

## 11. Suite automatizada
```bash
pnpm test              # 26 unitarios: reglas de @nodus/rbac, validador D6, hash-chain
pnpm test:integration  # 18 contra los resolvers reales (requiere Postgres + seed)
```
Un endpoint nuevo que use `resourceProcedure`/`actionProcedure` **hereda la protección**;
si alguien la omite, los tests de integración lo detectan.
