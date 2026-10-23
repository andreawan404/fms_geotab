import React, { useEffect, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Field } from './ui.jsx';
import { loadZones, peekZones, zoneToStop } from '../lib/zones.js';

const NumIn = ({ value, onChange, ...p }) => (
  <input type="number" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} {...p} />
);
const ok = (v) => typeof v === 'number' && Number.isFinite(v);

/** Lokasi stop: cukup pilih Zona Geotab (nama, titik tengah, dan radius terisi otomatis). Koordinat manual hanya sebagai cadangan. */
export default function ZonePicker({ stop, upd, ro, bad }) {
  const { t, geotab, toast } = useApp();
  const [zones, setZones] = useState(peekZones());
  const [q, setQ] = useState('');
  useEffect(() => {
    if (ro || zones) return;
    loadZones(geotab).then(setZones).catch((e) => toast(e.message || String(e), 'err'));
  }, [ro, zones, geotab, toast]);

  const current = zones?.find((z) => z.id === stop.zoneId);
  const change = (name) => {
    setQ(name);
    const z = (zones || []).find((x) => x.name === name);
    if (z && z.points.length) { upd(zoneToStop(z)); setQ(''); }
  };
  const hasPoint = ok(stop.lat) && ok(stop.lng);

  return (
    <div className="tms-zone">
      {!ro && (
        <Field label={t('ord.loc.zone')} hint={zones && zones.length === 0 ? t('ord.loc.noZone') : t('ord.loc.zoneOnlyHint')}>
          <input list={`zones-${stop._uid || 'x'}`} className={bad('lat') || bad('name') ? 'bad' : ''} value={q} onChange={(e) => change(e.target.value)} placeholder={zones ? t('ord.loc.zonePh') : t('loading')} />
          <datalist id={`zones-${stop._uid || 'x'}`}>{(zones || []).map((z) => <option key={z.id} value={z.name} />)}</datalist>
        </Field>
      )}
      <div className="tms-zone-cur">
        {hasPoint ? (
          <>
            <span className={`tms-badge ${stop.zoneId ? 'green' : 'amber'}`}>{stop.zoneId ? t('ord.loc.zoneBadge') : t('ord.loc.noZoneBadge')}</span>{' '}
            <b>{stop.name || current?.name}</b>
            <span className="tms-sm tms-muted"> · {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)} · {t('ord.s.radius')} {stop.radiusM} m</span>
          </>
        ) : <span className="tms-sm tms-muted">{t('ord.loc.pickZone')}</span>}
      </div>
      {!ro && (
        <details className="tms-zone-man">
          <summary className="tms-sm tms-muted">{t('ord.loc.manual')}</summary>
          <div className="tms-loc-coords" style={{ marginTop: 6 }}>
            <Field label={t('ord.s.name')}><input className={bad('name') ? 'bad' : ''} value={stop.name} onChange={(e) => upd({ name: e.target.value, zoneId: '' })} /></Field>
            <Field label={t('ord.s.lat')}><NumIn className={bad('lat') ? 'bad' : ''} value={stop.lat} onChange={(v) => upd({ lat: v, zoneId: '' })} /></Field>
            <Field label={t('ord.s.lng')}><NumIn className={bad('lat') ? 'bad' : ''} value={stop.lng} onChange={(v) => upd({ lng: v, zoneId: '' })} /></Field>
            <Field label={t('ord.s.radius')}><NumIn min={10} className={bad('radiusM') ? 'bad' : ''} value={stop.radiusM} onChange={(v) => upd({ radiusM: v })} /></Field>
          </div>
        </details>
      )}
    </div>
  );
}
