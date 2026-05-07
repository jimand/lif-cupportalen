import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import db from '../services/db';
import { sendConfirmationEmail, sendUnsubscribeConfirmationEmail, sendWelcomeEmail } from '../services/gmail';

const router = Router();

const subscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många försök, försök igen om en timme' },
});

// POST /api/subscriptions – double opt-in
router.post('/subscriptions', subscribeLimiter, (req: Request, res: Response) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ogiltig e-postadress' });
    return;
  }
  const token = randomUUID();
  const result = db.prepare(
    `INSERT OR IGNORE INTO subscriptions (email, token, status) VALUES (?, ?, 'pending')`
  ).run(parsed.data.email, token);

  if (result.changes > 0) {
    sendConfirmationEmail(parsed.data.email, token).catch((err) =>
      console.error(`[${new Date().toISOString()}] Bekräftelsemail misslyckades (${parsed.data.email}):`, err)
    );
  }

  res.json({ ok: true, pending: true });
});

// GET /api/subscriptions/confirm?token=xxx
router.get('/subscriptions/confirm', (req: Request, res: Response) => {
  const token = String(req.query.token || '');
  if (!token) { res.status(400).send('<p>Ogiltig länk</p>'); return; }

  const sub = db.prepare(`SELECT id, email FROM subscriptions WHERE token = ? AND status = 'pending'`).get(token) as any;
  if (!sub) {
    res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto">
        <h2>Ogiltig länk</h2>
        <p>Länken är ogiltig eller redan använd. Din prenumeration är antingen redan bekräftad eller så finns den inte.</p>
      </body></html>
    `);
    return;
  }

  db.prepare(`UPDATE subscriptions SET status = 'confirmed' WHERE id = ?`).run(sub.id);

  sendWelcomeEmail(sub.email, token).catch((err) =>
    console.error(`[${new Date().toISOString()}] Välkomstmail misslyckades (${sub.email}):`, err)
  );

  res.send(`
    <html><body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto">
      <h2>Prenumeration bekräftad!</h2>
      <p>Du är nu prenumerant på Landvetter IF Cupportalen och får mail när nya cuper godkänns.</p>
    </body></html>
  `);
});

// GET /api/subscriptions/unsubscribe?token=xxx
router.get('/subscriptions/unsubscribe', (req: Request, res: Response) => {
  const token = String(req.query.token || '');
  if (!token) { res.status(400).send('<p>Ogiltig länk</p>'); return; }

  const sub = db.prepare(`SELECT email FROM subscriptions WHERE token = ?`).get(token) as any;
  const result = db.prepare(`DELETE FROM subscriptions WHERE token = ?`).run(token);

  if (result.changes === 0) {
    res.status(404).send(`
      <html><body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto">
        <p>Länken är ogiltig eller redan använd.</p>
      </body></html>
    `);
    return;
  }

  if (sub?.email) {
    sendUnsubscribeConfirmationEmail(sub.email).catch((err) =>
      console.error(`[${new Date().toISOString()}] Avprenumerationsmail misslyckades (${sub.email}):`, err)
    );
  }

  res.send(`
    <html><body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto">
      <h2>Du är avprenumererad</h2>
      <p>Din e-postadress har tagits bort. Du får inga fler notiser om nya cuper.</p>
    </body></html>
  `);
});

export default router;
