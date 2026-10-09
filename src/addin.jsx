// Entry point add-in MyGeotab. Mendaftarkan geotab.addin.<nama> (dimuat via public/addin.html).
import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import Root from './Root.jsx';

// ID unik add-in untuk AddInData. Bisa di-override lewat window.TMS_CONFIG.addInId (lihat addin.html / README).
const FALLBACK_ADDIN_ID = 'aK8zhRighKbsh06-NQBpHBQ';

// Dokumentasi Geotab tidak menjelaskan bagaimana MyGeotab mencari objek add-in untuk halaman eksternal
// (dari nama file HTML, nama di config, atau namespace yang baru terdaftar). Semua kemungkinan itu didaftarkan ke
// SATU instance yang sama, sehingga mana pun yang dipakai MyGeotab hasilnya sama.
//   tms                    -> namespace utama
//   addin                  -> nama file addin.html
//   tmsTransportManagement -> turunan dari "name" di config.json
const NAMES = ['tms', 'addin', 'tmsTransportManagement'];

const log = (...a) => console.info('[TMS]', ...a);
const showFatal = (el, err) => {
  try {
    const box = document.createElement('div');
    box.setAttribute('style', 'padding:16px;margin:12px;border:1px solid #f3c2c2;background:#fdecec;color:#8f1d1d;font:14px/1.5 sans-serif;border-radius:8px');
    box.innerHTML = '<b>TMS gagal dimuat.</b> <span></span><div style="margin-top:6px;font-size:12px;opacity:.8">Buka console browser (F12) dan kirim pesan [TMS] untuk diagnosa.</div>';
    box.querySelector('span').textContent = String((err && err.message) || err);
    el.innerHTML = '';
    el.appendChild(box);
  } catch {
    /* abaikan */
  }
};

let shared = null;

function createAddin() {
  let root = null;
  let api = null;
  let active = false;
  const render = () => {
    if (!root) return;
    const cfg = window.TMS_CONFIG || {};
    root.render(<Root api={api} addInId={cfg.addInId || FALLBACK_ADDIN_ID} active={active} />);
  };
  return {
    initialize(a, _state, callback) {
      log('initialize dipanggil, build', typeof __TMS_BUILD__ === 'undefined' ? 'dev' : __TMS_BUILD__);
      let el = null;
      try {
        if (root) {
          callback(); // sudah diinisialisasi (mis. dipanggil lewat nama lain)
          return;
        }
        api = a;
        el = document.getElementById('tms-root');
        if (!el) {
          el = document.createElement('div');
          el.id = 'tms-root';
          document.body.appendChild(el);
        }
        root = createRoot(el);
        render();
      } catch (err) {
        console.error('[TMS] initialize gagal:', err);
        if (el) showFatal(el, err);
      }
      callback(); // selalu panggil callback agar MyGeotab tidak menampilkan halaman error generik
    },
    focus(a) {
      if (a) api = a;
      active = true;
      try {
        render();
      } catch (err) {
        console.error('[TMS] focus gagal:', err);
      }
    },
    blur() {
      active = false;
      try {
        render();
      } catch (err) {
        console.error('[TMS] blur gagal:', err);
      }
    },
  };
}

const factory = () => {
  if (!shared) shared = createAddin();
  return shared;
};

try {
  window.geotab = window.geotab || {};
  window.geotab.addin = window.geotab.addin || {};
  for (const n of NAMES) window.geotab.addin[n] = factory;
  log('script dimuat, build', typeof __TMS_BUILD__ === 'undefined' ? 'dev' : __TMS_BUILD__, '- terdaftar sebagai geotab.addin.{' + NAMES.join(', ') + '}');
} catch (err) {
  console.error('[TMS] registrasi gagal:', err);
}
