// Memastikan setiap kunci t('...') yang dipakai ada di kamus id & en, dan kamus id/en simetris.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const src = path.resolve('src');
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(jsx?|mjs)$/.test(f.name) && f.name !== 'i18n.js') files.push(p);
  }
})(src);

const { dict } = await import(pathToFileURL(path.join(src, 'i18n.js')).href);
const id = new Set(Object.keys(dict.id));
const en = new Set(Object.keys(dict.en));
const used = new Set();
const dyn = [];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bt\(\s*(['"`])([^'"`]+)\1/g)) {
    if (m[2].includes('${')) dyn.push(m[2]);
    else used.add(m[2]);
  }
}
// kunci dinamis yang diketahui
const expand = {
  'state.${f}': ['all', 'moving', 'idle', 'offline', 'deviating'].map((x) => `state.${x}`),
  'state.${r.state}': ['moving', 'idle', 'offline', 'deviating'].map((x) => `state.${x}`),
  'status.${f}': ['planned', 'in_progress', 'completed', 'missed', 'deviated'].map((x) => `status.${x}`),
  'status.${r.result.status}': ['planned', 'in_progress', 'completed', 'missed', 'deviated'].map((x) => `status.${x}`),
  'status.${status}': ['planned', 'in_progress', 'completed', 'missed', 'deviated'].map((x) => `status.${x}`),
  'routes.mode.${r.mode}': ['recommended', 'manual'].map((x) => `routes.mode.${x}`),
  'routes.mode.${m}': ['recommended', 'manual'].map((x) => `routes.mode.${x}`),
  'param.${k}': ['widthM', 'radius', 'avgSpeedKmh', 'confirmSec', 'confirmMeters', 'gpsMarginM', 'recoverSec', 'graceMin'].map((x) => `param.${x}`),
  'param.${k}.hint': ['widthM', 'radius', 'avgSpeedKmh', 'confirmSec', 'confirmMeters', 'gpsMarginM', 'recoverSec', 'graceMin'].map((x) => `param.${x}.hint`),
  'asg.kind.${k}': ['once', 'recur'].map((x) => `asg.kind.${x}`),
  'asg.conflict.${c.reason}': ['vehicle', 'driver'].map((x) => `asg.conflict.${x}`),
  'rep.tab.${k}': ['summary', 'trips', 'exceptions', 'compliance'].map((x) => `rep.tab.${x}`),
  'nav.${k}': ['fleet', 'routes', 'assignments', 'monitor', 'reports', 'settings'].map((x) => `nav.${x}`),
  'alert.${it.type}': ['deviation_start', 'deviation_end', 'checkpoint_arrived', 'checkpoint_skipped', 'route_completed'].map((x) => `alert.${x}`),
  'routes.mode.${r.mode}': ['recommended', 'manual'].map((x) => `routes.mode.${x}`),
};
const unknownDyn = [];
for (const d of new Set(dyn)) {
  if (expand[d]) expand[d].forEach((k) => used.add(k));
  else unknownDyn.push(d);
}
let bad = 0;
for (const k of [...used].sort()) {
  if (!id.has(k)) { console.log('MISSING id:', k); bad++; }
  if (!en.has(k)) { console.log('MISSING en:', k); bad++; }
}
for (const k of id) if (!en.has(k)) { console.log('only in id:', k); bad++; }
for (const k of en) if (!id.has(k)) { console.log('only in en:', k); bad++; }
if (unknownDyn.length) console.log('dynamic keys not verified:', unknownDyn);
console.log(`${used.size} keys used, ${id.size} id / ${en.size} en entries, ${bad} problems`);
process.exit(bad ? 1 : 0);
