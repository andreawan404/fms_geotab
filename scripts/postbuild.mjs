// Menyalin file statis ke dist dan (opsional) mengganti placeholder host di config.json.
// Pakai: HOST_URL=https://cdn.perusahaan.com/tms npm run build
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
for (const f of ['addin.html', 'config.json', 'icon.svg']) {
  const src = path.resolve('public', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dist, f));
}
const addInId = process.env.ADDIN_ID || 'aK8zhRighKbsh06-NQBpHBQ';
{
  const p = path.join(dist, 'addin.html');
  // URL skrip absolut bila HOST_URL diisi (aman saat MyGeotab menyuntik HTML ke halamannya); jika tidak, relatif.
  const hostForScript = (process.env.HOST_URL || '').replace(/\/$/, '');
  fs.writeFileSync(
    p,
    fs.readFileSync(p, 'utf8').replaceAll('__ADDIN_ID__', addInId).replaceAll('__HOST_URL__/tms.js', hostForScript ? `${hostForScript}/tms.js` : 'tms.js'),
  );
  console.log('addInId =', addInId);
}
const host = (process.env.HOST_URL || '').replace(/\/$/, '');
if (host) {
  const p = path.join(dist, 'config.json');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('https://YOUR_HOST/tms', host));
  console.log('config.json -> host', host);
} else {
  console.log('HOST_URL tidak di-set: ganti YOUR_HOST di dist/config.json sebelum dipasang ke MyGeotab.');
}
const size = fs.statSync(path.join(dist, 'tms.js')).size;
console.log(`tms.js ${(size / 1024).toFixed(0)} KB`);
