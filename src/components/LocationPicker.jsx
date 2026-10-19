import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Field } from './ui.jsx';
import { L, MapBox, useMap } from './mapkit.jsx';
import { geocode, reverseGeocode } from '../services/routing.js';
import { centroid, haversine } from '../core/geometry.js';

const NumIn = ({ value, onChange, ...p }) => (
  <input type="number" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} {...p} />
);
const short = (label) => label.split(',').slice(0, 2).join(',').trim();
const ok = (v) => typeof v === 'number' && Number.isFinite(v);

let zoneCache = null; // daftar Zone Geotab dimuat sekali per sesi

/** Lokasi stop: cari alamat / pilih Zona Geotab / klik peta. Peta menampilkan titik, radius, dan poligon zona. */
export default function LocationPicker({ stop, upd, ro, bad }) {
  const { t, settings, geotab, toast } = useApp();
  const [mapRef, map] = useMap(settings.tileUrl, { center: [-2.5, 118], zoom: 5 });
  const layer = useRef(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const [busy, setBusy] = useState(false);
  const [zones, setZones] = useState(zoneCache);
  const [zonePoly, setZonePoly] = useState(null);
  const [zq, setZq] = useState('');
  const stopRef = useRef(stop);
  stopRef.current = stop;

  // ---- pencarian alamat (otomatis setelah berhenti mengetik)
  useEffect(() => {
    const s = q.trim();
    if (ro || s.length < 3) { setHits(null); return undefined; }
    let dead = false;
    const id = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await geocode(settings, s);
        if (!dead) setHits(r);
      } catch (e) {
        if (!dead) { setHits([]); toast(e.message || String(e), 'err'); }
      }
      if (!dead) setBusy(false);
    }, 600);
    return () => { dead = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const pickHit = (h) => {
    const cur = stopRef.current;
    upd({ lat: h.lat, lng: h.lng, address: h.label, name: cur.name || short(h.label) });
    setZonePoly(null);
    setHits(null);
    setQ('');
  };

  // ---- Zona Geotab
  const loadZones = async () => {
    if (zones) return;
    try {
      zoneCache = await geotab.getZones();
      setZones(zoneCache);
    } catch (e) {
      toast(e.message || String(e), 'err');
    }
  };
  const pickZone = (name) => {
    setZq(name);
    const z = (zones || []).find((x) => x.name === name);
    if (!z || !z.points.length) return;
    const [la, ln] = centroid(z.points);
    const r = Math.max(...z.points.map((p) => haversine(la, ln, p[0], p[1])));
    upd({ lat: +la.toFixed(6), lng: +ln.toFixed(6), name: z.name, radiusM: Math.round(Math.min(5000, Math.max(50, r))) });
    setZonePoly(z.points);
  };

  // ---- klik / geser pada peta
  const setPoint = async (lat, lng) => {
    const la = +lat.toFixed(6);
    const ln = +lng.toFixed(6);
    upd({ lat: la, lng: ln });
    const cur = stopRef.current;
    if (!cur.address) {
      const a = await reverseGeocode(settings, la, ln);
      if (a) upd({ lat: la, lng: ln, address: a });
    }
  };
  const setPointRef = useRef(setPoint);
  setPointRef.current = setPoint;

  useEffect(() => {
    if (!map || ro) return undefined;
    const h = (e) => setPointRef.current(e.latlng.lat, e.latlng.lng);
    map.on('click', h);
    return () => map.off('click', h);
  }, [map, ro]);

  // ---- gambar titik, radius, zona
  useEffect(() => {
    if (!map) return;
    if (!layer.current) layer.current = L.layerGroup().addTo(map);
    const g = layer.current;
    g.clearLayers();
    if (zonePoly) L.polygon(zonePoly, { color: '#7a3cc2', weight: 2, fillOpacity: 0.12, interactive: false }).addTo(g);
    if (ok(stop.lat) && ok(stop.lng)) {
      const color = stop.type === 'pickup' ? '#0b5ea8' : '#1a9e5c';
      L.circle([stop.lat, stop.lng], { radius: stop.radiusM || 150, color, weight: 1, dashArray: '4 4', fillOpacity: 0.08, interactive: false }).addTo(g);
      const mk = L.marker([stop.lat, stop.lng], { draggable: !ro }).addTo(g);
      if (!ro) mk.on('dragend', () => setPointRef.current(mk.getLatLng().lat, mk.getLatLng().lng));
    }
  }, [map, stop.lat, stop.lng, stop.radiusM, stop.type, zonePoly, ro]);

  // pusatkan peta bila titik berubah dari luar peta (cari / zona / ketik)
  const lastView = useRef('');
  useEffect(() => {
    if (!map || !ok(stop.lat) || !ok(stop.lng)) return;
    const key = zonePoly ? `z${zonePoly.length}:${stop.lat}` : `${stop.lat},${stop.lng}`;
    if (key === lastView.current) return;
    lastView.current = key;
    if (zonePoly) map.fitBounds(L.latLngBounds(zonePoly), { padding: [24, 24], maxZoom: 17 });
    else map.setView([stop.lat, stop.lng], Math.max(map.getZoom(), 15));
  }, [map, stop.lat, stop.lng, zonePoly]);

  const clear = () => { upd({ lat: null, lng: null }); setZonePoly(null); setZq(''); };

  return (
    <div className="tms-loc">
      <div className="tms-loc-form">
        {!ro && (
          <>
            <Field label={t('ord.loc.search')} hint={t('ord.loc.searchHint')}>
              <div className="tms-searchbox">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ord.loc.searchPh')} />
                {busy && <span className="tms-searching">{t('ord.searching')}</span>}
                {hits && (
                  <div className="tms-geores">
                    {hits.length === 0 && <div className="tms-sm tms-muted" style={{ padding: 8 }}>{t('ord.noResult')}</div>}
                    {hits.map((h, i) => <button type="button" key={i} onClick={() => pickHit(h)}>{h.label}</button>)}
                  </div>
                )}
              </div>
            </Field>
            <Field label={t('ord.loc.zone')} hint={zones && zones.length === 0 ? t('ord.loc.noZone') : t('ord.loc.zoneHint')}>
              <input list={`zones-${stop._uid || 'x'}`} value={zq} onFocus={loadZones} onChange={(e) => pickZone(e.target.value)} placeholder={t('ord.loc.zonePh')} />
              <datalist id={`zones-${stop._uid || 'x'}`}>{(zones || []).map((z) => <option key={z.id} value={z.name} />)}</datalist>
            </Field>
          </>
        )}
        <Field label={t('ord.s.name')}><input disabled={ro} className={bad('name') ? 'bad' : ''} value={stop.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
        <Field label={t('ord.s.address')}><input disabled={ro} value={stop.address} onChange={(e) => upd({ address: e.target.value })} /></Field>
        <div className="tms-loc-coords">
          <Field label={t('ord.s.lat')}><NumIn disabled={ro} className={bad('lat') ? 'bad' : ''} value={stop.lat} onChange={(v) => upd({ lat: v })} /></Field>
          <Field label={t('ord.s.lng')}><NumIn disabled={ro} className={bad('lat') ? 'bad' : ''} value={stop.lng} onChange={(v) => upd({ lng: v })} /></Field>
          <Field label={t('ord.s.radius')}><NumIn disabled={ro} min={10} className={bad('radiusM') ? 'bad' : ''} value={stop.radiusM} onChange={(v) => upd({ radiusM: v })} /></Field>
        </div>
      </div>
      <div className="tms-loc-map">
        <MapBox mapRef={mapRef} />
        {!ro && (
          <div className="tms-loc-hint">
            <span>{t('ord.loc.mapHint')}</span>
            {ok(stop.lat) && <button type="button" className="tms-btn sm" onClick={clear}>{t('ord.loc.clear')}</button>}
          </div>
        )}
      </div>
    </div>
  );
}
