variable "name" { type = string }
variable "image" { type = string }
variable "port" { type = number }
variable "env_vars" { type = map(string); default = {}; sensitive = true }
variable "cpu" { type = string; default = "1" }
variable "memory" { type = string; default = "512Mi" }
variable "min_instances" { type = number; default = 0 }
variable "max_instances" { type = number; default = 2 }
variable "region" { type = string }
