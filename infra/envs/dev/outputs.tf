output "database_url" {
  description = "DATABASE_URL provisionada por Neon."
  value       = module.neon.connection_uri
  sensitive   = true
}

output "vercel_project_id" {
  description = "ID del proyecto Vercel creado."
  value       = module.vercel.project_id
}
