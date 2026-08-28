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

- [x] **Daglig backup på VPS** – Klart 2026-08-28. `backup.sh` installerad som `/usr/local/bin/backup-cupportalen`, konfiguration i `/etc/cupportalen-backup.env` (600), cron kl 02:00, destination `/root/backups/cupportalen`. Verifierat: integritetskontroll, kryptering, dekryptering och en skarp återställning till en tillfällig volym (27 cuper, `integrity_check ok`).
  - Återställningstestet avslöjade att rutinen i README saknade ett `chown`-steg: `docker cp` lägger in filerna som root medan backend kör som `appuser`, vilket gav `SQLITE_READONLY_DIRECTORY`. Rättat.
  - **Lösenfrasen i `/etc/cupportalen-backup.env` måste finnas sparad utanför servern.** Utan den går `.env` i backupen inte att dekryptera.
- [ ] **Offsite-kopia** – Backupen ligger nu på `/root/backups/` på samma maskin som databasen. Det skyddar mot databaskorruption, trasiga migrationer och misstag, men inte mot hårdvarufel, brand eller stöld. Se NAS-punkten nedan.
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
- [ ] **PWA / mobilapp** – `frontend/public/site.webmanifest` och `theme-color` finns sedan etapp 4. Kvar: service worker för offlinestöd, samt PNG-ikoner i 192 och 512 px (manifestet pekar just nu bara på SVG:n).
