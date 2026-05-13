#!/bin/bash
# Daglig säkerhetskopia för Cupportalen
# Säkerhetskopierar: SQLite-databas, uppladdade filer och .env
#
# Förutsättningar:
#   - Extern disk monterad på /mnt/backup
#   - Körs som en användare med tillgång till docker
#
# Installation:
#   sudo cp backup.sh /usr/local/bin/backup-cupportalen
#   sudo chmod +x /usr/local/bin/backup-cupportalen
#   Lägg till i crontab: 0 2 * * * /usr/local/bin/backup-cupportalen >> /var/log/backup-cupportalen.log 2>&1

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$HOME/cupportalen}"
BACKUP_DIR="/mnt/backup/cupportalen"
KEEP_DAYS=30
DATE=$(date +%Y-%m-%d)
CONTAINER="cupportalen-backend-1"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.prod.yml"

log() { echo "[$(date -Iseconds)] $*"; }

# --- Kontrollera att extern disk är monterad ---
if ! mountpoint -q /mnt/backup; then
  log "FEL: /mnt/backup är inte monterat. Avbryter."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# --- 1. SQLite-databas ---
# Använder SQLites inbyggda .backup-kommando för konsekvent kopia även under drift
log "Säkerhetskopierar databas..."
docker exec "$CONTAINER" sqlite3 /data/cups.db ".backup '/data/cups-backup-tmp.db'"
docker cp "$CONTAINER:/data/cups-backup-tmp.db" "$BACKUP_DIR/cups-$DATE.db"
docker exec "$CONTAINER" rm -f /data/cups-backup-tmp.db
log "Databas klar: cups-$DATE.db ($(du -sh "$BACKUP_DIR/cups-$DATE.db" | cut -f1))"

# --- 2. Uppladdade filer (bilagor) ---
log "Säkerhetskopierar bilagor..."
if docker exec "$CONTAINER" test -d /data/uploads; then
  docker cp "$CONTAINER:/data/uploads" "$BACKUP_DIR/uploads-$DATE"
  log "Bilagor klara: uploads-$DATE"
else
  log "Inga bilagor att kopiera."
fi

# --- 3. .env (innehåller Gmail-tokens och hemligheter) ---
log "Säkerhetskopierar .env..."
cp "$PROJECT_DIR/.env" "$BACKUP_DIR/env-$DATE"
chmod 600 "$BACKUP_DIR/env-$DATE"
log ".env klar"

# --- 4. Komprimera dagens backup ---
log "Komprimerar..."
tar -czf "$BACKUP_DIR/backup-$DATE.tar.gz" \
  -C "$BACKUP_DIR" \
  "cups-$DATE.db" \
  $([ -d "$BACKUP_DIR/uploads-$DATE" ] && echo "uploads-$DATE" || true) \
  "env-$DATE"

rm -f "$BACKUP_DIR/cups-$DATE.db" "$BACKUP_DIR/env-$DATE"
rm -rf "$BACKUP_DIR/uploads-$DATE"
log "Komprimerad: backup-$DATE.tar.gz ($(du -sh "$BACKUP_DIR/backup-$DATE.tar.gz" | cut -f1))"

# --- 5. Ta bort gamla backuper ---
log "Rensar backuper äldre än $KEEP_DAYS dagar..."
find "$BACKUP_DIR" -name "backup-*.tar.gz" -mtime +"$KEEP_DAYS" -delete
REMAINING=$(ls "$BACKUP_DIR"/backup-*.tar.gz 2>/dev/null | wc -l)
log "Klar. $REMAINING backup(er) bevarade."
