import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { L, MapBox, drawRoute, esc, fitTo, useMap } from './mapkit.jsx';
import { Kpi, Modal, PhaseBadge, Spinner, StatusBadge, download } from './ui.jsx';
import { engineRoute } from '../lib/engineRoute.js';
import { fmtDateTime, fmtDur, fmtKm, fmtTime } from '../core/time.js';
import { toCSV } from '../core/csv.js';
import { errMessage } from '../services/geotab.js';

/** Detail satu penugasan (instance harian): status, checkpoint, deviasi, dan replay rencana vs aktual. */
export default function InstanceDetail({ inst, onClose, footerExtra }) {
  const { t, lang, routeMap, deviceMap, driverMap, evaluate, settings } = useApp();
  const route = routeMap.get(inst.routeId);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [mapRef, map] = useMap(settings.tileUrl);
  const layer = useRef(null);
  const marker = useRef(null);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let dead = false;
    evaluate(inst, { withLogs: true })
      .then((d) => !dead && setData(d))
      .catch((e) => !dead && setErr(errMessage(e)));
    return () => {
      dead = true;
    };
  }, [inst, evaluate]);

  const logs = data?.logs || [];
  const res = data?.result;

  useEffect(() => {
    if (!map || !res || !route) return;
    layer.current?.remove();
    layer.current = L.layerGroup().addTo(map);
    const states = res.checkpoints.map((c) => (c.arrivedMs ? 'arrived' : c.skipped ? 'skipped' : ''));
    drawRoute(layer.current, { ...route, widthM: route.widthM || settings.defaults.widthM }, { cpStates: states });
    if (logs.length > 1) {
      // jejak aktual: hitam di dalam koridor, merah saat deviasi
      let seg = [];
      let red = false;
      const inDev = (ms) => res.deviations.some((d) => ms >= d.startMs && ms <= d.endMs);
      const flush = () => {
        if (seg.length > 1) L.polyline(seg, { color: red ? '#d63a3a' : '#111', weight: red ? 4 : 3, opacity: 0.85 }).addTo(layer.current);
      };
      for (const p of logs) {
        const r = inDev(p.t);
        if (r !== red) {
          const last = seg[seg.length - 1];
          flush();
          seg = last ? [last] : [];
          red = r;
        }
        seg.push([p.lat, p.lng]);
      }
      flush();
    }
    for (const d of res.deviations) {
      if (Number.isFinite(d.lat)) L.circleMarker([d.lat, d.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#d63a3a', fillOpacity: 1 }).bindTooltip(`${fmtTime(d.startMs)} · max ${Math.round(d.maxDistM)} m`).addTo(layer.current);
    }
    fitTo(map, [...(route.path || []), ...logs.map((p) => [p.lat, p.lng])]);
    marker.current?.remove();
    if (logs.length) {
      marker.current = L.circleMarker([logs[0].lat, logs[0].lng], { radius: 8, color: '#fff', weight: 2, fillColor: '#ffb703', fillOpacity: 1 }).addTo(map);
    }
  }, [map, res, route]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (logs[pos] && marker.current) marker.current.setLatLng([logs[pos].lat, logs[pos].lng]);
  }, [pos, logs]);

  useEffect(() => {
    if (!playing || !logs.length) return undefined;
    const step = Math.max(1, Math.ceil(logs.length / 250));
    const iv = setInterval(() => {
      setPos((p) => {
        if (p >= logs.length - 1) {
          setPlaying(false);
          return p;
        }
        return Math.min(logs.length - 1, p + step);
      });
    }, 70);
    return () => clearInterval(iv);
  }, [playing, logs.length]);

  const devName = deviceMap.get(inst.deviceId)?.name || inst.deviceId;
  const drv = driverMap.get(inst.driverId)?.name;
  const cur = logs[pos];
  const eng = useMemo(() => (route ? engineRoute(route, settings) : null), [route, settings]);

  const exportCsv = () => {
    const cols = [
      { label: t('rep.cpName'), get: (r) => r.name },
      { label: t('detail.planned'), get: (r) => fmtDateTime(r.plannedMs) },
      { label: t('detail.arrived'), get: (r) => fmtDateTime(r.arrivedMs) },
      { label: t('detail.delay'), get: (r) => (r.delayMin == null ? '' : r.delayMin.toFixed(1)) },
      { label: t('detail.dwell'), get: (r) => Math.round(r.dwellSec) },
    ];
    download(`checkpoint_${devName}_${inst.date}.csv`, toCSV(res.checkpoints, cols, lang === 'id' ? ';' : ','));
  };

  return (
    <Modal
      wide
      onClose={onClose}
      title={`${devName} · ${route?.name || '?'} · ${inst.date}`}
      footer={
        <>
          {res && <button className="tms-btn" onClick={exportCsv}>CSV</button>}
          <span className="tms-grow" />
          {footerExtra}
          <button className="tms-btn" onClick={onClose}>{t('close')}</button>
        </>
      }
    >
      {err && <div className="tms-banner" style={{ margin: 0 }}>{err}</div>}
      <div className="tms-detail-grid">
        <div>
          {!res && !err && <Spinner text={t('loading')} />}
          {res && route && (
          <>
            <div className="tms-row" style={{ marginBottom: 10 }}>
              <StatusBadge status={res.status} />
              <PhaseBadge phase={res.phase} ms={res.phase === 'finished' ? res.finishedMs : res.startedMs} />
              <span className="tms-sm tms-muted">
                {fmtTime(inst.startMs)}–{fmtTime(inst.endMs)} · {drv || t('noDriver')}
              </span>
            </div>
            <div className="tms-kpis" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <Kpi label={t('detail.compliance')} value={res.compliancePct == null ? '-' : `${res.compliancePct.toFixed(0)}%`} tone={res.compliancePct != null && res.compliancePct < 90 ? 'bad' : 'good'} />
              <Kpi label={t('detail.deviations')} value={res.deviations.length} tone={res.deviations.length ? 'bad' : ''} />
              <Kpi label={t('detail.outKm')} value={fmtKm(res.outsideDistM)} />
              <Kpi label={t('detail.checkpoints')} value={`${res.arrivedCount}/${res.totalCheckpoints}`} />
              <Kpi label={t('detail.distance')} value={fmtKm(res.totalDistM)} />
              <Kpi label={t('detail.maxOff')} value={`${Math.round(res.maxDistM)} m`} sub={`${t('routes.width')} ${eng.widthM} m`} />
            </div>

            <table>
              <thead>
                <tr>
                  <th>#</th><th>{t('rep.cpName')}</th><th>{t('detail.planned')}</th><th>{t('detail.arrived')}</th><th className="num">{t('detail.delay')}</th><th className="num">{t('detail.dwell')}</th>
                </tr>
              </thead>
              <tbody>
                {res.checkpoints.map((c, i) => (
                  <tr key={c.id || i}>
                    <td>{i + 1}</td>
                    <td>{c.name}</td>
                    <td>{fmtTime(c.plannedMs)}</td>
                    <td>{c.arrivedMs ? fmtTime(c.arrivedMs) : c.skipped ? <span className="tms-badge amber">{t('detail.skipped')}</span> : '-'}</td>
                    <td className="num" style={{ color: c.delayMin > 10 ? '#d63a3a' : undefined }}>{c.delayMin == null ? '-' : `${c.delayMin > 0 ? '+' : ''}${c.delayMin.toFixed(0)} m`}</td>
                    <td className="num">{c.arrivedMs ? fmtDur(c.dwellSec) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {res.deviations.length > 0 && (
              <>
                <h4 style={{ margin: '14px 0 6px' }}>{t('detail.deviationList')}</h4>
                <table>
                  <thead>
                    <tr><th>{t('detail.start')}</th><th>{t('detail.end')}</th><th className="num">{t('detail.maxOff')}</th><th className="num">{t('detail.outKm')}</th></tr>
                  </thead>
                  <tbody>
                    {res.deviations.map((d, i) => (
                      <tr key={i}>
                        <td>{fmtTime(d.startMs)}</td>
                        <td>{d.ongoing ? <span className="tms-badge red">{t('detail.ongoing')}</span> : fmtTime(d.endMs)}</td>
                        <td className="num">{Math.round(d.maxDistM)} m</td>
                        <td className="num">{fmtKm(d.travelM, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
          )}
        </div>
        <div>
            <MapBox mapRef={mapRef} />
            {logs.length > 1 && (
              <div style={{ marginTop: 8 }}>
                <div className="tms-row">
                  <button className="tms-btn sm" onClick={() => { if (pos >= logs.length - 1) setPos(0); setPlaying(!playing); }}>{playing ? '❚❚' : '▶'} {t('detail.replay')}</button>
                  <input type="range" min="0" max={logs.length - 1} value={pos} onChange={(e) => { setPlaying(false); setPos(Number(e.target.value)); }} className="tms-grow" />
                </div>
                {cur && (
                  <div className="tms-sm tms-muted" dangerouslySetInnerHTML={{ __html: `${esc(fmtDateTime(cur.t))} · ${Math.round(cur.speed || 0)} km/h` }} />
                )}
              </div>
            )}
        </div>
      </div>
    </Modal>
  );
}
