import React, { useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Empty, Kpi, download } from './ui.jsx';
import AckDialog from './AckDialog.jsx';
import { ACKABLE, SEVERITY, filterAlerts, groupByDay, groupByDevice, summarize } from '../lib/alertView.js';
import { expand } from '../core/schedule.js';
import { fmtDateTime, fmtTime, parseYmd, ymd } from '../core/time.js';
import { vehicleLabel } from '../lib/vehicle.js';

const TYPES = ['deviation_start', 'late_start', 'start_reached', 'route_completed', 'deviation_end', 'checkpoint_arrived', 'checkpoint_skipped'];
const PRESETS = [['today', 1], ['d7', 7], ['d30', 30], ['d90', 90]];
const PAGE = 300;
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Riwayat seluruh alert/kejadian: timeline per hari atau per kendaraan, dengan filter dan penanganan. */
export default function AlertHistory({ onBack, onOpen }) {
  const { t, lang, feed, acks, unackAlert, deviceMap, routeMap, assignments, devices, settings } = useApp();
  const locale = lang === 'id' ? 'id-ID' : 'en-GB';
  const [preset, setPreset] = useState(7);
  const [types, setTypes] = useState(new Set());
  const [devSel, setDevSel] = useState('');
  const [ack, setAck] = useState('all');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState('day');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState(new Set());
  const [ackIds, setAckIds] = useState(null);

  const dname = (id) => vehicleLabel(deviceMap.get(id) || { name: id }).name;
  const text = (e) => t(`ev.${e.type}`, { route: routeMap.get(e.routeId)?.name || '', cp: e.cpName || '', dist: Math.round(e.distM || 0), min: e.min ?? '' });

  const filtered = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (preset - 1));
    return filterAlerts(feed, { fromMs: from.getTime(), deviceIds: devSel ? [devSel] : [], types, ack, q, acks, text, deviceName: dname });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, preset, devSel, types, ack, q, acks, deviceMap, routeMap, lang]);
  const sum = useMemo(() => summarize(filtered, acks), [filtered, acks]);
  const shown = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  const days = useMemo(() => groupByDay(shown), [shown]);
  const groups = useMemo(() => groupByDevice(shown, acks), [shown, acks]);

  const toggleType = (ty) => {
    const n = new Set(types);
    n.has(ty) ? n.delete(ty) : n.add(ty);
    setTypes(n);
    setLimit(PAGE);
  };
  const openEvent = (e) => {
    const date = e.instKey?.split('@')[1];
    if (!date) return;
    const inst = expand(assignments, date, date).find((i) => i.key === e.instKey);
    if (inst) onOpen?.(inst);
  };
  const canOpen = (e) => !!e.instKey && assignments.some((a) => e.instKey.startsWith(`${a.id}@`));
  const dayLabel = (k) => parseYmd(k).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const todayKey = ymd(new Date());

  const exportCsv = () => {
    const head = ['waktu', 'kendaraan', 'jenis', 'keterangan', 'rute', 'status_penanganan', 'ditangani_oleh', 'catatan'];
    const rows = filtered.map((e) => {
      const a = acks.get(e.id);
      return [fmtDateTime(e.at), dname(e.deviceId), t(`evt.${e.type}`), text(e), routeMap.get(e.routeId)?.name || '', ACKABLE.has(e.type) ? (a ? 'sudah' : 'belum') : '', a?.by || '', a?.note || ''];
    });
    download(`riwayat-alert-${ymd(new Date())}.csv`, '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'));
  };

  const Row = ({ e, showDay }) => {
    const a = acks.get(e.id);
    return (
      <div className={`tms-alert-item hist ${SEVERITY[e.type] || 'mute'}`}>
        <span className="dot" />
        <div className="body" onClick={() => canOpen(e) && openEvent(e)} style={{ cursor: canOpen(e) ? 'pointer' : 'default' }}>
          <div className="ttl"><b>{dname(e.deviceId)}</b><span className="rel">{showDay ? fmtDateTime(e.at) : fmtTime(e.at)}</span></div>
          <div className="txt">{text(e)}</div>
          {a && <div className="tms-acked">✓ {t('ack.by', { by: a.by || '—' })} · {fmtDateTime(a.at)}{a.note ? ` · “${a.note}”` : ''}</div>}
        </div>
        {ACKABLE.has(e.type) && (a
          ? <button className="tms-btn sm ghost" onClick={() => unackAlert(e.id)}>{t('ack.undo')}</button>
          : <button className="tms-btn sm" onClick={() => setAckIds([e.id])}>{t('ack.btn')}</button>)}
      </div>
    );
  };

  const openAll = filtered.filter((e) => ACKABLE.has(e.type) && !acks.has(e.id)).map((e) => e.id);

  return (
    <div className="tms-page">
      <div className="tms-row" style={{ marginBottom: 10 }}>
        <button className="tms-btn sm" onClick={onBack}>← {t('hist.back')}</button>
        <h2 className="tms-grow">{t('hist.title')}</h2>
        {openAll.length > 0 && <button className="tms-btn sm" onClick={() => setAckIds(openAll)}>{t('ack.all', { n: openAll.length })}</button>}
        <button className="tms-btn sm" onClick={exportCsv} disabled={!filtered.length}>{t('rep.csv')}</button>
      </div>

      <div className="tms-kpis">
        <Kpi label={t('hist.total')} value={sum.total} />
        <Kpi label={t('hist.offRoute')} value={sum.byType.deviation_start || 0} tone={sum.byType.deviation_start ? 'bad' : ''} />
        <Kpi label={t('hist.late')} value={sum.byType.late_start || 0} tone={sum.byType.late_start ? 'bad' : ''} />
        <Kpi label={t('hist.open')} value={sum.open} tone={sum.open ? 'bad' : 'good'} />
        <Kpi label={t('hist.vehicles')} value={sum.vehicles} />
      </div>

      <div className="tms-card" style={{ marginBottom: 10 }}>
        <div className="tms-card-b tms-histf">
          <div className="tms-chips" style={{ padding: 0 }}>
            {PRESETS.map(([k, n]) => (
              <button key={k} className={`tms-chip ${preset === n ? 'on' : ''}`} onClick={() => { setPreset(n); setLimit(PAGE); }}>{t(`hist.p.${k}`)}</button>
            ))}
          </div>
          <select value={devSel} onChange={(e) => { setDevSel(e.target.value); setLimit(PAGE); }}>
            <option value="">{t('hist.allVehicles')}</option>
            {devices.map((d) => <option key={d.id} value={d.id}>{vehicleLabel(d).name}</option>)}
          </select>
          <select value={ack} onChange={(e) => setAck(e.target.value)}>
            <option value="all">{t('hist.ack.all')}</option>
            <option value="open">{t('hist.ack.open')}</option>
            <option value="done">{t('hist.ack.done')}</option>
          </select>
          <input type="search" placeholder={t('hist.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="tms-chips" style={{ padding: '0 14px 10px' }}>
          {TYPES.map((ty) => (
            <button key={ty} className={`tms-chip ${types.has(ty) ? 'on' : ''}`} onClick={() => toggleType(ty)}>{t(`evt.${ty}`)} {sum.byType[ty] || 0}</button>
          ))}
          <span className="tms-grow" />
          <button className={`tms-chip ${mode === 'day' ? 'on' : ''}`} onClick={() => setMode('day')}>{t('hist.mode.day')}</button>
          <button className={`tms-chip ${mode === 'dev' ? 'on' : ''}`} onClick={() => setMode('dev')}>{t('hist.mode.dev')}</button>
        </div>
      </div>

      <div className="tms-card">
        {filtered.length === 0 && <Empty>{t('hist.empty')}</Empty>}
        {mode === 'day' && days.map((g) => (
          <div key={g.day}>
            <div className="tms-feed-sec">{g.day === todayKey ? `${t('asg.today')} · ` : ''}{dayLabel(g.day)} · {t('hist.nEvents', { n: g.items.length })}</div>
            {g.items.map((e) => <Row key={e.id} e={e} />)}
          </div>
        ))}
        {mode === 'dev' && groups.map((g) => {
          const isOpen = open.has(g.deviceId);
          return (
            <div key={g.deviceId}>
              <div className="tms-feed-sec tms-clickable" onClick={() => { const n = new Set(open); isOpen ? n.delete(g.deviceId) : n.add(g.deviceId); setOpen(n); }}>
                {isOpen ? '▾' : '▸'} {dname(g.deviceId)} · {t('hist.nEvents', { n: g.items.length })}
                {g.open > 0 && <span className="tms-pill-bad">{t('hist.nOpen', { n: g.open })}</span>}
                <span className="tms-muted" style={{ float: 'right', textTransform: 'none', fontWeight: 400 }}>{t('hist.last')} {fmtDateTime(g.last)}</span>
              </div>
              {isOpen && g.items.map((e) => <Row key={e.id} e={e} showDay />)}
            </div>
          );
        })}
        {filtered.length > shown.length && (
          <div className="tms-card-f"><button className="tms-btn sm" onClick={() => setLimit(limit + PAGE)}>{t('hist.more', { n: filtered.length - shown.length })}</button></div>
        )}
      </div>
      <div className="tms-sm tms-muted" style={{ marginTop: 8 }}>{t('hist.retention', { d: settings.alertRetentionDays || 90 })}</div>
      {ackIds && <AckDialog ids={ackIds} onClose={() => setAckIds(null)} />}
    </div>
  );
}
