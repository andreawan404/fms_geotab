// Notifikasi exception ke admin: email (Brevo) dan WhatsApp (Fonnte atau webhook generik).
// Setiap exception baru dikirim sekali (diklaim atomik lewat UPDATE ... RETURNING), exception "tinggi" yang belum ditangani diingatkan sekali lagi.
import { ApiError } from './errors.js';
import { mailConfig, sendEmail } from './mailer.js';

let waSender = null; // untuk tes
export const setWaSender = (fn) => { waSender = fn; };

const SEV_ORDER = ['high', 'medium', 'low'];
const SEV_LABEL = { high: 'TINGGI', medium: 'SEDANG', low: 'RENDAH' };
const SEV_ICON = { high: '🔴', medium: '🟠', low: '⚪' };
const KIND = {
  no_response: 'Tidak ada vendor yang menerima', not_started: 'Belum berangkat', late: 'Terlambat (belum tiba)', late_arrival: 'Tiba terlambat', stale: 'Tidak ada update', outside_radius: 'Di luar radius lokasi', qty_diff: 'Selisih qty',
  breakdown: 'Kendaraan mogok', accident: 'Kecelakaan', traffic: 'Macet / jalan tertutup', customer_closed: 'Lokasi tutup', failed_delivery: 'Gagal kirim', other: 'Kendala lain',
};
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}j ${Math.round(m % 60)}m` : `${Math.round(m)}m`);
export function detailText(kind, m = {}) {
  switch (kind) {
    case 'no_response': return 'Semua penawaran kedaluwarsa / ditolak. Alokasikan ulang manual.';
    case 'not_started': return `Belum berangkat, ${dur(m.minutes || 0)} setelah jadwal di ${m.stop || '-'}.`;
    case 'late': return `Belum tiba di ${m.stop || '-'}, terlambat ${dur(m.minutes || 0)}.`;
    case 'late_arrival': return `Tiba di ${m.stop || '-'} terlambat ${dur(m.minutes || 0)}.`;
    case 'stale': return `Tidak ada update dari vendor selama ${dur(m.minutes || 0)}.`;
    case 'outside_radius': return `Dicatat ${Math.round(m.distM || 0)} m dari titik ${m.stop || '-'}.`;
    case 'qty_diff': return `Qty tidak sesuai di ${m.stop || '-'} (petugas: ${m.receiver || '-'}).`;
    default: return [m.note, m.stop && `@ ${m.stop}`].filter(Boolean).join(' ');
  }
}

export const waConfig = () => {
  if (process.env.FONNTE_TOKEN) return { provider: 'fonnte', configured: true };
  if (process.env.WA_WEBHOOK_URL) return { provider: 'webhook', configured: true };
  return { provider: null, configured: false };
};

export const normPhone = (v) => {
  let d = String(v || '').replace(/[^\d]/g, '');
  if (d.startsWith('0')) d = `62${d.slice(1)}`;
  else if (d.startsWith('8')) d = `62${d}`;
  return d;
};

export async function sendWhatsApp(to, message) {
  if (waSender) return waSender({ to, message });
  const cfg = waConfig();
  if (!cfg.configured) return { status: 'skipped', error: 'WhatsApp belum dikonfigurasi (FONNTE_TOKEN / WA_WEBHOOK_URL)' };
  try {
    let res;
    if (cfg.provider === 'fonnte') {
      res = await fetch('https://api.fonnte.com/send', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { Authorization: process.env.FONNTE_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ target: to, message, countryCode: '62' }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.status === false) return { status: 'failed', error: `Fonnte ${res.status}: ${String(j.reason || j.message || '').slice(0, 150)}` };
      return { status: 'sent' };
    }
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.WA_WEBHOOK_TOKEN) headers.Authorization = `Bearer ${process.env.WA_WEBHOOK_TOKEN}`;
    res = await fetch(process.env.WA_WEBHOOK_URL, { method: 'POST', signal: AbortSignal.timeout(10000), headers, body: JSON.stringify({ to, message }) });
    return res.ok ? { status: 'sent' } : { status: 'failed', error: `Webhook ${res.status}` };
  } catch (e) {
    return { status: 'failed', error: String(e.message || e).slice(0, 150) };
  }
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const DEFAULTS = { emailEnabled: true, waEnabled: true, emails: [], phones: [], minSeverity: 'high', renotifyMin: 60 };

export async function getSettings(db) {
  const r = (await db.query('SELECT * FROM notify_settings WHERE id = 1'))[0];
  if (!r) return { ...DEFAULTS, updatedAt: '', updatedBy: '' };
  const arr = (v) => (typeof v === 'string' ? JSON.parse(v) : v) || [];
  return { emailEnabled: r.email_enabled, waEnabled: r.wa_enabled, emails: arr(r.emails), phones: arr(r.phones), minSeverity: r.min_severity, renotifyMin: r.renotify_min, updatedAt: new Date(r.updated_at).toISOString(), updatedBy: r.updated_by || '' };
}

export async function saveSettings(db, input, actor) {
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\n,;]+/)).map((x) => String(x).trim()).filter(Boolean);
  const emails = [...new Set(list(input.emails).map((e) => e.toLowerCase()))];
  const phones = [...new Set(list(input.phones).map(normPhone))];
  const bad = [...emails.filter((e) => !EMAIL_RE.test(e)).map((e) => ({ path: 'emails', code: 'invalid', value: e })), ...phones.filter((p) => p.length < 9 || p.length > 15).map((p) => ({ path: 'phones', code: 'invalid', value: p }))];
  if (bad.length) throw new ApiError(422, 'validation', 'Email / nomor tidak valid', bad);
  if (emails.length > 10 || phones.length > 10) throw new ApiError(422, 'validation', 'Maksimal 10 penerima per kanal', [{ path: 'emails', code: 'too_many' }]);
  const min = SEV_ORDER.includes(input.minSeverity) ? input.minSeverity : 'high';
  const ren = Math.min(Math.max(Math.round(Number(input.renotifyMin) || 0), 0), 1440);
  await db.query(
    `INSERT INTO notify_settings (id, email_enabled, wa_enabled, emails, phones, min_severity, renotify_min, updated_at, updated_by) VALUES (1, $1, $2, $3::jsonb, $4::jsonb, $5, $6, now(), $7)
     ON CONFLICT (id) DO UPDATE SET email_enabled = $1, wa_enabled = $2, emails = $3::jsonb, phones = $4::jsonb, min_severity = $5, renotify_min = $6, updated_at = now(), updated_by = $7`,
    [!!input.emailEnabled, !!input.waEnabled, JSON.stringify(emails), JSON.stringify(phones), min, ren, actor || '']);
  return getSettings(db);
}

export const providers = () => ({ email: { configured: mailConfig().configured, from: mailConfig().from }, wa: waConfig() });
export async function recentLog(db) {
  return (await db.query('SELECT at, channel, to_addr, items, status, error FROM notify_log ORDER BY id DESC LIMIT 15')).map((r) => ({ at: new Date(r.at).toISOString(), channel: r.channel, to: r.to_addr, items: r.items, status: r.status, error: r.error || '' }));
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function compose(rows, { reminder, test }) {
  const head = test ? '✅ Tes notifikasi TMS: koneksi berhasil.' : `${reminder ? '⏰ Pengingat (belum ditangani): ' : '⚠️ '}TMS: ${rows.length} exception ${reminder ? 'masih terbuka' : 'baru'}`;
  const lines = rows.slice(0, 8).map((r, i) => {
    const m = typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta || {};
    return { sev: r.severity, title: KIND[r.kind] || r.kind, doNo: r.do_no, customer: r.customer, vendor: [r.vendor_name, r.plate].filter(Boolean).join(' · '), detail: detailText(r.kind, m), n: i + 1 };
  });
  const more = rows.length > 8 ? `\n…dan ${rows.length - 8} lainnya.` : '';
  const wa = test ? head : `${head}\n\n${lines.map((l) => `${l.n}. ${SEV_ICON[l.sev]} *${l.title}* (${SEV_LABEL[l.sev]})\n   ${l.doNo} · ${l.customer}${l.vendor ? `\n   ${l.vendor}` : ''}\n   ${l.detail}`).join('\n')}${more}\n\nBuka MyGeotab › TMS › menu Exception.`;
  const html = test ? `<p>${esc(head)}</p>` : `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p><b>${esc(head)}</b></p>${lines.map((l) => `<div style="border-left:4px solid ${l.sev === 'high' ? '#c62828' : l.sev === 'medium' ? '#e08a00' : '#9aa7b5'};padding:4px 10px;margin:8px 0"><b>${esc(l.title)}</b> <span style="color:#666">(${SEV_LABEL[l.sev]})</span><br>${esc(l.doNo)} · ${esc(l.customer)}${l.vendor ? `<br>${esc(l.vendor)}` : ''}<br>${esc(l.detail)}</div>`).join('')}${esc(more)}<p style="color:#666">Buka MyGeotab › TMS › menu Exception untuk menandai ditangani.</p></div>`;
  return { subject: test ? 'Tes notifikasi TMS' : `[TMS] ${reminder ? 'Pengingat: ' : ''}${rows.length} exception${rows[0] && rows[0].severity === 'high' ? ' (prioritas tinggi)' : ''}`, wa, html, text: wa.replace(/\*/g, '') };
}

async function deliver(db, cfg, msg, items) {
  const out = [];
  const log = (channel, to, r) => db.query('INSERT INTO notify_log (channel, to_addr, items, status, error) VALUES ($1, $2, $3, $4, $5)', [channel, to, items, r.status, r.error || null]).catch(() => {});
  if (cfg.emailEnabled) for (const to of cfg.emails) { const r = await sendEmail({ to, subject: msg.subject, html: msg.html, text: msg.text }); await log('email', to, r); out.push({ channel: 'email', to, ...r }); }
  if (cfg.waEnabled) for (const to of cfg.phones) { const r = await sendWhatsApp(to, msg.wa); await log('whatsapp', to, r); out.push({ channel: 'whatsapp', to, ...r }); }
  return out;
}

const SELECT = `SELECT e.id, e.kind, e.severity, e.meta, o.do_no, o.customer, v.name AS vendor_name, vh.plate FROM exceptions e JOIN orders o ON o.id = e.order_id LEFT JOIN vendors v ON v.id = o.vendor_id LEFT JOIN vehicles vh ON vh.id = o.vehicle_id`;

/** Kirim exception baru (dan pengingat) ke admin. Aman dipanggil berulang / bersamaan: klaim atomik. Tidak pernah melempar error. */
export async function notifyPending(db) {
  try {
    const cfg = await getSettings(db);
    const hasTarget = (cfg.emailEnabled && cfg.emails.length) || (cfg.waEnabled && cfg.phones.length);
    if (!hasTarget) return { sent: 0 };
    const sevs = JSON.stringify(SEV_ORDER.slice(0, SEV_ORDER.indexOf(cfg.minSeverity) + 1));
    const claimed = await db.query(
      `UPDATE exceptions SET notified_at = now() WHERE id IN (SELECT id FROM exceptions WHERE notified_at IS NULL AND cleared_at IS NULL AND ack_at IS NULL AND created_at > now() - interval '6 hours'
         AND severity IN (SELECT jsonb_array_elements_text($1::jsonb)) ORDER BY created_at LIMIT 30) RETURNING id`, [sevs]);
    const remind = cfg.renotifyMin > 0 ? await db.query(
      `UPDATE exceptions SET renotified_at = now() WHERE id IN (SELECT id FROM exceptions WHERE notified_at IS NOT NULL AND renotified_at IS NULL AND severity = 'high' AND cleared_at IS NULL AND ack_at IS NULL
         AND notified_at < now() - ($1 || ' minutes')::interval AND created_at > now() - interval '24 hours' ORDER BY created_at LIMIT 30) RETURNING id`, [String(cfg.renotifyMin)]) : [];
    let sent = 0;
    for (const [ids, reminder] of [[claimed, false], [remind, true]]) {
      if (!ids.length) continue;
      const list = JSON.stringify(ids.map((r) => Number(r.id)));
      const rows = await db.query(`${SELECT} WHERE e.id IN (SELECT value::bigint FROM jsonb_array_elements_text($1::jsonb)) ORDER BY (e.severity = 'high') DESC, e.created_at`, [list]);
      const res = await deliver(db, cfg, compose(rows, { reminder }), rows.length);
      const ok = res.some((r) => r.status === 'sent');
      if (ok) sent += rows.length;
      else if (res.some((r) => r.status === 'failed')) await db.query(`UPDATE exceptions SET ${reminder ? 'renotified_at' : 'notified_at'} = NULL WHERE id IN (SELECT value::bigint FROM jsonb_array_elements_text($1::jsonb))`, [list]); // coba lagi nanti
    }
    return { sent };
  } catch (e) {
    console.error('[notify]', e.message);
    return { sent: 0, error: e.message };
  }
}

export async function sendTest(db) {
  const cfg = await getSettings(db);
  if (!cfg.emails.length && !cfg.phones.length) throw new ApiError(422, 'notify_no_target', 'Isi minimal satu email atau nomor WhatsApp');
  const res = await deliver(db, { ...cfg, emailEnabled: true, waEnabled: true }, compose([], { test: true }), 0);
  return { results: res };
}
