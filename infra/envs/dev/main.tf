provider "neon" {
  api_key = var.neon_api_key
}

provider "vercel" {
  api_token = var.vercel_api_token
  team      = var.vercel_team
}

module "neon" {
  source       = "../../modules/neon"
  project_name = "nodus-dev"
  region_id    = "aws-us-east-1"
  pg_version   = 16
}

module "vercel" {
  source       = "../../modules/vercel"
  project_name = "nodus-web-dev"
  git_repo     = var.git_repo
  database_url = module.neon.connection_uri
  auth_secret  = var.auth_secret
}
