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

- [ ] **Databasmigrationer** – Ersätt `try/catch ALTER TABLE` med numrerade SQL-migreringsfiler.
- [ ] **Paginering i admin** – Cupar, prenumeranter och e-postjobb laddas alla på en gång; lägg till paginering eller "load more".
- [ ] **Admin-logg** – Logga godkännanden och avslag (vem, vad, när) och visa historiken i adminpanelen.

## Större / mer ambitiöst

- [ ] **Kalendervy** – Månadskalender på startsidan som komplement till listan; cupar plottas på sina datum.
- [ ] **PWA / mobilapp** – Manifest + service worker så att appen kan sparas på hemskärmen med offlinestöd.
