import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Modal, Spinner } from './ui.jsx';
import { dispatchBlockers, normalizeOrder, totals } from '../core/orders.js';
import { fittingVehicles, vehicleFit } from '../core/capacity.js';
import { fmtDateTime } from '../core/time.js';
import { stepKey } from '../core/trip.js';
import PodDocument from './PodDocument.jsx';
import { apiErrorText, fmtNum, issueText } from '../lib/orderView.js';

const OFFER_CLS = { offered: 'blue', accepted: 'green', rejected: 'red', expired: 'amber', withdrawn: 'gray' };

/** Alokasi DO: tawarkan ke beberapa vendor (siapa terima duluan menang) atau alokasi langsung ke kendaraan + driver. */
export default function DispatchDialog({ orderId, onClose, onChanged }) {
  const { t, ordersApi, toast } = useApp();
  const [order, setOrder] = useState(null);
  const [m, setM] = useState(null); // { vendors, vehicles, drivers }
  const [disp, setDisp] = useState({ offers: [], mail: {} });
  const [mode, setMode] = useState('offer');
  const [pick, setPick] = useState(new Set());
  const [expiry, setExpiry] = useState(60);
  const [d, setD] = useState({ vendorId: '', vehicleId: '', driverId: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [podId, setPodId] = useState(null);

  const load = useCallback(async () => {
    const [o, vendors, vehicles, drivers, dp] = await Promise.all([
      ordersApi.get(orderId), ordersApi.master.list('vendors'), ordersApi.master.list('vehicles'), ordersApi.master.list('drivers'), ordersApi.dispatch.get(orderId),
    ]);
    setOrder(o);
    setM({ vendors, vehicles, drivers });
    setDisp(dp);
  }, [ordersApi, orderId]);
  useEffect(() => {
    load().catch((e) => { toast(apiErrorText(t, e), 'err'); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const norm = useMemo(() => (order ? normalizeOrder(order) : null), [order]);
  const need = useMemo(() => (norm ? totals(norm) : null), [norm]);
  const blockers = useMemo(() => (norm ? dispatchBlockers(norm) : []), [norm]);

  const perVendor = useMemo(() => {
    if (!m || !need) return [];
    return m.vendors.map((v) => {
      const vs = m.vehicles.filter((x) => x.vendorId === v.id);
      const fits = fittingVehicles(vs, need);
      const best = fits[0];
      const nearest = !best && vs.length ? vs.map((x) => ({ x, f: vehicleFit(x, need) })).sort((a, b) => a.f.reasons.length - b.f.reasons.length)[0] : null;
      return { vendor: v, vehicles: vs, fits, best, nearest, hasEmail: !!String(v.email || '').trim() };
    });
  }, [m, need]);

  // pilihan awal broadcast: vendor yang punya kendaraan cocok dan email
  useEffect(() => {
    if (perVendor.length && pick.size === 0 && !result) setPick(new Set(perVendor.filter((x) => x.fits.length && x.hasEmail).map((x) => x.vendor.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perVendor.length]);

  const why = (r) => t(`dsp.why.${r.code}`, { need: fmtNum(r.need, 1), have: fmtNum(r.have, 1) });
  const run = async (fn, okMsg) => {
    setBusy(true);
    setErr('');
    try {
      const r = await fn();
      if (okMsg) toast(okMsg);
      await load();
      onChanged?.();
      return r;
    } catch (e) {
      setErr(e.code === 'not_ready' && Array.isArray(e.details) ? e.details.map((b) => t(`ord.block.${b.code}`, { n: b.n })).join('; ') : apiErrorText(t, e));
    } finally {
      setBusy(false);
    }
    return null;
  };

  const toggle = (id) => setPick((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sendOffer = async () => {
    const r = await run(() => ordersApi.dispatch.offer(orderId, [...pick], Number(expiry) || 60));
    if (r) setResult(r);
  };
  const dVendor = perVendor.find((x) => x.vendor.id === d.vendorId);
  const assign = () => run(() => ordersApi.dispatch.assign(orderId, d.vendorId, d.vehicleId, d.driverId || null), t('dsp.assigned'));
  const release = () => {
    if (!window.confirm(t('dsp.confirmRelease'))) return Promise.resolve();
    return run(() => ordersApi.dispatch.release(orderId), t('dsp.released'));
  };

  const canAllocate = order && ['draft', 'offered'].includes(order.status);
  const noResponse = order && order.status === 'offered' && order.openOffers === 0;

  return (
    <Modal wide onClose={onClose} title={`${t('dsp.title')} · ${order?.doNo || ''}`} footer={<button className="tms-btn" onClick={onClose}>{t('close')}</button>}>
      {!order || !m ? <Spinner text={t('loading')} /> : (
        <div className="tms-dsp">
          <div className="tms-dsp-need">
            <b>{order.customer}</b>
            <span>{t('ord.sum.peakWeight')}: <b>{fmtNum(need.peakWeight, 1)} kg</b></span>
            <span>{t('ord.sum.peakVolume')}: <b>{fmtNum(need.peakVolume, 2)} m³</b></span>
            <span>{t('ord.sum.pallets')}: <b>{fmtNum(need.peakPallets, 1)}</b></span>
            {(need.tempMin != null || need.tempMax != null) && <span className="tms-badge blue">{need.tempMin ?? '…'} – {need.tempMax ?? '…'} °C</span>}
            {need.hazardous && <span className="tms-badge red">B3</span>}
          </div>
          {err && <div className="tms-banner" style={{ margin: '8px 0' }}>{err}</div>}

          {order.status === 'assigned' && (
            <div className="tms-card" style={{ margin: '8px 0' }}>
              <div className="tms-card-b">
                <div className="tms-row">
                  <div className="tms-grow">
                    <span className="tms-badge green">{t('ord.status.assigned')}</span>{' '}
                    <b>{order.vendorName}</b> · {order.plate || '-'} · {order.driverName || t('dsp.noDriver')}
                    <div className="tms-sm tms-muted">{t(`dsp.via.${order.assignedVia || 'admin'}`)} · {fmtDateTime(order.assignedAt)}</div>
                  </div>
                  <button className="tms-btn danger" onClick={release} disabled={busy}>{t('dsp.release')}</button>
                </div>
              </div>
            </div>
          )}

          {disp.trip?.events?.length > 0 && (
            <div className="tms-card" style={{ margin: '8px 0' }}>
              <div className="tms-card-b">
                <b>{t('trip.title')}</b> <span className="tms-badge blue">{t('trip.progress', { p: Math.round((disp.trip.events.length / Math.max(1, disp.trip.steps.length)) * 100) })}</span>
                <ul className="tms-trip">
                  {[...disp.trip.events].reverse().map((e) => {
                    const st = disp.trip.steps[e.seq - 1];
                    const stop = st && st.stopIdx >= 0 ? order.stops[st.stopIdx] : null;
                    return (
                      <li key={e.seq}>
                        <time>{fmtDateTime(e.at)}</time>
                        <span>{st ? t(`trip.step.${stepKey(st)}`) : e.type}{stop ? ` · ${stop.name}` : ''}</span>
                        {e.outside && <span className="tms-badge amber">{t('trip.outside', { m: fmtNum(e.distM) })}</span>}
                        {e.lat != null && <a target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${e.lat},${e.lng}`}>GPS</a>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {disp.pods?.length > 0 && (
            <div className="tms-card" style={{ margin: '8px 0' }}>
              <div className="tms-card-b">
                <b>{t('pod.title')}</b>
                <ul className="tms-trip">
                  {disp.pods.map((p) => (
                    <li key={p.id}>
                      <time>{fmtDateTime(p.submittedAt)}</time>
                      <span>{p.stopName} · {p.receiverName}</span>
                      {p.hasDiff && <span className="tms-badge amber">{t('pod.diff')}</span>}
                      {p.outside && <span className="tms-badge amber">{t('trip.outside', { m: fmtNum(p.distM) })}</span>}
                      {p.amendments > 0 && <span className="tms-badge blue">{t('pod.nAmend', { n: p.amendments })}</span>}
                      <button className="tms-btn sm" onClick={() => setPodId(p.id)}>{t('pod.open')}</button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {canAllocate && blockers.length > 0 && (
            <div className="tms-banner" style={{ margin: '8px 0' }}>{t('dsp.notReady')}: {blockers.map((b) => t(`ord.block.${b.code}`, { n: b.n })).join('; ')}</div>
          )}
          {noResponse && <div className="tms-banner warn" style={{ margin: '8px 0' }}><b>{t('dsp.noResponse')}</b> {t('dsp.noResponseHint')}</div>}

          {canAllocate && (
            <>
              <div className="tms-chips" style={{ padding: 0, margin: '8px 0' }}>
                <button className={`tms-chip ${mode === 'offer' ? 'on' : ''}`} onClick={() => setMode('offer')}>{t('dsp.mode.offer')}</button>
                <button className={`tms-chip ${mode === 'direct' ? 'on' : ''}`} onClick={() => setMode('direct')}>{t('dsp.mode.direct')}</button>
                <span className="tms-grow" />
                {order.status === 'offered' && <button className="tms-btn sm danger" onClick={release} disabled={busy}>{t('dsp.withdraw')}</button>}
              </div>

              {mode === 'offer' && (
                <>
                  <div className="tms-sm tms-muted" style={{ marginBottom: 6 }}>{t('dsp.offerHint')}</div>
                  <div className="tms-tablewrap">
                    <table>
                      <thead><tr><th /><th>{t('mst.kind.vendors')}</th><th>{t('mst.f.email')}</th><th>{t('dsp.fit')}</th></tr></thead>
                      <tbody>
                        {perVendor.length === 0 && <tr><td colSpan={4} className="tms-muted" style={{ padding: 12 }}>{t('dsp.noVendors')}</td></tr>}
                        {perVendor.map(({ vendor, vehicles, fits, best, nearest, hasEmail }) => (
                          <tr key={vendor.id}>
                            <td style={{ width: 30 }}><input type="checkbox" checked={pick.has(vendor.id)} onChange={() => toggle(vendor.id)} disabled={!hasEmail} /></td>
                            <td><b>{vendor.name}</b><div className="tms-sm tms-muted">{vendor.pic}</div></td>
                            <td>{hasEmail ? <span className="tms-sm">{vendor.email}</span> : <span className="tms-badge amber">{t('mst.noEmail')}</span>}</td>
                            <td>
                              {fits.length > 0
                                ? <span className="tms-badge green">{t('dsp.fitN', { n: fits.length, m: vehicles.length })}</span>
                                : <span className="tms-badge red">{vehicles.length ? t('dsp.noFit') : t('dsp.noVehicles')}</span>}
                              {best && <span className="tms-sm tms-muted"> {t('dsp.bestVeh', { plate: best.vehicle.plate, pct: best.fit.util.weight ?? '-' })}</span>}
                              {nearest && <div className="tms-sm tms-muted">{nearest.x.plate}: {nearest.f.reasons.map(why).join(', ')}</div>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="tms-row" style={{ marginTop: 10 }}>
                    <label className="tms-sm">{t('dsp.expiry')}{' '}
                      <input type="number" min="5" max="1440" value={expiry} onChange={(e) => setExpiry(e.target.value)} style={{ width: 70, display: 'inline-block' }} /> {t('dsp.minutes')}
                    </label>
                    <span className="tms-grow" />
                    <button className="tms-btn pri" disabled={busy || pick.size === 0 || blockers.length > 0} onClick={sendOffer}>{busy ? t('saving') : t('dsp.send', { n: pick.size })}</button>
                  </div>
                  {result && (
                    <div className="tms-card" style={{ marginTop: 10 }}>
                      <div className="tms-card-b">
                        <b>{t('dsp.sentTitle')}</b>
                        {!result.mail?.configured && <div className="tms-sm" style={{ color: '#7a5a00', margin: '4px 0' }}>{t('dsp.mailOff')}</div>}
                        {result.emails.map((e) => (
                          <div key={e.vendorId} className="tms-sm">{e.vendorName}: <span className={`tms-badge ${e.status === 'sent' ? 'green' : e.status === 'failed' ? 'red' : 'amber'}`}>{t(`dsp.mail.${e.status}`)}</span> {e.error && <span className="tms-muted">{e.error}</span>}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {mode === 'direct' && (
                <div className="tms-form3">
                  <label className="tms-field"><span className="tms-field-label">{t('mst.f.vendorId')}</span>
                    <select value={d.vendorId} onChange={(e) => setD({ vendorId: e.target.value, vehicleId: '', driverId: '' })}>
                      <option value="">-</option>
                      {perVendor.map((x) => <option key={x.vendor.id} value={x.vendor.id}>{x.vendor.name}</option>)}
                    </select>
                  </label>
                  <label className="tms-field"><span className="tms-field-label">{t('dsp.vehicle')}</span>
                    <select value={d.vehicleId} onChange={(e) => setD({ ...d, vehicleId: e.target.value })} disabled={!dVendor}>
                      <option value="">-</option>
                      {(dVendor?.vehicles || []).map((x) => {
                        const f = vehicleFit(x, need);
                        return <option key={x.id} value={x.id} disabled={!f.ok}>{x.plate} · {t(`mst.vt.${x.type}`)} · {fmtNum(x.maxWeightKg)} kg{f.ok ? ` (${f.util.weight ?? '-'}%)` : ` ✕ ${f.reasons.map(why).join(', ')}`}</option>;
                      })}
                    </select>
                  </label>
                  <label className="tms-field"><span className="tms-field-label">{t('dsp.driver')}</span>
                    <select value={d.driverId} onChange={(e) => setD({ ...d, driverId: e.target.value })} disabled={!dVendor}>
                      <option value="">{t('dsp.noDriver')}</option>
                      {m.drivers.filter((x) => x.vendorId === d.vendorId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </label>
                  <div style={{ gridColumn: '1/-1', textAlign: 'right' }}>
                    <button className="tms-btn pri" disabled={busy || !d.vendorId || !d.vehicleId || blockers.length > 0} onClick={assign}>{t('dsp.assign')}</button>
                  </div>
                </div>
              )}
            </>
          )}

          <h4 style={{ margin: '14px 0 4px' }}>{t('dsp.history')}</h4>
          {!disp.mail?.configured && <div className="tms-sm tms-muted" style={{ marginBottom: 4 }}>{t('dsp.mailOff')}</div>}
          <div className="tms-tablewrap">
            <table>
              <thead><tr><th>{t('mst.kind.vendors')}</th><th>{t('mon.status')}</th><th>{t('dsp.sentAt')}</th><th>{t('dsp.expiresAt')}</th><th>{t('dsp.respondedAt')}</th><th>{t('dsp.note')}</th></tr></thead>
              <tbody>
                {disp.offers.length === 0 && <tr><td colSpan={6} className="tms-muted" style={{ padding: 10 }}>{t('dsp.noOffers')}</td></tr>}
                {disp.offers.map((o) => (
                  <tr key={o.id}>
                    <td>{o.vendorName}</td>
                    <td><span className={`tms-badge ${OFFER_CLS[o.status] || 'gray'}`}>{t(`dsp.os.${o.status}`)}</span></td>
                    <td>{fmtDateTime(o.sentAt)}</td><td>{fmtDateTime(o.expiresAt)}</td><td>{o.respondedAt ? fmtDateTime(o.respondedAt) : '-'}</td>
                    <td>{o.rejectReason || (o.plate ? `${o.plate}${o.driverName ? ` · ${o.driverName}` : ''}` : '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {podId && <PodDocument podId={podId} onClose={() => setPodId(null)} onChanged={load} />}
    </Modal>
  );
}
