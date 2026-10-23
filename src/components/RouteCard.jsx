import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Field } from './ui.jsx';
import { L, MapBox, drawRoute, fitTo, useMap } from './mapkit.jsx';
import { computeAlternatives, endpointsFar, manualCalc, routableStops } from '../services/orderRoute.js';
import { findRoutes } from '../services/routing.js';
import { simplifyToMax } from '../core/geometry.js';
import { fmtDur, fmtKm } from '../core/time.js';

const vtxIcon = () => L.divIcon({ className: 'tms-vtx-wrap', iconSize: [12, 12], iconAnchor: [6, 6], html: '<div class="tms-vtx"></div>' });

/**
 * Rute DO: lebar koridor + peta. Dua cara: Otomatis (jalur antar stop dari mesin rute, bisa pilih alternatif)
 * atau Manual (dispatcher menggambar titik jalur sendiri di peta, bisa ditempel ke jalan).
 */
export default function RouteCard({ stops, widthM, onWidth, ro, onCalc, existing }) {
  const { t, settings } = useApp();
  const [mapRef, map] = useMap(settings.tileUrl, { center: [-2.5, 118], zoom: 5 });
  const layer = useRef(null);
  const vtx = useRef(null);
  const manualInit = existing?.mode === 'manual' && existing.manualPath?.length > 1;
  const [mode, setMode] = useState(manualInit ? 'manual' : 'auto');
  const [alts, setAlts] = useState([]);
  const [altIdx, setAltIdx] = useState(0);
  const [manual, setManual] = useState(manualInit ? existing.manualPath : []);
  const [prev, setPrev] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const pts = useMemo(() => routableStops(stops), [stops]);
  const key = pts.map((s) => `${s.lat},${s.lng}`).join('|');
  const width = Number(widthM) || settings.defaults.widthM;
  const calc = useMemo(() => (mode === 'manual' ? (manual.length > 1 ? manualCalc(manual) : null) : alts[altIdx] || null), [mode, manual, alts, altIdx]);
  const manualRef = useRef(manual);
  manualRef.current = manual;

  // jalur otomatis dihitung ulang saat titik stop berubah (hanya mode otomatis)
  useEffect(() => {
    if (mode !== 'auto') return undefined;
    if (pts.length < 2) { setAlts([]); setErr(''); return undefined; }
    let dead = false;
    const id = setTimeout(async () => {
      setBusy('auto');
      try {
        const r = await computeAlternatives(settings, pts);
        if (!dead) { setAlts(r); setAltIdx(0); setErr(''); }
      } catch (e) {
        if (!dead) { setAlts([]); setErr(e.message || String(e)); }
      }
      if (!dead) setBusy('');
    }, 700);
    return () => { dead = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mode]);

  // beri tahu form DO jalur yang berlaku
  useEffect(() => { onCalc?.(calc); }, [calc?.path, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // gambar jalur, koridor, titik
  useEffect(() => {
    if (!map) return;
    if (!layer.current) layer.current = L.layerGroup().addTo(map);
    const g = layer.current;
    g.clearLayers();
    drawRoute(g, { color: mode === 'manual' ? '#d9480f' : '#0b5ea8', widthM: width, path: calc?.path || [], checkpoints: pts.map((s, i) => ({ name: s.name || `Stop ${i + 1}`, lat: Number(s.lat), lng: Number(s.lng), radius: Number(s.radiusM) || 150 })) }, { corridor: !!calc, checkpoints: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, calc?.path, key, width, mode]);

  // sesuaikan tampilan hanya saat titik / jalur otomatis berubah (bukan saat menggambar manual)
  useEffect(() => {
    if (!map) return;
    fitTo(map, [...(mode === 'auto' ? calc?.path || [] : manualRef.current), ...pts.map((s) => [Number(s.lat), Number(s.lng)])]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, mode, alts]);

  // mode manual: klik peta = tambah titik; titik bisa digeser, klik kanan = hapus
  useEffect(() => {
    if (!map || ro || mode !== 'manual') return undefined;
    const h = (e) => setManual((m) => [...m, [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]]);
    map.on('click', h);
    return () => map.off('click', h);
  }, [map, ro, mode]);
  useEffect(() => {
    if (!map) return;
    if (!vtx.current) vtx.current = L.layerGroup().addTo(map);
    const g = vtx.current;
    g.clearLayers();
    if (mode !== 'manual' || ro || manual.length > 300) return;
    manual.forEach((p, i) => {
      const m = L.marker(p, { icon: vtxIcon(), draggable: true, zIndexOffset: 800 }).addTo(g);
      m.on('dragend', () => setManual((cur) => cur.map((q, k) => (k === i ? [+m.getLatLng().lat.toFixed(6), +m.getLatLng().lng.toFixed(6)] : q))));
      m.on('contextmenu', () => setManual((cur) => cur.filter((_, k) => k !== i)));
    });
  }, [map, manual, mode, ro]);

  const toManual = () => {
    setMode('manual');
    if (!manual.length) setManual(calc?.path?.length > 1 ? simplifyToMax(calc.path, 150, 5) : pts.map((s) => [Number(s.lat), Number(s.lng)]));
    setErr('');
  };
  const snap = async () => {
    if (manual.length < 2) return;
    if (manual.length > 50) { setErr(t('routes.tooManyVertices')); return; }
    setBusy('snap');
    try {
      const [r] = await findRoutes(settings, manual, { alternatives: false });
      setPrev(manual);
      setManual(simplifyToMax(r.path, 600, 1));
      setErr('');
    } catch (e) { setErr(e.message || String(e)); }
    setBusy('');
  };

  const far = mode === 'manual' && manual.length > 1 && endpointsFar(manual, pts);

  return (
    <div className="tms-card tms-routecard">
      <div className="tms-card-h">{t('ord.route.title')}</div>
      <div className="tms-card-b">
        <div className="tms-row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label={t('ord.route.width')} hint={t('ord.route.widthHint')}>
            <input type="number" min="20" max="2000" step="5" style={{ width: 110 }} disabled={ro} value={widthM ?? ''} onChange={(e) => onWidth(e.target.value === '' ? null : Number(e.target.value))} />
          </Field>
          {!ro && (
            <div className="tms-row" style={{ gap: 14, paddingBottom: 8 }}>
              <label className="tms-row tms-sm"><input type="radio" name="rc-mode" checked={mode === 'auto'} onChange={() => { setMode('auto'); setErr(''); }} /> {t('ord.route.auto')}</label>
              <label className="tms-row tms-sm"><input type="radio" name="rc-mode" checked={mode === 'manual'} onChange={toManual} /> {t('ord.route.manual')}</label>
            </div>
          )}
          <div className="tms-sm tms-grow" style={{ paddingBottom: 8 }}>
            {pts.length < 2 ? <span className="tms-muted">{t('ord.route.need')}</span>
              : busy === 'auto' ? <span className="tms-muted">{t('ord.route.calc')}</span>
              : err ? <span style={{ color: '#c62828' }}>{mode === 'auto' ? `${t('ord.route.fail')}: ` : ''}{err}</span>
              : calc ? <span>{fmtKm(calc.distanceM)}{calc.durationS ? ` · ${fmtDur(calc.durationS)}` : ''} · {t('ord.route.stopsN', { n: pts.length })}</span> : null}
          </div>
        </div>

        {!ro && mode === 'auto' && alts.length > 1 && (
          <div style={{ margin: '6px 0' }}>
            <div className="tms-sm tms-muted" style={{ marginBottom: 4 }}>{t('routes.pickAlt')}</div>
            {alts.map((a, i) => (
              <div key={i} className={`tms-alt ${i === altIdx ? 'on' : ''}`} onClick={() => setAltIdx(i)}>
                <input type="radio" readOnly checked={i === altIdx} />
                <div className="tms-grow"><b>{t('routes.alt')} {i + 1}</b> · {fmtKm(a.distanceM)} · {fmtDur(a.durationS)}</div>
              </div>
            ))}
          </div>
        )}

        {!ro && mode === 'manual' && (
          <div style={{ margin: '6px 0' }}>
            <div className="tms-sm tms-muted" style={{ marginBottom: 6 }}>{t('ord.route.manualHelp')}</div>
            <div className="tms-row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="tms-btn sm" onClick={snap} disabled={busy === 'snap' || manual.length < 2}>{busy === 'snap' ? t('loading') : t('routes.snap')}</button>
              {prev && <button type="button" className="tms-btn sm" onClick={() => { setManual(prev); setPrev(null); }}>{t('undo')}</button>}
              <button type="button" className="tms-btn sm" onClick={() => setManual(manual.slice(0, -1))} disabled={!manual.length}>⌫</button>
              <button type="button" className="tms-btn sm" onClick={() => setManual(pts.map((s) => [Number(s.lat), Number(s.lng)]))}>{t('routes.fromCp')}</button>
              <button type="button" className="tms-btn sm danger" onClick={() => setManual([])}>{t('routes.clearPath')}</button>
              <span className="tms-sm tms-muted">{manual.length} {t('routes.vertices')}</span>
            </div>
            {far && <div className="tms-sm" style={{ color: '#b45309', marginTop: 4 }}>⚠ {t('ord.route.farEnds')}</div>}
          </div>
        )}

        <div style={{ height: 320, marginTop: 4 }}><MapBox mapRef={mapRef} className="tms-map-fill" /></div>
        <div className="tms-sm tms-muted" style={{ marginTop: 6 }}>{t('ord.route.saveNote')}</div>
      </div>
    </div>
  );
}
