import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AdminRequest extends Request {
  isAdmin?: boolean;
}

export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.admin_token;

  if (!token) {
    res.status(401).json({ error: 'Ej inloggad' });
    return;
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] });
    req.isAdmin = true;
    next();
  } catch {
    res.status(401).json({ error: 'Ogiltig eller utgången session' });
  }
}
