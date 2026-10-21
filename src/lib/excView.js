import { VENDOR_KINDS } from '../core/exceptions.js';

export const SEV_CLS = { high: 'red', medium: 'amber', low: 'gray' };
export const fmtMin = (m) => {
  if (m == null || Number.isNaN(m)) return '-';
  const v = Math.round(m);
  return v >= 60 ? `${Math.floor(v / 60)}j ${v % 60}m` : `${v}m`;
};
/** Teks penjelasan exception, terjemahan lewat i18n (data mentah ada di e.meta). */
export function excDetail(t, e) {
  const m = e.meta || {};
  if (VENDOR_KINDS.includes(e.kind)) return [m.note, m.stop && `@ ${m.stop}`].filter(Boolean).join(' ');
  return t(`exc.d.${e.kind}`, { stop: m.stop || '-', minutes: fmtMin(m.minutes), distM: Math.round(m.distM || 0), receiver: m.receiver || '-' });
}
