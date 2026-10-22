import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Empty, Spinner } from '../components/ui.jsx';
import ConnectorEditor from '../components/ConnectorEditor.jsx';
import { fmtDateTime } from '../core/time.js';
import { STATUS_CLS, apiErrorText } from '../lib/orderView.js';

/** Integrasi TMS customer: pilih mode, atur konektor penarik DO, lihat DO yang masuk. */
export default function IntegrationPage({ mode, onMode }) {
  const { t, ordersApi, toast, devices, linkState, runLink } = useApp();
  const [aliasSel, setAliasSel] = useState({});
  const [linking, setLinking] = useState(false);
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [edit, setEdit] = useState(null); // null | {} (baru) | konektor
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [d, o] = await Promise.all([ordersApi.integration.list(), ordersApi.integration.orders()]);
      setData(d); setOrders(o.orders || []); setErr('');
    } catch (e) { setErr(apiErrorText(t, e)); setData((x) => x || { connectors: [], encryption: true }); }
  }, [ordersApi, t]);
  useEffect(() => { load(); }, [load]);

  const run = async (c) => {
    setBusy(c.id);
    try {
      const r = await ordersApi.integration.run(c.id);
      toast(t('int.ran', { n: r.fetched, c: r.created, u: r.updated }));
    } catch (e) { toast(apiErrorText(t, e), 'err'); }
    setBusy(''); load();
  };
  const remove = async (c) => {
    if (!window.confirm(t('int.confirmDelete', { name: c.name }))) return;
    try { await ordersApi.integration.remove(c.id); load(); } catch (e) { toast(apiErrorText(t, e), 'err'); }
  };
  const toggle = async (c) => {
    try { await ordersApi.integration.save({ id: c.id, name: c.name, baseUrl: c.baseUrl, authType: c.authType, authName: c.authName, config: c.config, intervalMin: c.intervalMin, enabled: !c.enabled }); load(); } catch (e) { toast(apiErrorText(t, e), 'err'); }
  };
  const changeMode = async (m) => {
    try { await ordersApi.integration.setMode(m); onMode(m); toast(t('int.modeSaved')); } catch (e) { toast(apiErrorText(t, e), 'err'); }
  };

  const linkNow = async () => { setLinking(true); await runLink(); setLinking(false); load(); };
  const saveAlias = async (u) => {
    const dev = aliasSel[u.orderId];
    if (!dev) return;
    try { await ordersApi.integration.setAlias(u.plate, dev); toast(t('int.aliasSaved')); await linkNow(); } catch (e) { toast(apiErrorText(t, e), 'err'); }
  };

  return (
    <div className="tms-page">
      <div className="tms-row" style={{ marginBottom: 10 }}>
        <h2 className="tms-grow">{t('int.title')}</h2>
        <button className="tms-btn pri" onClick={() => setEdit({})}>+ {t('int.new')}</button>
        <button className="tms-btn sm" onClick={load} title={t('refresh')}>↻</button>
      </div>
      <div className="tms-sm tms-muted" style={{ marginBottom: 10 }}>{t('int.hint')}</div>
      {err && <div className="tms-banner" style={{ margin: '0 0 10px' }}>{err}</div>}
      {data && !data.encryption && <div className="tms-banner" style={{ margin: '0 0 10px' }}>{t('int.noEnc')}</div>}

      <div className="tms-card" style={{ marginBottom: 12 }}><div className="tms-card-b">
        <b>{t('int.mode')}</b>
        <div className="tms-row" style={{ gap: 16, marginTop: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {['full', 'monitor'].map((m) => (
            <label key={m} style={{ flex: '1 1 320px', border: `1px solid ${mode === m ? '#0b5fa5' : '#d9dee5'}`, background: mode === m ? '#eef5fc' : '#fff', borderRadius: 8, padding: 10, cursor: 'pointer' }}>
              <input type="radio" name="mode" checked={mode === m} onChange={() => changeMode(m)} /> <b>{t(`int.mode.${m}`)}</b>
              <div className="tms-sm tms-muted">{t(`int.mode.${m}Desc`)}</div>
            </label>
          ))}
        </div>
      </div></div>

      <div className="tms-card" style={{ marginBottom: 12 }}><div className="tms-card-b">
        <div className="tms-row" style={{ gap: 8 }}>
          <b className="tms-grow">{t('int.link')}</b>
          <button className="tms-btn sm" disabled={linking} onClick={linkNow}>{linking ? '…' : t('int.linkNow')}</button>
        </div>
        <div className="tms-sm tms-muted">{t('int.linkHint')}</div>
        {linkState && (
          <div className="tms-sm" style={{ marginTop: 6 }}>
            {t('int.linkSummary', { a: linkState.linkedActive ?? 0, l: linkState.linked.length, u: linkState.unmatched.length, c: linkState.closed })}
            {linkState.errors.map((e, i) => <div key={i} style={{ color: '#c62828' }}>{e}</div>)}
          </div>
        )}
        {linkState?.unmatched.length > 0 && (
          <div className="tms-tablewrap" style={{ marginTop: 6 }}><table>
            <thead><tr><th>{t('ord.doNo')}</th><th>{t('int.f.plate')}</th><th>{t('int.reason')}</th><th>{t('int.pickVehicle')}</th><th /></tr></thead>
            <tbody>{linkState.unmatched.map((u) => (
              <tr key={u.orderId}><td><b>{u.doNo}</b></td><td>{u.plate || '—'}</td><td>{t(`int.reason.${u.reason}`)}</td>
                <td>{u.reason === 'no_coords' || u.reason === 'no_plate' ? '—' : (
                  <select value={aliasSel[u.orderId] || ''} onChange={(e) => setAliasSel((m) => ({ ...m, [u.orderId]: e.target.value }))}>
                    <option value="">—</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.name}{d.plate ? ` · ${d.plate}` : ''}</option>)}
                  </select>)}</td>
                <td>{u.reason !== 'no_coords' && u.reason !== 'no_plate' && <button className="tms-btn sm" disabled={!aliasSel[u.orderId]} onClick={() => saveAlias(u)}>{t('save')}</button>}</td></tr>
            ))}</tbody></table></div>
        )}
      </div></div>

      {!data ? <Spinner /> : data.connectors.length === 0 ? <Empty>{t('int.empty')}</Empty> : data.connectors.map((c) => (
        <div key={c.id} className="tms-card" style={{ marginBottom: 10 }}><div className="tms-card-b">
          <div className="tms-row" style={{ gap: 8 }}>
            <b className="tms-grow">{c.name}</b>
            <span className={`tms-badge ${!c.enabled ? 'gray' : c.lastStatus === 'ok' ? 'green' : c.lastStatus === 'error' ? 'red' : 'blue'}`}>{!c.enabled ? t('int.off') : c.lastStatus === 'ok' ? t('int.ok') : c.lastStatus === 'error' ? t('int.error') : t('int.neverRun')}</span>
            <button className="tms-btn sm" disabled={busy === c.id} onClick={() => run(c)}>{busy === c.id ? '…' : t('int.sync')}</button>
            <button className="tms-btn sm" onClick={() => setEdit(c)}>{t('edit')}</button>
            <button className="tms-btn sm" onClick={() => toggle(c)}>{c.enabled ? t('int.disable') : t('int.enable')}</button>
            <button className="tms-btn sm" disabled={c.orders > 0} title={c.orders > 0 ? t('int.deleteBlocked') : ''} onClick={() => remove(c)}>{t('delete')}</button>
          </div>
          <div className="tms-sm tms-muted">{c.baseUrl}{c.config.request.path} · {t('int.everyMin', { n: c.intervalMin })} · {t('int.nOrders', { n: c.orders })}</div>
          <div className="tms-sm">{c.lastRunAt ? `${t('int.lastRun')}: ${fmtDateTime(c.lastRunAt)} (${t('int.fetched', { n: c.lastCount })})` : t('int.neverRun')}</div>
          {c.lastError && <div className="tms-sm" style={{ color: '#c62828' }}>{c.lastError}</div>}
        </div></div>
      ))}

      {orders.length > 0 && (
        <div className="tms-card"><div className="tms-card-b">
          <b>{t('int.imported')}</b>
          <div className="tms-tablewrap" style={{ marginTop: 6 }}><table>
            <thead><tr><th>{t('ord.doNo')}</th><th>{t('ord.customer')}</th><th>{t('int.f.plate')}</th><th>{t('mon.status')}</th><th>{t('ord.route')}</th><th>{t('int.synced')}</th><th>{t('int.linked')}</th></tr></thead>
            <tbody>{orders.map((o) => (
              <tr key={o.id}><td><b>{o.doNo}</b></td><td>{o.customer}</td><td>{o.plate || <span className="tms-badge amber">{t('int.noPlate')}</span>}</td>
                <td><span className={`tms-badge ${STATUS_CLS[o.status]}`}>{t(`ord.status.${o.status}`)}</span>{o.extStatus && <div className="tms-sm tms-muted">{o.extStatus}</div>}</td>
                <td>{o.summary?.origin} → {o.summary?.destination}</td><td>{fmtDateTime(o.extSyncedAt)}</td><td>{o.linkedRouteId ? <span className="tms-badge green">{t('int.linkedYes')}</span> : <span className="tms-badge gray">{t('int.linkedNo')}</span>}</td></tr>
            ))}</tbody></table></div>
        </div></div>
      )}
      {edit && <ConnectorEditor initial={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  );
}
