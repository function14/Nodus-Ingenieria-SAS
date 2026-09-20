terraform {
  required_providers {
    vercel = {
      source = "vercel/vercel"
    }
  }
}

resource "vercel_project" "web" {
  name           = var.project_name
  framework      = "nextjs"
  root_directory = var.root_directory

  # Al crear el proyecto por API esto queda en false (por el panel viene en
  # true). Sin VERCEL/VERCEL_URL, Auth.js deja de confiar en el host y toda
  # /api/auth/* responde 500 "problem with the server configuration".
  automatically_expose_system_environment_variables = true

  # En un monorepo pnpm, Vercel no genera el cliente de Prisma de forma fiable:
  # sin este paso el build cae con "@prisma/client did not initialize yet".
  build_command = "pnpm --filter @nodus/db exec prisma generate && pnpm build"

  git_repository = var.git_repo == null ? null : {
    type = "github"
    repo = var.git_repo
  }
}

resource "vercel_project_environment_variable" "database_url" {
  project_id = vercel_project.web.id
  key        = "DATABASE_URL"
  value      = var.database_url
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "auth_secret" {
  project_id = vercel_project.web.id
  key        = "AUTH_SECRET"
  value      = var.auth_secret
  target     = ["production", "preview"]
  sensitive  = true
}

# Vercel Cron manda "Authorization: Bearer $CRON_SECRET". Sin esta variable
# cualquiera podria disparar el barrido de SLA desde fuera.
resource "vercel_project_environment_variable" "cron_secret" {
  project_id = vercel_project.web.id
  key        = "CRON_SECRET"
  value      = var.cron_secret
  target     = ["production", "preview"]
  sensitive  = true
}

# Redundante con las variables de sistema, pero deja la intencion explicita:
# es la unica forma de que Auth.js confie en el host si alguien las desactiva.
resource "vercel_project_environment_variable" "auth_trust_host" {
  project_id = vercel_project.web.id
  key        = "AUTH_TRUST_HOST"
  value      = "true"
  target     = ["production", "preview"]
  sensitive  = false
}

# Repositorio documental en Cloudflare R2. Si no se pasan credenciales el
# entorno queda sin documentos y la aplicacion lo dice con un error claro, en
# vez de intentar hablar con el MinIO de desarrollo.
resource "vercel_project_environment_variable" "r2_account_id" {
  count      = var.r2 == null ? 0 : 1
  project_id = vercel_project.web.id
  key        = "R2_ACCOUNT_ID"
  value      = var.r2.account_id
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "r2_access_key_id" {
  count      = var.r2 == null ? 0 : 1
  project_id = vercel_project.web.id
  key        = "R2_ACCESS_KEY_ID"
  value      = var.r2.access_key_id
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "r2_secret_access_key" {
  count      = var.r2 == null ? 0 : 1
  project_id = vercel_project.web.id
  key        = "R2_SECRET_ACCESS_KEY"
  value      = var.r2.secret_access_key
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "r2_bucket" {
  count      = var.r2 == null ? 0 : 1
  project_id = vercel_project.web.id
  key        = "R2_BUCKET"
  value      = var.r2.bucket
  target     = ["production", "preview"]
  sensitive  = true
}
