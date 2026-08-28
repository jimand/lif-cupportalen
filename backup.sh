#!/bin/bash
# Daglig säkerhetskopia för Cupportalen
# Säkerhetskopierar: SQLite-databas, uppladdade filer och .env
#
# Förutsättningar:
#   - Extern disk (eller NAS-share) monterad på /mnt/backup
#   - Körs som en användare med tillgång till docker
#   - gnupg installerat (för kryptering av .env)
#
# Installation:
#   sudo cp backup.sh /usr/local/bin/backup-cupportalen
#   sudo chmod +x /usr/local/bin/backup-cupportalen
#
#   Skapa /etc/cupportalen-backup.env med rättigheter 600:
#     PROJECT_DIR=/opt/cupportalen
#     BACKUP_PASSPHRASE=<lang slumpmassig strang>
#
#   Crontab:
#     0 2 * * * . /etc/cupportalen-backup.env && /usr/local/bin/backup-cupportalen >> /var/log/backup-cupportalen.log 2>&1
#
# Återställning: se avsnittet "Återställa från backup" i README.md

set -euo pipefail
umask 077   # allt som skapas här är läsbart endast för ägaren

# --- Konfiguration ---
# PROJECT_DIR måste sättas explicit. Tidigare gissade skriptet på
# "$HOME/cupportalen", vilket blir /root/cupportalen under cron och därmed
# fel katalog utan att det märks förrän .env-kopieringen failar.
if [ -z "${PROJECT_DIR:-}" ]; then
  echo "FEL: PROJECT_DIR är inte satt. Sätt den till projektets katalog, t.ex. /opt/cupportalen." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-/mnt/backup/cupportalen}"
MOUNT_POINT="${MOUNT_POINT:-/mnt/backup}"
KEEP_DAYS="${KEEP_DAYS:-30}"
CONTAINER="${CONTAINER:-cupportalen-backend-1}"
DATE=$(date +%Y-%m-%d)

log()  { echo "[$(date -Iseconds)] $*"; }
fail() { echo "[$(date -Iseconds)] FEL: $*" >&2; exit 1; }

# --- Förkontroller ---
[ -d "$PROJECT_DIR" ] || fail "PROJECT_DIR '$PROJECT_DIR' finns inte."
[ -f "$PROJECT_DIR/.env" ] || fail "Hittar ingen .env i '$PROJECT_DIR'."

mountpoint -q "$MOUNT_POINT" || fail "$MOUNT_POINT är inte monterat. Avbryter."

docker inspect "$CONTAINER" >/dev/null 2>&1 \
  || fail "Containern '$CONTAINER' finns inte. Kontrollera namnet med 'docker ps'."

# .env innehåller JWT_SECRET, GMAIL_REFRESH_TOKEN och GMAIL_CLIENT_SECRET.
# Krypterad som standard; klartext kräver ett medvetet val.
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  command -v gpg >/dev/null || fail "BACKUP_PASSPHRASE är satt men gpg saknas. Installera gnupg."
  ENCRYPT_ENV=1
elif [ "${BACKUP_ALLOW_PLAINTEXT_ENV:-0}" = "1" ]; then
  log "VARNING: .env säkerhetskopieras i klartext (BACKUP_ALLOW_PLAINTEXT_ENV=1)."
  ENCRYPT_ENV=0
else
  fail "BACKUP_PASSPHRASE saknas. Sätt den för att kryptera .env, eller sätt BACKUP_ALLOW_PLAINTEXT_ENV=1 för att medvetet spara den i klartext."
fi

# --- Lås mot samtidiga körningar ---
exec 9>"/tmp/backup-cupportalen.lock"
flock -n 9 || fail "En annan backup körs redan. Avbryter."

mkdir -p "$BACKUP_DIR"

cleanup() {
  rm -f "$BACKUP_DIR/cups-$DATE.db" "$BACKUP_DIR/env-$DATE" "$BACKUP_DIR/env-$DATE.gpg"
  rm -rf "$BACKUP_DIR/uploads-$DATE"
}
trap cleanup EXIT

# --- 1. SQLite-databas ---
# .backup ger en konsistent kopia även under drift (viktigt med WAL påslaget).
log "Säkerhetskopierar databas..."
docker exec "$CONTAINER" sqlite3 /data/cups.db ".backup '/data/cups-backup-tmp.db'"

# Verifiera kopian innan den packas – en tyst korrupt eller tom backup är
# värre än ingen backup, eftersom den ser ut att fungera. Kontrollen körs i
# containern, som är den enda plats vi vet har sqlite3.
log "Verifierar databaskopian..."
INTEGRITY=$(docker exec "$CONTAINER" sqlite3 /data/cups-backup-tmp.db "PRAGMA integrity_check;")
if [ "$INTEGRITY" != "ok" ]; then
  docker exec "$CONTAINER" rm -f /data/cups-backup-tmp.db || true
  fail "integrity_check gav '$INTEGRITY' – backupen är inte användbar."
fi
CUP_COUNT=$(docker exec "$CONTAINER" sqlite3 /data/cups-backup-tmp.db "SELECT COUNT(*) FROM cups;")

docker cp "$CONTAINER:/data/cups-backup-tmp.db" "$BACKUP_DIR/cups-$DATE.db"
docker exec "$CONTAINER" rm -f /data/cups-backup-tmp.db
log "Databas klar: cups-$DATE.db ($(du -sh "$BACKUP_DIR/cups-$DATE.db" | cut -f1), $CUP_COUNT cuper)"

# --- 2. Uppladdade filer (bilagor) ---
log "Säkerhetskopierar bilagor..."
if docker exec "$CONTAINER" test -d /data/uploads; then
  docker cp "$CONTAINER:/data/uploads" "$BACKUP_DIR/uploads-$DATE"
  log "Bilagor klara: uploads-$DATE"
else
  log "Inga bilagor att kopiera."
fi

# --- 3. .env ---
log "Säkerhetskopierar .env..."
if [ "$ENCRYPT_ENV" = "1" ]; then
  gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase "$BACKUP_PASSPHRASE" \
      --output "$BACKUP_DIR/env-$DATE.gpg" \
      "$PROJECT_DIR/.env"
  ENV_ENTRY="env-$DATE.gpg"
  log ".env klar (krypterad)"
else
  cp "$PROJECT_DIR/.env" "$BACKUP_DIR/env-$DATE"
  ENV_ENTRY="env-$DATE"
  log ".env klar (KLARTEXT)"
fi

# --- 4. Komprimera dagens backup ---
log "Komprimerar..."
TARBALL="$BACKUP_DIR/backup-$DATE.tar.gz"
tar -czf "$TARBALL" \
  -C "$BACKUP_DIR" \
  "cups-$DATE.db" \
  $([ -d "$BACKUP_DIR/uploads-$DATE" ] && echo "uploads-$DATE" || true) \
  "$ENV_ENTRY"
chmod 600 "$TARBALL"

SIZE_BYTES=$(stat -c%s "$TARBALL" 2>/dev/null || stat -f%z "$TARBALL")
log "Komprimerad: backup-$DATE.tar.gz ($(du -sh "$TARBALL" | cut -f1))"

# Jämför mot föregående backup – en kraftig krympning tyder på att något
# gått fel även när alla kommandon lyckats.
PREV=$(find "$BACKUP_DIR" -name 'backup-*.tar.gz' ! -name "backup-$DATE.tar.gz" -type f \
       | sort | tail -1)
if [ -n "$PREV" ]; then
  PREV_BYTES=$(stat -c%s "$PREV" 2>/dev/null || stat -f%z "$PREV")
  if [ "$PREV_BYTES" -gt 0 ] && [ $((SIZE_BYTES * 2)) -lt "$PREV_BYTES" ]; then
    log "VARNING: backupen är mindre än halva föregående ($SIZE_BYTES vs $PREV_BYTES byte). Kontrollera innehållet."
  fi
fi

# --- 5. Ta bort gamla backuper ---
log "Rensar backuper äldre än $KEEP_DAYS dagar..."
find "$BACKUP_DIR" -name "backup-*.tar.gz" -mtime +"$KEEP_DAYS" -delete
REMAINING=$(find "$BACKUP_DIR" -name 'backup-*.tar.gz' -type f | wc -l | tr -d ' ')
log "Klar. $REMAINING backup(er) bevarade."
