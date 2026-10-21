// Pengiriman email via Brevo (API transaksional). Tanpa BREVO_API_KEY email tidak dikirim (status 'skipped') dan DO tetap tercatat.
let sender = null; // untuk tes

export function setMailer(fn) {
  sender = fn;
}

export const mailConfig = () => ({
  configured: !!process.env.BREVO_API_KEY,
  from: process.env.BREVO_SENDER || 'aan@sumbermas-autorindo.com',
  fromName: process.env.BREVO_SENDER_NAME || 'SMA-TRACK TMS',
});

export async function sendEmail({ to, subject, html, text }) {
  if (sender) return sender({ to, subject, html, text });
  const cfg = mailConfig();
  if (!cfg.configured) return { status: 'skipped', error: 'BREVO_API_KEY belum diisi' };
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: { email: cfg.from, name: cfg.fromName }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    });
    if (!res.ok) return { status: 'failed', error: `Brevo ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` };
    return { status: 'sent' };
  } catch (e) {
    return { status: 'failed', error: String(e.message || e).slice(0, 200) };
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const portalBase = () => (process.env.PORTAL_BASE_URL || 'https://fms-geotab.vercel.app').replace(/\/$/, '');

/** Isi email penawaran DO untuk vendor. */
export function offerEmail({ order, vendor, token, expiresAt }) {
  const s = order.summary || {};
  const link = `${portalBase()}/portal.html#/o/${token}`;
  const exp = new Date(expiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
  const rows = [
    ['Nomor DO', order.doNo], ['Customer', order.customer], ['Rute', `${s.origin || ''} → ${s.destination || ''}${s.stops > 2 ? ` (via ${s.stops - 2})` : ''}`],
    ['Beban puncak', `${s.peakWeight ?? 0} kg / ${s.peakVolume ?? 0} m³ / ${s.peakPallets ?? 0} pallet`], ['Batas respons', `${exp} WIB`],
  ];
  const subject = `Penawaran DO ${order.doNo} - ${order.customer}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Yth. ${esc(vendor.pic || vendor.name)},</p><p>Ada penawaran pengiriman (DO) yang menunggu respons Anda. Siapa yang menerima lebih dulu mendapatkan DO ini.</p>${rows.map(([k, v]) => `<div>${esc(k)}: <b>${esc(v)}</b></div>`).join('')}<p>Terima / tolak DO di tautan berikut:<br><a href="${esc(link)}">${esc(link)}</a></p><p style="color:#666;font-size:12px">Tautan ini khusus untuk ${esc(vendor.name)}, jangan diteruskan ke pihak lain.</p></div>`;
  const text = `Penawaran DO ${order.doNo}\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nBuka: ${link}`;
  return { subject, html, text };
}
