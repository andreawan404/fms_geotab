import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Field, Modal, Spinner } from './ui.jsx';
import { CATEGORIES, PRIORITIES, UNITS, dispatchBlockers, emptyItem, emptyOrder, emptyStop, genDoNo, normalizeOrder, totals, validateOrder } from '../core/orders.js';
import ZonePicker from './ZonePicker.jsx';
import RouteCard from './RouteCard.jsx';
import { routeIdOf } from '../core/linkPlan.js';
import { routableStops, saveOrderRoute } from '../services/orderRoute.js';
import { apiErrorText, fmtNum, isoToLocal, issueText, localToIso } from '../lib/orderView.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

let seq = 0;
const nid = (p) => `${p}${++seq}`;
const strip = ({ _k, _from, ...r }) => r;
const keyItem = (it) => ({ ...it, _k: it._k || nid('i') });
const keyStop = (s) => ({ ...s, _uid: s._uid || nid('s'), items: s.items.map(keyItem) });
const sameItem = (a, b) => JSON.stringify(normalizeOrder({ stops: [{ items: [strip(a)] }] }).stops[0].items[0]) === JSON.stringify(normalizeOrder({ stops: [{ items: [strip(b)] }] }).stops[0].items[0]);

/** Beri kunci stabil + tautkan item delivery yang identik dengan item pickup sebelumnya. */
function hydrate(order) {
  const stops = order.stops.map(keyStop);
  const pool = [];
  stops.forEach((s) => {
    if (s.type === 'pickup') s.items.forEach((it) => pool.push(it));
    else s.items = s.items.map((it) => {
      const src = pool.find((p) => sameItem(p, it));
      return src ? { _k: it._k, _from: src._k } : it;
    });
  });
  return { ...order, stops };
}

/** Terapkan tautan: item delivery tertaut = salinan persis item pickup (nilai terkini). */
function effective(order) {
  const map = new Map();
  return {
    ...order,
    stops: order.stops.map((s) => {
      if (s.type === 'pickup') {
        s.items.forEach((it) => map.set(it._k, it));
        return { ...s, items: s.items.map(strip) };
      }
      return { ...s, items: s.items.map((it) => (it._from ? (map.has(it._from) ? strip(map.get(it._from)) : null) : strip(it))).filter(Boolean) };
    }),
  };
}

/** Item pickup (stop sebelum stop ke-idx) yang bisa dipilih di delivery. */
function sourcesFor(stops, idx) {
  const out = [];
  stops.slice(0, idx).forEach((s, i) => {
    if (s.type === 'pickup') s.items.forEach((it) => out.push({ key: it._k, item: it, stopNo: i + 1, stopName: s.name }));
  });
  return out;
}

const NumIn = ({ value, onChange, step = 'any', ...p }) => (
  <input type="number" min="0" step={step} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} {...p} />
);

const F = ({ label, cls = '', children }) => <label className={`tms-if ${cls}`}><span>{label}</span>{children}</label>;

/** Satu barang: semua field kapasitas tersusun dalam kartu (tanpa scroll samping). */
function ItemCard({ it, n, set, remove, ro }) {
  const { t } = useApp();
  return (
    <div className="tms-item">
      <div className="tms-item-n">{n}</div>
      {!ro && remove && <button type="button" className="tms-x tms-item-x" onClick={remove} aria-label={t('delete')} title={t('delete')}>×</button>}
      <div className="tms-item-grid">
        <F label={t('ord.i.desc')} cls="c5"><input disabled={ro} value={it.description} onChange={(e) => set({ description: e.target.value })} /></F>
        <F label={t('ord.i.sku')} cls="c2"><input disabled={ro} value={it.sku} onChange={(e) => set({ sku: e.target.value })} /></F>
        <F label={t('ord.i.qty')} cls="c2"><NumIn disabled={ro} value={it.qty} onChange={(v) => set({ qty: v })} /></F>
        <F label={t('ord.i.unit')} cls="c3"><input disabled={ro} list="tms-units" value={it.unit} onChange={(e) => set({ unit: e.target.value })} /></F>
        <F label={t('ord.i.weight')} cls="c3"><NumIn disabled={ro} value={it.weightKg} onChange={(v) => set({ weightKg: v })} /></F>
        <F label={t('ord.i.volume')} cls="c3"><NumIn disabled={ro} value={it.volumeM3} onChange={(v) => set({ volumeM3: v })} /></F>
        <F label={t('ord.i.pallets')} cls="c3"><NumIn disabled={ro} value={it.pallets} onChange={(v) => set({ pallets: v })} /></F>
        <F label={t('ord.i.colli')} cls="c3"><NumIn disabled={ro} value={it.colli} onChange={(v) => set({ colli: v })} /></F>
        <F label={t('ord.i.dims')} cls="c4">
          <div className="tms-dims">
            <NumIn disabled={ro} value={it.lengthCm} onChange={(v) => set({ lengthCm: v })} placeholder="P" />
            <NumIn disabled={ro} value={it.widthCm} onChange={(v) => set({ widthCm: v })} placeholder="L" />
            <NumIn disabled={ro} value={it.heightCm} onChange={(v) => set({ heightCm: v })} placeholder="T" />
          </div>
        </F>
        <F label={t('ord.i.cat')} cls="c3">
          <select disabled={ro} value={it.category} onChange={(e) => set({ category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`ord.cat.${c}`)}</option>)}
          </select>
        </F>
        <F label={t('ord.i.temp')} cls="c3">
          <div className="tms-dims">
            <input type="number" step="any" disabled={ro} value={it.tempMin ?? ''} placeholder="min" onChange={(e) => set({ tempMin: e.target.value === '' ? null : Number(e.target.value) })} />
            <input type="number" step="any" disabled={ro} value={it.tempMax ?? ''} placeholder="max" onChange={(e) => set({ tempMax: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
        </F>
        <div className="tms-if c2 tms-flags">
          <label title={t('ord.i.hazardous')}><input type="checkbox" disabled={ro} checked={!!it.hazardous} onChange={(e) => set({ hazardous: e.target.checked })} /> B3</label>
          <label title={t('ord.i.stackable')}><input type="checkbox" disabled={ro} checked={it.stackable !== false} onChange={(e) => set({ stackable: e.target.checked })} /> {t('ord.i.stack')}</label>
        </div>
      </div>
    </div>
  );
}

const sumText = (it) => [
  it.qty != null ? `${fmtNum(it.qty)} ${it.unit || ''}`.trim() : null,
  it.weightKg != null ? `${fmtNum(it.weightKg, 1)} kg` : null,
  it.volumeM3 != null ? `${fmtNum(it.volumeM3, 2)} m³` : null,
  it.pallets != null ? `${fmtNum(it.pallets, 1)} plt` : null,
  it.colli != null ? `${fmtNum(it.colli)} koli` : null,
].filter(Boolean).join(' · ');

/** Daftar barang pickup (editable). */
function PickupItems({ items, setItems, ro }) {
  const { t } = useApp();
  return (
    <div>
      {items.map((it, i) => (
        <ItemCard key={it._k} it={it} n={i + 1} ro={ro} set={(p) => setItems(items.map((x, k) => (k === i ? { ...x, ...p } : x)))}
          remove={items.length > 1 ? () => setItems(items.filter((_, k) => k !== i)) : null} />
      ))}
      {!ro && <button type="button" className="tms-btn sm" onClick={() => setItems([...items, keyItem(emptyItem())])}>+ {t('ord.addItem')}</button>}
    </div>
  );
}

/** Barang delivery: centang dari barang pickup (otomatis identik), "Ubah" bila ada perbedaan, atau tambah barang lain. */
function DeliveryItems({ items, setItems, sources, ro }) {
  const { t } = useApp();
  const linked = new Map(items.filter((i) => i._from).map((i) => [i._from, i]));
  const manual = items.filter((i) => !i._from);
  const toggle = (src) => {
    if (linked.has(src.key)) setItems(items.filter((i) => i._from !== src.key));
    else setItems([...items.filter((i) => i._from || i.description || i.weightKg != null), { _k: nid('i'), _from: src.key }]);
  };
  const all = sources.length > 0 && sources.every((s) => linked.has(s.key));
  const toggleAll = () => {
    if (all) setItems(manual.length ? manual : [keyItem(emptyItem())]);
    else setItems([...sources.map((s) => linked.get(s.key) || { _k: nid('i'), _from: s.key }), ...manual.filter((m) => m.description || m.weightKg != null)]);
  };
  const edit = (src) => setItems(items.map((i) => (i._from === src.key ? { ...strip(src.item), _k: nid('i') } : i)));
  const setManual = (k, p) => setItems(items.map((i) => (i._k === k ? { ...i, ...p } : i)));
  return (
    <div>
      {sources.length > 0 && (
        <div className="tms-srclist">
          <div className="tms-row" style={{ marginBottom: 4 }}>
            <span className="tms-sm tms-muted tms-grow">{t('ord.fromPickup')}</span>
            {!ro && <button type="button" className="tms-btn sm" onClick={toggleAll}>{all ? t('ord.clearAll') : t('ord.selectAll')}</button>}
          </div>
          {sources.map((src) => {
            const on = linked.has(src.key);
            return (
              <div key={src.key} className={`tms-src ${on ? 'on' : ''}`}>
                <label>
                  <input type="checkbox" disabled={ro} checked={on} onChange={() => toggle(src)} />
                  <b>{src.item.description || t('ord.noName')}</b>
                  <span className="tms-muted tms-sm"> {sumText(src.item)} · {t('ord.fromStop', { n: src.stopNo })}</span>
                </label>
                {on && !ro && <button type="button" className="tms-btn sm" onClick={() => edit(src)} title={t('ord.editDiffHint')}>{t('ord.editDiff')}</button>}
              </div>
            );
          })}
        </div>
      )}
      {manual.length > 0 && <div className="tms-sm tms-muted" style={{ margin: '8px 0 4px' }}>{t('ord.otherItems')}</div>}
      {manual.map((it, i) => (
        <ItemCard key={it._k} it={it} n={i + 1} ro={ro} set={(p) => setManual(it._k, p)}
          remove={items.length > 1 ? () => setItems(items.filter((x) => x._k !== it._k)) : null} />
      ))}
      {!ro && <button type="button" className="tms-btn sm" onClick={() => setItems([...items, keyItem(emptyItem())])}>+ {t('ord.addOther')}</button>}
      <datalist id="tms-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
    </div>
  );
}

function StopCard({ stop, idx, count, set, move, remove, ro, errs, sources }) {
  const { t } = useApp();
  const upd = (patch) => set({ ...stop, ...patch });
  const bad = (f) => errs.some((e) => e.path.startsWith(`stops.${idx}.${f}`));
  return (
    <div className={`tms-stopcard ${stop.type}`}>
      <div className="tms-stop-h">
        <span className="tms-stop-n">{idx + 1}</span>
        <select disabled={ro} value={stop.type} onChange={(e) => upd({ type: e.target.value })} style={{ width: 'auto' }} className={bad('type') ? 'bad' : ''}>
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
      <ZonePicker stop={stop} upd={upd} ro={ro} bad={bad} />
      <div className="tms-stop-grid">
        <Field label={t('ord.s.winStart')}><input type="datetime-local" disabled={ro} value={isoToLocal(stop.windowStart)} onChange={(e) => upd({ windowStart: localToIso(e.target.value) })} /></Field>
        <Field label={t('ord.s.winEnd')}><input type="datetime-local" disabled={ro} className={bad('windowEnd') ? 'bad' : ''} value={isoToLocal(stop.windowEnd)} onChange={(e) => upd({ windowEnd: localToIso(e.target.value) })} /></Field>
        <Field label={t('ord.s.contact')}><input disabled={ro} value={stop.contactName} onChange={(e) => upd({ contactName: e.target.value })} /></Field>
        <Field label={t('ord.s.phone')}><input disabled={ro} value={stop.contactPhone} onChange={(e) => upd({ contactPhone: e.target.value })} /></Field>
        <Field label={t('ord.s.instr')} className="wide"><input disabled={ro} value={stop.instructions} onChange={(e) => upd({ instructions: e.target.value })} /></Field>
      </div>
      <div className="tms-sm tms-muted" style={{ margin: '4px 0 6px' }}><b>{stop.type === 'pickup' ? t('ord.itemsLoad') : t('ord.itemsUnload')}</b></div>
      {stop.type === 'pickup'
        ? <PickupItems items={stop.items} setItems={(items) => upd({ items })} ro={ro} />
        : <DeliveryItems items={stop.items} setItems={(items) => upd({ items })} sources={sources} ro={ro} />}
    </div>
  );
}

/** Editor DO: header, stop berurutan (multi-leg), item dengan kapasitas lengkap, ringkasan muatan, validasi langsung. */
export default function OrderEditor({ id, onClose, onSaved }) {
  const { t, ordersApi, toast, settings, routes, saveRoute } = useApp();
  const [loading, setLoading] = useState(!!id);
  const calcRef = useRef(null);
  const [order, setOrder] = useState(() => {
    const o = { ...emptyOrder(), corridorM: settings.defaults.widthM };
    const h = hydrate(o);
    const src = h.stops[0].items.map((i) => ({ _k: nid('i'), _from: i._k }));
    h.stops[1] = { ...h.stops[1], items: src };
    return h;
  });
  const [doManual, setDoManual] = useState(false);
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
      setOrder(hydrate({ doNo: o.doNo, customer: o.customer, orderDate: o.orderDate, priority: o.priority, notes: o.notes, corridorM: o.corridorM ?? settings.defaults.widthM, stops: o.stops.map((s) => ({ ...s })) }));
      setDoManual(true);
      setLoading(false);
    }).catch((e) => {
      if (dead) return;
      toast(apiErrorText(t, e), 'err');
      onClose();
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const eff = useMemo(() => effective(order), [order]);
  const norm = useMemo(() => normalizeOrder(eff), [eff]);
  const val = useMemo(() => validateOrder(norm), [norm]);
  const tot = useMemo(() => totals(norm), [norm]);
  const blockers = useMemo(() => dispatchBlockers(norm), [norm]);
  const upd = (patch) => { setOrder((o) => ({ ...o, ...patch })); setServerErr(''); };
  const setCustomer = (customer) => upd(!meta && !doManual ? { customer, doNo: genDoNo(customer) } : { customer });
  const setStop = (i, s) => {
    const old = order.stops[i];
    let stops = order.stops.map((x, k) => (k === i ? s : x));
    // barang baru di pickup ikut tercentang di delivery yang sebelumnya memuat semua barang pickup ini
    if (s.type === 'pickup' && old.type === 'pickup' && s.items.length > old.items.length) {
      const oldKeys = old.items.map((x) => x._k);
      const added = s.items.filter((x) => !oldKeys.includes(x._k));
      stops = stops.map((d, k) => {
        if (k <= i || d.type !== 'delivery' || d.items.some((x) => !x._from)) return d;
        const have = new Set(d.items.map((x) => x._from));
        return oldKeys.every((key) => have.has(key)) ? { ...d, items: [...d.items, ...added.map((a) => ({ _k: nid('i'), _from: a._k }))] } : d;
      });
    }
    upd({ stops });
  };
  const move = (i, d) => {
    const a = clone(order.stops);
    [a[i], a[i + d]] = [a[i + d], a[i]];
    upd({ stops: a });
  };
  const addStop = (type) => {
    const ns = keyStop(emptyStop(type));
    if (type === 'delivery') {
      const used = new Set(order.stops.flatMap((x) => x.items.map((i) => i._from).filter(Boolean)));
      const free = sourcesFor([...order.stops, ns], order.stops.length).filter((x) => !used.has(x.key));
      if (free.length) ns.items = free.map((x) => ({ _k: nid('i'), _from: x.key }));
    }
    upd({ stops: [...order.stops, ns] });
  };
  const shownErrors = useMemo(() => val.errors.filter((e) => !(e.code === 'do_no_required' && !meta && !doManual)), [val, meta, doManual]);
  const fieldBad = (f) => val.errors.some((e) => e.path === f);

  const save = async () => {
    if (val.errors.length) return;
    setBusy(true);
    setServerErr('');
    try {
      const r = meta ? await ordersApi.update(meta.id, eff, meta.version) : await ordersApi.create(eff);
      toast(t('ord.saved', { no: r.order.doNo }));
      // simpan rute DO ke menu Rute (id tetap, diperbarui bila DO diubah)
      const pts = routableStops(norm.stops);
      if (calcRef.current && pts.length >= 2) {
        try {
          await saveOrderRoute({ order: { id: r.order.id, doNo: r.order.doNo }, stops: pts, calc: calcRef.current, settings, widthM: norm.corridorM, existing: routes.find((x) => x.id === routeIdOf(r.order.id)), saveRoute, colorIdx: routes.length });
          toast(t('ord.route.saved'));
        } catch (e) { toast(`${t('ord.route.saveFail')}: ${e.message || e}`, 'err'); }
      }
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
            <Field label={t('ord.customer')}><input disabled={ro} autoFocus={!meta} className={fieldBad('customer') ? 'bad' : ''} value={order.customer} onChange={(e) => setCustomer(e.target.value)} /></Field>
            <Field label={t('ord.doNo')} hint={!meta && !ro ? (doManual ? t('ord.doManual') : t('ord.doAuto')) : undefined}>
              <div className="tms-dono">
                <input disabled={ro} readOnly={!meta && !doManual} className={fieldBad('doNo') && (doManual || meta) ? 'bad' : ''} value={order.doNo} placeholder={t('ord.doPh')} onChange={(e) => upd({ doNo: e.target.value })} />
                {!meta && !ro && <button type="button" className="tms-btn sm" onClick={() => { const m = !doManual; setDoManual(m); if (!m) upd({ doNo: genDoNo(order.customer) }); }}>{doManual ? t('ord.doAutoBtn') : t('ord.doEdit')}</button>}
              </div>
            </Field>
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
                <StopCard key={s._uid} stop={s} idx={i} sources={sourcesFor(order.stops, i)} count={order.stops.length} ro={ro} errs={val.errors}
                  set={(v) => setStop(i, v)} move={(d) => move(i, d)} remove={() => upd({ stops: order.stops.filter((_, k) => k !== i) })} />
              ))}
              <RouteCard existing={meta ? routes.find((x) => x.id === routeIdOf(meta.id)) : null} stops={norm.stops} widthM={order.corridorM} onWidth={(v) => upd({ corridorM: v })} ro={ro} onCalc={(c) => { calcRef.current = c; }} />
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
                  {shownErrors.length === 0 && !serverErr && <div className="tms-issue ok">✓ {t('ord.check.ok')}</div>}
                  {shownErrors.map((e, i) => <div key={`e${i}`} className="tms-issue err">{issueText(t, e)}</div>)}
                  {val.warnings.map((e, i) => <div key={`w${i}`} className="tms-issue warn">{issueText(t, e)}</div>)}
                  {shownErrors.length === 0 && (
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
