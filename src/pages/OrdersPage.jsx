import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Empty, Kpi, Spinner } from '../components/ui.jsx';
import DispatchDialog from '../components/DispatchDialog.jsx';
import OrderReport from '../components/OrderReport.jsx';
import OrderEditor from '../components/OrderEditor.jsx';
import OrderImport, { downloadTemplate } from '../components/OrderImport.jsx';
import { ORDER_STATUS } from '../core/orders.js';
import { totalSteps } from '../core/trip.js';
import { STATUS_CLS, apiErrorText, fmtNum } from '../lib/orderView.js';

const PAGE = 50;

function Setup({ h }) {
  const { t } = useApp();
  if (!h || h.ok) return null;
  return (
    <div className="tms-banner" style={{ margin: '0 0 10px' }}>
      <b>{t('ord.setup.title')}</b>
      <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
        {h.db === 'not_configured' && <li>{t('ord.setup.db')}</li>}
        {h.db === 'error' && <li>{t('ord.setup.dbErr')}: {h.dbError}</li>}
        {h.auth && h.auth !== 'configured' && <li>{t('ord.setup.auth')}</li>}
      </ul>
    </div>
  );
}

/** Daftar DO: filter status/cari, buat, ubah, import Excel. */
export default function OrdersPage() {
  const { t, ordersApi, toast } = useApp();
  const [data, setData] = useState({ orders: [], total: 0, counts: {} });
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [health, setHealth] = useState(null);
  const [edit, setEdit] = useState(null); // null | 'new' | id
  const [imp, setImp] = useState(false);
  const [dsp, setDsp] = useState(null);
  const [rpt, setRpt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await ordersApi.list({ status, q, limit, source: 'internal' }));
    } catch (e) {
      setError(apiErrorText(t, e));
    }
    setLoading(false);
  }, [ordersApi, status, q, limit, t]);

  useEffect(() => {
    const h = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(h);
  }, [load, q]);
  useEffect(() => {
    ordersApi.health().then(setHealth).catch(() => setHealth({ ok: false, db: 'error', dbError: t('ord.api.network') }));
  }, [ordersApi, t]);

  const remove = async (o, e) => {
    e.stopPropagation();
    if (!window.confirm(t('ord.confirmDelete', { no: o.doNo }))) return;
    try {
      await ordersApi.remove(o.id);
      toast(t('ord.deleted', { no: o.doNo }));
      load();
    } catch (ex) {
      toast(apiErrorText(t, ex), 'err');
    }
  };

  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
  return (
    <div className="tms-page">
      <div className="tms-row" style={{ marginBottom: 10 }}>
        <h2 className="tms-grow">{t('ord.title')}</h2>
        <button className="tms-btn sm" onClick={downloadTemplate}>⬇ {t('imp.template')}</button>
        <button className="tms-btn" onClick={() => setImp(true)}>{t('imp.title')}</button>
        <button className="tms-btn pri" onClick={() => setEdit('new')}>+ {t('ord.new')}</button>
        <button className="tms-btn sm" onClick={load} title={t('refresh')}>↻</button>
      </div>
      <Setup h={health} />
      {error && <div className="tms-banner" style={{ margin: '0 0 10px' }}>{error}</div>}

      <div className="tms-kpis">
        <Kpi label={t('ord.total')} value={total} />
        <Kpi label={t('ord.status.draft')} value={data.counts.draft || 0} />
        <Kpi label={t('ord.status.offered')} value={data.counts.offered || 0} />
        <Kpi label={t('ord.status.running')} value={data.counts.running || 0} />
        <Kpi label={t('ord.status.done')} value={data.counts.done || 0} tone="good" />
      </div>

      <div className="tms-row" style={{ marginBottom: 8 }}>
        <div className="tms-chips" style={{ padding: 0 }}>
          <button className={`tms-chip ${status === '' ? 'on' : ''}`} onClick={() => setStatus('')}>{t('state.all')} {total}</button>
          {ORDER_STATUS.map((s) => (
            <button key={s} className={`tms-chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{t(`ord.status.${s}`)} {data.counts[s] || 0}</button>
          ))}
        </div>
        <span className="tms-grow" />
        <input type="search" placeholder={t('ord.search')} value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} style={{ width: 260 }} />
      </div>

      <div className="tms-tablewrap">
        <table>
          <thead>
            <tr>
              <th>{t('ord.doNo')}</th><th>{t('ord.customer')}</th><th>{t('ord.date')}</th><th>{t('ord.priority')}</th><th>{t('mon.status')}</th><th>{t('ord.route')}</th>
              <th className="num">{t('ord.stopsShort')}</th><th className="num">{t('ord.sum.peakWeight')} (kg)</th><th className="num">{t('ord.sum.peakVolume')} (m³)</th><th className="num">{t('ord.sum.pallets')}</th><th>{t('ord.flags')}</th><th>{t('dsp.allocation')}</th><th />
            </tr>
          </thead>
          <tbody>
            {loading && data.orders.length === 0 && <tr><td colSpan={13}><Spinner text={t('loading')} /></td></tr>}
            {!loading && data.orders.length === 0 && <tr><td colSpan={13}><Empty>{t('ord.empty')}</Empty></td></tr>}
            {data.orders.map((o) => {
              const s = o.summary || {};
              return (
                <tr key={o.id} className="click" onClick={() => setEdit(o.id)}>
                  <td><b>{o.doNo}</b></td>
                  <td>{o.customer}</td>
                  <td>{o.orderDate}</td>
                  <td>{o.priority !== 'normal' ? <span className={`tms-badge ${o.priority === 'urgent' ? 'red' : 'amber'}`}>{t(`ord.prio.${o.priority}`)}</span> : <span className="tms-muted">{t('ord.prio.normal')}</span>}</td>
                  <td><span className={`tms-badge ${STATUS_CLS[o.status] || 'gray'}`}>{t(`ord.status.${o.status}`)}</span></td>
                  <td className="tms-route">{s.origin} → {s.destination}{s.stops > 2 ? <span className="tms-muted"> ({t('ord.viaN', { n: s.stops - 2 })})</span> : null}</td>
                  <td className="num">{s.stops}</td>
                  <td className="num">{fmtNum(s.peakWeight, 1)}</td>
                  <td className="num">{fmtNum(s.peakVolume, 2)}</td>
                  <td className="num">{fmtNum(s.peakPallets, 1)}</td>
                  <td>{s.hazardous && <span className="tms-badge red">B3</span>} {s.tempMin != null || s.tempMax != null ? <span className="tms-badge blue">°C</span> : null}</td>
                  <td>
                    {o.vendorName ? <div><b>{o.vendorName}</b><div className="tms-sm tms-muted">{o.plate}{o.driverName ? ` · ${o.driverName}` : ''}</div>
                      {o.tripEvents > 0 && <div className="tms-sm"><span className={`tms-badge ${o.status === 'done' ? 'green' : 'blue'}`}>{t('trip.progress', { p: Math.round((o.tripEvents / totalSteps((o.summary || {}).stops || 2)) * 100) })}</span></div>}</div>
                      : o.status === 'offered' ? (o.openOffers > 0 ? <span className="tms-badge blue">{t('dsp.waiting', { n: o.openOffers })}</span> : <span className="tms-badge red">{t('dsp.noResponse')}</span>) : <span className="tms-muted">-</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {['draft', 'offered', 'assigned'].includes(o.status) && <button className="tms-btn sm pri" onClick={(e) => { e.stopPropagation(); setDsp(o.id); }}>{o.status === 'assigned' ? t('dsp.detail') : t('dsp.allocate')}</button>}{' '}
                    {['running', 'done'].includes(o.status) && <button className="tms-btn sm" onClick={(e) => { e.stopPropagation(); setRpt(o.id); }}>{t('ordrep.open')}</button>}{' '}
                    {o.status === 'draft' && <button className="tms-btn sm danger" onClick={(e) => remove(o, e)}>{t('delete')}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.total > data.orders.length && (
        <div style={{ marginTop: 8 }}><button className="tms-btn sm" onClick={() => setLimit(limit + PAGE)}>{t('hist.more', { n: data.total - data.orders.length })}</button></div>
      )}

      {rpt && <OrderReport orderId={rpt} onClose={() => setRpt(null)} />}
      {dsp && <DispatchDialog orderId={dsp} onClose={() => setDsp(null)} onChanged={load} />}
      {edit && <OrderEditor id={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={load} />}
      {imp && <OrderImport onClose={() => setImp(false)} onDone={load} existing={new Set(data.orders.map((o) => o.doNo))} />}
    </div>
  );
}
