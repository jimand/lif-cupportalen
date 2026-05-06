# Landvetter IF – Cupportalen

Webbapplikation där fotbollstränare kan hitta och rekommendera cuper.

## Teknikstack

- **Frontend:** React + Vite + TypeScript + ShadCN/UI + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript
- **Databas:** SQLite via better-sqlite3
- **Auth:** JWT med admin-lösenord
- **E-post:** Gmail API via OAuth2

---

## 1. Gmail OAuth2-setup

Görs en gång för att få refresh token som ger permanent åtkomst till Gmail-kontot.

### Steg 1 – Skapa Google Cloud-projekt

1. Gå till [Google Cloud Console](https://console.cloud.google.com/)
2. Skapa ett nytt projekt (t.ex. "LIF Cupportalen")
3. Aktivera **Gmail API**: Sök efter "Gmail API" under "APIs & Services" → "Enable APIs and Services"

### Steg 2 – Skapa OAuth2-credentials

1. Gå till "APIs & Services" → "Credentials"
2. Klicka "Create Credentials" → "OAuth client ID"
3. Välj applikationstyp: **Desktop app**
4. Ge den ett namn (t.ex. "Cupportalen")
5. Ladda ner JSON-filen eller kopiera Client ID och Client Secret

### Steg 3 – Konfigurera .env

```bash
cp .env.example .env
```

Fyll i:
```
GMAIL_CLIENT_ID=din-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=din-client-secret
```

### Steg 4 – Kör auth-skriptet

```bash
cd backend
npm install
npm run gmail-auth
```

Skriptet öppnar en URL. Öppna den i webbläsaren, logga in med `cup@landvetterif.se` och godkänn åtkomst. Kopiera koden och klistra in i terminalen.

Du får nu din `GMAIL_REFRESH_TOKEN` – lägg till den i `.env`.

---

## 2. Sätt upp .env

```bash
cp .env.example .env
```

Redigera `.env`:

```env
ADMIN_PASSWORD=valfritt-starkt-losenord
JWT_SECRET=en-lang-slumpmassig-strang-minst-32-tecken
GMAIL_CLIENT_ID=din-gmail-client-id
GMAIL_CLIENT_SECRET=din-gmail-client-secret
GMAIL_REFRESH_TOKEN=din-refresh-token
GMAIL_USER=cup@landvetterif.se
```

**Generera ett säkert JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 3. Starta med Docker Compose

### Utveckling

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001/api
- Admin-panel: http://localhost:5173/admin/login

### Produktion

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Applikationen körs på port 80. Nginx reverse proxar:
- `/api/*` → backend (port 3001, intern)
- `/*` → frontend (statiska filer)

---

## 4. HTTPS med Certbot (cup.landvetterif.se)

### Förutsättningar

- DNS för `cup.landvetterif.se` pekar på VPS:ens IP
- Port 80 och 443 är öppna i brandväggen

### Steg 1 – Installera Certbot på VPS

```bash
sudo apt update
sudo apt install certbot
```

### Steg 2 – Starta bara Nginx (port 80) utan HTTPS

Se till att Nginx-konfigurationen är i HTTP-läge (standardläge i `nginx/nginx.conf`).

```bash
docker compose -f docker-compose.prod.yml up -d nginx
```

### Steg 3 – Hämta certifikat

```bash
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d cup.landvetterif.se \
  --email din@epost.se \
  --agree-tos \
  --non-interactive
```

### Steg 4 – Aktivera HTTPS i nginx.conf

Redigera `nginx/nginx.conf`:

1. Avkommentera HTTPS-servern (blocket med `listen 443 ssl`)
2. Kommentera ut (eller ta bort) HTTP-servern
3. Lägg till redirect från HTTP till HTTPS i HTTP-servern:
   ```nginx
   return 301 https://$host$request_uri;
   ```

### Steg 5 – Starta om

```bash
docker compose -f docker-compose.prod.yml restart nginx
```

### Steg 6 – Automatisk förnyelse

Certbot-certifikat gäller 90 dagar. Lägg till cron-jobb:

```bash
sudo crontab -e
```

Lägg till:
```
0 3 * * * certbot renew --quiet && docker compose -f /sökväg/till/docker-compose.prod.yml restart nginx
```

---

## Felsökning

### Kontrollera loggar

```bash
# Alla tjänster
docker compose -f docker-compose.prod.yml logs -f

# Bara backend
docker compose -f docker-compose.prod.yml logs -f backend
```

### Kontrollera databas

```bash
docker compose -f docker-compose.prod.yml exec backend sh
# Inuti containern:
sqlite3 /data/cups.db ".tables"
sqlite3 /data/cups.db "SELECT * FROM cups;"
```

### Återställ admin-lösenord

Uppdatera `ADMIN_PASSWORD` i `.env` och starta om backend:
```bash
docker compose -f docker-compose.prod.yml restart backend
```
