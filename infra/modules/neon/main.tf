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

  # Las cuentas que pertenecen a una organizacion deben declararla:
  # sin org_id la API responde 400 "org_id is required".
  org_id = var.org_id

  # Ventana de restauracion punto-en-el-tiempo. El default del provider
  # (86400) supera el maximo del plan free de Neon (21600).
  history_retention_seconds = var.history_retention_seconds
}
