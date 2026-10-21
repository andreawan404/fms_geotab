import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Empty, Spinner } from '../components/ui.jsx';
import PodDocument from '../components/PodDocument.jsx';
import { fmtDateTime } from '../core/time.js';
import { apiErrorText } from '../lib/orderView.js';

/** Bukti POP (pickup) & POD (delivery) dari semua DO: cari, filter, buka dokumen. */
export default function EvidencePage() {
  const { t, ordersApi } = useApp();
  const [rows, setRows] = useState(null);
  const [kind, setKind] = useState('');
  const [days, setDays] = useState(30);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setErr('');
    try { setRows(await ordersApi.pod.list({ kind, q, days })); } catch (e) { setErr(apiErrorText(t, e)); setRows([]); }
  }, [ordersApi, kind, q, days, t]);
  useEffect(() => { const h = setTimeout(load, q ? 250 : 0); return () => clearTimeout(h); }, [load, q]);

  const n = (k) => (rows || []).filter((r) => r.kind === k).length;
  return (
    <div className="tms-page">
      <div className="tms-row" style={{ marginBottom: 10 }}>
        <h2 className="tms-grow">{t('evd.title')}</h2>
        <button className="tms-btn sm" onClick={load} title={t('refresh')}>↻</button>
      </div>
      <div className="tms-sm tms-muted" style={{ marginBottom: 8 }}>{t('evd.hint')}</div>
      {err && <div className="tms-banner" style={{ margin: '0 0 10px' }}>{err}</div>}
      <div className="tms-row" style={{ marginBottom: 8 }}>
        <div className="tms-chips" style={{ padding: 0 }}>
          <button className={`tms-chip ${kind === '' ? 'on' : ''}`} onClick={() => setKind('')}>{t('state.all')}</button>
          <button className={`tms-chip ${kind === 'pickup' ? 'on' : ''}`} onClick={() => setKind('pickup')}>POP · {t('evd.pickup')}</button>
          <button className={`tms-chip ${kind === 'delivery' ? 'on' : ''}`} onClick={() => setKind('delivery')}>POD · {t('evd.delivery')}</button>
        </div>
        <select style={{ width: "auto" }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[1, 7, 30, 90].map((d) => <option key={d} value={d}>{t('evd.days', { d })}</option>)}
        </select>
        <span className="tms-grow" />
        <input type="search" placeholder={t('evd.search')} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />
      </div>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>{t('evd.empty')}</Empty> : (
        <>
          <div className="tms-sm tms-muted" style={{ marginBottom: 6 }}>{t('evd.count', { n: rows.length, pop: n('pickup'), pod: n('delivery') })}</div>
          <div className="tms-tablewrap">
            <table>
              <thead><tr><th>{t('evd.type')}</th><th>{t('ord.doNo')}</th><th>{t('ord.customer')}</th><th>{t('pod.stop')}</th><th>{t('evd.person')}</th><th>{t('pod.vendor')}</th><th>{t('pod.vehicle')}</th><th>{t('pod.submitted')}</th><th>{t('evd.notes')}</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setOpen(r.id)} style={{ cursor: 'pointer' }}>
                    <td><span className={`tms-badge ${r.kind === 'pickup' ? 'blue' : 'green'}`}>{r.kind === 'pickup' ? 'POP' : 'POD'}</span></td>
                    <td><b>{r.doNo}</b></td><td>{r.customer}</td><td>{r.stopName}</td><td>{r.receiverName}</td><td>{r.vendorName}</td><td>{r.plate}</td><td>{fmtDateTime(r.submittedAt)}</td>
                    <td>
                      {r.hasDiff && <span className="tms-badge amber">{t('pod.diff')}</span>}{' '}
                      {r.outside && <span className="tms-badge amber">{t('evd.outside')}</span>}{' '}
                      {r.amendments > 0 && <span className="tms-badge blue">{t('pod.nAmend', { n: r.amendments })}</span>}{' '}
                      {r.purged && <span className="tms-badge gray">{t('evd.purged')}</span>}
                    </td>
                    <td><button className="tms-btn sm" onClick={(e) => { e.stopPropagation(); setOpen(r.id); }}>{t('pod.open')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {open && <PodDocument podId={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
