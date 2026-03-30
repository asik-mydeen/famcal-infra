variable "aws_region" { type = string; default = "us-east-1" }
variable "aws_account_id" { type = string }
variable "api_image" { type = string }
variable "api_env_vars" { type = map(string); sensitive = true }
