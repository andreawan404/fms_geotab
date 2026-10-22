import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Empty, Kpi, Modal, Spinner } from '../components/ui.jsx';
import NotifyDialog from '../components/NotifyDialog.jsx';
import DispatchDialog from '../components/DispatchDialog.jsx';
import { ALL_KINDS } from '../core/exceptions.js';
import { fmtDateTime } from '../core/time.js';
import { SEV_CLS, excDetail } from '../lib/excView.js';
import { apiErrorText } from '../lib/orderView.js';

const STATES = ['open', 'handled', 'cleared', 'all'];

/** Exception management: kejadian menyimpang dari DO (terlambat, mogok, selisih qty, dll.). Diperbarui otomatis tiap 60 detik. */
export default function ExceptionsPage({ onCount }) {
  const { t, ordersApi, toast } = useApp();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('open');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [act, setAct] = useState(null); // { e, action }
  const [note, setNote] = useState('');
  const [dsp, setDsp] = useState(null);
  const [ntf, setNtf] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await ordersApi.insights.exceptions({ status, kind, q });
      setData(r); setErr(''); onCount?.(r.counts.open);
    } catch (e) { setErr(apiErrorText(t, e)); setData((d) => d || { exceptions: [], counts: {} }); }
  }, [ordersApi, status, kind, q, t, onCount]);
  useEffect(() => { const h = setTimeout(load, q ? 250 : 0); return () => clearTimeout(h); }, [load, q]);
  useEffect(() => { const i = setInterval(load, 60000); return () => clearInterval(i); }, [load]);

  const submit = async () => {
    try {
      await ordersApi.insights.act(act.action, act.e.id, note);
      toast(t(`exc.done.${act.action}`));
      setAct(null); setNote(''); load();
    } catch (e) { toast(apiErrorText(t, e), 'err'); }
  };
  const c = data?.counts || {};
  return (
    <div className="tms-page">
      <div className="tms-row" style={{ marginBottom: 10 }}>
        <h2 className="tms-grow">{t('exc.title')}</h2>
        <button className="tms-btn" onClick={() => setNtf(true)}>🔔 {t('ntf.btn')}</button>
        <button className="tms-btn sm" onClick={load} title={t('refresh')}>↻</button>
      </div>
      <div className="tms-sm tms-muted" style={{ marginBottom: 8 }}>{t('exc.hint')}</div>
      {err && <div className="tms-banner" style={{ margin: '0 0 10px' }}>{err}</div>}
      <div className="tms-kpis">
        <Kpi label={t('exc.sev.high')} value={c.high ?? 0} tone={c.high ? 'bad' : ''} />
        <Kpi label={t('exc.sev.medium')} value={c.medium ?? 0} />
        <Kpi label={t('exc.sev.low')} value={c.low ?? 0} />
        <Kpi label={t('exc.state.handled')} value={c.handled ?? 0} />
        <Kpi label={t('exc.state.cleared')} value={c.cleared ?? 0} tone="good" sub={t('exc.last30')} />
      </div>
      <div className="tms-row" style={{ marginBottom: 8 }}>
        <div className="tms-chips" style={{ padding: 0 }}>
          {STATES.map((s) => <button key={s} className={`tms-chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{t(`exc.state.${s}`)}</button>)}
        </div>
        <select style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">{t('exc.allKinds')}</option>
          {ALL_KINDS.map((k) => <option key={k} value={k}>{t(`exc.kind.${k}`)}</option>)}
        </select>
        <span className="tms-grow" />
        <input type="search" placeholder={t('exc.search')} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
      </div>
      {!data ? <Spinner /> : data.exceptions.length === 0 ? <Empty>{t('exc.empty')}</Empty> : (
        <div className="tms-tablewrap">
          <table>
            <thead><tr><th>{t('exc.severity')}</th><th>{t('exc.type')}</th><th>{t('ord.doNo')}</th><th>{t('pod.vendor')}</th><th>{t('exc.detail')}</th><th>{t('exc.since')}</th><th>{t('mon.status')}</th><th /></tr></thead>
            <tbody>
              {data.exceptions.map((e) => (
                <tr key={e.id}>
                  <td><span className={`tms-badge ${SEV_CLS[e.severity]}`}>{t(`exc.sev.${e.severity}`)}</span></td>
                  <td><b>{t(`exc.kind.${e.kind}`)}</b>{e.source === 'vendor' && <div className="tms-sm tms-muted">{t('exc.byVendor')}</div>}</td>
                  <td><a href="#" onClick={(ev) => { ev.preventDefault(); setDsp(e.orderId); }}><b>{e.doNo}</b></a><div className="tms-sm tms-muted">{e.customer}</div></td>
                  <td>{e.vendorName || '-'}<div className="tms-sm tms-muted">{e.plate}</div></td>
                  <td style={{ minWidth: 280, maxWidth: 380, whiteSpace: 'normal' }}>{excDetail(t, e)}{e.ackNote && <div className="tms-sm tms-muted">↳ {e.ackBy}: {e.ackNote}</div>}</td>
                  <td>{fmtDateTime(e.createdAt)}</td>
                  <td><span className={`tms-badge ${e.state === 'open' ? 'amber' : e.state === 'handled' ? 'blue' : 'green'}`}>{t(`exc.state.${e.state}`)}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {e.state === 'open' && <button className="tms-btn sm" onClick={() => { setAct({ e, action: 'ack' }); setNote(''); }}>{t('exc.act.ack')}</button>}
                    {e.state === 'handled' && <button className="tms-btn sm" onClick={() => { setAct({ e, action: 'unack' }); setNote(''); }}>{t('exc.act.unack')}</button>}
                    {e.state !== 'cleared' && <button className="tms-btn sm" onClick={() => { setAct({ e, action: 'resolve' }); setNote(''); }}>{t('exc.act.resolve')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {act && (
        <Modal title={`${t(`exc.act.${act.action}`)} · ${act.e.doNo}`} onClose={() => setAct(null)}
          footer={<><button className="tms-btn" onClick={() => setAct(null)}>{t('cancel')}</button><button className="tms-btn pri" onClick={submit}>{t(`exc.act.${act.action}`)}</button></>}>
          <div className="tms-sm" style={{ marginBottom: 8 }}><b>{t(`exc.kind.${act.e.kind}`)}</b> — {excDetail(t, act.e)}</div>
          {act.action !== 'unack' && (
            <>
              <label className="tms-sm">{t('exc.note')}</label>
              <input className="tms-input" style={{ width: '100%' }} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t('exc.notePh')} autoFocus />
              {act.action === 'resolve' && <div className="tms-sm tms-muted" style={{ marginTop: 6 }}>{t('exc.resolveHint')}</div>}
            </>
          )}
        </Modal>
      )}
      {ntf && <NotifyDialog onClose={() => setNtf(false)} />}
      {dsp && <DispatchDialog orderId={dsp} onClose={() => setDsp(null)} onChanged={load} />}
    </div>
  );
}
