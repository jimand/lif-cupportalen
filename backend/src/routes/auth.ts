import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många inloggningsförsök, försök igen om 15 minuter' },
});

const loginSchema = z.object({
  password: z.string().min(1, 'Lösenord krävs'),
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ogiltiga uppgifter' });
    return;
  }

  const { password } = parsed.data;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    res.status(500).json({ error: 'Serverkonfigurationsfel' });
    return;
  }

  if (!adminPassword.startsWith('$2')) {
    res.status(500).json({ error: 'Serverkonfigurationsfel: ADMIN_PASSWORD måste vara ett bcrypt-hash' });
    return;
  }

  const valid = await bcrypt.compare(password, adminPassword);

  if (!valid) {
    res.status(401).json({ error: 'Fel lösenord' });
    return;
  }

  const token = jwt.sign({ admin: true }, process.env.JWT_SECRET!, {
    expiresIn: '8h',
  });

  res.cookie('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
  });

  res.json({ ok: true });
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

router.get('/me', (req: Request, res: Response) => {
  const token = req.cookies?.admin_token;
  if (!token) {
    res.json({ admin: false });
    return;
  }
  try {
    jwt.verify(token, process.env.JWT_SECRET!);
    res.json({ admin: true });
  } catch {
    res.json({ admin: false });
  }
});

export default router;
