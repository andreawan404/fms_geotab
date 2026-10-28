import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Modal, Spinner } from './ui.jsx';
import { portalBase } from '../services/ordersApi.js';
import { buildOrderReportHtml } from '../lib/orderReport.js';
import { buildEta } from '../core/eta.js';
import { estimateCost, tollClassOf } from '../core/cost.js';
import { computeOrderFuel } from '../services/fuelDo.js';
import { routeIdOf } from '../core/linkPlan.js';
import { excDetail } from '../lib/excView.js';
import { apiErrorText } from '../lib/orderView.js';

/** Laporan DO siap cetak A4. Angka biaya & BBM dihitung sekali lalu disimpan sebagai snapshot (tombol "Hitung ulang" untuk memperbarui). */
export default function OrderReport({ orderId, onClose }) {
  const { t, ordersApi, toast, routes, settings, geotab, sensorWindows, vehicleEconomy } = useApp();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const frame = useRef(null);

  const build = useCallback(async (recalc) => {
    const order = await ordersApi.get(orderId);
    const [disp, vehicles, exc] = await Promise.all([
      ordersApi.dispatch.get(orderId), ordersApi.master.list('vehicles'),
      ordersApi.insights.exceptions({ status: 'all', q: order.doNo }).catch(() => ({ exceptions: [] })),
    ]);
    const pods = (await Promise.all((disp.pods || []).map((p) => ordersApi.pod.get(p.id).catch(() => null)))).filter(Boolean)
      .sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));
    const route = (routes || []).find((r) => r.id === routeIdOf(order.id)) || null;
    const veh = (vehicles || []).find((v) => v.id === order.vehicleId) || null;
    const events = disp.trip?.events || [];
    let { cost, fuel } = order;
    const save = {};
    if (route && (recalc || !cost)) {
      let kmPerL = Number(veh?.fuelKmPerL) > 0 ? Number(veh.fuelKmPerL) : null;
      if (veh?.geotabDeviceId && vehicleEconomy) { const r = await vehicleEconomy(veh.geotabDeviceId).catch(() => null); if (r?.kmPerL) kmPerL = r.kmPerL; }
      const cls = tollClassOf(veh);
      const est = estimateCost({ distanceM: route.distanceM, tollM: route.tollM, kmPerL, tollClass: cls, cost: settings.cost });
      cost = { ...est, kmPerL, tollClass: cls, fuelPriceRp: Number(settings.cost?.fuelPriceRp) || null, durS: route.durationS || null };
      save.cost = cost;
    }
    if (events.length && (recalc || !fuel) && veh?.geotabDeviceId) {
      const first = events[0].at; const last = events[events.length - 1].at;
      const done = order.status === 'done';
      const r = await computeOrderFuel({ geotab, sensorWindows, order: { deviceId: veh.geotabDeviceId, stops: [{ arriveAt: first }, { arriveAt: last }], arrived: done ? 2 : 0, total: 2, kg: order.summary?.peakWeight } }).catch(() => ({ ok: false }));
      if (r.ok) { fuel = { ...r.fuel, source: 'sensor' }; save.fuel = fuel; }
    }
    if (save.cost || save.fuel) await ordersApi.dispatch.saveCalc(orderId, save).catch(() => {});
    const eta = route?.checkpoints?.length > 1 ? buildEta(route.checkpoints, { offsets: route.checkpoints.map((c) => c.etaOffsetS || 0), exact: false }) : null;
    if (eta && route.distanceM) eta.totalM = route.distanceM;
    if (eta && route.durationS) eta.totalS = route.durationS;
    return { order, route, trip: disp.trip, pods, cost, fuel, eta, exceptions: (exc.exceptions || []).filter((e) => e.orderId === orderId) };
  }, [ordersApi, orderId, routes, settings, geotab, sensorWindows, vehicleEconomy]);

  const run = useCallback((recalc) => {
    setBusy(true);
    return build(recalc).then((d) => { setData(d); setErr(''); }).catch((e) => setErr(apiErrorText(t, e))).finally(() => setBusy(false));
  }, [build, t]);
  useEffect(() => { run(false); }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const html = useMemo(() => {
    if (!data) return '';
    const host = (typeof window !== 'undefined' && window.TMS_CONFIG && window.TMS_CONFIG.hostUrl) || '';
    return buildOrderReportHtml({ ...data, base: portalBase() || location.origin, logoUrl: `${host || location.origin}/logo.svg`, tileUrl: settings.tileUrl || '', t, excText: (e) => excDetail(t, e) });
  }, [data, t, settings.tileUrl]);
  const print = () => { const w = frame.current?.contentWindow; if (w) { w.focus(); w.print(); } };

  return (
    <Modal title={`${t('ordrep.title')}${data ? ` · ${data.order.doNo}` : ''}`} onClose={onClose} xwide footer={<button className="tms-btn" onClick={onClose}>{t('close')}</button>}>
      {err && <div className="tms-banner err">{err}</div>}
      {!data && !err && <Spinner text={t('loading')} />}
      {data && (
        <>
          <div className="tms-row" style={{ marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
            <button className="tms-btn primary" onClick={print} disabled={busy}>{t('ordrep.print')}</button>
            <button className="tms-btn" onClick={async () => { await run(true); toast(t('ordrep.recalced')); }} disabled={busy}>{t('ordrep.recalc')}</button>
            <span className="tms-sm tms-muted">{t('ordrep.printHint')}</span>
          </div>
          <iframe ref={frame} title="DO report" srcDoc={html} sandbox="allow-same-origin allow-modals" style={{ width: '100%', height: '66vh', border: '1px solid #d9dee5', borderRadius: 8, background: '#fff' }} />
        </>
      )}
    </Modal>
  );
}
