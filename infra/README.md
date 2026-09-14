# infra/ — Infraestructura como codigo (Terraform)

Provisiona la infra gestionada del MVP: **Neon** (PostgreSQL) y el **proyecto
Vercel** con sus variables de entorno. El computo lo gestiona Vercel (no hay
servidores propios en el MVP).

## Estructura
- `modules/neon` — proyecto Neon (Postgres 16) -> output `connection_uri`.
- `modules/vercel` — proyecto Vercel (Next.js, root `apps/web`) + env vars
  (`DATABASE_URL`, `AUTH_SECRET`) para production/preview.
- `envs/dev` — entorno que compone ambos modulos.

## Uso
```bash
cd infra/envs/dev
cp terraform.tfvars.example terraform.tfvars   # completa tokens (no se commitea)
terraform init
terraform validate
terraform plan     # requiere tokens reales de Neon y Vercel
terraform apply    # opcional; crea la infra
```
El estado (`*.tfstate`) y `terraform.tfvars` estan gitignorados. `terraform apply`
es opcional para la prueba: el valor esta en el IaC versionado y validado.
