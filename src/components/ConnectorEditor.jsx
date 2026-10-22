import React, { createContext, useContext, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Modal } from './ui.jsx';
import { PRESET, fromForm, toForm } from '../lib/connForm.js';
import { apiErrorText } from '../lib/orderView.js';

const STATUSES = ['assigned', 'running', 'done', 'cancelled'];
const FormCtx = createContext(null);

// Komponen harus di level modul (bukan di dalam ConnectorEditor) agar input tidak kehilangan fokus tiap ketikan.
function Field({ k, label, ph, hint, type = 'text', rows }) {
  const { f, set } = useContext(FormCtx);
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <span className="tms-sm">{label}</span>
      {rows ? <textarea className="tms-input" rows={rows} style={{ width: '100%' }} value={f[k]} onChange={set(k)} placeholder={ph} />
        : <input className="tms-input" type={type} style={{ width: '100%' }} value={f[k]} onChange={set(k)} placeholder={ph} autoComplete="off" />}
      {hint && <span className="tms-sm tms-muted" style={{ display: 'block' }}>{hint}</span>}
    </label>
  );
}
function Sec({ title, children, hint }) {
  return (
    <div className="tms-card" style={{ marginBottom: 10 }}><div className="tms-card-b"><b>{title}</b>{hint && <div className="tms-sm tms-muted" style={{ marginBottom: 6 }}>{hint}</div>}<div className="tms-grid2">{children}</div></div></div>
  );
}

/** Editor konektor TMS customer: koneksi, request, pemetaan field, dan uji dengan data asli. */
export default function ConnectorEditor({ initial, onClose, onSaved }) {
  const { t, ordersApi, toast } = useApp();
  const [f, setF] = useState(() => toForm(initial || { config: PRESET }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState(null);
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const fail = (e) => setErr(`${apiErrorText(t, e)}${Array.isArray(e.details) ? ` (${e.details.map((d) => d.path).join(', ')})` : ''}`);

  const doTest = async () => {
    setBusy(true); setErr(''); setRes(null);
    try { setRes(await ordersApi.integration.test(fromForm(f))); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const doSave = async () => {
    setBusy(true); setErr('');
    try { await ordersApi.integration.save(fromForm(f)); toast(t('int.saved')); onSaved(); onClose(); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <Modal xwide title={f.id ? t('int.edit') : t('int.new')} onClose={onClose}
      footer={<><button className="tms-btn" onClick={onClose}>{t('cancel')}</button><button className="tms-btn" disabled={busy} onClick={doTest}>{t('int.test')}</button><button className="tms-btn pri" disabled={busy} onClick={doSave}>{t('save')}</button></>}>
      <FormCtx.Provider value={{ f, set }}>
      {err && <div className="tms-banner" style={{ marginBottom: 8 }}>{err}</div>}
      <Sec title={t('int.sec.conn')}>
        <Field k="name" label={t('int.name')} ph="TMS PT Contoh" />
        <Field k="baseUrl" label={t('int.baseUrl')} ph="https://api.tms-customer.co.id" hint={t('int.baseUrlHint')} />
        <label style={{ display: 'block', marginBottom: 8 }}><span className="tms-sm">{t('int.auth')}</span>
          <select className="tms-input" style={{ width: '100%' }} value={f.authType} onChange={set('authType')}>
            <option value="bearer">Bearer token</option><option value="header">API key (header)</option><option value="query">API key (query)</option><option value="basic">Basic (user + password)</option><option value="none">{t('int.authNone')}</option>
          </select></label>
        {['header', 'query', 'basic'].includes(f.authType) && <Field k="authName" label={f.authType === 'basic' ? t('int.user') : t('int.authName')} ph={f.authType === 'header' ? 'X-API-Key' : f.authType === 'query' ? 'api_key' : 'username'} />}
        {f.authType !== 'none' && <Field k="secret" type="password" label={f.authType === 'basic' ? t('int.password') : t('int.secret')} ph={f.hasSecret ? t('int.secretKeep') : ''} hint={t('int.secretHint')} />}
        <Field k="intervalMin" type="number" label={t('int.interval')} hint={t('int.intervalHint')} />
      </Sec>
      <Sec title={t('int.sec.req')} hint={t('int.sec.reqHint')}>
        <label style={{ display: 'block', marginBottom: 8 }}><span className="tms-sm">{t('int.method')}</span><select className="tms-input" style={{ width: '100%' }} value={f.method} onChange={set('method')}><option>GET</option><option>POST</option></select></label>
        <Field k="path" label={t('int.path')} ph="/v1/deliveries" />
        <Field k="query" rows={3} label={t('int.query')} ph={'updated_since={{since}}\nstatus=active'} hint={t('int.queryHint')} />
        <Field k="headers" rows={3} label={t('int.headers')} ph="Accept-Language=id" />
        {f.method === 'POST' && <Field k="body" rows={3} label={t('int.body')} ph={'{"since":"{{since}}"}'} />}
        <Field k="itemsPath" label={t('int.itemsPath')} ph="data.items" hint={t('int.itemsPathHint')} />
        <label style={{ display: 'block', marginBottom: 8 }}><span className="tms-sm">{t('int.paging')}</span>
          <select className="tms-input" style={{ width: '100%' }} value={f.pgType} onChange={set('pgType')}><option value="none">{t('int.pg.none')}</option><option value="page">{t('int.pg.page')}</option><option value="cursor">{t('int.pg.cursor')}</option></select></label>
        {f.pgType === 'page' && <><Field k="pageParam" label={t('int.pageParam')} /><Field k="sizeParam" label={t('int.sizeParam')} ph="per_page" /><Field k="pgSize" type="number" label={t('int.pageSize')} /></>}
        {f.pgType === 'cursor' && <><Field k="cursorParam" label={t('int.cursorParam')} /><Field k="nextPath" label={t('int.nextPath')} ph="meta.next_cursor" /><Field k="sizeParam" label={t('int.sizeParam')} ph="limit" /></>}
      </Sec>
      <Sec title={t('int.sec.order')} hint={t('int.sec.orderHint')}>
        <Field k="oExternalId" label={t('int.f.externalId')} ph="id" /><Field k="oDoNo" label={t('int.f.doNo')} ph="do_number" /><Field k="oCustomer" label={t('int.f.customer')} ph="customer.name" />
        <Field k="oDate" label={t('int.f.date')} ph="created_at" /><Field k="oPlate" label={t('int.f.plate')} ph="vehicle.plate" hint={t('int.f.plateHint')} /><Field k="oStatus" label={t('int.f.status')} ph="status" />
        <Field k="oStatusMap" rows={3} label={t('int.f.statusMap')} ph={'ON_THE_WAY=running\nDELIVERED=done'} hint={t('int.f.statusMapHint')} />
        <label style={{ display: 'block', marginBottom: 8 }}><span className="tms-sm">{t('int.f.defaultStatus')}</span><select className="tms-input" style={{ width: '100%' }} value={f.oDefault} onChange={set('oDefault')}>{STATUSES.map((s) => <option key={s} value={s}>{t(`ord.status.${s}`)}</option>)}</select></label>
        <Field k="tz" type="number" label={t('int.tz')} hint={t('int.tzHint')} />
      </Sec>
      <Sec title={t('int.sec.stops')} hint={t('int.sec.stopsHint')}>
        <Field k="sPath" label={t('int.s.path')} ph="stops" /><Field k="sTypeField" label={t('int.s.typeField')} ph="type" /><Field k="sTypeMap" rows={2} label={t('int.s.typeMap')} ph={'PICKUP=pickup\nDROP=delivery'} />
        <Field k="sFixed" label={t('int.s.fixed')} ph="delivery" hint={t('int.s.fixedHint')} /><Field k="sName" label={t('int.s.name')} ph="name" /><Field k="sAddress" label={t('int.s.address')} ph="address" />
        <Field k="sLat" label={t('int.s.lat')} ph="lat" /><Field k="sLng" label={t('int.s.lng')} ph="lng" /><Field k="sFrom" label={t('int.s.from')} ph="eta_from" /><Field k="sTo" label={t('int.s.to')} ph="eta_to" hint={t('int.s.toHint')} /><Field k="sRadius" label={t('int.s.radius')} ph="radius" />
      </Sec>
      <Sec title={t('int.sec.items')} hint={t('int.sec.itemsHint')}>
        <Field k="iPath" label={t('int.i.path')} ph="items" /><Field k="iDesc" label={t('int.i.desc')} ph="name" /><Field k="iQty" label={t('int.i.qty')} ph="qty" /><Field k="iUnit" label={t('int.i.unit')} ph="unit" /><Field k="iWeight" label={t('int.i.weight')} ph="weight" />
      </Sec>

      </FormCtx.Provider>

      {res && (
        <div className="tms-card"><div className="tms-card-b">
          <b>{t('int.testResult', { n: res.count })}</b>
          {res.mapped.length === 0 && <div className="tms-sm tms-muted">{t('int.noData')}</div>}
          {res.mapped.length > 0 && (
            <div className="tms-tablewrap" style={{ margin: '6px 0' }}><table>
              <thead><tr><th>{t('int.f.externalId')}</th><th>{t('ord.doNo')}</th><th>{t('int.f.plate')}</th><th>{t('int.f.status')}</th><th>{t('ord.route')}</th><th>{t('int.check')}</th></tr></thead>
              <tbody>{res.mapped.map((m, i) => (
                <tr key={i}><td>{m.externalId || '-'}</td><td>{m.doNo || '-'}</td><td>{m.plate || <span className="tms-badge amber">{t('int.noPlate')}</span>}</td>
                  <td>{m.extStatus} → <b>{t(`ord.status.${m.status}`)}</b></td><td>{m.stops.map((s) => `${s.type === 'pickup' ? '⬆' : '⬇'} ${s.name}`).join(' → ') || '-'}</td>
                  <td>{m.problems.length ? m.problems.map((p) => <span key={p} className="tms-badge red" style={{ marginRight: 4 }}>{t(`int.problem.${p}`)}</span>) : <span className="tms-badge green">OK</span>}</td></tr>
              ))}</tbody></table></div>
          )}
          <details><summary className="tms-sm">{t('int.rawSample')}</summary><pre style={{ maxHeight: 240, overflow: 'auto', background: '#f6f8fa', padding: 8, borderRadius: 6, fontSize: 12 }}>{res.sample}</pre></details>
        </div></div>
      )}
    </Modal>
  );
}
