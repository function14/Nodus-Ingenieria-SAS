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
