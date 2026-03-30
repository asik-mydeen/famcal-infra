variable "gcp_project" { type = string }
variable "gcp_region" { type = string; default = "us-central1" }
variable "api_image" { type = string }
variable "nova_proxy_image" { type = string }
variable "api_env_vars" { type = map(string); sensitive = true }
variable "nova_api_key" { type = string; sensitive = true }
