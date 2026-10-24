import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Empty, Spinner, download } from '../components/ui.jsx';
import { toCSV } from '../core/csv.js';
import { SEV_CLS, fmtMin } from '../lib/excView.js';
import { apiErrorText, fmtNum } from '../lib/orderView.js';

const pad = (n) => String(n).padStart(2, '0');
/** Tanggal lokal (bukan UTC) agar jam 00-07 WIB tidak jatuh ke hari sebelumnya. */
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const pct = (v) => (v == null ? '-' : `${fmtNum(v * 100, 1)}%`);
const MAX_DAYS = 92;

export function presetRange(key, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === '7') return [ymd(addDays(today, -6)), ymd(today)];
  if (key === '30') return [ymd(addDays(today, -29)), ymd(today)];
  if (key === '90') return [ymd(addDays(today, -89)), ymd(today)];
  if (key === 'month') return [ymd(new Date(today.getFullYear(), today.getMonth(), 1)), ymd(today)];
  if (key === 'last') return [ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)), ymd(new Date(today.getFullYear(), today.getMonth(), 0))];
  return null;
}
export const rangeDays = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
export const rangeOk = (from, to) => /^\d{4}-\d\d-\d\d$/.test(from) && /^\d{4}-\d\d-\d\d$/.test(to) && rangeDays(from, to) >= 1 && rangeDays(from, to) <= MAX_DAYS;
const fmtWeight = (kg) => (kg >= 1000 ? `${fmtNum(kg / 1000, 1)} t` : `${fmtNum(kg, 0)} kg`);
const fmtDate = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** Selisih terhadap periode pembanding. kind 'rate' = poin persentase, 'num' = persen perubahan; better = arah yang baik. */
export function deltaOf(cur, prev, kind) {
  if (cur == null || prev == null) return null;
  if (kind === 'rate') return { v: (cur - prev) * 100, text: `${fmtNum(Math.abs(cur - prev) * 100, 1)}` };
  if (!prev) return cur ? { v: null, text: 'baru' } : { v: 0, text: '0' };
  const d = ((cur - prev) / prev) * 100;
  return { v: d, text: `${fmtNum(Math.abs(d), 0)}%` };
}
function Delta({ cur, prev, kind = 'num', better = 'up', t }) {
  const d = deltaOf(cur, prev, kind);
  if (!d) return <span className="pf-d none">-</span>;
  const flat = d.v != null && Math.abs(d.v) < (kind === 'rate' ? 0.05 : 0.5);
  if (flat) return <span className="pf-d flat">{t('perf.same')}</span>;
  const up = d.v == null || d.v > 0;
  const good = d.v == null ? true : (better === 'up') === up;
  return <span className={`pf-d ${good ? 'good' : 'bad'}`}>{up ? '▲' : '▼'} {d.text}{kind === 'rate' ? ` ${t('perf.pts')}` : ''}</span>;
}

function Tip({ x, children }) {
  return <div className="pf-tip" style={{ left: `${x}%` }} role="status">{children}</div>;
}

/** DO dibuat vs selesai per hari. */
function DayBars({ daily, t }) {
  const [hi, setHi] = useState(null);
  const max = Math.max(1, ...daily.map((d) => d.created));
  const W = 720, H = 170, L = 30, B = 20, step = (W - L) / daily.length, bw = Math.min(14, step * 0.38);
  const y = (v) => H - B - (v / max) * (H - B - 8);
  const every = Math.max(1, Math.ceil(daily.length / 12));
  return (
    <div className="pf-chart" onMouseLeave={() => setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t('perf.daily')}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={y(f * max)} y2={y(f * max)} className="pf-grid" /><text x={L - 6} y={y(f * max) + 3} className="pf-ax" textAnchor="end">{fmtNum(Math.round(f * max))}</text></g>)}
        {daily.map((d, i) => {
          const cx = L + i * step + step / 2;
          return (
            <g key={d.date}>
              {hi === i && <rect x={L + i * step} y={4} width={step} height={H - B - 4} className="pf-hl" />}
              <rect x={cx - bw - 1} y={y(d.created)} width={bw} height={Math.max(0, H - B - y(d.created))} className="pf-s2" rx="2" />
              <rect x={cx + 1} y={y(d.done)} width={bw} height={Math.max(0, H - B - y(d.done))} className="pf-s1" rx="2" />
              {i % every === 0 && <text x={cx} y={H - 5} className="pf-ax" textAnchor="middle">{d.date.slice(8)}/{d.date.slice(5, 7)}</text>}
              <rect x={L + i * step} y={0} width={step} height={H - B} fill="transparent" onMouseEnter={() => setHi(i)} onFocus={() => setHi(i)} />
            </g>
          );
        })}
      </svg>
      {hi != null && <Tip x={Math.min(88, Math.max(12, ((L + hi * step + step / 2) / W) * 100))}><b>{fmtDate(daily[hi].date)}</b><span><i className="pf-sw s2" />{t('perf.created')} {daily[hi].created}</span><span><i className="pf-sw s1" />{t('ord.status.done')} {daily[hi].done}</span></Tip>}
    </div>
  );
}

/** Persentase tepat waktu per hari (satu sumbu, 0-100%). Hari tanpa stop terukur memutus garis. */
function OnTimeLine({ daily, t }) {
  const [hi, setHi] = useState(null);
  const W = 720, H = 120, L = 30, B = 18, step = (W - L) / daily.length;
  const y = (r) => 6 + (1 - r) * (H - B - 12);
  const pts = daily.map((d, i) => (d.measured ? { i, x: L + i * step + step / 2, r: d.ontime / d.measured, d } : null));
  const segs = []; let cur = [];
  pts.forEach((p) => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } });
  if (cur.length) segs.push(cur);
  return (
    <div className="pf-chart" onMouseLeave={() => setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t('perf.ontimeTrend')}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={y(f)} y2={y(f)} className="pf-grid" /><text x={L - 6} y={y(f) + 3} className="pf-ax" textAnchor="end">{f * 100}%</text></g>)}
        <line x1={L} x2={W} y1={y(0.9)} y2={y(0.9)} className="pf-target" />
        {segs.map((s, k) => <polyline key={k} points={s.map((p) => `${p.x},${y(p.r)}`).join(' ')} className="pf-line" />)}
        {pts.map((p) => p && <circle key={p.i} cx={p.x} cy={y(p.r)} r={hi === p.i ? 4.5 : 3} className="pf-dot" />)}
        {daily.map((d, i) => <rect key={d.date} x={L + i * step} y={0} width={step} height={H - B} fill="transparent" onMouseEnter={() => setHi(i)} />)}
      </svg>
      {hi != null && daily[hi].measured > 0 && <Tip x={Math.min(88, Math.max(12, ((L + hi * step + step / 2) / W) * 100))}><b>{fmtDate(daily[hi].date)}</b><span>{t('perf.onTime')} {pct(daily[hi].ontime / daily[hi].measured)}</span><span>{t('perf.stops', { a: daily[hi].ontime, b: daily[hi].measured })}</span></Tip>}
    </div>
  );
}

const STATUS_ORDER = ['draft', 'offered', 'assigned', 'running', 'done', 'cancelled'];
function StatusMix({ counts, total, t }) {
  const rows = STATUS_ORDER.map((s) => ({ s, n: counts[s] || 0 }));
  return (
    <div>
      <div className="pf-stack" role="img" aria-label={t('perf.status')}>
        {total ? rows.filter((r) => r.n).map((r) => <i key={r.s} className={`st-${r.s}`} style={{ flexGrow: r.n }} title={`${t(`ord.status.${r.s}`)}: ${r.n}`} />) : <i className="st-draft" style={{ flexGrow: 1, opacity: 0.4 }} />}
      </div>
      <ul className="pf-legend">
        {rows.map((r) => <li key={r.s}><i className={`pf-sw st-${r.s}`} /><span>{t(`ord.status.${r.s}`)}</span><b>{fmtNum(r.n)}</b><em>{total ? `${fmtNum((r.n / total) * 100, 0)}%` : '-'}</em></li>)}
      </ul>
    </div>
  );
}

function Metric({ label, value, sub, delta }) {
  return (
    <div className="pf-m">
      <div className="pf-m-l">{label}</div>
      <div className="pf-m-v">{value}</div>
      {delta}
      {sub && <div className="pf-m-s">{sub}</div>}
    </div>
  );
}

/** Dashboard kinerja DO. Semua angka mengikuti rentang tanggal yang dipilih pada slicer. */
export default function PerformancePage() {
  const { t, ordersApi } = useApp();
  const [preset, setPreset] = useState('30');
  const init = presetRange('30');
  const [from, setFrom] = useState(init[0]);
  const [to, setTo] = useState(init[1]);
  const [rep, setRep] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [view, setView] = useState('chart');
  const valid = rangeOk(from, to);

  const load = useCallback(async () => {
    if (!rangeOk(from, to)) return;
    setBusy(true); setErr('');
    try { setRep(await ordersApi.insights.report({ from, to })); } catch (e) { setErr(apiErrorText(t, e)); }
    setBusy(false);
  }, [ordersApi, from, to, t]);
  useEffect(() => { load(); }, [load]);

  const pick = (key) => {
    setPreset(key);
    const r = presetRange(key);
    if (r) { setFrom(r[0]); setTo(r[1]); }
  };
  const edit = (setter) => (e) => { setter(e.target.value); setPreset('custom'); };

  const k = rep?.kpi;
  const maxExc = useMemo(() => Math.max(1, ...(rep?.exceptionsByKind || []).map((x) => x.n)), [rep]);
  const sev = useMemo(() => {
    const o = { high: 0, medium: 0, low: 0 };
    (rep?.exceptionsByKind || []).forEach((x) => { o[x.severity] = (o[x.severity] || 0) + x.n; });
    return o;
  }, [rep]);
  const p = rep?.prev;

  const csv = () => {
    const cols = [
      { label: t('pod.vendor'), key: 'vendorName' }, { label: t('perf.v.sent'), key: 'sent' }, { label: t('perf.v.accepted'), key: 'accepted' }, { label: t('perf.v.rejected'), key: 'rejected' }, { label: t('perf.v.expired'), key: 'expired' },
      { label: `${t('perf.v.acceptRate')} %`, get: (r) => (r.acceptRate == null ? '' : (r.acceptRate * 100).toFixed(1)) }, { label: `${t('perf.v.response')} (min)`, get: (r) => (r.responseMin == null ? '' : Math.round(r.responseMin)) },
      { label: t('perf.v.orders'), key: 'orders' }, { label: t('ord.status.done'), key: 'done' }, { label: `${t('perf.onTime')} %`, get: (r) => (r.onTimeRate == null ? '' : (r.onTimeRate * 100).toFixed(1)) },
      { label: t('perf.v.qtyDiff'), key: 'qtyDiff' }, { label: t('perf.v.exceptions'), key: 'exceptions' },
    ];
    download(`kinerja_vendor_${rep.range.from}_${rep.range.to}.csv`, toCSV(rep.vendors, cols, ';'));
  };

  return (
    <div className="tms-page pf">
      <div className="pf-top">
        <h2>{t('perf.title')}</h2>
        <div className="tms-grow" />
        <button className="tms-btn" disabled={!rep || !rep.vendors.length} onClick={csv}>{t('rep.csv')}</button>
        <button className="tms-btn sm" onClick={load} disabled={busy || !valid} title={t('refresh')} aria-label={t('refresh')}>↻</button>
      </div>

      <div className="pf-filter">
        <div className="pf-seg" role="group" aria-label={t('perf.date')}>
          {['7', '30', '90', 'month', 'last'].map((x) => <button key={x} className={preset === x ? 'on' : ''} aria-pressed={preset === x} onClick={() => pick(x)}>{t(`perf.p.${x}`)}</button>)}
          <button className={preset === 'custom' ? 'on' : ''} aria-pressed={preset === 'custom'} onClick={() => setPreset('custom')}>{t('perf.p.custom')}</button>
        </div>
        <label className="pf-date"><span>{t('perf.from')}</span><input type="date" value={from} max={to || undefined} onChange={edit(setFrom)} /></label>
        <label className="pf-date"><span>{t('perf.to')}</span><input type="date" value={to} min={from || undefined} onChange={edit(setTo)} /></label>
        <div className="pf-vs">{valid && p?.range?.from ? t('perf.vs', { a: fmtDate(p.range.from), b: fmtDate(p.range.to) }) : ''}</div>
      </div>
      {!valid && <div className="tms-banner" style={{ margin: '0 0 10px' }}>{t('perf.rangeBad')}</div>}
      {err && <div className="tms-banner" style={{ margin: '0 0 10px' }}>{err}</div>}
      {!rep && !err && valid && <Spinner />}

      {rep && (
        <div className={`pf-body${busy ? ' busy' : ''}`} aria-busy={busy}>
          <section className="pf-panel pf-head">
            <Metric label={t('perf.completion')} value={pct(k.completionRate)} delta={<Delta cur={k.completionRate} prev={p?.completionRate} kind="rate" t={t} />} sub={`${fmtNum(k.done)} ${t('ord.status.done')} / ${fmtNum(k.dispatched)} ${t('perf.dispatched', { n: '' }).trim()}`} />
            <Metric label={t('perf.onTime')} value={pct(k.onTimeRate)} delta={<Delta cur={k.onTimeRate} prev={p?.onTimeRate} kind="rate" t={t} />} sub={t('perf.stops', { a: k.onTimeStops, b: k.measuredStops })} />
            <Metric label={t('perf.total')} value={fmtNum(k.total)} delta={<Delta cur={k.total} prev={p?.total} t={t} />} sub={t('perf.dispatched', { n: k.dispatched })} />
            <Metric label={t('perf.exceptions')} value={fmtNum(k.exceptions)} delta={<Delta cur={k.exceptions} prev={p?.exceptions} better="down" t={t} />} sub={t('perf.resolveSub', { n: rep.handling.open })} />
          </section>

          <section className="pf-panel pf-ops">
            <h3>{t('perf.sec.ops')}</h3>
            <div className="pf-grid8">
              <Metric label={t('perf.leadAssign')} value={fmtMin(k.leadMin.toAssign)} sub={t('perf.leadAssignSub')} />
              <Metric label={t('perf.leadTrip')} value={fmtMin(k.leadMin.trip)} sub={t('perf.leadTripSub')} />
              <Metric label={t('perf.leadTotal')} value={fmtMin(k.leadMin.total)} delta={<Delta cur={k.leadMin.total} prev={p?.leadTotal} better="down" t={t} />} sub={t('perf.leadTotalSub')} />
              <Metric label={t('perf.resolve')} value={fmtMin(rep.handling.resolveMin)} sub={t('perf.resolveSub', { n: rep.handling.open })} />
              <Metric label={t('perf.lateStops')} value={fmtNum(rep.delay.lateStops)} sub={t('perf.lateStopsSub')} />
              <Metric label={t('perf.avgDelay')} value={fmtMin(rep.delay.avgMin)} sub={`${t('perf.maxDelay')}: ${fmtMin(rep.delay.maxMin)}`} />
              <Metric label={t('perf.load')} value={fmtWeight(rep.load.kg)} sub={t('perf.loadSub', { v: fmtWeight(rep.load.kgDone) })} />
              <Metric label={t('perf.fuelEff')} value={rep.fuel.kmPerL == null ? '-' : `${fmtNum(rep.fuel.kmPerL, 1)} km/L`} sub={rep.fuel.kmPerL == null ? t('perf.fuelNone') : t('perf.fuelSub', { n: rep.fuel.orders, l: fmtNum(rep.fuel.liters, 0) })} />
            </div>
          </section>

          <div className="pf-cols">
            <section className="pf-panel pf-wide">
              <div className="pf-ph">
                <h3>{t('perf.daily')}</h3>
                <span className="pf-key"><i className="pf-sw s2" />{t('perf.created')}<i className="pf-sw s1" />{t('ord.status.done')}</span>
                <div className="tms-grow" />
                <div className="pf-seg sm"><button className={view === 'chart' ? 'on' : ''} onClick={() => setView('chart')}>{t('perf.chart')}</button><button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>{t('perf.table')}</button></div>
              </div>
              {!rep.daily.length ? <Empty>{t('perf.empty')}</Empty> : view === 'chart' ? (
                <>
                  <DayBars daily={rep.daily} t={t} />
                  <h4 className="pf-sub">{t('perf.ontimeTrend')} <span className="pf-note">{t('perf.hint', { g: rep.graceMin })}</span></h4>
                  <OnTimeLine daily={rep.daily} t={t} />
                </>
              ) : (
                <div className="tms-tablewrap pf-scroll"><table><thead><tr><th>{t('perf.date')}</th><th className="num">{t('perf.created')}</th><th className="num">{t('ord.status.done')}</th><th className="num">{t('perf.onTime')}</th></tr></thead>
                  <tbody>{rep.daily.map((d) => <tr key={d.date}><td>{d.date}</td><td className="num">{d.created}</td><td className="num">{d.done}</td><td className="num">{d.measured ? pct(d.ontime / d.measured) : '-'}</td></tr>)}</tbody></table></div>
              )}
            </section>
            <section className="pf-panel">
              <div className="pf-ph"><h3>{t('perf.status')}</h3></div>
              <StatusMix counts={k.counts} total={k.total} t={t} />
            </section>
          </div>

          <div className="pf-cols even">
            <section className="pf-panel">
              <div className="pf-ph"><h3>{t('perf.excBreakdown')}</h3><div className="tms-grow" />{['high', 'medium', 'low'].map((s) => <span key={s} className={`tms-badge ${SEV_CLS[s]}`}>{t(`exc.sev.${s}`)} {sev[s]}</span>)}</div>
              {rep.exceptionsByKind.length === 0 ? <Empty>{t('perf.noExc')}</Empty> : rep.exceptionsByKind.map((x) => (
                <div key={x.kind} className="pf-hb">
                  <span className="pf-hb-l">{t(`exc.kind.${x.kind}`)}</span>
                  <span className="pf-hb-t"><i className={`sev-${x.severity}`} style={{ width: `${(x.n / maxExc) * 100}%` }} /></span>
                  <b>{x.n}</b>
                </div>
              ))}
            </section>
            <section className="pf-panel">
              <div className="pf-ph"><h3>{t('perf.customers')}</h3></div>
              {rep.topCustomers.length === 0 ? <Empty>{t('perf.noCust')}</Empty> : (
                <table className="pf-cust"><thead><tr><th>Customer</th><th className="num">{t('perf.v.orders')}</th><th>{t('perf.completion')}</th><th className="num">{t('perf.cust.exc')}</th></tr></thead>
                  <tbody>{rep.topCustomers.map((c) => (
                    <tr key={c.customer}><td><b>{c.customer}</b></td><td className="num">{c.orders}</td>
                      <td><span className="pf-mini"><i style={{ width: `${c.orders ? (c.done / c.orders) * 100 : 0}%` }} /></span><span className="pf-mini-n">{pct(c.orders ? c.done / c.orders : null)}</span></td>
                      <td className="num">{c.exceptions}</td></tr>
                  ))}</tbody></table>
              )}
            </section>
          </div>

          <section className="pf-panel">
            <div className="pf-ph"><h3>{t('perf.vendors')}</h3></div>
            {rep.vendors.length === 0 ? <Empty>{t('perf.emptyVendors')}</Empty> : (
              <div className="tms-tablewrap pf-scroll">
                <table>
                  <thead><tr><th>{t('pod.vendor')}</th><th className="num">{t('perf.v.sent')}</th><th className="num">{t('perf.v.accepted')}</th><th className="num">{t('perf.v.rejected')}</th><th className="num">{t('perf.v.expired')}</th><th className="num">{t('perf.v.acceptRate')}</th><th className="num">{t('perf.v.response')}</th><th className="num">{t('perf.v.orders')}</th><th className="num">{t('ord.status.done')}</th><th className="num">{t('perf.onTime')}</th><th className="num">{t('perf.v.qtyDiff')}</th><th className="num">{t('perf.v.exceptions')}</th></tr></thead>
                  <tbody>
                    {rep.vendors.map((v) => (
                      <tr key={v.vendorId}>
                        <td><b>{v.vendorName}</b></td><td className="num">{v.sent}</td><td className="num">{v.accepted}</td><td className="num">{v.rejected}</td><td className="num">{v.expired}</td>
                        <td className="num">{pct(v.acceptRate)}</td><td className="num">{fmtMin(v.responseMin)}</td><td className="num">{v.orders}</td><td className="num">{v.done}</td>
                        <td className="num"><span className={`tms-badge ${v.onTimeRate == null ? 'gray' : v.onTimeRate >= 0.9 ? 'green' : v.onTimeRate >= 0.75 ? 'amber' : 'red'}`}>{pct(v.onTimeRate)}</span></td>
                        <td className="num">{v.qtyDiff}</td><td className="num">{v.exceptions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
