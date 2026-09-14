terraform {
  required_providers {
    neon = {
      source = "kislerdm/neon"
    }
  }
}

resource "neon_project" "this" {
  name       = var.project_name
  region_id  = var.region_id
  pg_version = var.pg_version
}
