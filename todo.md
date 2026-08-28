# Att göra – Cupportalen

## Högt värde, relativt enkelt

- [ ] **Mail vid avslag** – Skicka notis till avsändaren (`source_email`) när en cup avslås, med `rejected_reason` i mailet.
- [ ] **Redigera prenumeration** – Länk i notismailet ("hantera din prenumeration") där prenumeranten kan byta åldersklass utan att avsluta och börja om.
- [ ] **Sök i adminpanelen** – Sökruta på cupnamn + statusfilter (pending/approved/rejected) i adminlistan.
- [ ] **Bekräftelsedialog vid radering** – Visa en bekräftelsedialog innan en cup raderas.

## Funktionellt intressant

- [ ] **Sammanfoga dubbletter** – Admin kan slå ihop två cupar och behålla röster och bilagor från båda.
- [ ] **Filtrera på anmälningsdeadline** – Lägg till `registration_deadline` i filterpanelen ("sista anmälningsdag inom X dagar").

## Drift & säkerhetskopior

- [ ] **Sätta upp daglig backup på VPS** – Skriptet `backup.sh` finns i repot och är nu rättat (det kunde tidigare inte köra: `sqlite3` saknades i containern och `PROJECT_DIR` pekade fel). Steg:
  1. Montera extern disk på `/mnt/backup`.
  2. Bygg om backend så imagen får `sqlite3`: `docker compose -f docker-compose.prod.yml up --build -d backend`.
  3. `sudo cp backup.sh /usr/local/bin/backup-cupportalen && sudo chmod +x /usr/local/bin/backup-cupportalen`
  4. Skapa `/etc/cupportalen-backup.env` (rättigheter 600) med `PROJECT_DIR` och `BACKUP_PASSPHRASE`.
  5. Cron: `0 2 * * * . /etc/cupportalen-backup.env && /usr/local/bin/backup-cupportalen >> /var/log/backup-cupportalen.log 2>&1`
  6. **Testa återställningen en gång** enligt avsnittet i README – en otestad backup har obekräftat värde.
- [ ] **Bekräfta projektets sökväg på servern** – `README.md` säger numera `/opt/cupportalen`, men `backup.sh` gissade tidigare på `$HOME/cupportalen`. Verifiera vilken som stämmer och rätta kvarvarande dokumentation.
- [ ] **Offsite-kopia** – `/mnt/backup` är en lokalt monterad disk på samma maskin. Brand, stöld eller ransomware tar både original och backup. Se NAS-punkten nedan.
- [ ] **Byta backup-destination till NAS** – Om NAS används: montera NAS-share (SMB/NFS) på `/mnt/backup` istf. extern disk. Ändra inte i backup.sh, bara mount-punkten. Överväg kryptering av `.env`-backupen om NAS delas med andra.

## Kvalitet & drift

- [x] **Databasmigrationer** – Klart. `backend/src/services/migrations.ts` med `schema_migrations`-tabell, transaktion per migration och stopp vid fel.
- [ ] **Paginering i admin** – Cupar, prenumeranter och e-postjobb laddas alla på en gång; lägg till paginering eller "load more".
- [ ] **Admin-logg** – Logga godkännanden och avslag (vem, vad, när) och visa historiken i adminpanelen.

## Kvar från kodgenomgången (aug 2026)

- [ ] **OG-bild för delning** – `frontend/index.html` har alla Open Graph-taggar utom bilden; `og:image`-blocket ligger utkommenterat. Exportera 1200×630 PNG från samma designfil som loggan, lägg som `frontend/public/og-image.png` och avkommentera. Behövs även `apple-touch-icon.png` (180×180) – varken WhatsApp, Facebook eller Safari accepterar SVG där.
- [ ] **Cup-specifika OG-taggar** – Delade cuplänkar visar sajtens generiska titel. Kräver att backend serverrenderar `/cups/:id` för bot-user-agents, eller prerendering. Egen etapp.
- [ ] **Ålders- och formatfilter är strängbaserade** – `age_classes` och `cup_type` lagras kommaseparerat och matchas med `LIKE '%x%'`, så filter på ålder 1 matchar 10, 11, 12. Fungerar för 7–18 men är sköra semantik. En `cup_age_classes`-join-tabell löser både korrekthet och index.
- [ ] **Dubbletter av cuper** – `cups` saknar UNIQUE-constraint; samma cup kan skapas obegränsat via formulär, mail och admin. Duplikatvarningen i UI är en heuristik på första 10 tecknen, inte en spärr. Överväg `UNIQUE(lower(name), start_date)`.
- [ ] **Pollern behandlar varje oläst inkorgsmail** – `q: 'is:unread label:INBOX'` utan avsändar- eller etikettfilter, så spam och autosvar parsas också. Överväg en Gmail-etikett.
- [ ] **Transaktioner saknas vid flerstegsskrivningar** – t.ex. röstning (INSERT vote + UPDATE thumbs_up) och cupskapande från e-postjobb. Vid ett kast mitt i blir data inkonsekvent. `better-sqlite3` har `db.transaction()`.
- [ ] **Rösträkningen går att manipulera** – röstidentiteten är enbart en `voter_id`-cookie; rensad cookie ger en ny röst. Acceptabelt för en klubbportal, men siffran är inte att lita på.
- [ ] **Linter** – ESLint är inte konfigurerat i något av projekten. CI kör bygge och tester men ingen lint.
- [ ] **Kvarvarande npm-sårbarheter** – kräver majoruppgraderingar: `vite` 5→8 (dev-server, Windows-specifik) och `react-router-dom` 6→7 (open redirect, ej nåbar då alla navigeringsmål är hårdkodade). `googleapis` ligger 36 majorversioner efter.

## Större / mer ambitiöst

- [ ] **Kalendervy** – Månadskalender på startsidan som komplement till listan; cupar plottas på sina datum.
- [ ] **PWA / mobilapp** – Manifest + service worker så att appen kan sparas på hemskärmen med offlinestöd.
