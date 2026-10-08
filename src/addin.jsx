// Entry point add-in MyGeotab. Mendaftarkan geotab.addin.tms (dimuat via public/addin.html).
import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import Root from './Root.jsx';

// ID unik add-in untuk AddInData. Bisa di-override lewat window.TMS_CONFIG.addInId (lihat addin.html / README).
const FALLBACK_ADDIN_ID = 'aK8zhRighKbsh06-NQBpHBQ';

function createAddin() {
  let root = null;
  let api = null;
  const render = (active) => {
    const cfg = window.TMS_CONFIG || {};
    root?.render(<Root api={api} addInId={cfg.addInId || FALLBACK_ADDIN_ID} active={active} />);
  };
  return {
    initialize(a, _state, callback) {
      api = a;
      let el = document.getElementById('tms-root');
      if (!el) {
        el = document.createElement('div');
        el.id = 'tms-root';
        document.body.appendChild(el);
      }
      root = createRoot(el);
      render(false);
      callback();
    },
    focus() {
      render(true);
    },
    blur() {
      render(false);
    },
  };
}

window.geotab = window.geotab || {};
window.geotab.addin = window.geotab.addin || {};
window.geotab.addin.tms = createAddin;
