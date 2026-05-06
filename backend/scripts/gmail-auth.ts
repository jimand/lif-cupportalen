/**
 * Kör detta skript EN GÅNG för att generera refresh_token för Gmail OAuth2.
 *
 * Förutsättningar:
 * 1. Skapa ett projekt i Google Cloud Console
 * 2. Aktivera Gmail API
 * 3. Skapa OAuth2-credentials (Web application, INTE Desktop)
 * 4. Lägg till http://localhost:3000 under "Authorized redirect URIs"
 * 5. Kopiera client_id och client_secret till .env
 *
 * Kör: cd backend && npm run gmail-auth
 */

import 'dotenv/config';
import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3456';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Saknar GMAIL_CLIENT_ID eller GMAIL_CLIENT_SECRET i .env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('\n=== Gmail OAuth2 Setup ===\n');
console.log('Öppna denna URL i din webbläsare:\n');
console.log(authUrl);
console.log('\nLogga in med cup@landvetterif.se och godkänn åtkomst.');
console.log('Webbläsaren omdirigeras automatiskt och koden hämtas...\n');

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/?')) return;

  const params = new URL(req.url, REDIRECT_URI).searchParams;
  const code = params.get('code');
  const error = params.get('error');

  if (error) {
    res.writeHead(400);
    res.end(`<h2>Fel: ${error}</h2>`);
    console.error(`\nFel från Google: ${error}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400);
    res.end('<h2>Ingen kod mottagen</h2>');
    server.close();
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>Klart! Du kan stänga den här fliken och gå tillbaka till terminalen.</h2>');

    console.log('\n=== Klar! ===\n');
    console.log('Lägg till denna rad i din .env-fil:\n');
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  } catch (err) {
    res.writeHead(500);
    res.end('<h2>Fel vid hämtning av tokens</h2>');
    console.error('Fel:', err);
  } finally {
    server.close();
  }
});

server.listen(3456, () => {
  console.log('Väntar på callback på http://localhost:3456 ...\n');
});
