import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import cupsRouter from './routes/cups';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import { startGmailPoller } from './services/gmail';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.set('trust proxy', true);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.use('/api/cups', cupsRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Ett internt serverfel uppstod' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Backend startad på port ${PORT}`);
  startGmailPoller();
});
