export const pad = (n) => String(n).padStart(2, '0');

/** Geotab TimeSpan "d.hh:mm:ss.fffffff" / "hh:mm:ss" -> detik */
export function parseSpan(s) {
  if (s == null) return 0;
  if (typeof s === 'number') return s;
  const m = /^(?:(\d+)\.)?(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(String(s).trim());
  if (!m) return 0;
  return Number(m[1] || 0) * 86400 + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]);
}

export function fmtDur(sec) {
  if (sec == null || Number.isNaN(sec)) return '-';
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(sec % 60)}s`;
  return `${sec}s`;
}

export const fmtKm = (m, digits = 1) => (m == null ? '-' : `${(m / 1000).toFixed(digits)} km`);

export function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function atTime(dateStr, hhmm) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}
export function fmtTime(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtDateTime(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (x.getDay() + 6) % 7; // Senin = awal minggu
  x.setDate(x.getDate() - diff);
  return x;
}
