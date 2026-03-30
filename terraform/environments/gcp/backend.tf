terraform {
  backend "gcs" {
    bucket = "famcal-terraform-state"
    prefix = "gcp"
  }
}
