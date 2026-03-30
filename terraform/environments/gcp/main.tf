terraform {
  required_providers {
    google = { source = "hashicorp/google"; version = "~> 5.0" }
    cloudflare = { source = "cloudflare/cloudflare"; version = "~> 4.0" }
    random = { source = "hashicorp/random" }
  }
}

provider "google" {
  project = var.gcp_project
  region  = var.gcp_region
}

module "api" {
  source   = "../../modules/compute"
  name     = "famcal-api"
  image    = var.api_image
  port     = 3000
  region   = var.gcp_region
  env_vars = var.api_env_vars
}

module "nova_proxy" {
  source   = "../../modules/compute"
  name     = "famcal-nova-proxy"
  image    = var.nova_proxy_image
  port     = 8080
  region   = var.gcp_region
  env_vars = { NOVA_API_KEY = var.nova_api_key, PORT = "8080" }
}

module "database" {
  source = "../../modules/database"
  name   = "famcal-db"
  region = var.gcp_region
}

module "storage" {
  source = "../../modules/storage"
  name   = "famcal-storage-${var.gcp_project}"
  region = var.gcp_region
}

module "registry" {
  source = "../../modules/registry"
  name   = "famcal"
  region = var.gcp_region
}
