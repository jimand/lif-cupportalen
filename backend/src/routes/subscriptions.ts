import { Router, Request, Response } from 'express';
import { randomUUID, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import db from '../services/db';
import { sendConfirmationEmail, sendUnsubscribeConfirmationEmail, sendWelcomeEmail } from '../services/gmail';

const router = Router();

const CSRF_COOKIE = 'csrf_token';

function setCsrfToken(res: Response): string {
  const token = randomUUID();
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000,
  });
  return token;
}

function verifyCsrfToken(req: Request): boolean {
  const cookie = req.cookies?.[CSRF_COOKIE];
  const body = req.body?.csrf_token;
  if (!cookie || !body || cookie.length !== body.length) return false;
  try {
    return timingSafeEqual(Buffer.from(cookie), Buffer.from(body));
  } catch {
    return false;
  }
}

const subscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många försök, försök igen om en timme' },
});

const confirmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många försök, försök igen om 15 minuter' },
});

// POST /api/subscriptions – double opt-in
router.post('/subscriptions', subscribeLimiter, (req: Request, res: Response) => {
  const parsed = z.object({
    email: z.string().email(),
    age_classes: z.string().max(200).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ogiltig e-postadress' });
    return;
  }
  const token = randomUUID();
  const result = db.prepare(
    `INSERT OR IGNORE INTO subscriptions (email, token, status, token_expires_at, age_classes)
     VALUES (?, ?, 'pending', datetime('now', '+48 hours'), ?)`
  ).run(parsed.data.email, token, parsed.data.age_classes || null);

  if (result.changes > 0) {
    sendConfirmationEmail(parsed.data.email, token).catch((err) =>
      console.error(`[${new Date().toISOString()}] Bekräftelsemail misslyckades (${parsed.data.email}):`, err)
    );
  }

  res.json({ ok: true, pending: true });
});

const confirmPage = (token: string, csrfToken: string, frontendUrl: string) => `
  <html><head><meta charset="utf-8"><title>Bekräfta prenumeration</title></head>
  <body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto;text-align:center">
    <h2>Bekräfta din prenumeration</h2>
    <p>Klicka på knappen nedan för att bekräfta att du vill prenumerera på Landvetter IF Cupportalen.</p>
    <form method="POST" action="${frontendUrl}/api/subscriptions/confirm">
      <input type="hidden" name="token" value="${token}">
      <input type="hidden" name="csrf_token" value="${csrfToken}">
      <button type="submit" style="background:#16a34a;color:#fff;border:none;padding:0.75rem 2rem;font-size:1rem;border-radius:6px;cursor:pointer">
        Bekräfta prenumeration
      </button>
    </form>
  </body></html>
`;

// GET /api/subscriptions/confirm?token=xxx – visar bekräftelsesida (skyddas mot länkskanning)
router.get('/subscriptions/confirm', confirmLimiter, (req: Request, res: Response) => {
  const token = String(req.query.token || '');
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (!token) { res.status(400).send('<p>Ogiltig länk</p>'); return; }

  const sub = db.prepare(
    `SELECT id, token_expires_at FROM subscriptions WHERE token = ? AND status = 'pending'`
  ).get(token) as any;

  if (!sub) {
    res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto">
        <h2>Ogiltig länk</h2>
        <p>Länken är ogiltig eller redan använd. Din prenumeration är antingen redan bekräftad eller så finns den inte.</p>
      </body></html>
    `);
    return;
  }

  if (sub.token_expires_at && new Date(sub.token_expires_at) < new Date()) {
    res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto">
        <h2>Länken har gått ut</h2>
        <p>Bekräftelselänken är äldre än 48 timmar. Prenumerera igen på <a href="${frontendUrl}">startsidan</a> för att få en ny länk.</p>
      </body></html>
    `);
    return;
  }

  const csrfToken = setCsrfToken(res);
  res.send(confirmPage(token, csrfToken, frontendUrl));
});

// POST /api/subscriptions/confirm – utför den faktiska bekräftelsen
router.post('/subscriptions/confirm', confirmLimiter, (req: Request, res: Response) => {
  const token = String(req.body?.token || req.query.token || '');
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (!token) { res.status(400).send('<p>Ogiltig länk</p>'); return; }

  if (!verifyCsrfToken(req)) {
    res.status(403).send(`
      <html><body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto">
        <h2>Ogiltig förfrågan</h2>
        <p>Säkerhetstoken saknas eller har gått ut. Gå tillbaka och försök igen via länken i mailet.</p>
      </body></html>
    `);
    return;
  }

  const sub = db.prepare(
    `SELECT id, email, token_expires_at FROM subscriptions WHERE token = ? AND status = 'pending'`
  ).get(token) as any;

  if (!sub) {
    res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto">
        <h2>Ogiltig länk</h2>
        <p>Länken är ogiltig eller redan använd. Din prenumeration är antingen redan bekräftad eller så finns den inte.</p>
      </body></html>
    `);
    return;
  }

  if (sub.token_expires_at && new Date(sub.token_expires_at) < new Date()) {
    res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto">
        <h2>Länken har gått ut</h2>
        <p>Bekräftelselänken är äldre än 48 timmar. Prenumerera igen på <a href="${frontendUrl}">startsidan</a> för att få en ny länk.</p>
      </body></html>
    `);
    return;
  }

  const unsubToken = randomUUID();
  db.prepare(`UPDATE subscriptions SET status = 'confirmed', token = ?, token_expires_at = NULL WHERE id = ?`).run(unsubToken, sub.id);

  sendWelcomeEmail(sub.email, unsubToken).catch((err) =>
    console.error(`[${new Date().toISOString()}] Välkomstmail misslyckades (${sub.email}):`, err)
  );

  res.send(`
    <html><body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto;text-align:center">
      <h2>Prenumeration bekräftad!</h2>
      <p>Du är nu prenumerant på Landvetter IF Cupportalen och får mail när nya cuper godkänns.</p>
      <p><a href="${frontendUrl}">Gå till startsidan</a></p>
    </body></html>
  `);
});

// GET /api/subscriptions/unsubscribe?token=xxx – visar bekräftelsesida
router.get('/subscriptions/unsubscribe', confirmLimiter, (req: Request, res: Response) => {
  const token = String(req.query.token || '');
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  if (!token) { res.status(400).send('<p>Ogiltig länk</p>'); return; }

  const sub = db.prepare(`SELECT email FROM subscriptions WHERE token = ?`).get(token) as any;
  if (!sub) {
    res.status(404).send(`
      <html><body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto">
        <p>Länken är ogiltig eller redan använd.</p>
      </body></html>
    `);
    return;
  }

  const csrfToken = setCsrfToken(res);
  res.send(`
    <html><head><meta charset="utf-8"><title>Avprenumerera</title></head>
    <body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto;text-align:center">
      <h2>Avprenumerera</h2>
      <p>Vill du sluta få notiser om nya cuper?</p>
      <form method="POST" action="${frontendUrl}/api/subscriptions/unsubscribe">
        <input type="hidden" name="token" value="${token}">
        <input type="hidden" name="csrf_token" value="${csrfToken}">
        <button type="submit" style="background:#CC0000;color:#fff;border:none;padding:0.75rem 2rem;font-size:1rem;border-radius:6px;cursor:pointer">
          Ja, avprenumerera
        </button>
      </form>
    </body></html>
  `);
});

// POST /api/subscriptions/unsubscribe – utför den faktiska avprenumerationen
router.post('/subscriptions/unsubscribe', confirmLimiter, (req: Request, res: Response) => {
  const token = String(req.body?.token || req.query.token || '');
  if (!token) { res.status(400).send('<p>Ogiltig länk</p>'); return; }

  if (!verifyCsrfToken(req)) {
    res.status(403).send(`
      <html><body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto">
        <h2>Ogiltig förfrågan</h2>
        <p>Säkerhetstoken saknas eller har gått ut. Gå tillbaka och försök igen via länken i mailet.</p>
      </body></html>
    `);
    return;
  }

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
    <html><body style="font-family:sans-serif;padding:2rem;max-width:500px;margin:0 auto;text-align:center">
      <h2>Du är avprenumererad</h2>
      <p>Din e-postadress har tagits bort. Du får inga fler notiser om nya cuper.</p>
    </body></html>
  `);
});

export default router;
