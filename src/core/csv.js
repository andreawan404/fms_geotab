/** columns: [{ label, key? , get?(row) }]. sep ';' untuk Excel lokal Indonesia. */
export function toCSV(rows, columns, sep = ',') {
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return s.includes('"') || s.includes('\n') || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(sep);
  const body = rows.map((r) => columns.map((c) => esc(c.get ? c.get(r) : r[c.key])).join(sep));
  return '﻿' + [head, ...body].join('\r\n');
}
