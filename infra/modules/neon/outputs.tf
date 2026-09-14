output "project_id" {
  description = "ID del proyecto Neon."
  value       = neon_project.this.id
}

output "connection_uri" {
  description = "Cadena de conexion (DATABASE_URL) del proyecto."
  value       = neon_project.this.connection_uri
  sensitive   = true
}
