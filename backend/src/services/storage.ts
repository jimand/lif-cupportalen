import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const UPLOADS_DIR = process.env.DB_PATH
  ? path.join(path.dirname(process.env.DB_PATH), 'uploads')
  : path.join(__dirname, '../../data/uploads');

export function saveFile(buffer: Buffer, originalName: string): { filename: string; size: number } {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const ext = path.extname(originalName).toLowerCase();
  const filename = `${randomUUID()}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return { filename, size: buffer.length };
}

export function deleteFile(filename: string): void {
  try { fs.unlinkSync(path.join(UPLOADS_DIR, path.basename(filename))); } catch {}
}

export function getFilePath(filename: string): string {
  return path.join(UPLOADS_DIR, path.basename(filename));
}
