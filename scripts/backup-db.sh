#!/bin/bash
# Daily database backup for TrueNAS cron
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/mnt/pool/backups/famcal}"
LOCAL_HOST="${LOCAL_SUPABASE_HOST:-172.16.0.1}"
LOCAL_PORT="${LOCAL_SUPABASE_PORT:-5432}"
LOCAL_PASS="${LOCAL_SUPABASE_PASS:?Set LOCAL_SUPABASE_PASS}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="famcal_backup_${TIMESTAMP}.sql.gz"

echo "[backup] Starting backup at $(date)"

PGPASSWORD="$LOCAL_PASS" pg_dump \
  -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U postgres -d postgres \
  | gzip > "$BACKUP_DIR/$FILENAME"

echo "[backup] Created: $BACKUP_DIR/$FILENAME ($(du -h "$BACKUP_DIR/$FILENAME" | cut -f1))"

find "$BACKUP_DIR" -name "famcal_backup_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[backup] Cleaned up backups older than $RETENTION_DAYS days"
