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
