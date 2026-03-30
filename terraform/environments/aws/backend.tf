terraform {
  backend "s3" {
    bucket = "famcal-terraform-state"
    key    = "aws/terraform.tfstate"
    region = "us-east-1"
  }
}
