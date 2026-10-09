// Membuat CHANGELOG.md dari src/changelog.js.  Pakai: npm run changelog
import fs from 'node:fs';
import { CHANGELOG } from '../src/changelog.js';

const out = ['# Changelog', '', 'Dibuat otomatis dari `src/changelog.js` (`npm run changelog`). Jangan diedit manual.', ''];
for (const e of CHANGELOG) {
  out.push(`## v${e.v} - ${e.date}`, '');
  for (const l of e.id) out.push(`- ${l}`);
  out.push('');
}
fs.writeFileSync('CHANGELOG.md', out.join('\n'));
console.log('CHANGELOG.md ditulis,', CHANGELOG.length, 'versi');
