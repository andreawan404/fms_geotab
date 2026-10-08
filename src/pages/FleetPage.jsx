import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { L, MapBox, STATE_COLOR, drawRoute, esc, fitTo, useMap, vehicleIcon, vehicleState } from '../components/mapkit.jsx';
import { StatusBadge, Empty, Spinner } from '../components/ui.jsx';
import { errMessage } from '../services/geotab.js';

const ago = (ms) => {
  if (!ms) return '-';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 172800) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};

/** Instance penugasan hari ini yang paling relevan untuk kendaraan: berjalan > akan datang > terakhir. */
export function pickInstance(list, now) {
  const active = list.find((x) => x.inst.startMs <= now && now <= x.inst.endMs);
  if (active) return active;
  const upcoming = list.filter((x) => x.inst.startMs > now).sort((a, b) => a.inst.startMs - b.inst.startMs)[0];
  return upcoming || list.sort((a, b) => b.inst.endMs - a.inst.endMs)[0] || null;
}

export default function FleetPage() {
  const { t, devices, statuses, results, settings, driverMap, geotab, loading, toast } = useApp();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState(null);
  const [showTrack, setShowTrack] = useState(false);
  const [trackTick, setTrackTick] = useState(0);
  const [mapRef, map] = useMap(settings.tileUrl);
  const markers = useRef(new Map());
  const fitted = useRef(false);
  const routeLayer = useRef(null);
  const trackLayer = useRef(null);
  const veLayer = useRef(null);

  const rows = useMemo(() => {
    const now = Date.now();
    const byDev = new Map();
    for (const r of results.values()) {
      if (!byDev.has(r.inst.deviceId)) byDev.set(r.inst.deviceId, []);
      byDev.get(r.inst.deviceId).push(r);
    }
    return devices.map((dev) => {
      const st = statuses.get(dev.id);
      const base = vehicleState(st);
      const today = pickInstance(byDev.get(dev.id) || [], now);
      const deviating = !!today?.result.currentlyDeviating && today.inst.startMs <= now && now <= today.inst.endMs;
      return { dev, st, state: deviating ? 'deviating' : base, base, today };
    });
  }, [devices, statuses, results]);

  const counts = useMemo(() => {
    const c = { all: rows.length, moving: 0, idle: 0, offline: 0, deviating: 0 };
    rows.forEach((r) => {
      c[r.base]++;
      if (r.state === 'deviating') c.deviating++;
    });
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return rows.filter((r) => (filter === 'all' || (filter === 'deviating' ? r.state === 'deviating' : r.base === filter)) && (!k || `${r.dev.name} ${r.dev.plate} ${r.dev.vin} ${r.dev.serial}`.toLowerCase().includes(k)));
  }, [rows, q, filter]);

  // layer groups
  useEffect(() => {
    if (!map) return undefined;
    routeLayer.current = L.layerGroup().addTo(map);
    trackLayer.current = L.layerGroup().addTo(map);
    veLayer.current = L.layerGroup().addTo(map);
    markers.current = new Map();
    fitted.current = false;
    return () => {
      routeLayer.current = trackLayer.current = veLayer.current = null;
    };
  }, [map]);

  // marker kendaraan
  useEffect(() => {
    if (!map || !veLayer.current) return;
    const keep = new Set();
    const visibleIds = new Set(shown.map((r) => r.dev.id));
    for (const r of rows) {
      const st = r.st;
      if (!st || !Number.isFinite(st.lat) || !Number.isFinite(st.lng) || !visibleIds.has(r.dev.id)) continue;
      keep.add(r.dev.id);
      const sig = `${r.state}:${Math.round(st.bearing / 10)}:${r.dev.name}`;
      let m = markers.current.get(r.dev.id);
      if (!m) {
        m = L.marker([st.lat, st.lng], { icon: vehicleIcon(r.dev.name, r.state, st.bearing), zIndexOffset: r.state === 'deviating' ? 900 : 0 }).addTo(veLayer.current);
        m.on('click', () => setSel(r.dev.id));
        markers.current.set(r.dev.id, m);
        m._sig = sig;
      } else {
        m.setLatLng([st.lat, st.lng]);
        if (m._sig !== sig) {
          m.setIcon(vehicleIcon(r.dev.name, r.state, st.bearing));
          m._sig = sig;
        }
      }
      m.bindPopup(
        `<b>${esc(r.dev.name)}</b> ${esc(r.dev.plate)}<br>${t(`state.${r.state}`)} · ${Math.round(st.speed)} km/h<br>${esc(driverMap.get(st.driverId)?.name || '')}${r.today ? `<br>${esc(r.today.route.name)}` : ''}`,
      );
    }
    for (const [id, m] of markers.current) {
      if (!keep.has(id)) {
        veLayer.current.removeLayer(m);
        markers.current.delete(id);
      }
    }
    if (!fitted.current && keep.size) {
      fitTo(map, [...markers.current.values()].map((m) => m.getLatLng()), 50);
      fitted.current = true;
    }
  }, [rows, shown, map, t, driverMap]);

  const selRow = rows.find((r) => r.dev.id === sel);

  // overlay rute kendaraan terpilih
  useEffect(() => {
    if (!routeLayer.current) return;
    routeLayer.current.clearLayers();
    const today = selRow?.today;
    if (!today) return;
    const states = today.result.checkpoints.map((c) => (c.arrivedMs ? 'arrived' : c.skipped ? 'skipped' : ''));
    drawRoute(routeLayer.current, today.route, { cpStates: states });
  }, [selRow?.today?.route, selRow?.today?.result.arrivedCount, sel, map]);

  // fokus ke kendaraan terpilih
  useEffect(() => {
    if (!map || !sel) return;
    const m = markers.current.get(sel);
    if (m) {
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 13), { duration: 0.6 });
      m.openPopup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, map]);

  // jejak hari ini
  useEffect(() => {
    if (!trackLayer.current) return undefined;
    trackLayer.current.clearLayers();
    if (!showTrack || !sel) return undefined;
    let dead = false;
    const d0 = new Date();
    d0.setHours(0, 0, 0, 0);
    geotab
      .getLogs(sel, d0.getTime(), Date.now())
      .then((logs) => {
        if (dead || !trackLayer.current) return;
        trackLayer.current.clearLayers();
        if (logs.length > 1) L.polyline(logs.map((p) => [p.lat, p.lng]), { color: '#111', weight: 3, opacity: 0.75, dashArray: '2 5' }).addTo(trackLayer.current);
        else toast(t('fleet.noTrack'));
      })
      .catch((e) => toast(errMessage(e), 'err'));
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTrack, sel, trackTick, map]);

  return (
    <div className="tms-page">
      <div className="tms-split">
        <div className="tms-card">
          <div className="tms-card-h">
            {t('fleet.title')} <span className="tms-muted tms-sm">({shown.length}/{rows.length})</span>
          </div>
          <div style={{ padding: '8px 12px 0' }}>
            <input placeholder={t('fleet.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="tms-chips">
            {['all', 'moving', 'idle', 'offline', 'deviating'].map((f) => (
              <button key={f} className={`tms-chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                {t(`state.${f}`)} {counts[f]}
              </button>
            ))}
          </div>
          <div className="tms-scroll">
            {loading && <Spinner text={t('loading')} />}
            {!loading && shown.length === 0 && <Empty>{t('fleet.empty')}</Empty>}
            {shown.map((r) => (
              <div key={r.dev.id} className={`tms-veh-item ${sel === r.dev.id ? 'sel' : ''}`} onClick={() => setSel(r.dev.id)}>
                <span className={`tms-dot-s ${r.state}`} />
                <div className="tms-grow" style={{ minWidth: 0 }}>
                  <div className="tms-row">
                    <b>{r.dev.name}</b>
                    <span className="tms-muted tms-sm">{r.dev.plate}</span>
                    <span className="tms-grow" />
                    <span className="tms-sm" style={{ color: STATE_COLOR[r.state] }}>
                      {r.st && r.base !== 'offline' ? `${Math.round(r.st.speed)} km/h` : t(`state.${r.state}`)}
                    </span>
                  </div>
                  <div className="tms-sm tms-muted">
                    {driverMap.get(r.st?.driverId)?.name || '—'} · {ago(r.st?.t)}
                  </div>
                  {r.today && (
                    <div className="tms-row tms-sm" style={{ marginTop: 3 }}>
                      <StatusBadge status={r.today.result.status} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.today.route.name}</span>
                      <span className="tms-muted">
                        {r.today.result.arrivedCount}/{r.today.result.totalCheckpoints}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {sel && (
            <div className="tms-sec tms-row">
              <label className="tms-row tms-sm">
                <input type="checkbox" checked={showTrack} onChange={(e) => setShowTrack(e.target.checked)} /> {t('fleet.track')}
              </label>
              {showTrack && (
                <button className="tms-btn sm" onClick={() => setTrackTick((x) => x + 1)}>
                  ↻
                </button>
              )}
            </div>
          )}
        </div>
        <MapBox mapRef={mapRef} />
      </div>
    </div>
  );
}
