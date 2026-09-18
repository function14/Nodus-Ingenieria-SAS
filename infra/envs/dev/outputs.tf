output "database_url_migraciones" {
  description = "Endpoint directo de Neon: el que se usa para migrate deploy y seed."
  value       = "${split("?", module.neon.connection_uri)[0]}?sslmode=require&connect_timeout=30"
  sensitive   = true
}

output "database_url_app" {
  description = "Endpoint pooled: el que Terraform inyecta en Vercel como DATABASE_URL."
  value       = local.app_database_url
  sensitive   = true
}

output "vercel_project_id" {
  description = "ID del proyecto Vercel creado."
  value       = module.vercel.project_id
}
