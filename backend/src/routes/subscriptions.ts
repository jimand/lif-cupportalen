import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import db from '../services/db';

const router = Router();

const subscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många försök, försök igen om en timme' },
});

// POST /api/subscriptions
router.post('/subscriptions', subscribeLimiter, (req: Request, res: Response) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ogiltig e-postadress' });
    return;
  }
  const token = randomUUID();
  db.prepare(`INSERT OR IGNORE INTO subscriptions (email, token) VALUES (?, ?)`).run(parsed.data.email, token);
  res.json({ ok: true });
});

// GET /api/subscriptions/unsubscribe?token=xxx
router.get('/subscriptions/unsubscribe', (req: Request, res: Response) => {
  const token = String(req.query.token || '');
  if (!token) { res.status(400).send('Ogiltig länk'); return; }
  const result = db.prepare(`DELETE FROM subscriptions WHERE token = ?`).run(token);
  if (result.changes === 0) {
    res.status(404).send('<p>Länken är ogiltig eller redan använd.</p>');
    return;
  }
  res.send('<p style="font-family:sans-serif;padding:2rem">Du är nu avprenumererad. Du får inga fler notiser om nya cuper.</p>');
});

export default router;
