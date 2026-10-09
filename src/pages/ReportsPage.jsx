import React, { useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Empty, Kpi, StatusBadge, download } from '../components/ui.jsx';
import InstanceDetail from '../components/InstanceDetail.jsx';
import { addDays, fmtDateTime, fmtDur, fmtKm, fmtTime, parseYmd, ymd } from '../core/time.js';
import { expand } from '../core/schedule.js';
import { toCSV } from '../core/csv.js';
import { errMessage } from '../services/geotab.js';
import { fmtEconomy, fmtHours, fmtLiters, fuelEconomy, withApprox } from '../core/sensor.js';

const MAX_ROWS = 1500;

export default function ReportsPage() {
  const { t, lang, devices, deviceMap, driverMap, routeMap, assignments, geotab, evaluate, sensorWindows, getRules, toast, settings } = useApp();
  const unit = settings.units?.fuelEcon || 'kmpl';
  const today = ymd(new Date());
  const [from, setFrom] = useState(ymd(addDays(new Date(), -6)));
  const [to, setTo] = useState(today);
  const [sel, setSel] = useState([]);
  const [showSel, setShowSel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [rep, setRep] = useState(null);
  const [tab, setTab] = useState('summary');
  const [detail, setDetail] = useState(null);
  const sep = lang === 'id' ? ';' : ',';

  const preset = (p) => {
    const d = new Date();
    if (p === 'today') [setFrom(today), setTo(today)];
    else if (p === 'yesterday') {
      const y = ymd(addDays(d, -1));
      setFrom(y);
      setTo(y);
    } else {
      setFrom(ymd(addDays(d, -(p - 1))));
      setTo(today);
    }
  };

  const generate = async () => {
    if (from > to) return toast(t('rep.badRange'), 'err');
    const days = (parseYmd(to) - parseYmd(from)) / 864e5 + 1;
    if (days > 31 && !window.confirm(t('rep.bigRange', { n: days }))) return;
    setBusy(true);
    setRep(null);
    try {
      const fromMs = parseYmd(from).getTime();
      const toMs = Math.min(addDays(parseYmd(to), 1).getTime() - 1, Date.now());
      const ids = sel.length ? sel : null;
      setProgress({ label: t('rep.loading'), pct: 5 });
      const [trips, exceptions, rules] = await Promise.all([geotab.getTrips(fromMs, toMs, ids), geotab.getExceptions(fromMs, toMs, ids), getRules()]);
      // engine hour / fuel / economy per kendaraan (seluruh rentang) dan per trip, dari counter StatusData
      const byDev = new Map();
      trips.forEach((tr, i) => {
        if (!byDev.has(tr.deviceId)) byDev.set(tr.deviceId, []);
        byDev.get(tr.deviceId).push(i);
      });
      const sensors = { dev: new Map(), trip: new Map() };
      const devQueue = [...byDev.keys()];
      let sdone = 0;
      const sworker = async () => {
        while (devQueue.length) {
          const id = devQueue.shift();
          const idx = byDev.get(id);
          const distKm = idx.reduce((sum, i) => sum + trips[i].distanceKm, 0);
          try {
            const r = await sensorWindows(id, [{ from: fromMs, to: toMs, distKm }, ...idx.map((i) => ({ from: trips[i].startMs, to: trips[i].stopMs, distKm: trips[i].distanceKm }))]);
            sensors.dev.set(id, { ...r.items[0], hasHours: r.hasHours, hasFuel: r.hasFuel });
            idx.forEach((i, k) => sensors.trip.set(i, r.items[k + 1]));
          } catch {
            /* kendaraan tanpa sensor / gagal: kolom tampil "-" */
          }
          sdone++;
          setProgress({ label: `${t('rep.sensorLoading')} ${sdone}/${byDev.size}`, pct: 8 + (7 * sdone) / Math.max(1, byDev.size) });
        }
      };
      await Promise.all([sworker(), sworker(), sworker()]);
      const insts = expand(assignments, from, to).filter((i) => i.startMs < Date.now() && (!ids || ids.includes(i.deviceId)) && routeMap.has(i.routeId));
      const out = [];
      let done = 0;
      const queue = [...insts];
      const worker = async () => {
        while (queue.length) {
          const inst = queue.shift();
          try {
            const { result } = await evaluate(inst);
            out.push({ inst, result });
          } catch (e) {
            out.push({ inst, result: null, error: errMessage(e) });
          }
          done++;
          setProgress({ label: `${t('rep.evaluating')} ${done}/${insts.length}`, pct: 15 + (85 * done) / Math.max(1, insts.length) });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      out.sort((a, b) => a.inst.startMs - b.inst.startMs);
      setRep({ trips, exceptions, rules, sensors, runs: out, range: { from, to }, ids });
      setTab('summary');
    } catch (e) {
      toast(errMessage(e), 'err');
    }
    setBusy(false);
    setProgress(null);
  };

  const model = useMemo(() => (rep ? buildModel(rep, devices) : null), [rep, devices]);
  const name = (id) => deviceMap.get(id)?.name || id;

  const csv = (fname, rows, cols) => download(`${fname}_${rep.range.from}_${rep.range.to}.csv`, toCSV(rows, cols, sep));

  return (
    <div className="tms-page">
      <div className="tms-card" style={{ marginBottom: 12 }}>
        <div className="tms-card-b">
          <div className="tms-row" style={{ alignItems: 'flex-end' }}>
            <div>
              <div className="tms-field-label">{t('rep.range')}</div>
              <div className="tms-row">
                <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
                <span>–</span>
                <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
              </div>
            </div>
            <div className="tms-row">
              {[['today', t('rep.today')], ['yesterday', t('rep.yesterday')], [7, t('rep.last7')], [30, t('rep.last30')]].map(([k, l]) => (
                <button key={k} className="tms-btn sm" onClick={() => preset(k)}>{l}</button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <div className="tms-field-label">{t('rep.vehicles')}</div>
              <button className="tms-btn" onClick={() => setShowSel(!showSel)}>{sel.length ? `${sel.length} ${t('rep.selected')}` : t('rep.allVehicles')} ▾</button>
              {showSel && (
                <div className="tms-card" style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, width: 260, maxHeight: 280, overflow: 'auto', padding: 8, boxShadow: '0 6px 20px rgba(0,0,0,.2)' }}>
                  <button className="tms-btn sm" onClick={() => setSel([])}>{t('rep.allVehicles')}</button>
                  {devices.map((d) => (
                    <label key={d.id} className="tms-row tms-sm" style={{ padding: '3px 0' }}>
                      <input type="checkbox" checked={sel.includes(d.id)} onChange={() => setSel(sel.includes(d.id) ? sel.filter((x) => x !== d.id) : [...sel, d.id])} /> {d.name} <span className="tms-muted">{d.plate}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button className="tms-btn pri" onClick={generate} disabled={busy}>{busy ? t('loading') : t('rep.generate')}</button>
          </div>
          {progress && (
            <div style={{ marginTop: 10 }}>
              <div className="tms-sm tms-muted">{progress.label}</div>
              <div className="tms-progress"><i style={{ width: `${progress.pct}%` }} /></div>
            </div>
          )}
        </div>
      </div>

      {!rep && !busy && <Empty>{t('rep.hint')}</Empty>}

      {model && (
        <>
          <div className="tms-kpis">
            <Kpi label={t('rep.kpi.distance')} value={fmtKm(model.totals.distanceKm * 1000, 0)} />
            <Kpi label={t('rep.kpi.trips')} value={model.totals.trips} />
            <Kpi label={t('rep.kpi.driving')} value={fmtDur(model.totals.drivingSec)} />
            <Kpi label={t('rep.kpi.idle')} value={fmtDur(model.totals.idleSec)} sub={model.totals.drivingSec + model.totals.idleSec ? `${((100 * model.totals.idleSec) / (model.totals.drivingSec + model.totals.idleSec)).toFixed(0)}%` : ''} />
            <Kpi label={t('col.engineHours')} value={model.totals.engineSec == null ? '-' : fmtHours(model.totals.engineSec)} />
            <Kpi label={t('col.fuelUsed')} value={model.totals.fuelL == null ? '-' : fmtLiters(model.totals.fuelL, 0)} />
            <Kpi label={t('col.fuelEcon')} value={fmtEconomy(model.totals.eco, unit)} />
            <Kpi label={t('rep.kpi.exceptions')} value={model.totals.exceptions} />
            <Kpi label={t('rep.kpi.runs')} value={`${model.totals.completed}/${model.totals.runs}`} sub={t('rep.kpi.runsSub')} tone="good" />
            <Kpi label={t('rep.kpi.compliance')} value={model.totals.compliance == null ? '-' : `${model.totals.compliance.toFixed(0)}%`} tone={model.totals.compliance != null && model.totals.compliance < 90 ? 'bad' : ''} />
            <Kpi label={t('rep.kpi.deviations')} value={model.totals.deviations} tone={model.totals.deviations ? 'bad' : ''} />
          </div>

          <div className="tms-tabs">
            {['summary', 'trips', 'exceptions', 'compliance'].map((k) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(`rep.tab.${k}`)}</button>
            ))}
            <span className="tms-grow" />
            <button className="tms-btn sm" style={{ alignSelf: 'center' }} onClick={() => exportTab(tab)}>⬇ CSV</button>
          </div>

          {tab === 'summary' && (
            <div className="tms-tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('asg.vehicle')}</th><th className="num">{t('rep.kpi.trips')}</th><th className="num">{t('rep.col.km')}</th><th className="num">{t('rep.kpi.driving')}</th><th className="num">{t('rep.kpi.idle')}</th>
                    <th className="num">{t('col.engineHours')}</th><th className="num">{t('col.fuelUsed')}</th><th className="num">{t('col.fuelEcon')}</th>
                    <th className="num">{t('rep.col.maxSpeed')}</th><th className="num">{t('rep.kpi.exceptions')}</th><th className="num">{t('rep.col.runs')}</th><th className="num">{t('status.deviated')}</th><th className="num">{t('status.missed')}</th>
                    <th className="num">{t('detail.compliance')}</th><th className="num">{t('rep.col.outKm')}</th>
                  </tr>
                </thead>
                <tbody>
                  {model.summary.length === 0 && <tr><td colSpan={15}><Empty>{t('rep.empty')}</Empty></td></tr>}
                  {model.summary.map((r) => (
                    <tr key={r.id}>
                      <td><b>{name(r.id)}</b> <span className="tms-muted tms-sm">{deviceMap.get(r.id)?.plate}</span></td>
                      <td className="num">{r.trips}</td><td className="num">{r.distanceKm.toFixed(1)}</td><td className="num">{fmtDur(r.drivingSec)}</td><td className="num">{fmtDur(r.idleSec)}</td>
                      <td className="num">{withApprox(r.sens, fmtHours(r.sens?.engineSec))}</td><td className="num">{withApprox(r.sens, fmtLiters(r.sens?.fuelL))}</td><td className="num">{withApprox(r.sens, fmtEconomy(r.sens, unit))}</td>
                      <td className="num">{r.maxSpeed ? Math.round(r.maxSpeed) : '-'}</td><td className="num">{r.exceptions}</td><td className="num">{r.runs}</td>
                      <td className="num" style={{ color: r.deviated ? '#d63a3a' : undefined }}>{r.deviated}</td><td className="num">{r.missed}</td>
                      <td className="num">{r.compliance == null ? '-' : <Bar pct={r.compliance} />}</td><td className="num">{(r.outM / 1000).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'trips' && (
            <div className="tms-tablewrap">
              <table>
                <thead><tr><th>{t('asg.vehicle')}</th><th>{t('asg.driver')}</th><th>{t('detail.start')}</th><th>{t('detail.end')}</th><th className="num">{t('rep.col.km')}</th><th className="num">{t('rep.kpi.driving')}</th><th className="num">{t('rep.kpi.idle')}</th><th className="num">{t('rep.col.stop')}</th><th className="num">{t('col.engineHours')}</th><th className="num">{t('col.fuelUsed')}</th><th className="num">{t('col.fuelEcon')}</th><th className="num">{t('rep.col.maxSpeed')}</th></tr></thead>
                <tbody>
                  {rep.trips.length === 0 && <tr><td colSpan={12}><Empty>{t('rep.empty')}</Empty></td></tr>}
                  {rep.trips.slice(0, MAX_ROWS).map((r, i) => (
                    <tr key={i}>
                      <td>{name(r.deviceId)}</td><td>{driverMap.get(r.driverId)?.name || '—'}</td><td>{fmtDateTime(r.startMs)}</td><td>{fmtDateTime(r.stopMs)}</td>
                      <td className="num">{r.distanceKm.toFixed(1)}</td><td className="num">{fmtDur(r.drivingSec)}</td><td className="num">{fmtDur(r.idleSec)}</td><td className="num">{fmtDur(r.stopSec)}</td>
                      {(() => {
                        const x = rep.sensors?.trip.get(i);
                        return (
                          <>
                            <td className="num">{withApprox(x, fmtHours(x?.engineSec, 2))}</td><td className="num">{withApprox(x, fmtLiters(x?.fuelL))}</td><td className="num">{withApprox(x, fmtEconomy(x, unit))}</td>
                          </>
                        );
                      })()}
                      <td className="num">{Math.round(r.maxSpeed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rep.trips.length > MAX_ROWS && <div className="tms-sm tms-muted" style={{ padding: 8 }}>{t('rep.truncated', { n: MAX_ROWS })}</div>}
            </div>
          )}

          {tab === 'exceptions' && (
            <div className="tms-tablewrap">
              <table>
                <thead>
                  <tr><th>{t('asg.vehicle')}</th>{model.ruleCols.map((r) => <th key={r.id} className="num">{r.name}</th>)}<th className="num">Total</th><th className="num">{t('rep.col.excDur')}</th></tr>
                </thead>
                <tbody>
                  {model.excRows.length === 0 && <tr><td colSpan={model.ruleCols.length + 3}><Empty>{t('rep.empty')}</Empty></td></tr>}
                  {model.excRows.map((r) => (
                    <tr key={r.id}>
                      <td><b>{name(r.id)}</b></td>
                      {model.ruleCols.map((c) => <td key={c.id} className="num">{r.byRule[c.id] || ''}</td>)}
                      <td className="num"><b>{r.total}</b></td><td className="num">{fmtDur(r.durSec)}</td>
                    </tr>
                  ))}
                  {model.excRows.length > 0 && (
                    <tr style={{ background: '#fafbfc' }}>
                      <td><b>Total</b></td>{model.ruleCols.map((c) => <td key={c.id} className="num"><b>{c.total}</b></td>)}<td className="num"><b>{model.totals.exceptions}</b></td><td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'compliance' && (
            <div className="tms-tablewrap">
              <table>
                <thead>
                  <tr><th>{t('asg.date')}</th><th>{t('asg.vehicle')}</th><th>{t('asg.driver')}</th><th>{t('asg.route')}</th><th>{t('mon.window')}</th><th>{t('mon.status')}</th><th className="num">{t('detail.checkpoints')}</th><th className="num">{t('detail.compliance')}</th><th className="num">{t('detail.deviations')}</th><th className="num">{t('rep.col.outKm')}</th><th className="num">{t('detail.maxOff')}</th><th className="num">{t('rep.col.lastDelay')}</th></tr>
                </thead>
                <tbody>
                  {rep.runs.length === 0 && <tr><td colSpan={12}><Empty>{t('rep.noRuns')}</Empty></td></tr>}
                  {rep.runs.slice(0, MAX_ROWS).map(({ inst, result, error }) => {
                    const lastDelay = result ? [...result.checkpoints].reverse().find((c) => c.delayMin != null)?.delayMin : null;
                    return (
                      <tr key={inst.key} className="click" onClick={() => setDetail(inst)}>
                        <td>{inst.date}</td><td><b>{name(inst.deviceId)}</b></td><td>{driverMap.get(inst.driverId)?.name || '—'}</td><td>{routeMap.get(inst.routeId)?.name}</td>
                        <td>{fmtTime(inst.startMs)}–{fmtTime(inst.endMs)}</td>
                        <td>{error ? <span className="tms-err" title={error}>error</span> : <StatusBadge status={result.status} />}</td>
                        {result ? (
                          <>
                            <td className="num">{result.arrivedCount}/{result.totalCheckpoints}</td>
                            <td className="num">{result.compliancePct == null ? '-' : <Bar pct={result.compliancePct} />}</td>
                            <td className="num">{result.deviations.length}</td><td className="num">{(result.outsideDistM / 1000).toFixed(2)}</td><td className="num">{Math.round(result.maxDistM)} m</td>
                            <td className="num">{lastDelay == null ? '-' : `${lastDelay > 0 ? '+' : ''}${lastDelay.toFixed(0)} m`}</td>
                          </>
                        ) : <td colSpan={6} />}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {detail && <InstanceDetail inst={detail} onClose={() => setDetail(null)} />}
    </div>
  );

  // kolom CSV sensor: angka murni (jam, liter, km/L, L/100km) + penanda perkiraan
  function sensorCols(pick) {
    const n = (v, d) => (v == null ? '' : v.toFixed(d));
    return [
      { label: `${t('col.engineHours')} (h)`, get: (r) => n(pick(r)?.engineSec == null ? null : pick(r).engineSec / 3600, 2) },
      { label: `${t('col.fuelUsed')} (L)`, get: (r) => n(pick(r)?.fuelL, 2) },
      { label: 'km/L', get: (r) => n(pick(r)?.kmPerL, 2) },
      { label: 'L/100km', get: (r) => n(pick(r)?.lPer100km, 1) },
      { label: t('rep.approx'), get: (r) => (pick(r)?.approx ? '~' : '') },
    ];
  }

  function exportTab(k) {
    if (k === 'summary') {
      csv('ringkasan_armada', model.summary, [
        { label: t('asg.vehicle'), get: (r) => name(r.id) }, { label: 'Plate', get: (r) => deviceMap.get(r.id)?.plate || '' },
        { label: t('rep.kpi.trips'), key: 'trips' }, { label: 'km', get: (r) => r.distanceKm.toFixed(1) }, { label: `${t('rep.kpi.driving')} (s)`, get: (r) => Math.round(r.drivingSec) },
        { label: `${t('rep.kpi.idle')} (s)`, get: (r) => Math.round(r.idleSec) },
        ...sensorCols((r) => r.sens),
        { label: t('rep.col.maxSpeed'), get: (r) => Math.round(r.maxSpeed) }, { label: t('rep.kpi.exceptions'), key: 'exceptions' },
        { label: t('rep.col.runs'), key: 'runs' }, { label: t('status.completed'), key: 'completed' }, { label: t('status.deviated'), key: 'deviated' }, { label: t('status.missed'), key: 'missed' },
        { label: `${t('detail.compliance')} %`, get: (r) => (r.compliance == null ? '' : r.compliance.toFixed(1)) }, { label: `${t('rep.col.outKm')}`, get: (r) => (r.outM / 1000).toFixed(2) },
      ]);
    } else if (k === 'trips') {
      const tripIdx = new Map(rep.trips.map((tr, i) => [tr, i]));
      csv('trip', rep.trips, [
        { label: t('asg.vehicle'), get: (r) => name(r.deviceId) }, { label: t('asg.driver'), get: (r) => driverMap.get(r.driverId)?.name || '' }, { label: t('detail.start'), get: (r) => fmtDateTime(r.startMs) },
        { label: t('detail.end'), get: (r) => fmtDateTime(r.stopMs) }, { label: 'km', get: (r) => r.distanceKm.toFixed(2) }, { label: `${t('rep.kpi.driving')} (s)`, get: (r) => Math.round(r.drivingSec) },
        { label: `${t('rep.kpi.idle')} (s)`, get: (r) => Math.round(r.idleSec) }, { label: `${t('rep.col.stop')} (s)`, get: (r) => Math.round(r.stopSec) },
        ...sensorCols((r) => rep.sensors?.trip.get(tripIdx.get(r))),
        { label: t('rep.col.maxSpeed'), get: (r) => Math.round(r.maxSpeed) },
      ]);
    } else if (k === 'exceptions') {
      csv('exception', rep.exceptions, [
        { label: t('asg.vehicle'), get: (r) => name(r.deviceId) }, { label: t('asg.driver'), get: (r) => driverMap.get(r.driverId)?.name || '' }, { label: 'Rule', get: (r) => rep.rules[r.ruleId] || r.ruleId },
        { label: t('detail.start'), get: (r) => fmtDateTime(r.startMs) }, { label: t('detail.end'), get: (r) => fmtDateTime(r.endMs) }, { label: `${t('rep.col.excDur')} (s)`, get: (r) => Math.round(r.durationSec) },
      ]);
    } else {
      csv('kepatuhan_rute', rep.runs.filter((r) => r.result), [
        { label: t('asg.date'), get: (r) => r.inst.date }, { label: t('asg.vehicle'), get: (r) => name(r.inst.deviceId) }, { label: t('asg.driver'), get: (r) => driverMap.get(r.inst.driverId)?.name || '' },
        { label: t('asg.route'), get: (r) => routeMap.get(r.inst.routeId)?.name }, { label: t('mon.status'), get: (r) => t(`status.${r.result.status}`) },
        { label: t('detail.checkpoints'), get: (r) => `${r.result.arrivedCount}/${r.result.totalCheckpoints}` }, { label: `${t('detail.compliance')} %`, get: (r) => (r.result.compliancePct == null ? '' : r.result.compliancePct.toFixed(1)) },
        { label: t('detail.deviations'), get: (r) => r.result.deviations.length }, { label: t('rep.col.outKm'), get: (r) => (r.result.outsideDistM / 1000).toFixed(2) }, { label: `${t('detail.maxOff')} (m)`, get: (r) => Math.round(r.result.maxDistM) },
      ]);
    }
  }
}

function Bar({ pct }) {
  const cls = pct >= 95 ? '' : pct >= 85 ? 'warn' : 'bad';
  return (
    <span><span className={`tms-bar ${cls}`}><i style={{ width: `${pct}%` }} /></span>{pct.toFixed(0)}%</span>
  );
}

function buildModel(rep, devices) {
  const per = new Map();
  const row = (id) => {
    if (!per.has(id)) per.set(id, { id, trips: 0, distanceKm: 0, drivingSec: 0, idleSec: 0, maxSpeed: 0, exceptions: 0, runs: 0, completed: 0, deviated: 0, missed: 0, compSum: 0, compN: 0, outM: 0, deviations: 0 });
    return per.get(id);
  };
  for (const tr of rep.trips) {
    const r = row(tr.deviceId);
    r.trips++;
    r.distanceKm += tr.distanceKm;
    r.drivingSec += tr.drivingSec;
    r.idleSec += tr.idleSec;
    r.maxSpeed = Math.max(r.maxSpeed, tr.maxSpeed);
  }
  const ruleTotals = new Map();
  const excBy = new Map();
  for (const e of rep.exceptions) {
    row(e.deviceId).exceptions++;
    ruleTotals.set(e.ruleId, (ruleTotals.get(e.ruleId) || 0) + 1);
    if (!excBy.has(e.deviceId)) excBy.set(e.deviceId, { id: e.deviceId, byRule: {}, total: 0, durSec: 0 });
    const x = excBy.get(e.deviceId);
    x.byRule[e.ruleId] = (x.byRule[e.ruleId] || 0) + 1;
    x.total++;
    x.durSec += e.durationSec;
  }
  let compSum = 0;
  let compN = 0;
  let deviations = 0;
  let completed = 0;
  let runs = 0;
  for (const { inst, result } of rep.runs) {
    if (!result) continue;
    const r = row(inst.deviceId);
    r.runs++;
    runs++;
    if (result.status === 'completed') {
      r.completed++;
      completed++;
    } else if (result.status === 'deviated') r.deviated++;
    else if (result.status === 'missed') r.missed++;
    r.outM += result.outsideDistM;
    r.deviations += result.deviations.length;
    deviations += result.deviations.length;
    if (result.compliancePct != null) {
      r.compSum += result.compliancePct;
      r.compN++;
      compSum += result.compliancePct;
      compN++;
    }
  }
  for (const [id, x] of rep.sensors?.dev || []) if (per.has(id)) per.get(id).sens = x;
  const order = new Map(devices.map((d, i) => [d.id, i]));
  const summary = [...per.values()].map((r) => ({ ...r, compliance: r.compN ? r.compSum / r.compN : null })).sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  const ruleCols = [...ruleTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, total]) => ({ id, total, name: rep.rules[id] || id }));
  // total armada: economy hanya dari kendaraan yang punya data fuel (jarak dan fuel dari kendaraan yang sama)
  const withHours = summary.filter((r) => r.sens && r.sens.engineSec != null);
  const withFuel = summary.filter((r) => r.sens && r.sens.fuelL != null);
  const fuelTotal = withFuel.reduce((x, r) => x + r.sens.fuelL, 0);
  const fuelDist = withFuel.reduce((x, r) => x + r.distanceKm, 0);
  const eco = withFuel.length ? fuelEconomy(fuelDist, fuelTotal) : null;
  return {
    summary,
    ruleCols,
    excRows: [...excBy.values()].sort((a, b) => b.total - a.total),
    totals: {
      engineSec: withHours.length ? withHours.reduce((x, r) => x + r.sens.engineSec, 0) : null,
      fuelL: withFuel.length ? fuelTotal : null,
      eco,
      distanceKm: summary.reduce((s, r) => s + r.distanceKm, 0),
      trips: summary.reduce((s, r) => s + r.trips, 0),
      drivingSec: summary.reduce((s, r) => s + r.drivingSec, 0),
      idleSec: summary.reduce((s, r) => s + r.idleSec, 0),
      exceptions: rep.exceptions.length,
      runs,
      completed,
      deviations,
      compliance: compN ? compSum / compN : null,
    },
  };
}
