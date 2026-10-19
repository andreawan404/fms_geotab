import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Field, Modal, Spinner } from './ui.jsx';
import { CATEGORIES, PRIORITIES, UNITS, dispatchBlockers, emptyItem, emptyOrder, emptyStop, normalizeOrder, totals, validateOrder } from '../core/orders.js';
import { geocode } from '../services/routing.js';
import { apiErrorText, fmtNum, isoToLocal, issueText, localToIso } from '../lib/orderView.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Pencarian alamat -> isi koordinat stop. */
function AddressSearch({ stop, onPick }) {
  const { t, settings } = useApp();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const go = async () => {
    const q = (stop.address || stop.name || '').trim();
    if (!q) return;
    setBusy(true);
    setErr('');
    try {
      setRes(await geocode(settings, q));
    } catch (e) {
      setErr(e.message || String(e));
      setRes(null);
    }
    setBusy(false);
  };
  return (
    <div>
      <button type="button" className="tms-btn sm" onClick={go} disabled={busy}>{busy ? t('ord.searching') : t('ord.findCoords')}</button>
      {err && <div className="tms-sm" style={{ color: 'var(--c-err)' }}>{err}</div>}
      {res && (
        <div className="tms-geores">
          {res.length === 0 && <div className="tms-sm tms-muted">{t('ord.noResult')}</div>}
          {res.map((r, i) => (
            <button type="button" key={i} onClick={() => { onPick(r); setRes(null); }}>{r.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const NumIn = ({ value, onChange, step = 'any', w, ...p }) => (
  <input type="number" min="0" step={step} style={w ? { width: w } : undefined} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} {...p} />
);

function ItemsTable({ items, setItems, ro }) {
  const { t } = useApp();
  const set = (i, patch) => setItems(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  return (
    <div className="tms-itemwrap">
      <table className="tms-itemtbl">
        <thead>
          <tr>
            <th>{t('ord.i.desc')}</th><th>{t('ord.i.sku')}</th><th>{t('ord.i.qty')}</th><th>{t('ord.i.unit')}</th><th>{t('ord.i.weight')}</th><th>{t('ord.i.volume')}</th>
            <th>{t('ord.i.pallets')}</th><th>{t('ord.i.colli')}</th><th>{t('ord.i.dims')}</th><th>{t('ord.i.cat')}</th><th>{t('ord.i.temp')}</th><th title={t('ord.i.hazardous')}>B3</th><th title={t('ord.i.stackable')}>{t('ord.i.stack')}</th><th />
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td style={{ minWidth: 170 }}><input disabled={ro} value={it.description} onChange={(e) => set(i, { description: e.target.value })} /></td>
              <td style={{ width: 90 }}><input disabled={ro} value={it.sku} onChange={(e) => set(i, { sku: e.target.value })} /></td>
              <td style={{ width: 80 }}><NumIn disabled={ro} value={it.qty} onChange={(v) => set(i, { qty: v })} /></td>
              <td style={{ width: 86 }}>
                <input disabled={ro} list="tms-units" value={it.unit} onChange={(e) => set(i, { unit: e.target.value })} />
              </td>
              <td style={{ width: 90 }}><NumIn disabled={ro} value={it.weightKg} onChange={(v) => set(i, { weightKg: v })} /></td>
              <td style={{ width: 80 }}><NumIn disabled={ro} value={it.volumeM3} onChange={(v) => set(i, { volumeM3: v })} /></td>
              <td style={{ width: 70 }}><NumIn disabled={ro} value={it.pallets} onChange={(v) => set(i, { pallets: v })} /></td>
              <td style={{ width: 70 }}><NumIn disabled={ro} value={it.colli} onChange={(v) => set(i, { colli: v })} /></td>
              <td style={{ width: 170 }}>
                <div className="tms-dims">
                  <NumIn disabled={ro} value={it.lengthCm} onChange={(v) => set(i, { lengthCm: v })} placeholder="P" />
                  <NumIn disabled={ro} value={it.widthCm} onChange={(v) => set(i, { widthCm: v })} placeholder="L" />
                  <NumIn disabled={ro} value={it.heightCm} onChange={(v) => set(i, { heightCm: v })} placeholder="T" />
                </div>
              </td>
              <td style={{ width: 110 }}>
                <select disabled={ro} value={it.category} onChange={(e) => set(i, { category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{t(`ord.cat.${c}`)}</option>)}
                </select>
              </td>
              <td style={{ width: 110 }}>
                <div className="tms-dims">
                  <input type="number" step="any" disabled={ro} value={it.tempMin ?? ''} placeholder="min" onChange={(e) => set(i, { tempMin: e.target.value === '' ? null : Number(e.target.value) })} />
                  <input type="number" step="any" disabled={ro} value={it.tempMax ?? ''} placeholder="max" onChange={(e) => set(i, { tempMax: e.target.value === '' ? null : Number(e.target.value) })} />
                </div>
              </td>
              <td style={{ width: 34, textAlign: 'center' }}><input type="checkbox" disabled={ro} checked={!!it.hazardous} onChange={(e) => set(i, { hazardous: e.target.checked })} /></td>
              <td style={{ width: 40, textAlign: 'center' }}><input type="checkbox" disabled={ro} checked={it.stackable !== false} onChange={(e) => set(i, { stackable: e.target.checked })} /></td>
              <td style={{ width: 30 }}>{!ro && items.length > 1 && <button type="button" className="tms-x" onClick={() => setItems(items.filter((_, k) => k !== i))} aria-label={t('delete')}>×</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id="tms-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
      {!ro && <button type="button" className="tms-btn sm" onClick={() => setItems([...items, emptyItem()])}>+ {t('ord.addItem')}</button>}
    </div>
  );
}

function StopCard({ stop, idx, count, set, move, remove, ro, errs }) {
  const { t } = useApp();
  const upd = (patch) => set({ ...stop, ...patch });
  const has = (f) => errs.some((e) => e.path.startsWith(`stops.${idx}.${f}`));
  return (
    <div className={`tms-stopcard ${stop.type}`}>
      <div className="tms-stop-h">
        <span className="tms-stop-n">{idx + 1}</span>
        <select disabled={ro} value={stop.type} onChange={(e) => upd({ type: e.target.value })} style={{ width: 'auto' }} className={has('type') ? 'bad' : ''}>
          <option value="pickup">{t('ord.pickup')}</option>
          <option value="delivery">{t('ord.delivery')}</option>
        </select>
        <span className="tms-grow" />
        {!ro && (
          <>
            <button type="button" className="tms-btn sm" onClick={() => move(-1)} disabled={idx === 0} title={t('ord.moveUp')}>↑</button>
            <button type="button" className="tms-btn sm" onClick={() => move(1)} disabled={idx === count - 1} title={t('ord.moveDown')}>↓</button>
            <button type="button" className="tms-btn sm danger" onClick={remove} disabled={count <= 2}>{t('delete')}</button>
          </>
        )}
      </div>
      <div className="tms-stop-grid">
        <Field label={t('ord.s.name')}><input disabled={ro} className={has('name') ? 'bad' : ''} value={stop.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
        <Field label={t('ord.s.address')}><input disabled={ro} value={stop.address} onChange={(e) => upd({ address: e.target.value })} /></Field>
        <Field label={t('ord.s.lat')}><NumIn disabled={ro} className={has('lat') ? 'bad' : ''} value={stop.lat} step="any" onChange={(v) => upd({ lat: v })} style={{ minWidth: 0 }} min={-90} /></Field>
        <Field label={t('ord.s.lng')}><NumIn disabled={ro} className={has('lat') ? 'bad' : ''} value={stop.lng} step="any" onChange={(v) => upd({ lng: v })} min={-180} /></Field>
        <Field label={t('ord.s.radius')}><NumIn disabled={ro} className={has('radiusM') ? 'bad' : ''} value={stop.radiusM} onChange={(v) => upd({ radiusM: v })} /></Field>
        <div className="tms-geobtn">{!ro && <AddressSearch stop={stop} onPick={(r) => upd({ lat: r.lat, lng: r.lng, address: stop.address || r.label })} />}</div>
        <Field label={t('ord.s.winStart')}><input type="datetime-local" disabled={ro} value={isoToLocal(stop.windowStart)} onChange={(e) => upd({ windowStart: localToIso(e.target.value) })} /></Field>
        <Field label={t('ord.s.winEnd')}><input type="datetime-local" disabled={ro} className={has('windowEnd') ? 'bad' : ''} value={isoToLocal(stop.windowEnd)} onChange={(e) => upd({ windowEnd: localToIso(e.target.value) })} /></Field>
        <Field label={t('ord.s.contact')}><input disabled={ro} value={stop.contactName} onChange={(e) => upd({ contactName: e.target.value })} /></Field>
        <Field label={t('ord.s.phone')}><input disabled={ro} value={stop.contactPhone} onChange={(e) => upd({ contactPhone: e.target.value })} /></Field>
        <Field label={t('ord.s.instr')} className="wide"><input disabled={ro} value={stop.instructions} onChange={(e) => upd({ instructions: e.target.value })} /></Field>
      </div>
      <div className="tms-sm tms-muted" style={{ margin: '4px 0' }}>{stop.type === 'pickup' ? t('ord.itemsLoad') : t('ord.itemsUnload')}</div>
      <ItemsTable items={stop.items} setItems={(items) => upd({ items })} ro={ro} />
    </div>
  );
}

/** Editor DO: header, stop berurutan (multi-leg), item dengan kapasitas lengkap, ringkasan muatan, validasi langsung. */
export default function OrderEditor({ id, onClose, onSaved }) {
  const { t, ordersApi, toast } = useApp();
  const [loading, setLoading] = useState(!!id);
  const [order, setOrder] = useState(() => emptyOrder());
  const [meta, setMeta] = useState(null); // { id, version, status }
  const [busy, setBusy] = useState(false);
  const [serverErr, setServerErr] = useState('');
  const ro = !!meta && meta.status !== 'draft';

  useEffect(() => {
    if (!id) return undefined;
    let dead = false;
    ordersApi.get(id).then((o) => {
      if (dead) return;
      setMeta({ id: o.id, version: o.version, status: o.status });
      setOrder({ doNo: o.doNo, customer: o.customer, orderDate: o.orderDate, priority: o.priority, notes: o.notes, stops: o.stops.map((s) => ({ ...s })) });
      setLoading(false);
    }).catch((e) => {
      if (dead) return;
      toast(apiErrorText(t, e), 'err');
      onClose();
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const norm = useMemo(() => normalizeOrder(order), [order]);
  const val = useMemo(() => validateOrder(norm), [norm]);
  const tot = useMemo(() => totals(norm), [norm]);
  const blockers = useMemo(() => dispatchBlockers(norm), [norm]);
  const upd = (patch) => { setOrder((o) => ({ ...o, ...patch })); setServerErr(''); };
  const setStop = (i, s) => upd({ stops: order.stops.map((x, k) => (k === i ? s : x)) });
  const move = (i, d) => {
    const a = clone(order.stops);
    [a[i], a[i + d]] = [a[i + d], a[i]];
    upd({ stops: a });
  };
  const addStop = (type) => upd({ stops: [...order.stops, emptyStop(type)] });
  const fieldBad = (f) => val.errors.some((e) => e.path === f);

  const save = async () => {
    if (val.errors.length) return;
    setBusy(true);
    setServerErr('');
    try {
      const r = meta ? await ordersApi.update(meta.id, order, meta.version) : await ordersApi.create(order);
      toast(t('ord.saved', { no: r.order.doNo }));
      onSaved?.(r.order);
      onClose();
    } catch (e) {
      setServerErr(apiErrorText(t, e));
      setBusy(false);
    }
  };

  const title = meta ? `${t('ord.edit')} · ${order.doNo}` : t('ord.new');
  return (
    <Modal wide xwide onClose={onClose} title={title} footer={(
      <>
        <button className="tms-btn" onClick={onClose}>{ro ? t('close') : t('cancel')}</button>
        {!ro && <button className="tms-btn pri" onClick={save} disabled={busy || loading || val.errors.length > 0}>{busy ? t('saving') : t('save')}</button>}
      </>
    )}>
      {loading ? <Spinner text={t('loading')} /> : (
        <div className="tms-oe">
          {ro && <div className="tms-banner warn" style={{ margin: '0 0 10px' }}>{t('ord.readonly')}</div>}
          <div className="tms-oe-head">
            <Field label={t('ord.doNo')}><input disabled={ro} className={fieldBad('doNo') ? 'bad' : ''} value={order.doNo} onChange={(e) => upd({ doNo: e.target.value })} placeholder="DO-2026-0001" /></Field>
            <Field label={t('ord.customer')}><input disabled={ro} className={fieldBad('customer') ? 'bad' : ''} value={order.customer} onChange={(e) => upd({ customer: e.target.value })} /></Field>
            <Field label={t('ord.date')}><input type="date" disabled={ro} className={fieldBad('orderDate') ? 'bad' : ''} value={order.orderDate} onChange={(e) => upd({ orderDate: e.target.value })} /></Field>
            <Field label={t('ord.priority')}>
              <select disabled={ro} value={order.priority} onChange={(e) => upd({ priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{t(`ord.prio.${p}`)}</option>)}
              </select>
            </Field>
            <Field label={t('ord.notes')} className="wide"><input disabled={ro} value={order.notes} onChange={(e) => upd({ notes: e.target.value })} /></Field>
          </div>

          <div className="tms-oe-body">
            <div>
              <div className="tms-row" style={{ margin: '4px 0 8px' }}>
                <h4 className="tms-grow" style={{ margin: 0 }}>{t('ord.stops')} <span className="tms-muted tms-sm">({t('ord.legsN', { n: tot.legs })})</span></h4>
                {!ro && <button type="button" className="tms-btn sm" onClick={() => addStop('pickup')}>+ {t('ord.pickup')}</button>}
                {!ro && <button type="button" className="tms-btn sm" onClick={() => addStop('delivery')}>+ {t('ord.delivery')}</button>}
              </div>
              {order.stops.map((s, i) => (
                <StopCard key={i} stop={s} idx={i} count={order.stops.length} ro={ro} errs={val.errors}
                  set={(v) => setStop(i, v)} move={(d) => move(i, d)} remove={() => upd({ stops: order.stops.filter((_, k) => k !== i) })} />
              ))}
            </div>

            <aside className="tms-oe-side">
              <div className="tms-card tms-sumcard">
                <div className="tms-card-h">{t('ord.sum.title')}</div>
                <div className="tms-card-b">
                  <dl className="tms-dl">
                    <dt>{t('ord.sum.weight')}</dt><dd>{fmtNum(tot.loadedWeight, 1)} kg</dd>
                    <dt>{t('ord.sum.peakWeight')}</dt><dd><b>{fmtNum(tot.peakWeight, 1)} kg</b></dd>
                    <dt>{t('ord.sum.volume')}</dt><dd>{fmtNum(tot.loadedVolume, 2)} m³</dd>
                    <dt>{t('ord.sum.peakVolume')}</dt><dd><b>{fmtNum(tot.peakVolume, 2)} m³</b></dd>
                    <dt>{t('ord.sum.pallets')}</dt><dd>{fmtNum(tot.loadedPallets, 1)} ({t('ord.sum.peak')} {fmtNum(tot.peakPallets, 1)})</dd>
                    <dt>{t('ord.sum.colli')}</dt><dd>{fmtNum(tot.loadedColli)} ({t('ord.sum.peak')} {fmtNum(tot.peakColli)})</dd>
                    <dt>{t('ord.sum.dims')}</dt><dd>{tot.maxLengthCm || '-'} × {tot.maxWidthCm || '-'} × {tot.maxHeightCm || '-'} cm</dd>
                    <dt>{t('ord.sum.temp')}</dt><dd>{tot.tempMin == null && tot.tempMax == null ? '-' : `${tot.tempMin ?? '…'} – ${tot.tempMax ?? '…'} °C`}</dd>
                  </dl>
                  <div className="tms-row" style={{ gap: 4, marginTop: 6 }}>
                    {tot.hazardous && <span className="tms-badge red">B3</span>}
                    {tot.unstackable && <span className="tms-badge amber">{t('ord.sum.unstack')}</span>}
                    {tot.tempConflict && <span className="tms-badge red">{t('ord.sum.tempConflict')}</span>}
                  </div>
                  <div className="tms-sm tms-muted" style={{ marginTop: 8 }}>{t('ord.sum.note')}</div>
                </div>
              </div>

              <div className="tms-card tms-sumcard">
                <div className="tms-card-h">{t('ord.check.title')}</div>
                <div className="tms-card-b">
                  {serverErr && <div className="tms-issue err">{serverErr}</div>}
                  {val.errors.length === 0 && !serverErr && <div className="tms-issue ok">✓ {t('ord.check.ok')}</div>}
                  {val.errors.map((e, i) => <div key={`e${i}`} className="tms-issue err">{issueText(t, e)}</div>)}
                  {val.warnings.map((e, i) => <div key={`w${i}`} className="tms-issue warn">{issueText(t, e)}</div>)}
                  {val.errors.length === 0 && (
                    <>
                      <div className="tms-sm tms-muted" style={{ margin: '8px 0 2px' }}>{t('ord.check.dispatch')}</div>
                      {blockers.length === 0 ? <div className="tms-issue ok">✓ {t('ord.check.dispatchOk')}</div> : blockers.map((b, i) => <div key={`b${i}`} className="tms-issue info">{t(`ord.block.${b.code}`, { n: b.n })}</div>)}
                    </>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}
    </Modal>
  );
}
