#!/bin/bash
# Migrates data from Supabase Cloud to self-hosted Supabase
set -euo pipefail

CLOUD_HOST="${CLOUD_SUPABASE_HOST:?Set CLOUD_SUPABASE_HOST}"
CLOUD_PASS="${CLOUD_SUPABASE_PASS:?Set CLOUD_SUPABASE_PASS}"
LOCAL_HOST="${LOCAL_SUPABASE_HOST:-172.16.0.1}"
LOCAL_PORT="${LOCAL_SUPABASE_PORT:-5432}"
LOCAL_PASS="${LOCAL_SUPABASE_PASS:?Set LOCAL_SUPABASE_PASS}"

echo "=== Step 1: Export schema from cloud ==="
PGPASSWORD="$CLOUD_PASS" pg_dump \
  --schema-only --no-owner --no-acl \
  -h "$CLOUD_HOST" -p 5432 -U postgres -d postgres \
  > /tmp/famcal-schema.sql

echo "=== Step 2: Export data from cloud ==="
PGPASSWORD="$CLOUD_PASS" pg_dump \
  --data-only --no-owner --no-acl \
  -h "$CLOUD_HOST" -p 5432 -U postgres -d postgres \
  --exclude-table-data='auth.*' \
  > /tmp/famcal-data.sql

echo "=== Step 3: Export auth users ==="
PGPASSWORD="$CLOUD_PASS" pg_dump \
  --data-only --no-owner --no-acl \
  -h "$CLOUD_HOST" -p 5432 -U postgres -d postgres \
  -t 'auth.users' -t 'auth.identities' \
  > /tmp/famcal-auth.sql

echo "=== Step 4: Import schema to self-hosted ==="
PGPASSWORD="$LOCAL_PASS" psql \
  -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U postgres -d postgres \
  < /tmp/famcal-schema.sql

echo "=== Step 5: Import data to self-hosted ==="
PGPASSWORD="$LOCAL_PASS" psql \
  -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U postgres -d postgres \
  < /tmp/famcal-data.sql

echo "=== Step 6: Import auth users ==="
PGPASSWORD="$LOCAL_PASS" psql \
  -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U postgres -d postgres \
  < /tmp/famcal-auth.sql

echo "=== Step 7: Verify row counts ==="
for table in families family_members events tasks meals lists list_items rewards notes countdowns photos alarms ai_preferences conversations conversation_messages ai_memories; do
  cloud_count=$(PGPASSWORD="$CLOUD_PASS" psql -h "$CLOUD_HOST" -U postgres -d postgres -t -c "SELECT count(*) FROM public.$table;" 2>/dev/null || echo "N/A")
  local_count=$(PGPASSWORD="$LOCAL_PASS" psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U postgres -d postgres -t -c "SELECT count(*) FROM public.$table;" 2>/dev/null || echo "N/A")
  echo "  $table: cloud=$cloud_count local=$local_count"
done

echo "=== Migration complete ==="
