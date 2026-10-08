import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { L, MapBox, drawRoute, esc, fitTo, useMap } from '../components/mapkit.jsx';
import { Empty, Field, Spinner } from '../components/ui.jsx';
import { uid } from '../services/store.js';
import { findRoutes, geocode, offsetsFromLegs, offsetsFromPath } from '../services/routing.js';
import { errMessage } from '../services/geotab.js';
import { centroid, haversine, pathLength, simplifyToMax } from '../core/geometry.js';
import { corridorZoneRing } from '../core/corridor.js';
import { fmtDur, fmtKm } from '../core/time.js';

const PALETTE = ['#0b5ea8', '#d9480f', '#2b8a3e', '#7b2cbf', '#c2255c', '#0c8599', '#e67700', '#495057'];
const PARAM_KEYS = ['confirmSec', 'confirmMeters', 'gpsMarginM', 'recoverSec', 'graceMin'];

function useDebounced(v, ms) {
  const [x, setX] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setX(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return x;
}

export default function RoutesPage() {
  const { t, routes, assignments, settings, deleteRoute, saveRoute, geotab, toast, loading } = useApp();
  const [draft, setDraft] = useState(null);

  const newDraft = () => ({
    id: uid('r'),
    name: '',
    color: PALETTE[routes.length % PALETTE.length],
    mode: 'recommended',
    profile: settings.routing.profile,
    widthM: settings.defaults.widthM,
    params: {},
    checkpoints: [],
    path: [],
    manualPath: [],
    distanceM: 0,
    durationS: 0,
    createdAt: Date.now(),
  });

  if (loading) return <Spinner text={t('loading')} />;
  if (draft) return <RouteEditor initial={draft} onClose={() => setDraft(null)} />;

  const remove = async (r) => {
    const n = assignments.filter((a) => a.routeId === r.id).length;
    if (!window.confirm(t('routes.confirmDelete', { name: r.name, n }))) return;
    try {
      if (r.zoneId) await geotab.removeZone(r.zoneId).catch(() => {});
      await deleteRoute(r);
      toast(t('saved'));
    } catch (e) {
      toast(errMessage(e), 'err');
    }
  };
  const duplicate = async (r) => {
    try {
      const copy = { ...r, id: uid('r'), name: `${r.name} (copy)`, _rid: undefined, _chunks: undefined, zoneId: undefined, createdAt: Date.now() };
      await saveRoute(copy);
      toast(t('saved'));
    } catch (e) {
      toast(errMessage(e), 'err');
    }
  };

  return (
    <div className="tms-page">
      <div className="tms-row" style={{ marginBottom: 12 }}>
        <h2 className="tms-grow">{t('routes.title')}</h2>
        <button className="tms-btn pri" onClick={() => setDraft(newDraft())}>+ {t('routes.new')}</button>
      </div>
      <div className="tms-card">
        {routes.length === 0 && <Empty>{t('routes.empty')}</Empty>}
        {routes.map((r) => {
          const n = assignments.filter((a) => a.routeId === r.id).length;
          return (
            <div key={r.id} className="tms-route-card" onClick={() => setDraft({ ...r, params: r.params || {}, manualPath: r.manualPath || [] })}>
              <span className="tms-swatch" style={{ background: r.color }} />
              <div className="tms-grow">
                <b>{r.name}</b>
                <div className="tms-sm tms-muted">
                  {fmtKm(r.distanceM)} · {fmtDur(r.durationS)} · {r.checkpoints.length} {t('routes.cp')} · {t('routes.width')} {r.widthM} m · {t(`routes.mode.${r.mode}`)} · {n} {t('routes.assignments')}
                </div>
                <div className="tms-sm tms-muted">{r.checkpoints.map((c) => c.name).join(' → ')}</div>
              </div>
              <div className="tms-row" onClick={(e) => e.stopPropagation()}>
                <button className="tms-btn sm" onClick={() => duplicate(r)}>{t('duplicate')}</button>
                <button className="tms-btn sm danger" onClick={() => remove(r)}>{t('delete')}</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RouteEditor({ initial, onClose }) {
  const { t, settings, saveRoute, geotab, toast } = useApp();
  const [draft, setDraft] = useState(() => ({ ...initial, sig: initial.checkpoints.map((c) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`).join('|') }));
  const [tool, setTool] = useState('none'); // none | cp | path
  const [alts, setAlts] = useState([]);
  const [altIdx, setAltIdx] = useState(0);
  const [busy, setBusy] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [zones, setZones] = useState(null);
  const [prevManual, setPrevManual] = useState(null);
  const [mapRef, map] = useMap(settings.tileUrl);
  const layer = useRef(null);
  const vtxLayer = useRef(null);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const isNew = !initial._rid;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const path = draft.mode === 'manual' ? draft.manualPath : draft.path;
  const dWidth = useDebounced(draft.widthM, 250);
  const dist = useMemo(() => pathLength(path), [path]);
  const sig = (cps) => cps.map((c) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`).join('|');
  const stale = draft.mode === 'recommended' && draft.path.length > 1 && draft.sig !== sig(draft.checkpoints);

  // layer groups + klik peta
  useEffect(() => {
    if (!map) return undefined;
    layer.current = L.layerGroup().addTo(map);
    vtxLayer.current = L.layerGroup().addTo(map);
    const onClick = (e) => {
      const tl = toolRef.current;
      const { lat, lng } = e.latlng;
      if (tl === 'cp') {
        setDraft((d) => {
          const n = d.checkpoints.length + 1;
          return { ...d, checkpoints: [...d.checkpoints, { id: uid('c'), name: `Checkpoint ${n}`, lat, lng, radius: settings.defaults.radius }] };
        });
      } else if (tl === 'path') {
        setDraft((d) => ({ ...d, manualPath: [...d.manualPath, [lat, lng]] }));
      }
    };
    map.on('click', onClick);
    if (initial.path?.length > 1) fitTo(map, initial.path);
    else if (initial.checkpoints?.length) fitTo(map, initial.checkpoints.map((c) => [c.lat, c.lng]));
    return () => {
      map.off('click', onClick);
      layer.current = vtxLayer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    if (!map) return;
    map.getContainer().classList.toggle('tms-cursor-cross', tool !== 'none');
  }, [tool, map]);

  const selectAlt = useCallback(
    (i, list) => {
      const a = (list || alts)[i];
      if (!a) return;
      setAltIdx(i);
      setDraft((d) => ({ ...d, path: a.path, distanceM: a.distanceM, durationS: a.durationS, legs: a.legs, sig: d.sig }));
    },
    [alts],
  );

  // gambar rute + koridor + checkpoint
  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    alts.forEach((a, i) => {
      if (i === altIdx || draft.mode !== 'recommended') return;
      L.polyline(a.path, { color: '#7a8794', weight: 6, opacity: 0.6 }).on('click', () => selectAlt(i)).addTo(layer.current);
    });
    drawRoute(layer.current, { ...draft, path, widthM: dWidth }, {
      draggable: true,
      onCpDrag: (i, ll) =>
        setDraft((d) => ({ ...d, checkpoints: d.checkpoints.map((c, k) => (k === i ? { ...c, lat: ll.lat, lng: ll.lng } : c)) })),
    });
  }, [map, path, dWidth, draft.checkpoints, draft.color, draft.mode, alts, altIdx, selectAlt]); // eslint-disable-line react-hooks/exhaustive-deps

  // titik jalur manual (bisa digeser; klik kanan = hapus)
  useEffect(() => {
    if (!vtxLayer.current) return;
    vtxLayer.current.clearLayers();
    if (draft.mode !== 'manual') return;
    draft.manualPath.forEach((p, i) => {
      if (draft.manualPath.length > 300) return;
      const m = L.marker(p, { icon: L.divIcon({ className: '', iconSize: [10, 10], iconAnchor: [5, 5], html: '<div class="tms-vtx"></div>' }), draggable: true }).addTo(vtxLayer.current);
      m.on('dragend', () => setDraft((d) => ({ ...d, manualPath: d.manualPath.map((q, k) => (k === i ? [m.getLatLng().lat, m.getLatLng().lng] : q)) })));
      m.on('contextmenu', () => setDraft((d) => ({ ...d, manualPath: d.manualPath.filter((_, k) => k !== i) })));
    });
  }, [map, draft.manualPath, draft.mode]);

  // ---- aksi ----
  const addCp = (cp) => setDraft((d) => ({ ...d, checkpoints: [...d.checkpoints, { id: uid('c'), radius: settings.defaults.radius, ...cp }] }));
  const updCp = (i, patch) => setDraft((d) => ({ ...d, checkpoints: d.checkpoints.map((c, k) => (k === i ? { ...c, ...patch } : c)) }));
  const delCp = (i) => setDraft((d) => ({ ...d, checkpoints: d.checkpoints.filter((_, k) => k !== i) }));
  const moveCp = (i, dir) =>
    setDraft((d) => {
      const a = [...d.checkpoints];
      const j = i + dir;
      if (j < 0 || j >= a.length) return d;
      [a[i], a[j]] = [a[j], a[i]];
      return { ...d, checkpoints: a };
    });

  const doSearch = async () => {
    if (!query.trim()) return;
    setBusy('geo');
    try {
      const res = await geocode(settings, query.trim());
      setHits(res);
      if (!res.length) toast(t('routes.noHits'));
    } catch (e) {
      toast(errMessage(e), 'err');
    }
    setBusy('');
  };
  const pickHit = (h) => {
    addCp({ name: h.label.split(',').slice(0, 2).join(',').trim(), lat: h.lat, lng: h.lng });
    setHits([]);
    setQuery('');
    map?.flyTo([h.lat, h.lng], Math.max(map.getZoom(), 14));
  };
  const loadZones = async () => {
    try {
      setZones(await geotab.getZones());
    } catch (e) {
      toast(errMessage(e), 'err');
    }
  };
  const pickZone = (id) => {
    const z = zones.find((x) => x.id === id);
    if (!z || !z.points.length) return;
    const [la, ln] = centroid(z.points);
    const r = Math.max(...z.points.map((p) => haversine(la, ln, p[0], p[1])));
    addCp({ name: z.name, lat: la, lng: ln, radius: Math.round(Math.min(500, Math.max(50, r))) });
  };

  const compute = async () => {
    if (draft.checkpoints.length < 2) return toast(t('routes.need2cp'), 'err');
    setBusy('route');
    try {
      const res = await findRoutes(settings, draft.checkpoints.map((c) => [c.lat, c.lng]), { alternatives: true, profile: draft.profile });
      setAlts(res);
      setAltIdx(0);
      const a = res[0];
      setDraft((d) => ({ ...d, path: a.path, distanceM: a.distanceM, durationS: a.durationS, legs: a.legs, sig: sig(d.checkpoints) }));
      fitTo(map, a.path);
      if (res.length > 1) toast(t('routes.altsFound', { n: res.length }));
    } catch (e) {
      toast(errMessage(e), 'err');
    }
    setBusy('');
  };

  const setMode = (mode) => {
    setDraft((d) => {
      if (mode === 'manual' && !d.manualPath.length) {
        const seed = d.path.length > 1 ? simplifyToMax(d.path, 150, 5) : d.checkpoints.map((c) => [c.lat, c.lng]);
        return { ...d, mode, manualPath: seed };
      }
      return { ...d, mode };
    });
    setTool(mode === 'manual' ? 'path' : 'none');
  };

  const snap = async () => {
    const pts = draft.manualPath;
    if (pts.length < 2) return toast(t('routes.needPath'), 'err');
    if (pts.length > 50) return toast(t('routes.tooManyVertices'), 'err');
    setBusy('snap');
    try {
      const [r] = await findRoutes(settings, pts, { alternatives: false, profile: draft.profile });
      setPrevManual(draft.manualPath);
      set({ manualPath: r.path });
      toast(t('routes.snapped'));
    } catch (e) {
      toast(errMessage(e), 'err');
    }
    setBusy('');
  };

  const setParam = (k, v) =>
    setDraft((d) => {
      const params = { ...d.params };
      if (v === '' || Number.isNaN(Number(v))) delete params[k];
      else params[k] = Number(v);
      return { ...d, params };
    });

  const buildFinal = () => {
    const full = path;
    const simple = simplifyToMax(full, 2500, 2);
    const offsets =
      draft.mode === 'recommended' && draft.legs?.length === draft.checkpoints.length - 1 && !stale
        ? offsetsFromLegs(draft.legs, draft.checkpoints.length)
        : offsetsFromPath(simple, draft.checkpoints, settings.defaults.avgSpeedKmh);
    const checkpoints = draft.checkpoints.map((c, i) => ({ id: c.id, name: c.name || `CP ${i + 1}`, lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), radius: Number(c.radius) || settings.defaults.radius, etaOffsetS: offsets[i] }));
    const { legs, sig: _s, ...rest } = draft;
    return { ...rest, name: draft.name.trim(), path: simple, manualPath: draft.mode === 'manual' ? simplifyToMax(draft.manualPath, 600, 1) : [], checkpoints, distanceM: Math.round(pathLength(full)), durationS: offsets[offsets.length - 1] || 0, updatedAt: Date.now() };
  };

  const valid = () => {
    if (!draft.name.trim()) return t('routes.needName');
    if (draft.checkpoints.length < 2) return t('routes.need2cp');
    if (path.length < 2) return t('routes.needPath');
    if (stale && !window.confirm(t('routes.staleConfirm'))) return t('cancelled');
    return '';
  };

  const save = async (andClose = true) => {
    const err = valid();
    if (err) return toast(err, 'err');
    setBusy('save');
    try {
      const saved = await saveRoute(buildFinal());
      toast(t('saved'));
      if (andClose) onClose();
      return saved;
    } catch (e) {
      toast(errMessage(e), 'err');
    } finally {
      setBusy('');
    }
    return null;
  };

  const syncZone = async () => {
    const err = valid();
    if (err) return toast(err, 'err');
    setBusy('zone');
    try {
      const saved = await saveRoute(buildFinal());
      const { ring, parts } = corridorZoneRing(saved.path, saved.widthM);
      const payload = { name: `TMS • ${saved.name}`, ring, comment: `Koridor rute TMS (lebar ${saved.widthM} m)` };
      let zoneId = saved.zoneId;
      if (zoneId) await geotab.setZone(zoneId, payload).catch(async () => { zoneId = await geotab.addZone(payload); });
      else zoneId = await geotab.addZone(payload);
      const withZone = await saveRoute({ ...saved, zoneId });
      setDraft((d) => ({ ...d, _rid: withZone._rid, _chunks: withZone._chunks, zoneId }));
      toast(t('routes.zoneSynced', { n: ring.length }) + (parts > 1 ? ` ${t('routes.zoneParts')}` : ''));
    } catch (e) {
      toast(errMessage(e), 'err');
    }
    setBusy('');
  };

  const etaS = draft.mode === 'recommended' && !stale ? draft.durationS : (dist / ((settings.defaults.avgSpeedKmh * 1000) / 3600));

  return (
    <div className="tms-page">
      <div className="tms-split wide">
        <div className="tms-card">
          <div className="tms-card-h">
            <button className="tms-btn sm" onClick={onClose}>← {t('back')}</button>
            <span className="tms-grow">{isNew ? t('routes.new') : t('routes.edit')}</span>
          </div>
          <div className="tms-scroll">
            <div className="tms-card-b">
              <div className="tms-grid2">
                <Field label={t('routes.name')} className="">
                  <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Depo A → Site B" />
                </Field>
                <Field label={t('routes.color')}>
                  <div className="tms-row">
                    {PALETTE.map((c) => (
                      <button key={c} onClick={() => set({ color: c })} aria-label={c} style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: draft.color === c ? '3px solid #1c2733' : '2px solid #fff', boxShadow: '0 0 0 1px #ccd' }} />
                    ))}
                  </div>
                </Field>
              </div>
            </div>

            <div className="tms-sec">
              <h4>1. {t('routes.checkpoints')}</h4>
              {draft.checkpoints.map((c, i) => (
                <div className="tms-cp-row" key={c.id}>
                  <span className="n">{i + 1}</span>
                  <input value={c.name} onChange={(e) => updCp(i, { name: e.target.value })} />
                  <input type="number" min="20" max="2000" value={c.radius} title={t('routes.radius')} onChange={(e) => updCp(i, { radius: e.target.value })} />
                  <span className="tms-row" style={{ gap: 2 }}>
                    <button className="tms-mini" onClick={() => moveCp(i, -1)} disabled={i === 0}>↑</button>
                    <button className="tms-mini" onClick={() => moveCp(i, 1)} disabled={i === draft.checkpoints.length - 1}>↓</button>
                    <button className="tms-mini" onClick={() => delCp(i)}>×</button>
                  </span>
                </div>
              ))}
              {draft.checkpoints.length === 0 && <div className="tms-sm tms-muted" style={{ marginBottom: 8 }}>{t('routes.cpHelp')}</div>}
              <div className="tms-row" style={{ marginBottom: 8 }}>
                <button className={`tms-btn sm ${tool === 'cp' ? 'on' : ''}`} onClick={() => setTool(tool === 'cp' ? 'none' : 'cp')}>
                  {tool === 'cp' ? t('routes.clickMapOn') : t('routes.clickMap')}
                </button>
                {draft.checkpoints.length > 1 && (
                  <>
                    <button className="tms-btn sm" onClick={() => set({ checkpoints: [...draft.checkpoints].reverse() })}>⇅ {t('routes.reverse')}</button>
                    <button className="tms-btn sm" onClick={() => {
                      const { id: _id, ...first } = draft.checkpoints[0];
                      addCp({ ...first, name: `${first.name} (end)` });
                    }}>⟲ {t('routes.roundTrip')}</button>
                  </>
                )}
              </div>
              <div className="tms-row" style={{ gap: 4 }}>
                <input style={{ flex: 1 }} value={query} placeholder={t('routes.searchAddr')} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
                <button className="tms-btn" onClick={doSearch} disabled={busy === 'geo'}>{t('search')}</button>
              </div>
              {hits.length > 0 && (
                <div className="tms-results">
                  {hits.map((h, i) => (
                    <div key={i} onClick={() => pickHit(h)} dangerouslySetInnerHTML={{ __html: esc(h.label) }} />
                  ))}
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                {zones ? (
                  <select value="" onChange={(e) => pickZone(e.target.value)}>
                    <option value="">{t('routes.pickZone')}</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                ) : (
                  <button className="tms-btn sm" onClick={loadZones}>{t('routes.fromZone')}</button>
                )}
              </div>
            </div>

            <div className="tms-sec">
              <h4>2. {t('routes.pathMode')}</h4>
              <div className="tms-row" style={{ marginBottom: 8 }}>
                {['recommended', 'manual'].map((m) => (
                  <label key={m} className="tms-row tms-sm">
                    <input type="radio" name="mode" checked={draft.mode === m} onChange={() => setMode(m)} /> {t(`routes.mode.${m}`)}
                  </label>
                ))}
              </div>
              {draft.mode === 'recommended' ? (
                <>
                  {settings.routing.provider === 'ors' && (
                    <Field label={t('routes.profile')}>
                      <select value={draft.profile} onChange={(e) => set({ profile: e.target.value })}>
                        <option value="driving-car">{t('routes.profile.car')}</option>
                        <option value="driving-hgv">{t('routes.profile.hgv')}</option>
                      </select>
                    </Field>
                  )}
                  <button className="tms-btn pri" onClick={compute} disabled={busy === 'route' || draft.checkpoints.length < 2}>
                    {busy === 'route' ? t('loading') : draft.path.length ? t('routes.recompute') : t('routes.compute')}
                  </button>
                  {stale && <div className="tms-err" style={{ marginTop: 6 }}>⚠ {t('routes.stale')}</div>}
                  {alts.length > 1 && (
                    <div style={{ marginTop: 8 }}>
                      <div className="tms-sm tms-muted" style={{ marginBottom: 4 }}>{t('routes.pickAlt')}</div>
                      {alts.map((a, i) => (
                        <div key={i} className={`tms-alt ${i === altIdx ? 'on' : ''}`} onClick={() => selectAlt(i)}>
                          <input type="radio" readOnly checked={i === altIdx} />
                          <div className="tms-grow">
                            <b>{t('routes.alt')} {i + 1}</b> · {fmtKm(a.distanceM)} · {fmtDur(a.durationS)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="tms-sm tms-muted" style={{ marginBottom: 6 }}>{t('routes.manualHelp')}</div>
                  <div className="tms-row">
                    <button className={`tms-btn sm ${tool === 'path' ? 'on' : ''}`} onClick={() => setTool(tool === 'path' ? 'none' : 'path')}>{tool === 'path' ? t('routes.drawOn') : t('routes.draw')}</button>
                    <button className="tms-btn sm" onClick={snap} disabled={busy === 'snap'}>{t('routes.snap')}</button>
                    {prevManual && <button className="tms-btn sm" onClick={() => { set({ manualPath: prevManual }); setPrevManual(null); }}>{t('undo')}</button>}
                    <button className="tms-btn sm" onClick={() => set({ manualPath: draft.manualPath.slice(0, -1) })} disabled={!draft.manualPath.length}>⌫</button>
                    <button className="tms-btn sm" onClick={() => set({ manualPath: draft.checkpoints.map((c) => [c.lat, c.lng]) })}>{t('routes.fromCp')}</button>
                    <button className="tms-btn sm danger" onClick={() => set({ manualPath: [] })}>{t('routes.clearPath')}</button>
                  </div>
                  <div className="tms-sm tms-muted" style={{ marginTop: 6 }}>{draft.manualPath.length} {t('routes.vertices')}</div>
                </>
              )}
            </div>

            <div className="tms-sec">
              <h4>3. {t('routes.width')}</h4>
              <div className="tms-row">
                <input type="range" min="20" max="500" step="5" value={draft.widthM} onChange={(e) => set({ widthM: Number(e.target.value) })} className="tms-grow" />
                <input type="number" min="10" max="2000" style={{ width: 80 }} value={draft.widthM} onChange={(e) => set({ widthM: Math.max(10, Number(e.target.value) || 10) })} />
                <span className="tms-sm">m</span>
              </div>
              <div className="tms-hint">{t('routes.widthHelp', { half: Math.round(draft.widthM / 2) })}</div>
            </div>

            <details className="tms-sec">
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>4. {t('routes.alertParams')}</summary>
              <div className="tms-sm tms-muted" style={{ margin: '6px 0' }}>{t('routes.alertParamsHelp')}</div>
              <div className="tms-grid2">
                {PARAM_KEYS.map((k) => (
                  <Field key={k} label={t(`param.${k}`)}>
                    <input type="number" min="0" placeholder={String(settings.defaults[k])} value={draft.params?.[k] ?? ''} onChange={(e) => setParam(k, e.target.value)} />
                  </Field>
                ))}
              </div>
            </details>

            <div className="tms-sec">
              <div className="tms-sm" style={{ marginBottom: 8 }}>
                <b>{fmtKm(dist)}</b> · ETA ≈ {fmtDur(etaS)} · {draft.checkpoints.length} {t('routes.cp')}
              </div>
              <div className="tms-row">
                <button className="tms-btn pri" onClick={() => save(true)} disabled={!!busy}>{busy === 'save' ? t('loading') : t('save')}</button>
                <button className="tms-btn" onClick={onClose}>{t('cancel')}</button>
                <span className="tms-grow" />
                <button className="tms-btn sm" onClick={syncZone} disabled={!!busy} title={t('routes.zoneHelp')}>
                  {draft.zoneId ? t('routes.zoneUpdate') : t('routes.zoneCreate')}
                </button>
              </div>
            </div>
          </div>
        </div>
        <MapBox mapRef={mapRef} />
      </div>
    </div>
  );
}
