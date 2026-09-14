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
