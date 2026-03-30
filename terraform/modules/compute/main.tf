resource "google_cloud_run_v2_service" "service" {
  name     = var.name
  location = var.region

  template {
    containers {
      image = var.image
      ports {
        container_port = var.port
      }
      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }
      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }
    }
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.service.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
