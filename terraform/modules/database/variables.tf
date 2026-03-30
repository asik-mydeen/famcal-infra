variable "name" { type = string }
variable "region" { type = string }
variable "tier" { type = string; default = "db-f1-micro" }
variable "database_name" { type = string; default = "postgres" }
variable "database_version" { type = string; default = "POSTGRES_15" }
