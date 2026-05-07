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

function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

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
        const dateHeader = headers.find((h: any) => h.name === 'Date')?.value || '';
        const rawBody = extractBody(msgRes.data.payload);

        const jobResult = db.prepare(`
          INSERT INTO email_jobs (gmail_message_id, subject, sender, raw_body, status, received_at)
          VALUES (?, ?, ?, ?, 'pending', ?)
        `).run(msg.id, subject, sender, rawBody, dateHeader);

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
  if (!to || !process.env.GMAIL_REFRESH_TOKEN) return;

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

export function startGmailPoller(): void {
  // Poll every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    pollGmail().catch(console.error);
  });
  console.log(`[${new Date().toISOString()}] Gmail: Poller startad (var 5:e minut)`);
}
