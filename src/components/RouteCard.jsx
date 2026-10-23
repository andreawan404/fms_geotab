import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Field } from './ui.jsx';
import { L, MapBox, drawRoute, fitTo, useMap } from './mapkit.jsx';
import { computePath, routableStops } from '../services/orderRoute.js';
import { fmtDur, fmtKm } from '../core/time.js';

/** Rute DO dari titik stop: lebar koridor + pratinjau peta (jalur, koridor, titik). Jalur dihitung otomatis. */
export default function RouteCard({ stops, widthM, onWidth, ro, onCalc }) {
  const { t, settings } = useApp();
  const [mapRef, map] = useMap(settings.tileUrl, { center: [-2.5, 118], zoom: 5 });
  const layer = useRef(null);
  const [calc, setCalc] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const pts = useMemo(() => routableStops(stops), [stops]);
  const key = pts.map((s) => `${s.lat},${s.lng}`).join('|');
  const width = Number(widthM) || settings.defaults.widthM;

  useEffect(() => {
    if (pts.length < 2) { setCalc(null); onCalc?.(null); setErr(''); return undefined; }
    let dead = false;
    const id = setTimeout(async () => {
      setBusy(true);
      try {
        const c = await computePath(settings, pts);
        if (!dead) { setCalc(c); onCalc?.(c); setErr(''); }
      } catch (e) {
        if (!dead) { setCalc(null); onCalc?.(null); setErr(e.message || String(e)); }
      }
      if (!dead) setBusy(false);
    }, 700);
    return () => { dead = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!map) return;
    if (!layer.current) layer.current = L.layerGroup().addTo(map);
    const g = layer.current;
    g.clearLayers();
    const route = { color: '#0b5ea8', widthM: width, path: calc?.path || [], checkpoints: pts.map((s, i) => ({ name: s.name || `Stop ${i + 1}`, lat: Number(s.lat), lng: Number(s.lng), radius: Number(s.radiusM) || 150 })) };
    drawRoute(g, route, { corridor: !!calc, checkpoints: true });
    fitTo(map, [...(calc?.path || []), ...pts.map((s) => [Number(s.lat), Number(s.lng)])]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, calc, key, width]);

  return (
    <div className="tms-card tms-routecard">
      <div className="tms-card-h">{t('ord.route.title')}</div>
      <div className="tms-card-b">
        <div className="tms-row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label={t('ord.route.width')} hint={t('ord.route.widthHint')}>
            <input type="number" min="20" max="2000" step="5" style={{ width: 110 }} disabled={ro} value={widthM ?? ''} onChange={(e) => onWidth(e.target.value === '' ? null : Number(e.target.value))} />
          </Field>
          <div className="tms-sm tms-grow" style={{ paddingBottom: 8 }}>
            {pts.length < 2 ? <span className="tms-muted">{t('ord.route.need')}</span>
              : busy ? <span className="tms-muted">{t('ord.route.calc')}</span>
              : err ? <span style={{ color: '#c62828' }}>{t('ord.route.fail')}: {err}</span>
              : calc ? <span>{fmtKm(calc.distanceM)} · {fmtDur(calc.durationS)} · {t('ord.route.stopsN', { n: pts.length })}</span> : null}
          </div>
        </div>
        <div style={{ height: 300, marginTop: 4 }}><MapBox mapRef={mapRef} className="tms-map-fill" /></div>
        <div className="tms-sm tms-muted" style={{ marginTop: 6 }}>{t('ord.route.saveNote')}</div>
      </div>
    </div>
  );
}
