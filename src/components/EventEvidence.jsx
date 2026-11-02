import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { L, MapBox, drawRoute, fitTo, useMap } from './mapkit.jsx';
import { Modal, Spinner } from './ui.jsx';
import { SEVERITY } from '../lib/alertView.js';
import { fmtDateTime, fmtTime } from '../core/time.js';
import { orderIdOfInstKey } from '../core/linkPlan.js';
import { vehicleLabel } from '../lib/vehicle.js';
import { errMessage } from '../services/geotab.js';

const COLOR = { err: '#d63a3a', warn: '#e6a100', ok: '#1a9e5c', info: '#1f78d1', mute: '#6b7785' };
const nearest = (logs, ms) => {
  let best = -1; let bd = Infinity;
  logs.forEach((p, i) => { const d = Math.abs(p.t - ms); if (d < bd) { bd = d; best = i; } });
  return best;
};

/** Bukti satu kejadian: peta rute + jejak GPS di sekitar waktu kejadian, penanda lokasi, dan putar ulang. Tidak bergantung pada penugasan masih ada. */
export default function EventEvidence({ ev, onClose, onOpenInst, onOpenOrder }) {
  const { t, geotab, settings, routeMap, deviceMap, driverMap } = useApp();
  const route = routeMap.get(ev.routeId);
  const [logs, setLogs] = useState(null);
  const [err, setErr] = useState('');
  const [pos, setPos] = useState(0);
  const [mapRef, map] = useMap(settings.tileUrl);
  const layer = useRef(null);
  const cursor = useRef(null);
  const tone = SEVERITY[ev.type] || 'mute';
  const evMs = Number(ev.t) || Number(ev.at) || 0;

  useEffect(() => {
    let dead = false;
    const before = 20 * 60000; const after = ev.type === 'deviation_start' ? 45 * 60000 : 20 * 60000;
    geotab.getLogs(ev.deviceId, evMs - before, Math.min(Date.now(), evMs + after))
      .then((l) => { if (dead) return; setLogs(l); setPos(Math.max(0, nearest(l, evMs))); })
      .catch((e) => { if (!dead) { setErr(errMessage(e)); setLogs([]); } });
    return () => { dead = true; };
  }, [geotab, ev.deviceId, evMs, ev.type]);

  const evPoint = useMemo(() => {
    if (Number.isFinite(ev.lat) && Number.isFinite(ev.lng)) return [ev.lat, ev.lng];
    const i = logs ? nearest(logs, evMs) : -1;
    return i >= 0 ? [logs[i].lat, logs[i].lng] : null;
  }, [ev, logs, evMs]);

  useEffect(() => {
    if (!map || !logs) return;
    layer.current?.remove();
    layer.current = L.layerGroup().addTo(map);
    if (route) drawRoute(layer.current, { ...route, widthM: route.widthM || settings.defaults?.widthM }, { weight: 4 });
    if (logs.length > 1) {
      L.polyline(logs.map((p) => [p.lat, p.lng]), { color: '#111', weight: 3, opacity: 0.8 }).addTo(layer.current);
      const k = nearest(logs, evMs);
      if (k > 0) L.polyline(logs.slice(Math.max(0, k - 1)).map((p) => [p.lat, p.lng]), { color: COLOR[tone], weight: 4, opacity: 0.9 }).addTo(layer.current);
    }
    if (evPoint) L.circleMarker(evPoint, { radius: 10, color: '#fff', weight: 3, fillColor: COLOR[tone], fillOpacity: 1 }).bindTooltip(`${fmtTime(evMs)} · ${t(`evt.${ev.type}`)}`, { permanent: true, direction: 'top', offset: [0, -8] }).addTo(layer.current);
    cursor.current?.remove();
    cursor.current = logs.length ? L.circleMarker([logs[0].lat, logs[0].lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#ffb703', fillOpacity: 1 }).addTo(map) : null;
    const pts = [...(logs.length ? logs.map((p) => [p.lat, p.lng]) : []), ...(evPoint ? [evPoint] : []), ...(route?.path?.length && logs.length < 2 ? route.path : [])];
    fitTo(map, pts, 30);
    if (!logs.length && evPoint) map.setView(evPoint, 15);
  }, [map, logs, route]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (logs?.[pos] && cursor.current) cursor.current.setLatLng([logs[pos].lat, logs[pos].lng]); }, [pos, logs]);

  const dev = deviceMap.get(ev.deviceId);
  const drv = driverMap?.get(ev.driverId)?.name;
  const orderId = orderIdOfInstKey(ev.instKey);
  const cur = logs?.[pos];
  const detail = t(`ev.${ev.type}`, { route: route?.name || '', cp: ev.cpName || '', dist: Math.round(ev.distM || 0), min: ev.min ?? '' });

  return (
    <Modal wide onClose={onClose} title={`${t('evid.title')} · ${vehicleLabel(dev || { name: ev.deviceId }).name}`}
      footer={<>{orderId && onOpenOrder && <button className="tms-btn" onClick={() => onOpenOrder(orderId)}>{t('evid.order')}</button>}{onOpenInst && <button className="tms-btn" onClick={onOpenInst}>{t('evid.inst')}</button>}<span className="tms-grow" /><button className="tms-btn" onClick={onClose}>{t('close')}</button></>}>
      <div className={`tms-alert-item hist ${tone}`} style={{ cursor: 'default', marginBottom: 8, borderRadius: 8 }}>
        <span className="dot" />
        <div className="body">
          <div className="ttl"><b>{t(`evt.${ev.type}`)}</b><span className="rel">{fmtDateTime(evMs)}</span></div>
          <div className="txt">{detail}</div>
          <div className="tms-sm tms-muted">{[route?.name, drv, evPoint && `${evPoint[0].toFixed(5)}, ${evPoint[1].toFixed(5)}`].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      {err && <div className="tms-banner" style={{ margin: '0 0 8px' }}>{err}</div>}
      {!logs && !err && <Spinner text={t('loading')} />}
      <MapBox mapRef={mapRef} className="tall" />
      {logs && logs.length > 1 && (
        <div style={{ marginTop: 8 }}>
          <input type="range" min="0" max={logs.length - 1} value={pos} onChange={(e) => setPos(Number(e.target.value))} style={{ width: '100%' }} />
          <div className="tms-sm tms-muted">{cur ? `${fmtDateTime(cur.t)} · ${Math.round(cur.speed || 0)} km/h` : ''} · {t('evid.trail', { n: logs.length })}</div>
        </div>
      )}
      {logs && logs.length === 0 && !err && <div className="tms-sm tms-muted" style={{ marginTop: 6 }}>{t('evid.noLogs')}</div>}
    </Modal>
  );
}
