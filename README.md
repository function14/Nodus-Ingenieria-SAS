# NODUS / 911MiPyme

Plataforma SaaS de **orquestación de casos** entre Mipymes y consultores. El sistema no es un
CRUD: gobierna el ciclo de vida de cada caso con **estados y transiciones definidos como datos**,
deja una **bitácora inmodificable y verificable**, controla **SLA por etapa** y estandariza las
interacciones con **plantillas metodológicas**.

Monorepo **Turborepo + pnpm**, TypeScript end-to-end.

---

## Qué resuelve

| Pilar | Cómo está implementado |
|---|---|
| **Workflow gobernado** | Estados, transiciones y roles permitidos viven en la base de datos, no en `if/else`. Un motor transaccional valida las guardas y ejecuta el cambio. |
| **Bitácora inmodificable** | Cada acción se encadena por hash (`rowHash = H(prevHash ‖ contenido)`). Cualquiera puede pulsar *Verificar integridad* y comprobar que nadie alteró el registro. |
| **SLA parametrizado** | Tiempos por etapa configurables; un barrido marca *en riesgo* / *vencido*, notifica y escala. |
| **Plantillas como datos** | El formulario de apertura (T1) se renderiza desde un JSON Schema guardado en la DB y se valida contra él en el servidor. |
| **Visibilidad por rol** | Una capa única (`packages/rbac`) decide qué ve y qué puede hacer cada rol; el menú, el enmascaramiento de datos y los permisos del backend derivan todos de ella. |

## Stack

Next.js 15 (App Router) · tRPC 11 · TanStack Query · Auth.js 5 (JWT) · Prisma 6 + PostgreSQL ·
Zod 4 · ajv (JSON Schema) · Tailwind v4 · Vitest · Docker Compose (dev) · Terraform (Neon + Vercel).

## Estructura

```
apps/
  web/                Next.js 15 + tRPC (servidor y cliente) + UI
packages/
  db/                 Prisma schema, cliente, seed y hash-chain de la bitácora
  rbac/               capa única de autorización: permisos, masking y navegación
  workflow/           motor de transiciones, consumidor de outbox y barrido de SLA
  forms/              validación JSON Schema (ajv) y derivación de campos
  schemas/            contratos Zod compartidos
infra/                Terraform (Neon + Vercel)
docker/               Dockerfiles (web / worker)
docker-compose.yml    Postgres, Redis y MinIO para desarrollo
```

---

## Clonar y correr la demo

**Requisitos:** Docker, Node 20+ y pnpm.

```bash
git clone git@github.com:function14/Nodus-Ingenieria-SAS.git
cd Nodus-Ingenieria-SAS

# 1. Variables de entorno (los valores por defecto sirven para local)
cp packages/db/.env.example packages/db/.env
cp apps/web/.env.example    apps/web/.env.local
#    en apps/web/.env.local pon un AUTH_SECRET real:  openssl rand -base64 32

# 2. Postgres local (puerto 5442, no choca con otros Postgres)
docker compose up -d db

# 3. Dependencias y cliente de Prisma
pnpm install
pnpm --filter @nodus/db exec prisma generate

# 4. Esquema y datos de demostración
pnpm --filter @nodus/db exec prisma migrate deploy
pnpm --filter @nodus/db run seed

# 5. Arrancar
pnpm dev        # http://localhost:3000
```

### Usuarios de demostración
Contraseña para todos: `demo1234`

| Usuario | Rol | Qué puede hacer |
|---|---|---|
| `advisory@demo.nodus` | Advisory / PMO | Command Center, clasificar, asignar, cerrar, barrido de SLA |
| `consultor@demo.nodus` | Consultor | Ver la bolsa y postularse; solo ve datos del cliente en sus casos asignados |
| `mipyme@demo.nodus` | Mipyme | Abrir casos y aceptar el cierre |
| `admin@demo.nodus` | Administrador | Acceso de gobierno |

El botón **"Ver como"** del encabezado cambia de rol re-autenticando como ese usuario.

### Recorrido sugerido (5 minutos)
1. Entra como **advisory** → el *Dashboard PMO* muestra KPIs, embudo, pipeline y SLA reales.
2. **Casos → “+ Nuevo caso”** → el formulario se genera desde la plantilla **T1**.
3. Abre el caso → ejecuta una transición → mira crecer el **expediente** y pulsa **“Verificar integridad”**.
4. **Ver como → Consultor**: las empresas aparecen como **“Empresa reservada”** y el menú se reduce.
   En **Bolsa interna** puedes postularte a un caso clasificado.
5. Vuelve a **advisory** → en **Bolsa interna** asigna a ese consultor → el caso avanza y el consultor
   ya ve los datos reales del cliente.
6. **“Revisar SLA”** en el dashboard → aparecen alertas en **Alertas**; en **Workflow** ves la máquina
   de estados tal como está configurada en la base de datos.

### Comprobar el canal de correo

Las comunicaciones se rigen por plantillas **TCOM** y una tabla de reglas
`evento → plantilla → destinatario → canal`. Dos de esas reglas salen por **email**, y las
dispara el propio recorrido de arriba:

| Qué haces | Regla | Quién recibiría |
|---|---|---|
| **“Revisar SLA”** (paso 6) | `sla_breached` → **TCOM9** | `advisory@demo.nodus` |
| Creas un caso de *RetailModa* (paso 2) | `caso_creado` → **TCOM1** | `mipyme@demo.nodus` |

En **Alertas** verás el registro de envío: destinatario, asunto renderizado y estado de
entrega. Sin proveedor configurado el estado es **“sin proveedor configurado”** — el sistema
**no finge** que envió. Cada envío queda además encadenado en la bitácora con su
destinatario, que es lo que exige RT-013.

Para que salgan correos de verdad basta con añadir `RESEND_API_KEY` (y `EMAIL_FROM` con un
dominio verificado): esos mismos registros pasan a **“entregado”**, sin tocar una línea de
código. En demos, `EMAIL_REDIRECT_TO` manda todo el correo a un único buzón para no escribir
nunca a terceros, conservando en la bitácora el destinatario real.

---

## Comandos

```bash
pnpm dev                 # desarrollo
pnpm build               # build de todo el monorepo (incluye lint y typecheck)
pnpm lint
pnpm test                # unitarios (no requieren base de datos)
pnpm test:integration    # autorización por rol contra los resolvers reales (requiere DB + seed)

# smokes de integración (requieren DB)
pnpm --filter @nodus/workflow run smoke   # transiciones, guardas y cadena de la bitácora
pnpm --filter @nodus/forms    run smoke   # validador de plantillas
```

## Despliegue

La infraestructura gestionada (proyecto **Neon** y proyecto **Vercel** con sus variables) se
provisiona desde `infra/` con Terraform; ver `infra/README.md`. En producción las migraciones se
aplican con `prisma migrate deploy` y el barrido de SLA corre como *cron* de Vercel
(`apps/web/vercel.json` → `/api/cron/sla`).

## Alcance

Es un **MVP funcional**: workflow, bitácora verificable, SLA, plantillas, bolsa interna,
autorización por rol y panel de control operan de extremo a extremo sobre PostgreSQL.

Queda fuera de este alcance, de forma deliberada: gestión documental en S3, PWA offline y push,
worker dedicado para la outbox (hoy el consumidor es in-process), *row level security* en Postgres
como defensa en profundidad, y pruebas end-to-end de navegador.
