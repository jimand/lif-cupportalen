import { google } from 'googleapis';
import cron from 'node-cron';
import db from './db';
import { parseEmailToCup } from './emailParser';
import { saveFile } from './storage';

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

if (process.env.GMAIL_REFRESH_TOKEN) {
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
}

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

/**
 * Kontrollerar att Gmail är konfigurerat innan ett utskick försöks.
 * Loggar när ett mail hoppas över – tyst return gör att prenumeranten får
 * "kolla din inkorg" utan att något mail skickas och utan spår i loggen.
 */
function gmailConfigured(context: string): boolean {
  if (!process.env.GMAIL_REFRESH_TOKEN) {
    console.error(
      `[${new Date().toISOString()}] Gmail: hoppar över ${context} – GMAIL_REFRESH_TOKEN saknas`
    );
    return false;
  }
  return true;
}

function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function collectAttachmentParts(payload: any, acc: any[] = []): any[] {
  if (!payload) return acc;
  if (payload.filename && payload.body?.attachmentId) acc.push(payload);
  for (const part of payload.parts || []) collectAttachmentParts(part, acc);
  return acc;
}

async function saveEmailAttachments(messageId: string, jobId: number, cupId: number | null, payload: any): Promise<void> {
  for (const part of collectAttachmentParts(payload)) {
    if (!ALLOWED_ATTACHMENT_TYPES.has(part.mimeType)) continue;
    try {
      const attRes = await gmail.users.messages.attachments.get({
        userId: process.env.GMAIL_USER || 'me',
        messageId,
        id: part.body.attachmentId,
      });
      const data = attRes.data.data;
      if (!data) continue;
      const buffer = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      if (buffer.length > MAX_ATTACHMENT_SIZE_BYTES) {
        console.warn(`[${new Date().toISOString()}] Gmail: Bilaga för stor (${buffer.length} B), hoppar över: ${part.filename}`);
        continue;
      }
      const { filename, size } = saveFile(buffer, part.filename);
      db.prepare(`
        INSERT INTO attachments (cup_id, email_job_id, filename, original_name, mime_type, size)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(cupId, jobId, filename, part.filename, part.mimeType, size);
      console.log(`[${new Date().toISOString()}] Gmail: Sparade bilaga "${part.filename}" (${size} B)`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Gmail: Kunde inte spara bilaga "${part.filename}":`, err);
    }
  }
}

function extractBody(payload: any): string {
  if (!payload) return '';

  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return '';
}

export async function pollGmail(): Promise<void> {
  if (!process.env.GMAIL_REFRESH_TOKEN || !process.env.GMAIL_CLIENT_ID) {
    console.log(`[${new Date().toISOString()}] Gmail: Ej konfigurerad, hoppar över polling`);
    return;
  }

  console.log(`[${new Date().toISOString()}] Gmail: Startar polling...`);

  try {
    const listRes = await gmail.users.messages.list({
      userId: process.env.GMAIL_USER || 'me',
      q: 'is:unread label:INBOX',
      maxResults: 20,
    });

    const messages = listRes.data.messages || [];
    console.log(`[${new Date().toISOString()}] Gmail: Hittade ${messages.length} olästa meddelanden`);

    for (const msg of messages) {
      if (!msg.id) continue;

      const existing = db.prepare('SELECT id FROM email_jobs WHERE gmail_message_id = ?').get(msg.id);
      if (existing) continue;

      try {
        const msgRes = await gmail.users.messages.get({
          userId: process.env.GMAIL_USER || 'me',
          id: msg.id,
          format: 'full',
        });

        const headers = msgRes.data.payload?.headers || [];
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
        const sender = headers.find((h: any) => h.name === 'From')?.value || '';
        // Gmails Date-header ser ut som "Mon, 13 May 2025 14:02:11 +0200".
        // Sparad ordagrant sorterar "ORDER BY received_at DESC" lexikografiskt
        // på veckodagsnamnet, så admins e-postlista hamnade i fel ordning.
        // Normalisera till ISO, som alla andra tidskolumner.
        const rawDateHeader = headers.find((h: any) => h.name === 'Date')?.value || '';
        const parsedDate = rawDateHeader ? new Date(rawDateHeader) : null;
        const dateHeader =
          parsedDate && !isNaN(parsedDate.getTime())
            ? parsedDate.toISOString()
            : new Date().toISOString();
        const rawBody = extractBody(msgRes.data.payload);

        const jobResult = db.prepare(`
          INSERT INTO email_jobs (gmail_message_id, subject, sender, raw_body, status, received_at)
          VALUES (?, ?, ?, ?, 'pending', ?)
        `).run(msg.id, subject, sender, rawBody.slice(0, 2000), dateHeader);

        const jobId = jobResult.lastInsertRowid;

        const parsed = parseEmailToCup(subject, rawBody);
        let parsedCupId: number | null = null;

        if (parsed.name && parsed.start_date) {
          const cupResult = db.prepare(`
            INSERT INTO cups (name, location, start_date, end_date, age_classes, url, description, source_email, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
          `).run(
            parsed.name,
            parsed.location || 'Okänd',
            parsed.start_date,
            parsed.end_date || null,
            parsed.age_classes || '',
            parsed.url || null,
            parsed.description || null,
            sender,
          );
          parsedCupId = Number(cupResult.lastInsertRowid);
          sendCupNotification(parsed.name).catch((err) =>
            console.error(`[${new Date().toISOString()}] Notifieringsmail misslyckades:`, err)
          );
        }

        db.prepare(`
          UPDATE email_jobs SET status = ?, parsed_cup_id = ?, processed_at = datetime('now') WHERE id = ?
        `).run(parsedCupId ? 'processed' : 'failed', parsedCupId, jobId);

        await saveEmailAttachments(msg.id, Number(jobId), parsedCupId, msgRes.data.payload);

        // Mark as read
        await gmail.users.messages.modify({
          userId: process.env.GMAIL_USER || 'me',
          id: msg.id,
          requestBody: { removeLabelIds: ['UNREAD'] },
        });

        console.log(`[${new Date().toISOString()}] Gmail: Bearbetade meddelande ${msg.id} – cup skapad: ${parsedCupId ? 'ja' : 'nej'}`);
      } catch (msgErr) {
        console.error(`[${new Date().toISOString()}] Gmail: Fel vid bearbetning av meddelande ${msg.id}:`, msgErr);
      }
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Gmail: Polling misslyckades:`, err);
  }
}

export async function sendCupNotification(cupName: string): Promise<void> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return;
  if (!gmailConfigured('sendCupNotification')) return;

  const from = process.env.GMAIL_USER || 'me';
  const adminUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin`;

  const subjectText = `Ny cup väntar på godkännande: ${cupName}`;
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subjectText, 'utf-8').toString('base64')}?=`;

  const bodyText = [
    `Cupen "${cupName}" har skickats in och väntar på ditt godkännande.`,
    '',
    `Logga in på admin-panelen: ${adminUrl}`,
  ].join('\r\n');
  const bodyEncoded = Buffer.from(bodyText, 'utf-8').toString('base64');

  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    `Subject: ${subjectEncoded}`,
    '',
    bodyEncoded,
  ].join('\r\n');

  const encoded = Buffer.from(message).toString('base64url');
  await gmail.users.messages.send({
    userId: from,
    requestBody: { raw: encoded },
  });
}

export async function sendSubscriberNotification(
  cupName: string, cupId: number, subscriberEmail: string, unsubToken: string,
): Promise<void> {
  if (!gmailConfigured('sendSubscriberNotification')) return;

  const from = process.env.GMAIL_USER || 'me';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const cupUrl = `${frontendUrl}/cups/${cupId}`;
  const unsubUrl = `${frontendUrl}/api/subscriptions/unsubscribe?token=${unsubToken}`;

  const subjectText = `Ny cup: ${cupName}`;
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subjectText, 'utf-8').toString('base64')}?=`;

  const bodyText = [
    `En ny cup har godkänts: "${cupName}"`,
    '',
    `Visa cupen: ${cupUrl}`,
    '',
    `---`,
    `Avprenumerera: ${unsubUrl}`,
  ].join('\r\n');
  const bodyEncoded = Buffer.from(bodyText, 'utf-8').toString('base64');

  const message = [
    `From: ${from}`,
    `To: ${subscriberEmail}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    `Subject: ${subjectEncoded}`,
    '',
    bodyEncoded,
  ].join('\r\n');

  const encoded = Buffer.from(message).toString('base64url');
  await gmail.users.messages.send({ userId: from, requestBody: { raw: encoded } });
}

export async function sendConfirmationEmail(email: string, token: string): Promise<void> {
  if (!gmailConfigured('sendConfirmationEmail')) return;

  const from = process.env.GMAIL_USER || 'me';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const confirmUrl = `${frontendUrl}/api/subscriptions/confirm?token=${token}`;

  const subjectText = `Bekräfta din prenumeration – Landvetter IF Cupportalen`;
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subjectText, 'utf-8').toString('base64')}?=`;

  const bodyText = [
    `Klicka på länken nedan för att bekräfta din prenumeration på Landvetter IF Cupportalen:`,
    '',
    confirmUrl,
    '',
    `Länken är giltig i 48 timmar. Om du inte begärde denna prenumeration kan du ignorera mailet.`,
  ].join('\r\n');
  const bodyEncoded = Buffer.from(bodyText, 'utf-8').toString('base64');

  const message = [
    `From: ${from}`,
    `To: ${email}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    `Subject: ${subjectEncoded}`,
    '',
    bodyEncoded,
  ].join('\r\n');

  const encoded = Buffer.from(message).toString('base64url');
  await gmail.users.messages.send({ userId: from, requestBody: { raw: encoded } });
}

export async function sendWelcomeEmail(email: string, unsubToken: string): Promise<void> {
  if (!gmailConfigured('sendWelcomeEmail')) return;

  const from = process.env.GMAIL_USER || 'me';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const unsubUrl = `${frontendUrl}/api/subscriptions/unsubscribe?token=${unsubToken}`;

  const subjectText = `Välkommen som prenumerant – Landvetter IF Cupportalen`;
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subjectText, 'utf-8').toString('base64')}?=`;

  const bodyText = [
    `Du är nu prenumerant på Landvetter IF Cupportalen och får mail när nya cuper godkänns.`,
    '',
    `Avprenumerera när som helst: ${unsubUrl}`,
  ].join('\r\n');
  const bodyEncoded = Buffer.from(bodyText, 'utf-8').toString('base64');

  const message = [
    `From: ${from}`,
    `To: ${email}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    `Subject: ${subjectEncoded}`,
    '',
    bodyEncoded,
  ].join('\r\n');

  const encoded = Buffer.from(message).toString('base64url');
  await gmail.users.messages.send({ userId: from, requestBody: { raw: encoded } });
}

export async function sendUnsubscribeConfirmationEmail(email: string): Promise<void> {
  if (!gmailConfigured('sendUnsubscribeConfirmationEmail')) return;

  const from = process.env.GMAIL_USER || 'me';

  const subjectText = `Du är avprenumererad – Landvetter IF Cupportalen`;
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subjectText, 'utf-8').toString('base64')}?=`;

  const bodyText = [
    `Din e-postadress har tagits bort från Landvetter IF Cupportalen.`,
    `Du får inga fler notiser om nya cuper.`,
  ].join('\r\n');
  const bodyEncoded = Buffer.from(bodyText, 'utf-8').toString('base64');

  const message = [
    `From: ${from}`,
    `To: ${email}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    `Subject: ${subjectEncoded}`,
    '',
    bodyEncoded,
  ].join('\r\n');

  const encoded = Buffer.from(message).toString('base64url');
  await gmail.users.messages.send({ userId: from, requestBody: { raw: encoded } });
}

export async function sendWeeklyDigest(): Promise<void> {
  if (!gmailConfigured('sendWeeklyDigest')) return;

  const cups = db.prepare(`
    SELECT id, name, age_classes FROM cups
    WHERE status = 'approved' AND updated_at >= datetime('now', '-7 days')
    ORDER BY updated_at DESC
  `).all() as any[];

  if (cups.length === 0) {
    console.log(`[${new Date().toISOString()}] Digest: Inga nya cupar den senaste veckan, hoppar över`);
    return;
  }

  const subscribers = db.prepare(`SELECT email, token, age_classes FROM subscriptions WHERE status = 'confirmed'`).all() as any[];
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const from = process.env.GMAIL_USER || 'me';
  let sent = 0;

  for (const sub of subscribers) {
    const subAges = sub.age_classes
      ? new Set(sub.age_classes.split(',').map((s: string) => s.trim()).filter(Boolean))
      : null;

    const relevantCups = subAges
      ? cups.filter((cup: any) =>
          cup.age_classes.split(',').map((s: string) => s.trim()).some((a: string) => subAges.has(a))
        )
      : cups;

    if (relevantCups.length === 0) continue;

    const cupList = relevantCups
      .map((cup: any) => `• ${cup.name} – ${frontendUrl}/cups/${cup.id}`)
      .join('\r\n');
    const unsubUrl = `${frontendUrl}/api/subscriptions/unsubscribe?token=${sub.token}`;

    const subjectText = `Veckans cupar – ${relevantCups.length} nya på Landvetter IF Cupportalen`;
    const subjectEncoded = `=?UTF-8?B?${Buffer.from(subjectText, 'utf-8').toString('base64')}?=`;

    const bodyText = [
      `Här är veckans nya cupar på Landvetter IF Cupportalen:`,
      '',
      cupList,
      '',
      `Se alla cupar: ${frontendUrl}`,
      '',
      `---`,
      `Avprenumerera: ${unsubUrl}`,
    ].join('\r\n');
    const bodyEncoded = Buffer.from(bodyText, 'utf-8').toString('base64');

    const message = [
      `From: ${from}`,
      `To: ${sub.email}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: base64`,
      `Subject: ${subjectEncoded}`,
      '',
      bodyEncoded,
    ].join('\r\n');

    const encoded = Buffer.from(message).toString('base64url');
    try {
      await gmail.users.messages.send({ userId: from, requestBody: { raw: encoded } });
      sent++;
    } catch (err) {
      const masked = sub.email[0] + '***' + sub.email.slice(sub.email.indexOf('@'));
      console.error(`[${new Date().toISOString()}] Digest: Misslyckades skicka till ${masked}:`, err);
    }
  }

  console.log(`[${new Date().toISOString()}] Digest: Skickad till ${sent} prenumeranter, ${cups.length} cupar inkluderade`);
}

export function startGmailPoller(): void {
  cron.schedule('*/5 * * * *', () => {
    pollGmail().catch(console.error);
  });
  // Weekly digest: Mondays at 08:00
  cron.schedule('0 8 * * 1', () => {
    sendWeeklyDigest().catch(console.error);
  });
  // Daily cleanup: remove pending subscriptions whose confirmation link has expired
  cron.schedule('0 3 * * *', () => {
    // better-sqlite3 är synkront – ett kast här (låst eller korrupt databas)
    // blir en uncaughtException och tar ner processen kl 03:00.
    try {
      const result = db.prepare(
        `DELETE FROM subscriptions WHERE status = 'pending' AND token_expires_at < datetime('now')`
      ).run();
      if (result.changes > 0) {
        console.log(`[${new Date().toISOString()}] Städning: Raderade ${result.changes} utgångna väntande prenumerationer`);
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Städning misslyckades:`, err);
    }
  });
  console.log(`[${new Date().toISOString()}] Gmail: Poller startad (var 5:e minut), veckodigest varje måndag 08:00`);
}
