import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Empty, Kpi, Spinner, download } from '../components/ui.jsx';
import { toCSV } from '../core/csv.js';
import { SEV_CLS, fmtMin } from '../lib/excView.js';
import { apiErrorText, fmtNum } from '../lib/orderView.js';

const ymd = (d) => d.toISOString().slice(0, 10);
const pct = (v) => (v == null ? '-' : `${fmtNum(v * 100, 1)}%`);
const tone = (v, good, warn) => (v == null ? '' : v >= good ? 'good' : v >= warn ? '' : 'bad');

function Bars({ daily, t }) {
  const max = Math.max(1, ...daily.map((d) => d.created));
  const W = Math.max(480, daily.length * 18), H = 140, pad = 22, bw = (W - pad) / daily.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label={t('perf.daily')}>
      {[0, 0.5, 1].map((f) => <line key={f} x1={pad} x2={W} y1={H - f * (H - 8)} y2={H - f * (H - 8)} stroke="#e4e9ef" />)}
      <text x="0" y="12" fontSize="9" fill="#6b7785">{max}</text>
      {daily.map((d, i) => {
        const hc = (d.created / max) * (H - 8), hd = (d.done / max) * (H - 8), x = pad + i * bw;
        return (
          <g key={d.date}>
            <title>{`${d.date}: ${d.created} DO, ${d.done} ${t('ord.status.done')}`}</title>
            <rect x={x + 1} y={H - hc} width={Math.max(2, bw * 0.45)} height={hc} fill="#9db7d6" rx="1" />
            <rect x={x + 1 + bw * 0.45} y={H - hd} width={Math.max(2, bw * 0.45)} height={hd} fill="#1f7a3d" rx="1" />
            {(daily.length <= 14 || i % Math.ceil(daily.length / 10) === 0) && <text x={x} y={H + 12} fontSize="9" fill="#6b7785">{d.date.slice(5)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Laporan kinerja DO: penyelesaian, tepat waktu, lead time, kinerja vendor, sebaran exception. */
export default function PerformancePage() {
  const { t, ordersApi } = useApp();
  const [days, setDays] = useState(30);
  const [rep, setRep] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setRep(null); setErr('');
    const to = new Date(); const from = new Date(Date.now() - (days - 1) * 864e5);
    try { setRep(await ordersApi.insights.report({ from: ymd(from), to: ymd(to) })); } catch (e) { setErr(apiErrorText(t, e)); }
  }, [ordersApi, days, t]);
  useEffect(() => { load(); }, [load]);

  const k = rep?.kpi;
  const maxExc = useMemo(() => Math.max(1, ...(rep?.exceptionsByKind || []).map((x) => x.n)), [rep]);
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
    <div className="tms-page">
      <div className="tms-row" style={{ marginBottom: 10 }}>
        <h2 className="tms-grow">{t('perf.title')}</h2>
        <select style={{ width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90].map((d) => <option key={d} value={d}>{t('evd.days', { d })}</option>)}</select>
        <button className="tms-btn" disabled={!rep || !rep.vendors.length} onClick={csv}>{t('rep.csv')}</button>
        <button className="tms-btn sm" onClick={load} title={t('refresh')}>↻</button>
      </div>
      <div className="tms-sm tms-muted" style={{ marginBottom: 8 }}>{t('perf.hint', { g: rep?.graceMin ?? 15 })}</div>
      {err && <div className="tms-banner" style={{ margin: '0 0 10px' }}>{err}</div>}
      {!rep && !err && <Spinner />}
      {rep && (
        <>
          <div className="tms-kpis">
            <Kpi label={t('perf.total')} value={fmtNum(k.total)} sub={t('perf.dispatched', { n: k.dispatched })} />
            <Kpi label={t('perf.completion')} value={pct(k.completionRate)} tone={tone(k.completionRate, 0.9, 0.7)} sub={`${k.done} ${t('ord.status.done')}`} />
            <Kpi label={t('perf.onTime')} value={pct(k.onTimeRate)} tone={tone(k.onTimeRate, 0.9, 0.75)} sub={t('perf.stops', { a: k.onTimeStops, b: k.measuredStops })} />
            <Kpi label={t('perf.leadAssign')} value={fmtMin(k.leadMin.toAssign)} sub={t('perf.leadAssignSub')} />
            <Kpi label={t('perf.leadTrip')} value={fmtMin(k.leadMin.trip)} sub={t('perf.leadTripSub')} />
            <Kpi label={t('perf.leadTotal')} value={fmtMin(k.leadMin.total)} sub={t('perf.leadTotalSub')} />
            <Kpi label={t('perf.exceptions')} value={fmtNum(k.exceptions)} tone={k.exceptions ? '' : 'good'} />
          </div>

          <div className="tms-card" style={{ marginBottom: 12 }}>
            <div className="tms-card-b">
              <b>{t('perf.daily')}</b> <span className="tms-sm tms-muted">· <span style={{ color: '#9db7d6' }}>■</span> {t('perf.created')} <span style={{ color: '#1f7a3d' }}>■</span> {t('ord.status.done')}</span>
              {rep.daily.length ? <Bars daily={rep.daily} t={t} /> : <Empty>{t('perf.empty')}</Empty>}
            </div>
          </div>

          <div className="tms-card" style={{ marginBottom: 12 }}>
            <div className="tms-card-b">
              <b>{t('perf.vendors')}</b>
              {rep.vendors.length === 0 ? <Empty>{t('perf.emptyVendors')}</Empty> : (
                <div className="tms-tablewrap" style={{ marginTop: 6 }}>
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
            </div>
          </div>

          <div className="tms-card">
            <div className="tms-card-b">
              <b>{t('perf.excBreakdown')}</b>
              {rep.exceptionsByKind.length === 0 ? <Empty>{t('perf.noExc')}</Empty> : rep.exceptionsByKind.map((x) => (
                <div key={x.kind} className="tms-row" style={{ gap: 8, margin: '6px 0' }}>
                  <span style={{ width: 230 }}>{t(`exc.kind.${x.kind}`)}</span>
                  <span className={`tms-bar ${x.severity === 'high' ? 'bad' : x.severity === 'medium' ? 'warn' : ''}`} style={{ width: 220 }}><i style={{ width: `${(x.n / maxExc) * 100}%`, ...(x.severity === 'low' ? { background: '#9aa7b5' } : {}) }} /></span>
                  <b>{x.n}</b> <span className={`tms-badge ${SEV_CLS[x.severity]}`}>{t(`exc.sev.${x.severity}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
