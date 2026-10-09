// Menyalin file statis ke dist dan (opsional) mengganti placeholder host di config.json.
// Pakai: HOST_URL=https://cdn.perusahaan.com/tms npm run build
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
for (const f of ['addin.html', 'config.json', 'icon.svg', 'probe.html', 'config-probe.json']) {
  const src = path.resolve('public', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dist, f));
}
fs.mkdirSync(path.join(dist, 'translations'), { recursive: true });
for (const l of ['en', 'id']) fs.writeFileSync(path.join(dist, 'translations', l + '.json'), '{}\n');
const addInId = process.env.ADDIN_ID || 'aK8zhRighKbsh06-NQBpHBQ';
{
  const p = path.join(dist, 'addin.html');
  // Skrip diselipkan INLINE ke addin.html (satu file, tanpa <script src> asinkron) supaya
  // geotab.addin.* sudah terdaftar begitu MyGeotab selesai menyuntik HTML.
  const bundle = fs.readFileSync(path.join(dist, 'tms.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  // split/join (bukan replace dgn string) agar pola "$&" di dalam bundle tidak ikut ditafsirkan
  const html = fs.readFileSync(p, 'utf8').replaceAll('__ADDIN_ID__', addInId).split('__BUNDLE__').join(bundle);
  if (!/<body[\s>]/i.test(html)) throw new Error('addin.html harus punya tag <body> (syarat MyGeotab)');
  fs.writeFileSync(p, html);
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
