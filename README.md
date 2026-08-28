# Landvetter IF – Cupportalen

Webbapplikation där fotbollstränare kan hitta, rösta på och föreslå cuper för Landvetter IF:s lag.

Live: **[cup.landvetterif.se](https://cup.landvetterif.se)**

---

## Funktioner

### För tränare (publik vy)
- Bläddra och filtrera godkända cuper (åldersklass, cupformat, datum, plats, fritextsök)
- Rösta på favoriter med tumme upp
- Föreslå ny cup via formulär eller e-post
- Prenumerera på notiser (dubbel opt-in, filtrerat per åldersklass)
- Veckodigest varje måndag med nya cuper från senaste veckan
- Dela cup via WhatsApp eller Facebook
- Exportera cup till kalender (iCal)

### För admin
- Granska och godkänn/avslå inkomna cuper (med avslagsorsak)
- Redigera alla fält, markera cuper som rekommenderade (⭐)
- Automatisk Gmail-polling var 5:e minut – cupar parsas och skapas från inkommande mail
- Hantera bilagor (PDF, bilder, Word-dokument)
- Prenumerantshantering: lägg till, ta bort, skicka om bekräftelse
- Statistikdashboard med diagram (Recharts) och Umami-integration
- Exportera cuplistning som CSV (Excel-kompatibel)
- Skicka veckodigest manuellt

---

## Teknikstack

| Del | Teknologi |
|-----|-----------|
| Frontend | React + Vite + TypeScript + ShadCN/UI + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Databas | SQLite via better-sqlite3 |
| Auth | JWT med admin-lösenord (bcrypt) |
| E-post | Gmail API via OAuth2 |
| Schemaläggning | node-cron |
| Analys | Umami (självhostad) |
| Drift | Docker Compose + Nginx Proxy Manager |

---

## Sätta upp lokalt

### 1. Gmail OAuth2

Görs en gång för att få refresh token som ger permanent åtkomst till Gmail-kontot.

**Skapa Google Cloud-projekt:**
1. Gå till [Google Cloud Console](https://console.cloud.google.com/)
2. Skapa ett nytt projekt (t.ex. "LIF Cupportalen")
3. Aktivera **Gmail API** under "APIs & Services" → "Enable APIs and Services"

**Skapa OAuth2-credentials:**
1. Gå till "APIs & Services" → "Credentials"
2. Klicka "Create Credentials" → "OAuth client ID"
3. Välj applikationstyp: **Desktop app**
4. Kopiera Client ID och Client Secret

**Hämta refresh token:**
```bash
cp .env.example .env
# Fyll i GMAIL_CLIENT_ID och GMAIL_CLIENT_SECRET
cd backend
npm install
npm run gmail-auth
```

Öppna URL:en som skrivs ut, logga in med `cup@landvetterif.se` och klistra in koden i terminalen. Du får din `GMAIL_REFRESH_TOKEN`.

---

### 2. Konfigurera .env

```bash
cp .env.example .env
```

```env
ADMIN_PASSWORD=$2b$10$...      # bcrypt-hash, se nedan
JWT_SECRET=...                 # 128-tecken hex, se nedan
GMAIL_CLIENT_ID=123...apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-...
GMAIL_REFRESH_TOKEN=1//04...
GMAIL_USER=cup@landvetterif.se
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173
ADMIN_NOTIFY_EMAIL=din@epost.se
```

**Generera lösenord och JWT-secret:**
```bash
# bcrypt-hash
node -e "const b=require('bcryptjs'); b.hash('DITT_LÖSENORD', 10).then(console.log)"

# JWT-secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

### 3. Starta med Docker Compose

```bash
docker compose up --build
```

| Tjänst | URL |
|--------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3001/api |
| Admin-panel | http://localhost:5173/admin/login |

---

## Driftsättning (VPS)

Se **[deploy.md](deploy.md)** för komplett guide med Docker Compose, Nginx Proxy Manager och SSL.

**Snabbuppdatering på servern:**
```bash
cd /opt/cupportalen        # se not om sökväg nedan
git pull
docker compose -f docker-compose.prod.yml up --build -d
docker network connect cupportalen_internal nginx-proxy-manager-app-1
```

> `docker network connect` måste köras efter varje rebuild – `docker compose up --build` återskapar nätverket och kopplar bort Nginx Proxy Manager.
>
> Nätverket heter `cupportalen_internal` (compose-projektnamn + nätverksnamnet
> `internal` från `docker-compose.prod.yml`). Verifiera med `docker network ls`.

**Gör kopplingen permanent (rekommenderas):** deklarera Nginx Proxy Managers
nätverk som externt så att `frontend` ansluts automatiskt vid varje rebuild och
det manuella steget ovan kan tas bort. Ta först reda på nätverkets namn:

```bash
docker inspect nginx-proxy-manager-app-1 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'
```

Lägg sedan till det i `docker-compose.prod.yml` under `networks:` med
`external: true`, och ta upp det på `frontend`-tjänsten.

---

## Felsökning

```bash
# Loggar
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs -f backend

# Kontrollera databas
docker compose -f docker-compose.prod.yml exec backend sh
sqlite3 /data/cups.db ".tables"
sqlite3 /data/cups.db "SELECT * FROM cups;"

# Återställ admin-lösenord
# Uppdatera ADMIN_PASSWORD i .env, sedan:
docker compose -f docker-compose.prod.yml restart backend
```

---

## Backup

Automatisk daglig backup sköts av `backup.sh`. Se kommentarshuvudet i skriptet
för installation och crontab-rad. Skriptet kräver `PROJECT_DIR` och
`BACKUP_PASSPHRASE` (för kryptering av `.env`) som miljövariabler, verifierar
kopian med `PRAGMA integrity_check` och varnar om backupen krympt kraftigt
jämfört med föregående dag.

**Manuell engångsbackup:**
```bash
docker compose -f docker-compose.prod.yml exec backend \
  sqlite3 /data/cups.db ".backup '/data/cups-$(date +%Y%m%d).db'"

docker compose -f docker-compose.prod.yml cp \
  backend:/data/cups-$(date +%Y%m%d).db ./cups-$(date +%Y%m%d).db
```

### Återställa från backup

Databasen ligger i den **namngivna Docker-volymen** `db_data`, inte i en
bind-mount — den går alltså inte att ersätta genom att kopiera en fil i
projektkatalogen.

```bash
cd /opt/cupportalen

# 1. Packa upp backupen
mkdir -p /tmp/restore && tar -xzf /mnt/backup/cupportalen/backup-2026-08-28.tar.gz -C /tmp/restore
ls /tmp/restore                      # cups-DATUM.db, uploads-DATUM/, env-DATUM.gpg

# 2. Stoppa backend sa att ingen skriver under tiden
docker compose -f docker-compose.prod.yml stop backend

# 3. Aterstall databasen in i volymen
docker compose -f docker-compose.prod.yml cp \
  /tmp/restore/cups-2026-08-28.db backend:/data/cups.db

# 4. Aterstall bilagor (om de finns i backupen)
docker compose -f docker-compose.prod.yml cp \
  /tmp/restore/uploads-2026-08-28/. backend:/data/uploads/

# 5. Aterstall .env vid behov (dekryptera forst)
gpg --batch --decrypt --passphrase "$BACKUP_PASSPHRASE" \
  --output .env /tmp/restore/env-2026-08-28.gpg
chmod 600 .env

# 6. Starta och verifiera
docker compose -f docker-compose.prod.yml start backend
docker compose -f docker-compose.prod.yml exec backend \
  sqlite3 /data/cups.db "PRAGMA integrity_check; SELECT COUNT(*) FROM cups;"
docker compose -f docker-compose.prod.yml logs --tail=30 backend

# 7. Stada
rm -rf /tmp/restore
```

> Steg 3 skriver över den körande databasen. Ta en färsk kopia först om det
> finns data som tillkommit efter backupen.
>
> **Testa återställningen en gång innan du behöver den.** En backup som aldrig
> har återställts har obekräftat värde.
