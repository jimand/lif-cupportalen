import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import db from '../services/db';
import { saveFile, deleteFile, getFilePath } from '../services/storage';
import { requireAdmin } from '../middleware/auth';

const router = Router();

const ALLOWED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_TYPES.includes(file.mimetype)),
});

// GET /api/cups/:cupId/attachments – public
router.get('/cups/:cupId/attachments', (req: Request, res: Response) => {
  const attachments = db.prepare(`
    SELECT id, original_name, mime_type, size, created_at
    FROM attachments WHERE cup_id = ? ORDER BY created_at ASC
  `).all(req.params.cupId);
  res.json(attachments);
});

// GET /api/attachments/:id/file – public for approved cups only
router.get('/attachments/:id/file', (req: Request, res: Response) => {
  const att = db.prepare(`SELECT * FROM attachments WHERE id = ?`).get(req.params.id) as any;
  if (!att) { res.status(404).json({ error: 'Filen hittades inte' }); return; }

  if (att.cup_id) {
    const cup = db.prepare(`SELECT status FROM cups WHERE id = ?`).get(att.cup_id) as any;
    if (!cup || cup.status !== 'approved') {
      const token = req.cookies?.admin_token;
      let isAdmin = false;
      try { if (token) { jwt.verify(token, process.env.JWT_SECRET!); isAdmin = true; } } catch {}
      if (!isAdmin) { res.status(403).json({ error: 'Åtkomst nekad' }); return; }
    }
  }

  const filePath = getFilePath(att.filename);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'Filen saknas på disk' }); return; }
  const inline = att.mime_type.startsWith('image/') || att.mime_type === 'application/pdf';
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${att.original_name}"`);
  res.setHeader('Content-Type', att.mime_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(filePath);
});

// POST /api/admin/cups/:cupId/attachments – admin upload
router.post('/admin/cups/:cupId/attachments', requireAdmin, upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'Ingen fil bifogad eller otillåten filtyp' }); return; }
  const cup = db.prepare(`SELECT id FROM cups WHERE id = ?`).get(req.params.cupId);
  if (!cup) { res.status(404).json({ error: 'Cupen hittades inte' }); return; }
  const { filename, size } = saveFile(req.file.buffer, req.file.originalname);
  const result = db.prepare(`
    INSERT INTO attachments (cup_id, filename, original_name, mime_type, size)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.cupId, filename, req.file.originalname, req.file.mimetype, size);
  res.status(201).json({ id: result.lastInsertRowid, original_name: req.file.originalname, mime_type: req.file.mimetype, size });
});

// DELETE /api/admin/attachments/:id – admin delete
router.delete('/admin/attachments/:id', requireAdmin, (req: Request, res: Response) => {
  const att = db.prepare(`SELECT * FROM attachments WHERE id = ?`).get(req.params.id) as any;
  if (!att) { res.status(404).json({ error: 'Bilagan hittades inte' }); return; }
  deleteFile(att.filename);
  db.prepare(`DELETE FROM attachments WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

export default router;
