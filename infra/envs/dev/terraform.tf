terraform {
  required_version = ">= 1.6.0"

  required_providers {
    neon = {
      source  = "kislerdm/neon"
      version = ">= 0.6.0"
    }
    vercel = {
      source  = "vercel/vercel"
      version = ">= 1.0.0"
    }
  }

  # Estado local para la prueba; en prod usar backend remoto
  # (Terraform Cloud, o S3/R2 con bloqueo).
  backend "local" {}
}
