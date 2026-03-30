output "connection_name" { value = google_sql_database_instance.db.connection_name }
output "ip_address" { value = google_sql_database_instance.db.public_ip_address }
output "password" { value = random_password.db_password.result; sensitive = true }
