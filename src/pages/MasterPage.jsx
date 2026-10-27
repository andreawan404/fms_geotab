import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Empty, Field, Modal, Spinner } from '../components/ui.jsx';
import { VEHICLE_TYPES } from '../core/capacity.js';
import { apiErrorText, fmtNum } from '../lib/orderView.js';

const KINDS = ['vendors', 'vehicles', 'drivers'];
const blank = {
  vendors: { name: '', pic: '', email: '', phone: '', geotabGroup: '', notes: '', internal: false, active: true },
  vehicles: { vendorId: '', plate: '', type: 'cdd', hasGps: false, geotabDeviceId: '', maxWeightKg: null, maxVolumeM3: null, maxPallets: null, maxColli: null, lengthCm: null, widthCm: null, heightCm: null, tempControlled: false, tempMinC: null, tempMaxC: null, allowsHazardous: false, fuelKmPerL: null, tollClass: null, notes: '', active: true },
  drivers: { vendorId: '', name: '', phone: '', licenseNo: '', notes: '', active: true },
};

const Txt = ({ v, set, k, ...p }) => <input value={v[k] ?? ''} onChange={(e) => set({ ...v, [k]: e.target.value })} {...p} />;
const Num = ({ v, set, k, ...p }) => <input type="number" step="any" value={v[k] ?? ''} onChange={(e) => set({ ...v, [k]: e.target.value === '' ? null : Number(e.target.value) })} {...p} />;
const Chk = ({ v, set, k, label }) => <label className="tms-chk"><input type="checkbox" checked={!!v[k]} onChange={(e) => set({ ...v, [k]: e.target.checked })} /> {label}</label>;

function MasterForm({ kind, item, vendors, onClose, onSaved }) {
  const { t, ordersApi, toast, devices } = useApp();
  const [v, setV] = useState(item || blank[kind]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const body = { ...v };
      delete body.id;
      if (item) await ordersApi.master.update(kind, item.id, body);
      else await ordersApi.master.create(kind, body);
      toast(t('mst.saved'));
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.code === 'validation' && Array.isArray(e.details) ? e.details.map((d) => `${t(`mst.f.${d.path}`)}: ${t(`mst.err.${d.code}`)}`).join('; ') : apiErrorText(t, e) || e.message);
      setBusy(false);
    }
  };
  const vendorSel = (
    <Field label={t('mst.f.vendorId')}>
      <select value={v.vendorId || ''} onChange={(e) => setV({ ...v, vendorId: e.target.value })}>
        <option value="">-</option>
        {vendors.filter((x) => x.active || x.id === v.vendorId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    </Field>
  );
  return (
    <Modal wide onClose={onClose} title={`${item ? t('mst.edit') : t('mst.add')} ${t(`mst.kind.${kind}`)}`} footer={(
      <>
        <button className="tms-btn" onClick={onClose}>{t('cancel')}</button>
        <button className="tms-btn pri" onClick={save} disabled={busy}>{busy ? t('saving') : t('save')}</button>
      </>
    )}>
      {err && <div className="tms-banner" style={{ margin: '0 0 10px' }}>{err}</div>}
      {kind === 'vendors' && (
        <div className="tms-form2">
          <Field label={t('mst.f.name')}><Txt v={v} set={setV} k="name" autoFocus /></Field>
          <Field label={t('mst.f.pic')}><Txt v={v} set={setV} k="pic" /></Field>
          <Field label={t('mst.f.email')} hint={t('mst.f.emailHint')}><Txt v={v} set={setV} k="email" placeholder="dispatch@vendor.com, ops@vendor.com" /></Field>
          <Field label={t('mst.f.phone')}><Txt v={v} set={setV} k="phone" /></Field>
          <Field label={t('mst.f.geotabGroup')} hint={t('mst.f.geotabGroupHint')}><Txt v={v} set={setV} k="geotabGroup" /></Field>
          <Field label={t('mst.f.notes')}><Txt v={v} set={setV} k="notes" /></Field>
          <Chk v={v} set={setV} k="internal" label={t('mst.f.internal')} />
          <div className="tms-sm tms-muted" style={{ gridColumn: '1/-1' }}>{t('mst.f.internalHint')}</div>
          <Chk v={v} set={setV} k="active" label={t('mst.f.active')} />
        </div>
      )}
      {kind === 'drivers' && (
        <div className="tms-form2">
          {vendorSel}
          <Field label={t('mst.f.name')}><Txt v={v} set={setV} k="name" autoFocus /></Field>
          <Field label={t('mst.f.phone')}><Txt v={v} set={setV} k="phone" /></Field>
          <Field label={t('mst.f.licenseNo')}><Txt v={v} set={setV} k="licenseNo" /></Field>
          <Field label={t('mst.f.notes')}><Txt v={v} set={setV} k="notes" /></Field>
          <Chk v={v} set={setV} k="active" label={t('mst.f.active')} />
        </div>
      )}
      {kind === 'vehicles' && (
        <>
          <div className="tms-form2">
            {vendorSel}
            <Field label={t('mst.f.plate')}><Txt v={v} set={setV} k="plate" autoFocus /></Field>
            <Field label={t('mst.f.type')}>
              <select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>{VEHICLE_TYPES.map((x) => <option key={x} value={x}>{t(`mst.vt.${x}`)}</option>)}</select>
            </Field>
            <Field label={t('mst.f.geotabDeviceId')} hint={t('mst.f.deviceHint')}>
              <select value={v.geotabDeviceId || ''} onChange={(e) => setV({ ...v, geotabDeviceId: e.target.value, hasGps: e.target.value ? true : v.hasGps })}>
                <option value="">{t('mst.f.noDevice')}</option>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          </div>
          <h4 style={{ margin: '10px 0 4px' }}>{t('mst.f.capacity')}</h4>
          <div className="tms-form4">
            <Field label={t('mst.f.maxWeightKg')}><Num v={v} set={setV} k="maxWeightKg" min="0" /></Field>
            <Field label={t('mst.f.maxVolumeM3')}><Num v={v} set={setV} k="maxVolumeM3" min="0" /></Field>
            <Field label={t('mst.f.maxPallets')}><Num v={v} set={setV} k="maxPallets" min="0" /></Field>
            <Field label={t('mst.f.maxColli')}><Num v={v} set={setV} k="maxColli" min="0" /></Field>
            <Field label={t('mst.f.lengthCm')}><Num v={v} set={setV} k="lengthCm" min="0" /></Field>
            <Field label={t('mst.f.widthCm')}><Num v={v} set={setV} k="widthCm" min="0" /></Field>
            <Field label={t('mst.f.heightCm')}><Num v={v} set={setV} k="heightCm" min="0" /></Field>
            <div />
          </div>
          <div className="tms-hint" style={{ marginBottom: 6 }}>{t('mst.f.capHint')}</div>
          <div className="tms-form4">
            <div className="tms-flagrow"><Chk v={v} set={setV} k="tempControlled" label={t('mst.f.tempControlled')} /></div>
            <Field label={t('mst.f.tempMinC')}><Num v={v} set={setV} k="tempMinC" disabled={!v.tempControlled} /></Field>
            <Field label={t('mst.f.tempMaxC')}><Num v={v} set={setV} k="tempMaxC" disabled={!v.tempControlled} /></Field>
            <div className="tms-flagrow"><Chk v={v} set={setV} k="allowsHazardous" label={t('mst.f.allowsHazardous')} /></div>
          </div>
          <div className="tms-form2">
            <Field label={t('mst.f.fuelKmPerL')} hint={t('mst.f.fuelKmPerLHint')}><Num v={v} set={setV} k="fuelKmPerL" min="0" step="0.1" /></Field>
            <Field label={t('mst.f.tollClass')} hint={t('mst.f.tollClassHint')}>
              <select value={v.tollClass ?? ''} onChange={(e) => setV({ ...v, tollClass: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">{t('mst.f.tollAuto')}</option>
                {[1, 2, 3, 4, 5].map((c) => <option key={c} value={c}>{t('cost.class', { n: c })}</option>)}
              </select>
            </Field>
          </div>
          <div className="tms-form2">
            <Chk v={v} set={setV} k="hasGps" label={t('mst.f.hasGps')} />
            <Chk v={v} set={setV} k="active" label={t('mst.f.active')} />
            <Field label={t('mst.f.notes')} className="wide"><Txt v={v} set={setV} k="notes" /></Field>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Vendor, kendaraan, dan driver beserta kapasitas — dasar alokasi DO. */
export default function MasterPage() {
  const { t, ordersApi, toast } = useApp();
  const [kind, setKind] = useState('vendors');
  const [data, setData] = useState({ vendors: [], vehicles: [], drivers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null); // { item|null }
  const [q, setQ] = useState('');
  const [vf, setVf] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [vendors, vehicles, drivers] = await Promise.all(KINDS.map((k) => ordersApi.master.list(k, { all: 1 })));
      setData({ vendors, vehicles, drivers });
    } catch (e) {
      setError(apiErrorText(t, e));
    }
    setLoading(false);
  }, [ordersApi, t]);
  useEffect(() => { load(); }, [load]);

  const vName = useMemo(() => new Map(data.vendors.map((v) => [v.id, v.name])), [data.vendors]);
  const counts = useMemo(() => {
    const c = {};
    for (const k of ['vehicles', 'drivers']) for (const x of data[k]) if (x.active) c[`${k}:${x.vendorId}`] = (c[`${k}:${x.vendorId}`] || 0) + 1;
    return c;
  }, [data]);

  const rows = data[kind].filter((x) => (!vf || x.vendorId === vf) && (!q || JSON.stringify(Object.values(x)).toLowerCase().includes(q.toLowerCase())));
  const remove = async (x) => {
    if (!window.confirm(t('mst.confirmDelete', { name: x.name || x.plate }))) return;
    try {
      const r = await ordersApi.master.remove(kind, x.id);
      toast(r?.deactivated ? t('mst.deactivated') : t('mst.deleted'));
      load();
    } catch (e) {
      toast(apiErrorText(t, e), 'err');
    }
  };

  return (
    <div className="tms-page">
      <div className="tms-row" style={{ marginBottom: 10 }}>
        <h2 className="tms-grow">{t('mst.title')}</h2>
        <button className="tms-btn pri" onClick={() => setForm({ item: null })} disabled={kind !== 'vendors' && data.vendors.length === 0}>+ {t('mst.add')} {t(`mst.kind.${kind}`)}</button>
        <button className="tms-btn sm" onClick={load} title={t('refresh')}>↻</button>
      </div>
      {error && <div className="tms-banner" style={{ margin: '0 0 10px' }}>{error}</div>}
      <div className="tms-row" style={{ marginBottom: 8 }}>
        <div className="tms-chips" style={{ padding: 0 }}>
          {KINDS.map((k) => <button key={k} className={`tms-chip ${kind === k ? 'on' : ''}`} onClick={() => { setKind(k); setVf(''); }}>{t(`mst.kind.${k}`)} {data[k].filter((x) => x.active).length}</button>)}
        </div>
        <span className="tms-grow" />
        {kind !== 'vendors' && (
          <select value={vf} onChange={(e) => setVf(e.target.value)} style={{ width: 200 }}>
            <option value="">{t('mst.allVendors')}</option>
            {data.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
        <input type="search" placeholder={t('mst.search')} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
      </div>
      {kind !== 'vendors' && data.vendors.length === 0 && !loading && <div className="tms-banner" style={{ margin: '0 0 10px' }}>{t('mst.needVendor')}</div>}

      <div className="tms-tablewrap">
        <table>
          <thead>
            {kind === 'vendors' && <tr><th>{t('mst.f.name')}</th><th>{t('mst.f.pic')}</th><th>{t('mst.f.email')}</th><th>{t('mst.f.phone')}</th><th className="num">{t('mst.kind.vehicles')}</th><th className="num">{t('mst.kind.drivers')}</th><th>{t('mon.status')}</th><th /></tr>}
            {kind === 'vehicles' && <tr><th>{t('mst.f.plate')}</th><th>{t('mst.f.vendorId')}</th><th>{t('mst.f.type')}</th><th className="num">{t('mst.f.maxWeightKg')}</th><th className="num">{t('mst.f.maxVolumeM3')}</th><th className="num">{t('mst.f.maxPallets')}</th><th>{t('mst.f.flags')}</th><th>{t('mon.status')}</th><th /></tr>}
            {kind === 'drivers' && <tr><th>{t('mst.f.name')}</th><th>{t('mst.f.vendorId')}</th><th>{t('mst.f.phone')}</th><th>{t('mst.f.licenseNo')}</th><th>{t('mon.status')}</th><th /></tr>}
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9}><Spinner text={t('loading')} /></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9}><Empty>{t('mst.empty')}</Empty></td></tr>}
            {rows.map((x) => (
              <tr key={x.id} className="click" onClick={() => setForm({ item: x })} style={x.active ? undefined : { opacity: 0.55 }}>
                {kind === 'vendors' && (<><td><b>{x.name}</b>{x.internal && <> <span className="tms-badge blue">{t('mst.internalBadge')}</span></>}</td><td>{x.pic}</td><td>{x.email || <span className="tms-badge amber">{t('mst.noEmail')}</span>}</td><td>{x.phone}</td><td className="num">{counts[`vehicles:${x.id}`] || 0}</td><td className="num">{counts[`drivers:${x.id}`] || 0}</td></>)}
                {kind === 'vehicles' && (<><td><b>{x.plate}</b></td><td>{vName.get(x.vendorId)}</td><td>{t(`mst.vt.${x.type}`)}</td><td className="num">{fmtNum(x.maxWeightKg)}</td><td className="num">{fmtNum(x.maxVolumeM3, 1)}</td><td className="num">{fmtNum(x.maxPallets, 1)}</td>
                  <td>{x.hasGps ? <span className="tms-badge green">GPS</span> : <span className="tms-badge gray">{t('mst.noGps')}</span>} {x.tempControlled && <span className="tms-badge blue">°C</span>} {x.allowsHazardous && <span className="tms-badge red">B3</span>}</td></>)}
                {kind === 'drivers' && (<><td><b>{x.name}</b></td><td>{vName.get(x.vendorId)}</td><td>{x.phone}</td><td>{x.licenseNo}</td></>)}
                <td>{x.active ? <span className="tms-badge green">{t('mst.active')}</span> : <span className="tms-badge gray">{t('mst.inactive')}</span>}</td>
                <td><button className="tms-btn sm danger" onClick={(e) => { e.stopPropagation(); remove(x); }}>{t('delete')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && <MasterForm kind={kind} item={form.item} vendors={data.vendors} onClose={() => setForm(null)} onSaved={load} />}
    </div>
  );
}
