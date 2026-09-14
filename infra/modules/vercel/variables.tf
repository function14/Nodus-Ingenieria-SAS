variable "project_name" {
  type        = string
  description = "Nombre del proyecto en Vercel."
}

variable "root_directory" {
  type        = string
  description = "Directorio de la app dentro del monorepo."
  default     = "apps/web"
}

variable "git_repo" {
  type        = string
  description = "owner/repo de GitHub para autodespliegue (opcional)."
  default     = null
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "auth_secret" {
  type      = string
  sensitive = true
}
