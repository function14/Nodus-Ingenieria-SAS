output "project_id" {
  description = "ID del proyecto Neon."
  value       = neon_project.this.id
}

output "connection_uri" {
  description = "Cadena de conexion (DATABASE_URL) del proyecto."
  value       = neon_project.this.connection_uri
  sensitive   = true
}

output "connection_uri_pooler" {
  description = "Cadena de conexion via pooler: la que debe usar la app en serverless."
  value       = neon_project.this.connection_uri_pooler
  sensitive   = true
}
