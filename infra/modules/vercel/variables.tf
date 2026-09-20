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

variable "cron_secret" {
  type        = string
  description = "Secreto que protege /api/cron/sla frente a disparos externos."
  sensitive   = true
}

variable "r2" {
  type = object({
    account_id        = string
    access_key_id     = string
    secret_access_key = string
    bucket            = string
  })
  description = "Cloudflare R2 para el repositorio documental. null = sin documentos en el entorno."
  sensitive   = true
  default     = null
}
