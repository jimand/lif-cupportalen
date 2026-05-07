import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import db from '../services/db';
import { sendCupNotification } from '../services/gmail';

const router = Router();

const cupSchema = z.object({
  name: z.string().min(1, 'Namn krävs').max(200),
  location: z.string().min(1, 'Ort krävs').max(200),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ogiltigt datumformat (ÅÅÅÅ-MM-DD)'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  age_classes: z.string().min(1, 'Åldersklasser krävs').max(500),
  url: z.string().max(500).optional().or(z.literal('')),
  description: z.string().max(2000).optional(),
});

function normalizeUrl(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getVoterToken(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';
  return crypto.createHash('sha256').update(`${ip}:${ua}`).digest('hex');
}

// GET /api/cups – list approved cups
router.get('/', (req: Request, res: Response) => {
  const { search, location, age_class, date_from, date_to, sort } = req.query;

  let query = `SELECT * FROM cups WHERE status = 'approved'`;
  const params: any[] = [];

  if (search) {
    query += ` AND (name LIKE ? OR location LIKE ? OR age_classes LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  if (location) {
    query += ` AND location LIKE ?`;
    params.push(`%${location}%`);
  }

  if (age_class) {
    query += ` AND age_classes LIKE ?`;
    params.push(`%${age_class}%`);
  }

  if (date_from) {
    query += ` AND start_date >= ?`;
    params.push(date_from);
  }

  if (date_to) {
    query += ` AND start_date <= ?`;
    params.push(date_to);
  }

  const sortOrder = sort === 'date' ? 'start_date ASC' : 'thumbs_up DESC, start_date ASC';
  query += ` ORDER BY ${sortOrder}`;

  const cups = db.prepare(query).all(...params);
  res.json(cups);
});

// GET /api/cups/:id
router.get('/:id', (req: Request, res: Response) => {
  const cup = db.prepare(`SELECT * FROM cups WHERE id = ? AND status = 'approved'`).get(req.params.id);
  if (!cup) {
    res.status(404).json({ error: 'Cupen hittades inte' });
    return;
  }
  res.json(cup);
});

// POST /api/cups – create pending cup
router.post('/', (req: Request, res: Response) => {
  const parsed = cupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ogiltiga uppgifter', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, location, start_date, end_date, age_classes, url, description } = parsed.data;

  const result = db.prepare(`
    INSERT INTO cups (name, location, start_date, end_date, age_classes, url, description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(name, location, start_date, end_date || null, age_classes, normalizeUrl(url), description || null);

  sendCupNotification(name).catch((err) =>
    console.error(`[${new Date().toISOString()}] Notifieringsmail misslyckades:`, err)
  );

  res.status(201).json({ id: result.lastInsertRowid, message: 'Cupen har skickats in och väntar på godkännande' });
});

// POST /api/cups/:id/vote
router.post('/:id/vote', (req: Request, res: Response) => {
  const cup = db.prepare(`SELECT id, thumbs_up FROM cups WHERE id = ? AND status = 'approved'`).get(req.params.id) as any;
  if (!cup) {
    res.status(404).json({ error: 'Cupen hittades inte' });
    return;
  }

  const voterToken = getVoterToken(req);

  const existing = db.prepare(`SELECT id FROM votes WHERE cup_id = ? AND voter_token = ?`).get(cup.id, voterToken);
  if (existing) {
    res.status(409).json({ error: 'Du har redan röstat på denna cup', already_voted: true });
    return;
  }

  db.prepare(`INSERT INTO votes (cup_id, voter_token) VALUES (?, ?)`).run(cup.id, voterToken);
  db.prepare(`UPDATE cups SET thumbs_up = thumbs_up + 1, updated_at = datetime('now') WHERE id = ?`).run(cup.id);

  const updated = db.prepare(`SELECT thumbs_up FROM cups WHERE id = ?`).get(cup.id) as any;
  res.json({ thumbs_up: updated.thumbs_up });
});

// GET /api/cups/vote-status – check if voted (query: ids)
router.get('/vote-status/check', (req: Request, res: Response) => {
  const { ids } = req.query;
  if (!ids) {
    res.json({});
    return;
  }

  const voterToken = getVoterToken(req);
  const idList = String(ids).split(',').map(Number).filter(Boolean);

  const result: Record<number, boolean> = {};
  for (const id of idList) {
    const vote = db.prepare(`SELECT id FROM votes WHERE cup_id = ? AND voter_token = ?`).get(id, voterToken);
    result[id] = !!vote;
  }

  res.json(result);
});

export default router;
