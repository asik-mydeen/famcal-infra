resource "google_storage_bucket" "storage" {
  name          = var.name
  location      = var.region
  force_destroy = var.force_destroy

  uniform_bucket_level_access = true

  cors {
    origin          = ["https://calendar.asikmydeen.com"]
    method          = ["GET", "PUT", "POST"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }
}
