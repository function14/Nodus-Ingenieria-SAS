provider "neon" {
  api_key = var.neon_api_key
}

provider "vercel" {
  api_token = var.vercel_api_token
  team      = var.vercel_team
}

# Secreto del cron: lo genera Terraform, nadie tiene que manipularlo.
resource "random_password" "cron_secret" {
  length  = 32
  special = false
}

locals {
  # La app corre en funciones serverless, asi que va por el pooler.
  # connect_timeout ampliado: el compute de Neon arranca en frio y con los 5s
  # por defecto de Prisma la primera peticion falla con P1001.
  app_database_url = "${split("?", module.neon.connection_uri_pooler)[0]}?sslmode=require&connect_timeout=30"
}

module "neon" {
  source       = "../../modules/neon"
  project_name = "nodus-dev"
  region_id    = "aws-us-east-1"
  pg_version   = 16
  org_id       = var.neon_org_id
}

module "vercel" {
  source       = "../../modules/vercel"
  project_name = "nodus-web-dev"
  git_repo     = var.git_repo
  database_url = local.app_database_url
  auth_secret  = var.auth_secret
  cron_secret  = random_password.cron_secret.result
  r2           = var.r2
}
