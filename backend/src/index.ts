import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';

import cupsRouter from './routes/cups';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import attachmentsRouter from './routes/attachments';
import subscriptionsRouter from './routes/subscriptions';
import { startGmailPoller } from './services/gmail';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET saknas i miljövariabler');
if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD saknas i miljövariabler');
if (!process.env.ADMIN_PASSWORD.startsWith('$2')) {
  throw new Error(
    'ADMIN_PASSWORD måste vara en bcrypt-hash (börjar med $2). ' +
    'Generera med: node -e "const b=require(\'bcryptjs\'); b.hash(\'DITT_LÖSENORD\', 10).then(console.log)"'
  );
}
if (!process.env.FRONTEND_URL && process.env.NODE_ENV === 'production') {
  throw new Error('FRONTEND_URL saknas i miljövariabler (krävs i produktion)');
}

// Gmail är valfritt – appen fungerar utan, men då skickas inga mail och
// ingen polling sker. Varna tydligt vid start så det inte upptäcks först
// när en prenumerant undrar var bekräftelsemailet tog vägen.
const missingGmail = [
  'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_USER',
].filter((k) => !process.env[k]);
if (missingGmail.length > 0) {
  console.warn(
    `[${new Date().toISOString()}] VARNING: Gmail ej konfigurerat (saknar ${missingGmail.join(', ')}). ` +
    'Ingen e-post skickas och ingen polling sker.'
  );
}
if (!process.env.ADMIN_NOTIFY_EMAIL) {
  console.warn(
    `[${new Date().toISOString()}] VARNING: ADMIN_NOTIFY_EMAIL saknas – inga notiser om nya cuper skickas.`
  );
}

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/api/cups', cupsRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api', attachmentsRouter);
app.use('/api', subscriptionsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Logga alltid hela stacken serverside – utan den går ett TypeError inte
  // att lokalisera i produktion. Klienten får fortsatt bara det generiska
  // meddelandet nedan.
  console.error(`[${new Date().toISOString()}] Internt fel:`, err);

  // Trasig JSON från klienten är ett klientfel, inte ett serverfel.
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Ogiltig JSON i förfrågan' });
    return;
  }

  res.status(500).json({ error: 'Ett internt serverfel uppstod' });
});

// Under Node 20 dödar en ohanterad promise-rejection processen. Logga den
// istället – restart: unless-stopped startar annars om utan att någon får
// veta varför, och vid ett bestående fel blir det en crash-loop.
process.on('unhandledRejection', (reason) => {
  console.error(`[${new Date().toISOString()}] Ohanterad promise-rejection:`, reason);
});

process.on('uncaughtException', (err) => {
  console.error(`[${new Date().toISOString()}] Ohanterat undantag:`, err);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Backend startad på port ${PORT}`);
  startGmailPoller();
});
