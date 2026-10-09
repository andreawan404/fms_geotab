import React, { useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Empty, Field, Modal, Spinner } from '../components/ui.jsx';
import InstanceDetail from '../components/InstanceDetail.jsx';
import { addDays, fmtTime, parseYmd, startOfWeek, ymd } from '../core/time.js';
import { expand, findConflicts, planCopy } from '../core/schedule.js';
import { uid } from '../services/store.js';
import { vehicleLabel } from '../lib/vehicle.js';
import { errMessage } from '../services/geotab.js';

const SYMBOL = { completed: '✓', deviated: '⚠', in_progress: '▶', missed: '✗', planned: '' };

export default function AssignmentsPage() {
  const { t, lang, assignments, routes, routeMap, devices, driverMap, results, loading } = useApp();
  const [anchor, setAnchor] = useState(() => new Date());
  const [view, setView] = useState('week'); // 'week' | 'month'
  const [q, setQ] = useState('');
  const [onlyScheduled, setOnlyScheduled] = useState(true);
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [copyDay, setCopyDay] = useState(false);
  const locale = lang === 'id' ? 'id-ID' : 'en-GB';
  const todayStr = ymd(new Date());

  const week = useMemo(() => startOfWeek(anchor), [anchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  // grid bulan: mulai Senin dari minggu yang memuat tanggal 1, sampai minggu yang memuat tanggal terakhir
  const monthDays = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const start = startOfWeek(first);
    const n = Math.ceil((((startOfWeek(last).getTime() - start.getTime()) / 864e5) + 7) / 7) * 7;
    return Array.from({ length: n }, (_, i) => addDays(start, i));
  }, [anchor]);
  const range = view === 'week' ? [days[0], days[6]] : [monthDays[0], monthDays[monthDays.length - 1]];
  const instances = useMemo(() => expand(assignments, ymd(range[0]), ymd(range[1])), [assignments, range[0].getTime(), range[1].getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const devById = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices]);
  const qn = q.trim().toLowerCase();
  const matchDev = (d) => !qn || `${d.name} ${d.plate}`.toLowerCase().includes(qn);

  const byCell = useMemo(() => {
    const m = new Map();
    for (const i of instances) {
      const k = `${i.deviceId}|${i.date}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    }
    return m;
  }, [instances]);
  const byDay = useMemo(() => {
    const m = new Map();
    for (const i of instances) {
      if (!matchDev(devById.get(i.deviceId) || { name: i.deviceId, plate: '' })) continue;
      if (!m.has(i.date)) m.set(i.date, []);
      m.get(i.date).push(i);
    }
    return m;
  }, [instances, qn, devById]); // eslint-disable-line react-hooks/exhaustive-deps
  const scheduledDevices = useMemo(() => new Set(instances.map((i) => i.deviceId)), [instances]);
  const rows = devices.filter((d) => (!onlyScheduled || scheduledDevices.has(d.id)) && matchDev(d));

  if (loading) return <Spinner text={t('loading')} />;

  const fmtD = (d, o) => d.toLocaleDateString(locale, o);
  const title =
    view === 'month'
      ? fmtD(anchor, { month: 'long', year: 'numeric' })
      : days[0].getMonth() === days[6].getMonth()
        ? `${days[0].getDate()} – ${days[6].getDate()} ${fmtD(days[6], { month: 'long', year: 'numeric' })}`
        : days[0].getFullYear() === days[6].getFullYear()
          ? `${days[0].getDate()} ${fmtD(days[0], { month: 'short' })} – ${days[6].getDate()} ${fmtD(days[6], { month: 'short', year: 'numeric' })}`
          : `${fmtD(days[0], { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtD(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const weekNo = (() => {
    // nomor minggu ISO dari hari Kamis pada minggu tersebut
    const th = addDays(week, 3);
    const jan1 = new Date(th.getFullYear(), 0, 1);
    return Math.floor(((th - jan1) / 864e5 + ((jan1.getDay() + 6) % 7)) / 7) + 1;
  })();
  const step = (dir) => setAnchor((a) => (view === 'week' ? addDays(a, 7 * dir) : new Date(a.getFullYear(), a.getMonth() + dir, 1)));

  const openNew = (deviceId = '', date = todayStr) =>
    setForm({
      id: uid('a'),
      routeId: routes[0]?.id || '',
      deviceId,
      driverId: '',
      startTime: '08:00',
      endTime: '17:00',
      kind: 'once',
      date,
      recur: { days: [1, 2, 3, 4, 5], from: date, until: '' },
      note: '',
      active: true,
      isNew: true,
    });

  const openEdit = (a) => setForm({ ...a, kind: a.recur ? 'recur' : 'once', date: a.date || a.recur?.from || todayStr, recur: a.recur ? { until: '', ...a.recur } : { days: [1, 2, 3, 4, 5], from: todayStr, until: '' }, isNew: false });

  const tip = (inst) => {
    const r = routeMap.get(inst.routeId);
    const d = devById.get(inst.deviceId);
    const st = results.get(inst.key)?.result.status;
    return [`${fmtTime(inst.startMs)}–${fmtTime(inst.endMs)}  ${r?.name || '?'}`, d?.name, driverMap.get(inst.driverId)?.name, st ? t(`status.${st}`) : '', inst.note].filter(Boolean).join('\n');
  };
  const weekend = (d) => d.getDay() === 0 || d.getDay() === 6;
  const usedRoutes = [...new Set(instances.map((i) => i.routeId))].map((id) => routeMap.get(id)).filter(Boolean);

  return (
    <div className="tms-page">
      <div className="tms-row" style={{ marginBottom: 10 }}>
        <h2 className="tms-grow">{t('asg.title')}</h2>
        <button className="tms-btn" onClick={() => setCopyDay(true)} disabled={!assignments.length}>{t('asg.copyDay')}</button>
        <button className="tms-btn pri" onClick={() => openNew()} disabled={!routes.length}>+ {t('asg.new')}</button>
      </div>
      {!routes.length && <div className="tms-banner warn" style={{ margin: '0 0 10px' }}>{t('asg.needRoute')}</div>}

      <div className="tms-cal-bar">
        <button className="tms-btn sm" onClick={() => setAnchor(new Date())}>{t('asg.today')}</button>
        <div className="tms-seg">
          <button onClick={() => step(-1)} aria-label="prev">‹</button>
          <button onClick={() => step(1)} aria-label="next">›</button>
        </div>
        <div className="tms-cal-title">
          {title}
          {view === 'week' && <span className="tms-cal-sub">{t('asg.weekNo', { n: weekNo })}</span>}
        </div>
        <label className="tms-cal-jump" title={t('asg.jump')}>
          {'\u{1F4C5}'}
          <input type="date" value={ymd(anchor)} onChange={(e) => e.target.value && setAnchor(parseYmd(e.target.value))} />
        </label>
        <span className="tms-grow" />
        <div className="tms-seg">
          <button className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>{t('asg.viewWeek')}</button>
          <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>{t('asg.viewMonth')}</button>
        </div>
        {view === 'week' && <label className="tms-row tms-sm"><input type="checkbox" checked={onlyScheduled} onChange={(e) => setOnlyScheduled(e.target.checked)} /> {t('asg.onlyScheduled')}</label>}
        <input style={{ width: 180 }} placeholder={t('fleet.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {view === 'week' && (
        <div className="tms-week">
          <table>
            <thead>
              <tr>
                <th className="vh">{t('asg.vehicle')}</th>
                {days.map((d) => (
                  <th key={d} className={`${ymd(d) === todayStr ? 'today' : ''} ${weekend(d) ? 'wk' : ''}`}>
                    <div className="dow">{fmtD(d, { weekday: 'short' })}</div>
                    <div className="dnum">{d.getDate()}</div>
                    {(d.getDate() === 1 || d.getTime() === days[0].getTime()) && <div className="dmon">{fmtD(d, { month: 'short' })}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8}><Empty>{t('asg.empty')}</Empty></td></tr>
              )}
              {rows.map((dev) => {
                const lb = vehicleLabel(dev);
                return (
                  <tr key={dev.id}>
                    <td className="veh" title={`${dev.name}${dev.plate ? ` · ${dev.plate}` : ''}`}>
                      <div className="vname">{lb.name}</div>
                      {lb.plate && <div className="vplate">{lb.plate}</div>}
                    </td>
                    {days.map((d) => {
                      const ds = ymd(d);
                      const list = byCell.get(`${dev.id}|${ds}`) || [];
                      return (
                        <td key={ds} className={`cell ${ds === todayStr ? 'today' : ''} ${weekend(d) ? 'wk' : ''}`} onClick={() => openNew(dev.id, ds)}>
                          {list.map((inst) => {
                            const r = routeMap.get(inst.routeId);
                            const st = results.get(inst.key)?.result.status;
                            return (
                              <div key={inst.key} className="tms-block" style={{ background: r?.color || '#888' }} title={tip(inst)} onClick={(e) => { e.stopPropagation(); setDetail(inst); }}>
                                <b>{SYMBOL[st] ? `${SYMBOL[st]} ` : ''}{fmtTime(inst.startMs)}–{fmtTime(inst.endMs)}</b>
                                <span>{r?.name || '?'}</span>
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === 'month' && (
        <div className="tms-month">
          <div className="tms-month-h">
            {days.map((d) => (
              <div key={d} className={weekend(d) ? 'wk' : ''}>{fmtD(d, { weekday: 'short' })}</div>
            ))}
          </div>
          <div className="tms-month-g">
            {monthDays.map((d) => {
              const ds = ymd(d);
              const list = byDay.get(ds) || [];
              const other = d.getMonth() !== anchor.getMonth();
              return (
                <div key={ds} className={`tms-mday ${other ? 'other' : ''} ${weekend(d) ? 'wk' : ''} ${ds === todayStr ? 'today' : ''}`} onClick={() => { setAnchor(d); setView('week'); }}>
                  <div className="mnum">{d.getDate() === 1 ? `${d.getDate()} ${fmtD(d, { month: 'short' })}` : d.getDate()}</div>
                  {list.slice(0, 3).map((inst) => {
                    const r = routeMap.get(inst.routeId);
                    const dv = devById.get(inst.deviceId);
                    return (
                      <div key={inst.key} className="tms-chip-ev" title={tip(inst)} onClick={(e) => { e.stopPropagation(); setDetail(inst); }}>
                        <i style={{ background: r?.color || '#888' }} />
                        <span>{fmtTime(inst.startMs)} {dv ? vehicleLabel(dv).name : inst.deviceId}</span>
                      </div>
                    );
                  })}
                  {list.length > 3 && <div className="tms-more">{t('asg.more', { n: list.length - 3 })}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {usedRoutes.length > 0 && (
        <div className="tms-legend">
          {usedRoutes.map((r) => (
            <span key={r.id}><i style={{ background: r.color || '#888' }} />{r.name}</span>
          ))}
        </div>
      )}

      {copyDay && <CopyDialog onClose={() => setCopyDay(false)} />}
      {form && <AssignmentForm initial={form} onClose={() => setForm(null)} />}
      {detail && (
        <InstanceDetail
          inst={detail}
          onClose={() => setDetail(null)}
          footerExtra={<DetailActions inst={detail} onEdit={(a) => { setDetail(null); openEdit(a); }} onDone={() => setDetail(null)} />}
        />
      )}
    </div>
  );
}

function DetailActions({ inst, onEdit, onDone }) {
  const { t, assignments, saveAssignment, deleteAssignment, toast } = useApp();
  const [dup, setDup] = useState(false);
  const a = assignments.find((x) => x.id === inst.assignmentId);
  if (!a) return null;
  const run = async (fn) => {
    try {
      await fn();
      toast(t('saved'));
      onDone();
    } catch (e) {
      toast(errMessage(e), 'err');
    }
  };
  const delThis = () => {
    if (!window.confirm(t('asg.confirmDeleteOne', { date: inst.date }))) return;
    run(() => (a.recur ? saveAssignment({ ...a, exceptions: [...(a.exceptions || []), inst.date] }) : deleteAssignment(a)));
  };
  const delAll = () => {
    if (!window.confirm(t('asg.confirmDeleteAll'))) return;
    run(() => deleteAssignment(a));
  };
  return (
    <>
      <button className="tms-btn" onClick={() => onEdit(a)}>{t('edit')}</button>
      <button className="tms-btn" onClick={() => setDup(true)}>{t('asg.duplicate')}</button>
      {dup && <CopyDialog only={inst} onClose={() => setDup(false)} onDone={onDone} />}
      <button className="tms-btn danger" onClick={delThis}>{a.recur ? t('asg.deleteThis') : t('delete')}</button>
      {a.recur && <button className="tms-btn danger" onClick={delAll}>{t('asg.deleteSeries')}</button>}
    </>
  );
}

/** Salin penugasan ke tanggal lain. only = satu instance (Duplikat); tanpa only = semua penugasan pada satu hari (Salin hari). */
function CopyDialog({ only, onClose, onDone }) {
  const { t, assignments, saveAssignment, deviceMap, routeMap, toast } = useApp();
  const todayStr = ymd(new Date());
  const [src, setSrc] = useState(only ? only.date : todayStr);
  const [dst, setDst] = useState(ymd(addDays(parseYmd(only ? only.date : todayStr), 1)));
  const [busy, setBusy] = useState(false);
  const insts = useMemo(() => (only ? [only] : expand(assignments, src, src)), [only, assignments, src]);
  const plan = useMemo(() => planCopy(insts, assignments, dst, () => 'preview'), [insts, assignments, dst]);
  const reasonText = (r) => t(`asg.skip.${r}`);

  const run = async () => {
    setBusy(true);
    try {
      let n = 0;
      for (const a of planCopy(insts, assignments, dst, () => uid('a')).create) {
        await saveAssignment(a);
        n++;
      }
      toast(t('asg.copied', { n, m: plan.skipped.length }), plan.skipped.length ? 'err' : 'ok');
      onClose();
      onDone?.();
    } catch (e) {
      toast(errMessage(e), 'err');
    }
    setBusy(false);
  };

  return (
    <Modal
      onClose={onClose}
      title={only ? t('asg.duplicate') : t('asg.copyDay')}
      footer={
        <>
          <button className="tms-btn" onClick={onClose}>{t('cancel')}</button>
          <button className="tms-btn pri" onClick={run} disabled={busy || plan.create.length === 0}>{t('asg.copyN', { n: plan.create.length })}</button>
        </>
      }
    >
      <div className="tms-grid3" style={{ marginBottom: 10 }}>
        {!only && (
          <Field label={t('asg.copyFrom')}>
            <input type="date" value={src} onChange={(e) => setSrc(e.target.value)} />
          </Field>
        )}
        <Field label={t('asg.copyTo')}>
          <input type="date" value={dst} onChange={(e) => setDst(e.target.value)} />
        </Field>
      </div>
      <p className="tms-sm tms-muted" style={{ margin: '0 0 6px' }}>{t('asg.copyHint')}</p>
      {insts.length === 0 && <Empty>{t('asg.copyNone')}</Empty>}
      {insts.length > 0 && (
        <div className="tms-tablewrap" style={{ maxHeight: 260, overflow: 'auto' }}>
          <table>
            <tbody>
              {insts.map((i) => {
                const sk = plan.skipped.find((x) => x.inst.key === i.key);
                return (
                  <tr key={i.key}>
                    <td><b>{deviceMap.get(i.deviceId)?.name || i.deviceId}</b></td>
                    <td>{routeMap.get(i.routeId)?.name}</td>
                    <td>{fmtTime(i.startMs)}–{fmtTime(i.endMs)}</td>
                    <td>{sk ? <span className="tms-badge amber">{reasonText(sk.reason)}</span> : <span className="tms-badge green">{'\u2713'}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function AssignmentForm({ initial, onClose }) {
  const { t, lang, routes, devices, drivers, assignments, saveAssignment, deleteAssignment, toast, routeMap, deviceMap } = useApp();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const locale = lang === 'id' ? 'id-ID' : 'en-GB';
  const dayNames = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, label: new Date(2026, 9, 4 + d).toLocaleDateString(locale, { weekday: 'short' }) })); // 4 Okt 2026 = Minggu

  const candidate = useMemo(() => {
    const base = { id: f.id, routeId: f.routeId, deviceId: f.deviceId, driverId: f.driverId || null, startTime: f.startTime, endTime: f.endTime, note: f.note, active: f.active, exceptions: f.exceptions };
    if (f.kind === 'once') return { ...base, date: f.date };
    return { ...base, recur: { days: f.recur.days, from: f.recur.from, ...(f.recur.until ? { until: f.recur.until } : {}) } };
  }, [f]);

  const problems = [];
  if (!f.routeId) problems.push(t('asg.errRoute'));
  if (!f.deviceId) problems.push(t('asg.errVehicle'));
  if (f.kind === 'once' && !f.date) problems.push(t('asg.errDate'));
  if (f.kind === 'recur' && (!f.recur.days.length || !f.recur.from)) problems.push(t('asg.errRecur'));
  if (f.kind === 'recur' && f.recur.until && f.recur.until < f.recur.from) problems.push(t('asg.errRecur'));

  const conflicts = useMemo(() => {
    if (problems.length || !f.active) return [];
    return findConflicts(candidate, assignments, ymd(new Date()));
  }, [candidate, assignments]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true);
    try {
      const { isNew, kind, recur, date, ...rest } = f;
      const out = { ...rest, driverId: f.driverId || null, createdAt: f.createdAt || Date.now() };
      if (kind === 'once') out.date = date;
      else out.recur = candidate.recur;
      if (kind === 'once') delete out.recur;
      else delete out.date;
      await saveAssignment(out);
      toast(t('saved'));
      onClose();
    } catch (e) {
      toast(errMessage(e), 'err');
    }
    setBusy(false);
  };
  const remove = async () => {
    if (!window.confirm(t('asg.confirmDeleteAll'))) return;
    try {
      await deleteAssignment(f);
      toast(t('saved'));
      onClose();
    } catch (e) {
      toast(errMessage(e), 'err');
    }
  };

  return (
    <Modal
      title={f.isNew ? t('asg.new') : t('asg.edit')}
      onClose={onClose}
      footer={
        <>
          {!f.isNew && <button className="tms-btn danger" onClick={remove}>{t('delete')}</button>}
          <span className="tms-grow" />
          <button className="tms-btn" onClick={onClose}>{t('cancel')}</button>
          <button className="tms-btn pri" onClick={save} disabled={busy || problems.length > 0 || conflicts.length > 0}>{t('save')}</button>
        </>
      }
    >
      <div className="tms-grid2">
        <Field label={t('asg.route')}>
          <select value={f.routeId} onChange={(e) => set({ routeId: e.target.value })}>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label={t('asg.vehicle')}>
          <select value={f.deviceId} onChange={(e) => set({ deviceId: e.target.value })}>
            <option value="">—</option>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name} {d.plate && `(${d.plate})`}</option>)}
          </select>
        </Field>
      </div>
      <Field label={`${t('asg.driver')} (${t('optional')})`}>
        <select value={f.driverId || ''} onChange={(e) => set({ driverId: e.target.value })}>
          <option value="">{t('noDriver')}</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <div className="tms-row" style={{ marginBottom: 10 }}>
        {['once', 'recur'].map((k) => (
          <label key={k} className="tms-row"><input type="radio" checked={f.kind === k} onChange={() => set({ kind: k })} /> {t(`asg.kind.${k}`)}</label>
        ))}
      </div>
      {f.kind === 'once' ? (
        <Field label={t('asg.date')}><input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></Field>
      ) : (
        <>
          <Field label={t('asg.days')}>
            <div className="tms-days">
              {dayNames.map(({ d, label }) => {
                const on = f.recur.days.includes(d);
                return (
                  <label key={d} className={on ? 'on' : ''}>
                    <input type="checkbox" checked={on} onChange={() => set({ recur: { ...f.recur, days: on ? f.recur.days.filter((x) => x !== d) : [...f.recur.days, d] } })} />
                    {label}
                  </label>
                );
              })}
            </div>
          </Field>
          <div className="tms-grid2">
            <Field label={t('asg.from')}><input type="date" value={f.recur.from} onChange={(e) => set({ recur: { ...f.recur, from: e.target.value } })} /></Field>
            <Field label={`${t('asg.until')} (${t('optional')})`}><input type="date" value={f.recur.until} onChange={(e) => set({ recur: { ...f.recur, until: e.target.value } })} /></Field>
          </div>
        </>
      )}
      <div className="tms-grid2">
        <Field label={t('asg.startTime')}><input type="time" value={f.startTime} onChange={(e) => set({ startTime: e.target.value })} /></Field>
        <Field label={t('asg.endTime')} hint={f.endTime <= f.startTime ? t('asg.overnight') : ''}><input type="time" value={f.endTime} onChange={(e) => set({ endTime: e.target.value })} /></Field>
      </div>
      <Field label={t('asg.note')}><input value={f.note || ''} onChange={(e) => set({ note: e.target.value })} /></Field>
      <label className="tms-row tms-sm"><input type="checkbox" checked={f.active !== false} onChange={(e) => set({ active: e.target.checked })} /> {t('asg.active')}</label>

      {problems.map((p) => <div key={p} className="tms-err">{p}</div>)}
      {conflicts.length > 0 && (
        <div className="tms-banner" style={{ margin: '10px 0 0' }}>
          <b>{t('asg.conflicts')}</b>
          {conflicts.slice(0, 5).map((c, i) => (
            <div key={i} className="tms-sm">
              {t(`asg.conflict.${c.reason}`)} · {c.date} · {deviceMap.get(c.other.deviceId)?.name} · {routeMap.get(c.other.routeId)?.name} · {fmtTime(c.other.startMs)}–{fmtTime(c.other.endMs)}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
