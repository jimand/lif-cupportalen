import { Router, Request, Response } from 'express';
import { z } from 'zod';
import db from '../services/db';
import { requireAdmin } from '../middleware/auth';
import { sendCupNotification } from '../services/gmail';

const router = Router();
router.use(requireAdmin);

const cupUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  location: z.string().min(1).max(200).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  age_classes: z.string().min(1).max(500).optional(),
  url: z.string().max(500).optional().or(z.literal('')),
  description: z.string().max(2000).optional(),
  status: z.enum(['pending', 'approved']).optional(),
});

function normalizeUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// GET /api/admin/cups – all cups including pending
router.get('/cups', (_req: Request, res: Response) => {
  const cups = db.prepare(`SELECT * FROM cups ORDER BY status ASC, created_at DESC`).all();
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
    res.status(400).json({ error: 'Ogiltiga uppgifter', details: parsed.error.flatten().fieldErrors });
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
      url = ?,
      description = ?,
      status = COALESCE(?, status),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    data.name ?? null,
    data.location ?? null,
    data.start_date ?? null,
    'end_date' in data ? (data.end_date || null) : cup.end_date,
    data.age_classes ?? null,
    'url' in data ? normalizeUrl(data.url) : cup.url,
    'description' in data ? (data.description || null) : cup.description,
    data.status ?? null,
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
  const updated = db.prepare(`SELECT * FROM cups WHERE id = ?`).get(req.params.id);
  res.json(updated);
});

// GET /api/admin/email-jobs
router.get('/email-jobs', (_req: Request, res: Response) => {
  const jobs = db.prepare(`
    SELECT ej.*, c.name as cup_name
    FROM email_jobs ej
    LEFT JOIN cups c ON ej.parsed_cup_id = c.id
    ORDER BY ej.received_at DESC
  `).all();
  res.json(jobs);
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
    url: z.string().max(500).optional().or(z.literal('')),
    description: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ogiltiga uppgifter', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, location, start_date, end_date, age_classes, url, description } = parsed.data;

  const cupResult = db.prepare(`
    INSERT INTO cups (name, location, start_date, end_date, age_classes, url, description, source_email, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(name, location, start_date, end_date || null, age_classes, normalizeUrl(url), description || null, job.sender);

  const cupId = cupResult.lastInsertRowid;

  sendCupNotification(name).catch((err) =>
    console.error(`[${new Date().toISOString()}] Notifieringsmail misslyckades:`, err)
  );

  db.prepare(`
    UPDATE email_jobs SET parsed_cup_id = ?, status = 'processed', processed_at = datetime('now') WHERE id = ?
  `).run(cupId, job.id);

  res.status(201).json({ cup_id: cupId });
});

export default router;
