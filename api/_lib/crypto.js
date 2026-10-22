// Enkripsi rahasia (kredensial API TMS customer) dengan AES-256-GCM. Kunci dari env ENCRYPTION_KEY (teks bebas, minimal 16 karakter).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ApiError } from './errors.js';

const key = () => {
  const k = process.env.ENCRYPTION_KEY;
  if (!k || k.length < 16) throw new ApiError(503, 'encryption_not_configured', 'ENCRYPTION_KEY belum diisi di Vercel (min. 16 karakter)');
  return createHash('sha256').update(k).digest();
};
export const encryptionReady = () => !!process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 16;

export function encrypt(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1.${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

export function decrypt(blob) {
  const [v, iv, tag, enc] = String(blob || '').split('.');
  if (v !== 'v1' || !iv || !tag || !enc) throw new ApiError(500, 'decrypt_failed', 'Rahasia tidak dapat dibaca');
  try {
    const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(500, 'decrypt_failed', 'Rahasia tidak dapat didekripsi (ENCRYPTION_KEY berubah?)');
  }
}
