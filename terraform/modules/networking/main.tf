resource "cloudflare_record" "app" {
  count   = var.cloudflare_zone_id != "" ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = var.domain
  content = var.target_url
  type    = "CNAME"
  proxied = true
}
