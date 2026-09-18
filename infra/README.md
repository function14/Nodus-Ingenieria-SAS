# infra/ — Infraestructura como código (Terraform)

Provisiona la infra gestionada del MVP: **Neon** (PostgreSQL) y el **proyecto
Vercel** con sus variables de entorno. El cómputo lo gestiona Vercel; no hay
servidores propios en el MVP.

## Estructura

- `modules/neon` — proyecto Neon (Postgres 16). Expone dos salidas: `connection_uri`
  (endpoint **directo**) y `connection_uri_pooler` (endpoint **pooled**).
- `modules/vercel` — proyecto Vercel (Next.js, root `apps/web`), *build command* y las
  variables `DATABASE_URL`, `AUTH_SECRET` y `CRON_SECRET` para production y preview.
- `envs/dev` — entorno que compone ambos módulos y genera el `CRON_SECRET`.

## Uso

```bash
cd infra/envs/dev
cp terraform.tfvars.example terraform.tfvars   # completa tokens (no se commitea)
terraform init
terraform plan
terraform apply

terraform output -raw database_url_migraciones   # para prisma migrate deploy / seed
```

El estado (`*.tfstate`), `terraform.tfvars` y los planes guardados están gitignorados.

## Decisiones que no son obvias

**Pooled para la app, directo para las migraciones.** La app corre en funciones
serverless, donde cada invocación abriría su propia conexión: por eso recibe el
endpoint del *pooler*. Las migraciones van por el endpoint directo, porque el pooler
no mantiene la sesión que necesita el *advisory lock* de Prisma Migrate.

**`connect_timeout` ampliado.** El cómputo de Neon se suspende cuando no hay tráfico y
tarda unos segundos en despertar. Con los 5 s por defecto de Prisma, la primera
petición después de un rato falla con `P1001`; las cadenas que emite Terraform llevan
`connect_timeout=30`.

**`build_command` explícito.** En un monorepo pnpm, Vercel no genera el cliente de
Prisma de forma fiable. Sin `prisma generate` previo al build, el despliegue cae con
*"@prisma/client did not initialize yet"*.

**`CRON_SECRET` lo genera Terraform.** Vercel Cron llama a `/api/cron/sla` con
`Authorization: Bearer $CRON_SECRET`; la ruta rechaza cualquier otra cosa. Al generarlo
como `random_password`, el secreto no pasa por manos de nadie.

**`org_id` en Neon.** Si la cuenta pertenece a una organización, la API rechaza la
creación del proyecto con `400 org_id is required`. Se obtiene en
`GET /api/v2/users/me/organizations` o en los ajustes de la organización.

## Límites del plan gratuito

- Neon: `history_retention_seconds` no puede pasar de `21600` (6 h). El *default* del
  provider (24 h) es rechazado, por eso el módulo lo fija.
- Vercel Hobby: solo admite *cron jobs* **diarios**. `apps/web/vercel.json` programa el
  barrido de SLA una vez al día; en la demo se dispara a mano desde el panel. En Pro se
  puede volver a una expresión más frecuente.
- El enlace con GitHub creado por API no instala el *webhook*, así que los `push` no
  disparan build por sí solos. Se resuelve conectando el repositorio una vez desde el
  panel de Vercel, o lanzando el despliegue con la API.
