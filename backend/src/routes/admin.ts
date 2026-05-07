import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import db from '../services/db';
import { requireAdmin } from '../middleware/auth';
import {
  sendCupNotification, sendSubscriberNotification, pollGmail,
  sendWelcomeEmail, sendUnsubscribeConfirmationEmail, sendConfirmationEmail,
} from '../services/gmail';

const router = Router();
router.use(requireAdmin);

const cupUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  location: z.string().min(1).max(200).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  age_classes: z.string().min(1).max(500).optional(),
  cup_type: z.string().max(200).optional().or(z.literal('')),
  url: z.string().max(500).optional().or(z.literal('')),
  description: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['pending', 'approved']).optional(),
  recommended: z.boolean().optional(),
  registration_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
});

function normalizeUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// GET /api/admin/stats
router.get('/stats', (_req: Request, res: Response) => {
  const total = (db.prepare(`SELECT COUNT(*) as n FROM cups`).get() as any).n;
  const approved = (db.prepare(`SELECT COUNT(*) as n FROM cups WHERE status = 'approved'`).get() as any).n;
  const pending = (db.prepare(`SELECT COUNT(*) as n FROM cups WHERE status = 'pending'`).get() as any).n;
  const total_votes = (db.prepare(`SELECT COALESCE(SUM(thumbs_up), 0) as n FROM cups`).get() as any).n;
  const attachment_count = (db.prepare(`SELECT COUNT(*) as n FROM attachments WHERE cup_id IS NOT NULL`).get() as any).n;
  res.json({ total, approved, pending, total_votes, attachment_count });
});

// GET /api/admin/cups.csv
router.get('/cups.csv', (_req: Request, res: Response) => {
  const cups = db.prepare(`SELECT * FROM cups ORDER BY created_at DESC`).all() as any[];
  function esc(v: any): string {
    return `"${String(v ?? '').replace(/"/g, '""')}"`;
  }
  const header = ['ID', 'Namn', 'Ort', 'Startdatum', 'Slutdatum', 'Åldrar', 'Spelformat', 'Status', 'Röster', 'Källa', 'Skapad'];
  const rows = cups.map((c) => [
    c.id, c.name, c.location, c.start_date, c.end_date ?? '',
    c.age_classes, c.cup_type ?? '', c.status, c.thumbs_up,
    c.source_email ?? '', c.created_at,
  ].map(esc).join(','));
  const csv = [header.map(esc).join(','), ...rows].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="cuper.csv"');
  res.send('﻿' + csv); // BOM for Excel UTF-8
});

// POST /api/admin/poll-now
router.post('/poll-now', (_req: Request, res: Response) => {
  pollGmail().catch(console.error);
  res.json({ ok: true });
});

// GET /api/admin/cups – all cups including pending
router.get('/cups', (_req: Request, res: Response) => {
  const cups = db.prepare(`
    SELECT *,
      EXISTS (
        SELECT 1 FROM cups c2
        WHERE c2.id != cups.id
          AND c2.status != 'pending'
          AND lower(c2.name) LIKE '%' || lower(substr(cups.name, 1, 10)) || '%'
      ) as potential_duplicate
    FROM cups ORDER BY status ASC, created_at DESC
  `).all();
  res.json(cups);
});

// PUT /api/admin/cups/:id
router.put('/cups/:id', (req: Request, res: Response) => {
  const cup = db.prepare(`SELECT * FROM cups WHERE id = ?`).get(req.params.id) as any;
  if (!cup) {
    res.status(404).json({ error: 'Cupen hittades inte' });
    return;
  }

  const parsed = cupUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    console.error(`[${new Date().toISOString()}] Valideringsfel PUT /cups/${req.params.id}:`, parsed.error.flatten().fieldErrors);
    res.status(400).json({ error: 'Ogiltiga fält' });
    return;
  }

  const data = parsed.data;
  db.prepare(`
    UPDATE cups SET
      name = COALESCE(?, name),
      location = COALESCE(?, location),
      start_date = COALESCE(?, start_date),
      end_date = ?,
      age_classes = COALESCE(?, age_classes),
      cup_type = ?,
      url = ?,
      description = ?,
      notes = ?,
      status = COALESCE(?, status),
      recommended = COALESCE(?, recommended),
      registration_deadline = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    data.name ?? null,
    data.location ?? null,
    data.start_date ?? null,
    'end_date' in data ? (data.end_date || null) : cup.end_date,
    data.age_classes ?? null,
    'cup_type' in data ? (data.cup_type || null) : cup.cup_type,
    'url' in data ? normalizeUrl(data.url) : cup.url,
    'description' in data ? (data.description || null) : cup.description,
    'notes' in data ? (data.notes || null) : cup.notes,
    data.status ?? null,
    'recommended' in data ? (data.recommended ? 1 : 0) : null,
    'registration_deadline' in data ? (data.registration_deadline || null) : cup.registration_deadline,
    req.params.id,
  );

  const updated = db.prepare(`SELECT * FROM cups WHERE id = ?`).get(req.params.id);
  res.json(updated);
});

// DELETE /api/admin/cups/:id
router.delete('/cups/:id', (req: Request, res: Response) => {
  const cup = db.prepare(`SELECT id FROM cups WHERE id = ?`).get(req.params.id);
  if (!cup) {
    res.status(404).json({ error: 'Cupen hittades inte' });
    return;
  }

  db.prepare(`DELETE FROM cups WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// PATCH /api/admin/cups/:id/approve
router.patch('/cups/:id/approve', (req: Request, res: Response) => {
  const cup = db.prepare(`SELECT id FROM cups WHERE id = ?`).get(req.params.id);
  if (!cup) {
    res.status(404).json({ error: 'Cupen hittades inte' });
    return;
  }

  db.prepare(`UPDATE cups SET status = 'approved', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  const updated = db.prepare(`SELECT * FROM cups WHERE id = ?`).get(req.params.id) as any;

  const subscribers = db.prepare(`SELECT email, token FROM subscriptions WHERE status = 'confirmed'`).all() as any[];
  for (const sub of subscribers) {
    sendSubscriberNotification(updated.name, updated.id, sub.email, sub.token).catch((err) =>
      console.error(`[${new Date().toISOString()}] Prenumerantmail misslyckades (${sub.email}):`, err)
    );
  }

  res.json(updated);
});

// GET /api/admin/subscriptions
router.get('/subscriptions', (_req: Request, res: Response) => {
  const subs = db.prepare(`SELECT id, email, status, created_at FROM subscriptions ORDER BY created_at DESC`).all();
  res.json(subs);
});

// POST /api/admin/subscriptions – add directly as confirmed + send welcome email
router.post('/subscriptions', (req: Request, res: Response) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ogiltig e-postadress' });
    return;
  }
  const token = randomUUID();
  const result = db.prepare(
    `INSERT OR IGNORE INTO subscriptions (email, token, status) VALUES (?, ?, 'confirmed')`
  ).run(parsed.data.email, token);
  if (result.changes === 0) {
    res.status(409).json({ error: 'E-postadressen är redan registrerad' });
    return;
  }
  sendWelcomeEmail(parsed.data.email, token).catch((err) =>
    console.error(`[${new Date().toISOString()}] Välkomstmail misslyckades (${parsed.data.email}):`, err)
  );
  res.json({ ok: true });
});

// DELETE /api/admin/subscriptions/:id
router.delete('/subscriptions/:id', (req: Request, res: Response) => {
  const sub = db.prepare(`SELECT email FROM subscriptions WHERE id = ?`).get(req.params.id) as any;
  if (!sub) {
    res.status(404).json({ error: 'Prenumeranten hittades inte' });
    return;
  }
  db.prepare(`DELETE FROM subscriptions WHERE id = ?`).run(req.params.id);
  sendUnsubscribeConfirmationEmail(sub.email).catch((err) =>
    console.error(`[${new Date().toISOString()}] Avprenumerationsmail misslyckades (${sub.email}):`, err)
  );
  res.json({ ok: true });
});

// POST /api/admin/subscriptions/:id/resend
router.post('/subscriptions/:id/resend', (req: Request, res: Response) => {
  const sub = db.prepare(`SELECT * FROM subscriptions WHERE id = ?`).get(req.params.id) as any;
  if (!sub) {
    res.status(404).json({ error: 'Prenumeranten hittades inte' });
    return;
  }
  if (sub.status === 'pending') {
    sendConfirmationEmail(sub.email, sub.token).catch((err) =>
      console.error(`[${new Date().toISOString()}] Bekräftelsemail misslyckades (${sub.email}):`, err)
    );
  } else {
    sendWelcomeEmail(sub.email, sub.token).catch((err) =>
      console.error(`[${new Date().toISOString()}] Välkomstmail misslyckades (${sub.email}):`, err)
    );
  }
  res.json({ ok: true });
});

// GET /api/admin/email-jobs
router.get('/email-jobs', (_req: Request, res: Response) => {
  try {
    const jobs = db.prepare(`
      SELECT ej.*, c.name as cup_name
      FROM email_jobs ej
      LEFT JOIN cups c ON ej.parsed_cup_id = c.id
      ORDER BY ej.received_at DESC
    `).all();
    res.json(jobs);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Email-jobs fel:`, err);
    res.status(500).json({ error: 'Kunde inte hämta e-postjobb' });
  }
});

// POST /api/admin/email-jobs/:id/create-cup
router.post('/email-jobs/:id/create-cup', (req: Request, res: Response) => {
  const job = db.prepare(`SELECT * FROM email_jobs WHERE id = ?`).get(req.params.id) as any;
  if (!job) {
    res.status(404).json({ error: 'E-postjobbet hittades inte' });
    return;
  }

  const schema = z.object({
    name: z.string().min(1),
    location: z.string().min(1),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    age_classes: z.string().min(1),
    cup_type: z.string().max(200).optional(),
    url: z.string().max(500).optional().or(z.literal('')),
    description: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ogiltiga uppgifter', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, location, start_date, end_date, age_classes, cup_type, url, description } = parsed.data;

  const cupResult = db.prepare(`
    INSERT INTO cups (name, location, start_date, end_date, age_classes, cup_type, url, description, source_email, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(name, location, start_date, end_date || null, age_classes, cup_type || null, normalizeUrl(url), description || null, job.sender);

  const cupId = cupResult.lastInsertRowid;

  sendCupNotification(name).catch((err) =>
    console.error(`[${new Date().toISOString()}] Notifieringsmail misslyckades:`, err)
  );

  db.prepare(`UPDATE attachments SET cup_id = ? WHERE email_job_id = ? AND cup_id IS NULL`).run(cupId, job.id);

  db.prepare(`
    UPDATE email_jobs SET parsed_cup_id = ?, status = 'processed', processed_at = datetime('now') WHERE id = ?
  `).run(cupId, job.id);

  res.status(201).json({ cup_id: cupId });
});

export default router;
