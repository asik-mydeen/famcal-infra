terraform {
  required_providers {
    hcloud = { source = "hetznercloud/hcloud"; version = "~> 1.45" }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

resource "hcloud_ssh_key" "deploy" {
  name       = "famcal-deploy"
  public_key = var.ssh_public_key
}

resource "hcloud_server" "famcal" {
  name        = "famcal"
  server_type = "cx22"
  image       = "ubuntu-24.04"
  location    = "fsn1"
  ssh_keys    = [hcloud_ssh_key.deploy.id]
  user_data   = file("${path.module}/cloud-init.yml")
}

resource "hcloud_firewall" "famcal" {
  name = "famcal"
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_firewall_attachment" "famcal" {
  firewall_id = hcloud_firewall.famcal.id
  server_ids  = [hcloud_server.famcal.id]
}
