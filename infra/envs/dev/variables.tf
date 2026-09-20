variable "neon_api_key" {
  type        = string
  description = "API key de Neon."
  sensitive   = true
}

variable "vercel_api_token" {
  type        = string
  description = "Token de API de Vercel."
  sensitive   = true
}

variable "vercel_team" {
  type        = string
  description = "Slug/ID del team de Vercel (opcional)."
  default     = null
}

variable "auth_secret" {
  type        = string
  description = "AUTH_SECRET para Auth.js en la app desplegada."
  sensitive   = true
}

variable "git_repo" {
  type        = string
  description = "owner/repo de GitHub a conectar en Vercel (opcional)."
  default     = null
}

variable "neon_org_id" {
  type        = string
  description = "Organizacion de Neon (org-xxxx). Requerido por la API al crear el proyecto."
  default     = null
}

variable "r2" {
  type = object({
    account_id        = string
    access_key_id     = string
    secret_access_key = string
    bucket            = string
  })
  description = "Cloudflare R2 (repositorio documental). Dejar null hasta tener el bucket."
  sensitive   = true
  default     = null
}
