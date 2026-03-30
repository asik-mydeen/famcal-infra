resource "google_sql_database_instance" "db" {
  name             = var.name
  region           = var.region
  database_version = var.database_version

  settings {
    tier = var.tier
    ip_configuration {
      ipv4_enabled = true
      authorized_networks {
        name  = "all"
        value = "0.0.0.0/0"
      }
    }
    backup_configuration {
      enabled    = true
      start_time = "03:00"
    }
  }
  deletion_protection = true
}

resource "google_sql_database" "database" {
  name     = var.database_name
  instance = google_sql_database_instance.db.name
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "google_sql_user" "user" {
  name     = "famcal"
  instance = google_sql_database_instance.db.name
  password = random_password.db_password.result
}
