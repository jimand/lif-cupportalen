# Att göra – Cupportalen

## Högt värde, relativt enkelt

- [ ] **Mail vid avslag** – Skicka notis till avsändaren (`source_email`) när en cup avslås, med `rejected_reason` i mailet.
- [ ] **Redigera prenumeration** – Länk i notismailet ("hantera din prenumeration") där prenumeranten kan byta åldersklass utan att avsluta och börja om.
- [ ] **Sök i adminpanelen** – Sökruta på cupnamn + statusfilter (pending/approved/rejected) i adminlistan.
- [ ] **Bekräftelsedialog vid radering** – Visa en bekräftelsedialog innan en cup raderas.

## Funktionellt intressant

- [ ] **Sammanfoga dubbletter** – Admin kan slå ihop två cupar och behålla röster och bilagor från båda.
- [ ] **Filtrera på anmälningsdeadline** – Lägg till `registration_deadline` i filterpanelen ("sista anmälningsdag inom X dagar").

## Kvalitet & drift

- [ ] **Databasmigrationer** – Ersätt `try/catch ALTER TABLE` med numrerade SQL-migreringsfiler.
- [ ] **Paginering i admin** – Cupar, prenumeranter och e-postjobb laddas alla på en gång; lägg till paginering eller "load more".
- [ ] **Admin-logg** – Logga godkännanden och avslag (vem, vad, när) och visa historiken i adminpanelen.

## Större / mer ambitiöst

- [ ] **Kalendervy** – Månadskalender på startsidan som komplement till listan; cupar plottas på sina datum.
- [ ] **PWA / mobilapp** – Manifest + service worker så att appen kan sparas på hemskärmen med offlinestöd.
