terraform {
  required_providers {
    aws = { source = "hashicorp/aws"; version = "~> 5.0" }
    random = { source = "hashicorp/random" }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_ecs_cluster" "famcal" {
  name = "famcal"
}

resource "aws_ecs_task_definition" "api" {
  family                   = "famcal-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"

  container_definitions = jsonencode([{
    name  = "famcal-api"
    image = var.api_image
    portMappings = [{ containerPort = 3000 }]
    environment = [for k, v in var.api_env_vars : { name = k, value = v }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/famcal-api"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

resource "aws_db_instance" "postgres" {
  identifier           = "famcal-db"
  engine               = "postgres"
  engine_version       = "15"
  instance_class       = "db.t4g.micro"
  allocated_storage    = 20
  db_name              = "famcal"
  username             = "famcal"
  password             = random_password.db_password.result
  publicly_accessible  = true
  skip_final_snapshot  = true
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "aws_s3_bucket" "storage" {
  bucket = "famcal-storage-${var.aws_account_id}"
}
