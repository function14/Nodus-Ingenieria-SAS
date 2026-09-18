variable "project_name" {
  type        = string
  description = "Nombre del proyecto Neon."
}

variable "region_id" {
  type        = string
  description = "Region de Neon (ej. aws-us-east-1)."
  default     = "aws-us-east-1"
}

variable "pg_version" {
  type        = number
  description = "Version mayor de PostgreSQL."
  default     = 16
}

variable "org_id" {
  type        = string
  description = "Organizacion de Neon. Obligatorio si la cuenta pertenece a una org."
  default     = null
}

variable "history_retention_seconds" {
  type        = number
  description = "Ventana de restauracion punto-en-el-tiempo. Maximo 21600 en el plan free."
  default     = 21600
}
