// Fetch ke API pihak ketiga yang dikonfigurasi admin, dengan perlindungan SSRF: hanya https, tolak alamat privat / loopback / metadata,
// tanpa redirect, batas waktu dan ukuran respons.
import dns from 'node:dns/promises';
import net from 'node:net';
import { ApiError } from './errors.js';

let testFetch = null; // untuk tes: menggantikan jaringan
export const setConnectorFetch = (fn) => { testFetch = fn; };

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
}

export async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new ApiError(422, 'connector_url', 'URL tidak valid'); }
  if (u.protocol !== 'https:') throw new ApiError(422, 'connector_url', 'URL harus diawali https://');
  if (u.username || u.password) throw new ApiError(422, 'connector_url', 'URL tidak boleh memuat user / password');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (testFetch && !net.isIP(host)) return u; // tes: tanpa DNS
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => { throw new ApiError(422, 'connector_dns', `Host tidak ditemukan: ${host}`); });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new ApiError(422, 'connector_private', 'Alamat privat / internal tidak diizinkan');
  return u;
}

export async function safeJsonFetch(url, { method = 'GET', headers = {}, body, maxBytes = 2 * 1024 * 1024, timeoutMs = 15000 } = {}) {
  if (testFetch) return testFetch(url, { method, headers, body });
  await assertPublicUrl(url);
  let res;
  try {
    res = await fetch(url, { method, headers: { Accept: 'application/json', ...headers }, body, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new ApiError(502, 'connector_fetch', `Gagal menghubungi API: ${String(e.cause?.code || e.message || e).slice(0, 120)}`);
  }
  const reader = res.body.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > maxBytes) { reader.cancel().catch(() => {}); throw new ApiError(502, 'connector_too_big', 'Respons API terlalu besar (maks. 2 MB)'); }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!res.ok) throw new ApiError(502, 'connector_http', `API menjawab ${res.status}: ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
  try { return JSON.parse(text); } catch { throw new ApiError(502, 'connector_json', 'Respons API bukan JSON'); }
}
