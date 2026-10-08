import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createGeotab, errMessage } from './services/geotab.js';
import { createStore, DEFAULT_SETTINGS } from './services/store.js';
import { Monitor } from './services/monitor.js';
import { evaluateInstance } from './core/tracking.js';
import { engineRoute, routeVersion } from './lib/engineRoute.js';
import { makeT } from './i18n.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

function beep() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'square';
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.25);
  } catch {
    /* audio tidak tersedia */
  }
}

export function AppProvider({ api, addInId, active = true, seed, children }) {
  const geotab = useMemo(() => createGeotab(api), [api]);
  const store = useMemo(() => createStore(geotab, addInId), [geotab, addInId]);
  const monitor = useRef(new Monitor()).current;

  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem('tms.lang') || 'id';
    } catch {
      return 'id';
    }
  });
  const t = useMemo(() => makeT(lang), [lang]);
  const setLang = (l) => {
    setLangState(l);
    try {
      localStorage.setItem('tms.lang', l);
    } catch {
      /* ignore */
    }
  };
  const [sound, setSoundState] = useState(() => {
    try {
      return localStorage.getItem('tms.sound') !== '0';
    } catch {
      return true;
    }
  });
  const setSound = (v) => {
    setSoundState(v);
    try {
      localStorage.setItem('tms.sound', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const [data, setData] = useState({ settings: DEFAULT_SETTINGS, settingsRid: null, routes: [], assignments: [], alerts: [] });
  const [devices, setDevices] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [statuses, setStatuses] = useState(new Map());
  const [results, setResults] = useState(new Map());
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [toasts, setToasts] = useState([]);
  const [lastTick, setLastTick] = useState(null);

  const dataRef = useRef(data);
  dataRef.current = data;
  const devRef = useRef([]);
  devRef.current = devices;
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const seen = useRef(new Set());
  const busy = useRef(false);
  const evalCache = useRef(new Map());
  const rulesCache = useRef(null);

  const toast = useCallback((message, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((l) => [...l, { id, message, kind }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), kind === 'err' ? 8000 : 3500);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    const errs = {};
    const [d, dev, drv] = await Promise.all([
      store.load().catch((e) => {
        errs.store = errMessage(e);
        return null;
      }),
      geotab.getDevices().catch((e) => {
        errs.devices = errMessage(e);
        return [];
      }),
      geotab.getDrivers().catch(() => []),
    ]);
    let loaded = d || dataRef.current;
    if (d && seed && !d.routes.length) {
      try {
        await seed({ store, devices: dev, drivers: drv });
        loaded = await store.load();
      } catch (e) {
        errs.seed = errMessage(e);
      }
    }
    seen.current = new Set(loaded.alerts.map((a) => a.key));
    setData(loaded);
    setDevices(dev);
    setDrivers(drv);
    setFeed(
      loaded.alerts.map((a) => ({ id: a.key, type: 'deviation_start', t: a.startMs, at: a.ts, deviceId: a.deviceId, routeId: a.routeId, instKey: a.instKey, distM: a.distM, lat: a.lat, lng: a.lng, persisted: true })),
    );
    monitor.reset();
    setErrors(errs);
    setLoading(false);
  }, [store, geotab, seed, monitor]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleEvents = useCallback(
    (events) => {
      const fresh = [];
      for (const e of events) {
        const id = `${e.instKey}:${e.type}:${e.t}`;
        if (seen.current.has(id)) continue;
        seen.current.add(id);
        fresh.push({ id, type: e.type, t: e.t, at: e.detectedAt || e.t, deviceId: e.deviceId, routeId: e.routeId, instKey: e.instKey, cpName: e.name, distM: e.distM, lat: e.lat, lng: e.lng });
      }
      if (!fresh.length) return;
      setFeed((f) => [...fresh, ...f].sort((a, b) => b.at - a.at).slice(0, 400));
      const now = Date.now();
      for (const it of fresh) {
        if (it.type !== 'deviation_start') continue;
        const device = devRef.current.find((d) => d.id === it.deviceId);
        const route = dataRef.current.routes.find((r) => r.id === it.routeId);
        if (now - it.at < 5 * 60000) {
          const msg = `${device?.name || it.deviceId} keluar rute ${route?.name || ''} (${Math.round(it.distM || 0)} m)`;
          if (soundRef.current) beep();
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('TMS Alert', { body: msg });
          } catch {
            /* ignore */
          }
          toast(msg, 'err');
        }
        store
          .saveAlert({ key: it.id, ts: it.at, deviceId: it.deviceId, routeId: it.routeId, instKey: it.instKey, startMs: it.t, distM: Math.round(it.distM || 0), lat: it.lat, lng: it.lng })
          .catch(() => {});
      }
    },
    [store, toast],
  );

  const tick = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const st = await geotab.getStatusInfo();
      setStatuses(new Map(st.map((s) => [s.deviceId, s])));
      const d = dataRef.current;
      const out = await monitor.tick({ geotab, assignments: d.assignments, routes: d.routes, settings: d.settings, nowMs: Date.now() });
      setResults(out.results);
      handleEvents(out.events);
      setLastTick(Date.now());
      setErrors((e) => (e.tick ? { ...e, tick: undefined } : e));
    } catch (e) {
      setErrors((x) => ({ ...x, tick: errMessage(e) }));
    } finally {
      busy.current = false;
    }
  }, [geotab, monitor, handleEvents]);

  useEffect(() => {
    if (!active || loading) return undefined;
    tick();
    const iv = setInterval(tick, Math.max(5, data.settings.pollSec) * 1000);
    return () => clearInterval(iv);
  }, [active, loading, data.settings.pollSec, data.routes, data.assignments, tick]);

  // ---- mutasi data ----
  const saveRoute = useCallback(
    async (route) => {
      const saved = await store.saveRoute(route);
      setData((d) => ({ ...d, routes: d.routes.some((r) => r.id === saved.id) ? d.routes.map((r) => (r.id === saved.id ? saved : r)) : [...d.routes, saved] }));
      return saved;
    },
    [store],
  );
  const deleteRoute = useCallback(
    async (route) => {
      const linked = dataRef.current.assignments.filter((a) => a.routeId === route.id);
      for (const a of linked) await store.deleteAssignment(a);
      await store.deleteRoute(route);
      setData((d) => ({ ...d, routes: d.routes.filter((r) => r.id !== route.id), assignments: d.assignments.filter((a) => a.routeId !== route.id) }));
    },
    [store],
  );
  const saveAssignment = useCallback(
    async (a) => {
      const saved = await store.saveAssignment(a);
      setData((d) => ({ ...d, assignments: d.assignments.some((x) => x.id === saved.id) ? d.assignments.map((x) => (x.id === saved.id ? saved : x)) : [...d.assignments, saved] }));
      return saved;
    },
    [store],
  );
  const deleteAssignment = useCallback(
    async (a) => {
      await store.deleteAssignment(a);
      setData((d) => ({ ...d, assignments: d.assignments.filter((x) => x.id !== a.id) }));
    },
    [store],
  );
  const saveSettings = useCallback(
    async (settings) => {
      const rid = await store.saveSettings(settings, dataRef.current.settingsRid);
      setData((d) => ({ ...d, settings, settingsRid: rid }));
      monitor.reset();
      evalCache.current.clear();
    },
    [store, monitor],
  );

  // ---- evaluasi instance (detail, report) ----
  const routeMap = useMemo(() => new Map(data.routes.map((r) => [r.id, r])), [data.routes]);
  const deviceMap = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices]);
  const driverMap = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);

  const evaluate = useCallback(
    async (inst, { withLogs = false } = {}) => {
      const route = dataRef.current.routes.find((r) => r.id === inst.routeId);
      if (!route) throw new Error('Rute tidak ditemukan');
      const key = `${inst.key}|${routeVersion(route)}`;
      const finished = inst.endMs < Date.now() - 5 * 60000;
      if (!withLogs && finished && evalCache.current.has(key)) return { result: evalCache.current.get(key) };
      const to = Math.min(Date.now(), inst.endMs);
      const logs = inst.startMs < to ? await geotab.getLogs(inst.deviceId, inst.startMs, to) : [];
      const result = evaluateInstance({ route: engineRoute(route, dataRef.current.settings), window: { startMs: inst.startMs, endMs: inst.endMs }, logs, nowMs: Date.now() });
      delete result.events;
      if (finished) evalCache.current.set(key, result);
      return { result, logs };
    },
    [geotab],
  );

  const getRules = useCallback(async () => {
    if (!rulesCache.current) rulesCache.current = await geotab.getRules().catch(() => ({}));
    return rulesCache.current;
  }, [geotab]);

  const value = {
    t,
    lang,
    setLang,
    sound,
    setSound,
    api,
    geotab,
    store,
    isMock: !!api.isMock,
    settings: data.settings,
    routes: data.routes,
    assignments: data.assignments,
    devices,
    drivers,
    deviceMap,
    driverMap,
    routeMap,
    statuses,
    results,
    feed,
    loading,
    errors,
    lastTick,
    active,
    toasts,
    toast,
    reload,
    tick,
    saveRoute,
    deleteRoute,
    saveAssignment,
    deleteAssignment,
    saveSettings,
    evaluate,
    getRules,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
