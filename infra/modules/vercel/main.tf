terraform {
  required_providers {
    vercel = {
      source = "vercel/vercel"
    }
  }
}

resource "vercel_project" "web" {
  name           = var.project_name
  root_directory = var.root_directory

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
