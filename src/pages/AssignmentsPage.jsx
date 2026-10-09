import React, { useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Empty, Field, Modal, Spinner } from '../components/ui.jsx';
import InstanceDetail from '../components/InstanceDetail.jsx';
import { addDays, fmtTime, parseYmd, startOfWeek, ymd } from '../core/time.js';
import { expand, findConflicts, planCopy } from '../core/schedule.js';
import { uid } from '../services/store.js';
import { errMessage } from '../services/geotab.js';

const SYMBOL = { completed: '✓', deviated: '⚠', in_progress: '▶', missed: '✗', planned: '' };

export default function AssignmentsPage() {
  const { t, lang, assignments, routes, routeMap, devices, deviceMap, results, loading } = useApp();
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [q, setQ] = useState('');
  const [onlyScheduled, setOnlyScheduled] = useState(true);
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [copyDay, setCopyDay] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const instances = useMemo(() => expand(assignments, ymd(days[0]), ymd(days[6])), [assignments, days]);
  const byCell = useMemo(() => {
    const m = new Map();
    for (const i of instances) {
      const k = `${i.deviceId}|${i.date}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    }
    return m;
  }, [instances]);
  const scheduledDevices = useMemo(() => new Set(instances.map((i) => i.deviceId)), [instances]);
  const rows = devices.filter((d) => (!onlyScheduled || scheduledDevices.has(d.id)) && (!q || `${d.name} ${d.plate}`.toLowerCase().includes(q.toLowerCase())));
  const todayStr = ymd(new Date());
  const locale = lang === 'id' ? 'id-ID' : 'en-GB';

  if (loading) return <Spinner text={t('loading')} />;

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

  return (
    <div className="tms-page">
      <div className="tms-row" style={{ marginBottom: 10 }}>
        <h2 className="tms-grow">{t('asg.title')}</h2>
        <button className="tms-btn" onClick={() => setCopyDay(true)} disabled={!assignments.length}>{t('asg.copyDay')}</button>
        <button className="tms-btn pri" onClick={() => openNew()} disabled={!routes.length}>+ {t('asg.new')}</button>
      </div>
      {!routes.length && <div className="tms-banner warn" style={{ margin: '0 0 10px' }}>{t('asg.needRoute')}</div>}
      <div className="tms-row" style={{ marginBottom: 10 }}>
        <button className="tms-btn sm" onClick={() => setWeek(addDays(week, -7))}>‹</button>
        <button className="tms-btn sm" onClick={() => setWeek(startOfWeek(new Date()))}>{t('asg.thisWeek')}</button>
        <button className="tms-btn sm" onClick={() => setWeek(addDays(week, 7))}>›</button>
        <b>{days[0].toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – {days[6].toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</b>
        <span className="tms-grow" />
        <label className="tms-row tms-sm"><input type="checkbox" checked={onlyScheduled} onChange={(e) => setOnlyScheduled(e.target.checked)} /> {t('asg.onlyScheduled')}</label>
        <input style={{ width: 180 }} placeholder={t('fleet.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="tms-week">
        <table>
          <thead>
            <tr>
              <th style={{ width: 150 }}>{t('asg.vehicle')}</th>
              {days.map((d) => (
                <th key={d} className={ymd(d) === todayStr ? 'today' : ''}>{d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8}><Empty>{t('asg.empty')}</Empty></td></tr>
            )}
            {rows.map((dev) => (
              <tr key={dev.id}>
                <td className="veh">{dev.name}<div className="tms-sm tms-muted" style={{ fontWeight: 400 }}>{dev.plate}</div></td>
                {days.map((d) => {
                  const ds = ymd(d);
                  const list = byCell.get(`${dev.id}|${ds}`) || [];
                  return (
                    <td key={ds} className="cell" onClick={() => openNew(dev.id, ds)}>
                      {list.map((inst) => {
                        const r = routeMap.get(inst.routeId);
                        const st = results.get(inst.key)?.result.status;
                        return (
                          <div key={inst.key} className="tms-block" style={{ background: r?.color || '#888' }} title={r?.name} onClick={(e) => { e.stopPropagation(); setDetail(inst); }}>
                            {SYMBOL[st] || ''} {fmtTime(inst.startMs)}–{fmtTime(inst.endMs)} {r?.name || '?'}
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
