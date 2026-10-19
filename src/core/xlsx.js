// Pembaca/penulis .xlsx minimal (tanpa dependensi berat): satu sheet, teks/angka/tanggal. Memakai fflate untuk zip.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colIdx = (ref) => {
  let n = 0;
  for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
const colName = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const attr = (tag, name) => {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return m ? unesc(m[1]) : null;
};
const tText = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1])).join('');

const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
function dateStyles(stylesXml) {
  const custom = new Set();
  for (const m of stylesXml.matchAll(/<numFmt\s[^>]*>/g)) {
    const id = Number(attr(m[0], 'numFmtId'));
    const code = (attr(m[0], 'formatCode') || '').toLowerCase().replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    if (/[dmyh]/.test(code) && !/^[0#.,%\s]*$/.test(code)) custom.add(id);
  }
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
  const flags = [];
  if (xfs) for (const m of xfs[1].matchAll(/<xf\s[^>]*?(?:\/>|>)/g)) {
    const id = Number(attr(m[0], 'numFmtId'));
    flags.push(BUILTIN_DATE.has(id) || custom.has(id));
  }
  return flags;
}
/** Serial tanggal Excel -> Date (waktu dinding lokal). */
export function excelDate(serial) {
  const d = new Date(Math.round((serial - 25569) * 864e5));
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

/** Baca sheet pertama (atau bernama `prefer`) dari .xlsx -> array baris (array sel). Sel tanggal menjadi Date. */
export function readXlsx(buf, prefer = 'DO') {
  const files = unzipSync(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
  const get = (p) => (files[p] ? strFromU8(files[p]) : '');
  if (!get('xl/workbook.xml')) throw new Error('Bukan file .xlsx yang valid');
  const sst = [];
  for (const m of get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) sst.push(tText(m[1]));
  const dflags = dateStyles(get('xl/styles.xml'));
  const sheets = [...get('xl/workbook.xml').matchAll(/<sheet\s[^>]*>/g)].map((m) => ({ name: attr(m[0], 'name'), rid: attr(m[0], 'r:id') }));
  const rels = {};
  for (const m of get('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s[^>]*>/g)) rels[attr(m[0], 'Id')] = attr(m[0], 'Target');
  const pick = sheets.find((s) => s.name === prefer) || sheets[0];
  if (!pick) throw new Error('Tidak ada sheet');
  let target = rels[pick.rid] || 'worksheets/sheet1.xml';
  target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const xml = get(target);
  const rows = [];
  for (const rm of xml.matchAll(/<row\s[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rIdx = Number(attr(rm[0], 'r')) - 1;
    const row = [];
    for (const cm of (rm[1] || '').matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = cm[1];
      const ci = colIdx(attr(head, 'r') || 'A1');
      const t = attr(head, 't');
      const s = Number(attr(head, 's') || 0);
      const inner = cm[2] || '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
      let val = null;
      if (t === 'inlineStr') val = tText(inner);
      else if (v) {
        const raw = unesc(v[1]);
        if (t === 's') val = sst[Number(raw)] ?? '';
        else if (t === 'str') val = raw;
        else if (t === 'b') val = raw === '1';
        else if (t === 'e') val = null;
        else {
          const n = Number(raw);
          val = dflags[s] && Number.isFinite(n) ? excelDate(n) : n;
        }
      }
      row[ci] = val;
    }
    rows[rIdx] = row;
  }
  return Array.from(rows, (r) => r || []);
}

/** Tulis workbook .xlsx. sheets: [{ name, rows: [[...]], widths?: [n], headerRows?: 1 }] -> Uint8Array. */
export function writeXlsx(sheets) {
  const files = {};
  files['[Content_Types].xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  files['_rels/.rels'] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  files['xl/workbook.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  files['xl/_rels/workbook.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  files['xl/styles.xml'] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B5EA8"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>');
  sheets.forEach((sh, i) => {
    const hdr = sh.headerRows ?? 1;
    const cols = sh.widths ? `<cols>${sh.widths.map((w, k) => `<col min="${k + 1}" max="${k + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const rowsXml = sh.rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
      if (v == null || v === '') return '';
      const ref = `${colName(c)}${r + 1}`;
      const st = r < hdr ? ' s="1"' : '';
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
      if (typeof v === 'boolean') return `<c r="${ref}"${st} t="b"><v>${v ? 1 : 0}</v></c>`;
      return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${hdr ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${hdr}" topLeftCell="A${hdr + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : ''}${cols}<sheetData>${rowsXml}</sheetData></worksheet>`);
  });
  return zipSync(files, { level: 6 });
}

/** CSV sederhana (pemisah , atau ;) -> array baris. Mendukung kutip ganda. */
export function parseCsv(text) {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
