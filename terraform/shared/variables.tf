variable "project_name" {
  type    = string
  default = "famcal"
}

variable "domain" {
  type    = string
  default = "calendar.asikmydeen.com"
}

variable "api_image" {
  type        = string
  description = "Docker image for the API server"
}

variable "nova_proxy_image" {
  type        = string
  description = "Docker image for the Nova proxy"
}

variable "nginx_image" {
  type        = string
  description = "Docker image for the Nginx frontend"
}
