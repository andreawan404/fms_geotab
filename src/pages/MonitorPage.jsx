import React, { useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Empty, Kpi, Spinner, StatusBadge } from '../components/ui.jsx';
import InstanceDetail from '../components/InstanceDetail.jsx';
import { eventText } from '../lib/eventText.js';
import { fmtDateTime, fmtTime } from '../core/time.js';

const ORDER = { deviated: 0, in_progress: 1, planned: 2, missed: 3, completed: 4 };

export default function MonitorPage() {
  const { t, results, deviceMap, driverMap, routeMap, feed, loading, lastTick, tick, sound, setSound, errors } = useApp();
  const [filter, setFilter] = useState('all');
  const [detail, setDetail] = useState(null);

  const list = useMemo(() => [...results.values()].sort((a, b) => ORDER[a.result.status] - ORDER[b.result.status] || a.inst.startMs - b.inst.startMs), [results]);
  const counts = useMemo(() => {
    const c = { all: list.length, deviated: 0, in_progress: 0, planned: 0, completed: 0, missed: 0 };
    list.forEach((r) => c[r.result.status]++);
    return c;
  }, [list]);
  const shown = filter === 'all' ? list : list.filter((r) => r.result.status === filter);

  if (loading) return <Spinner text={t('loading')} />;

  const notifPerm = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
  const askNotif = () => typeof Notification !== 'undefined' && Notification.requestPermission().then(() => tick());

  return (
    <div className="tms-page">
      <div className="tms-row" style={{ marginBottom: 10 }}>
        <h2 className="tms-grow">{t('mon.title')}</h2>
        <label className="tms-row tms-sm"><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> {t('mon.sound')}</label>
        {notifPerm !== 'granted' && typeof Notification !== 'undefined' && <button className="tms-btn sm" onClick={askNotif}>{t('mon.enableNotif')}</button>}
        <button className="tms-btn sm" onClick={tick}>↻ {t('refresh')}</button>
        <span className="tms-sm tms-muted">{lastTick ? fmtDateTime(lastTick).slice(11) : ''}</span>
      </div>
      <div className="tms-banner warn" style={{ margin: '0 0 10px' }}>{t('mon.openOnly')}</div>
      {errors.tick && <div className="tms-banner" style={{ margin: '0 0 10px' }}>{errors.tick}</div>}

      <div className="tms-kpis">
        <Kpi label={t('status.deviated')} value={counts.deviated} tone={counts.deviated ? 'bad' : ''} />
        <Kpi label={t('status.in_progress')} value={counts.in_progress} />
        <Kpi label={t('status.planned')} value={counts.planned} />
        <Kpi label={t('status.completed')} value={counts.completed} tone="good" />
        <Kpi label={t('status.missed')} value={counts.missed} tone={counts.missed ? 'bad' : ''} />
      </div>

      <div className="tms-mon">
        <div>
          <div className="tms-chips" style={{ padding: '0 0 8px' }}>
            {['all', 'deviated', 'in_progress', 'planned', 'completed', 'missed'].map((f) => (
              <button key={f} className={`tms-chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? t('state.all') : t(`status.${f}`)} {counts[f]}</button>
            ))}
          </div>
          <div className="tms-tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{t('mon.status')}</th><th>{t('asg.vehicle')}</th><th>{t('asg.driver')}</th><th>{t('asg.route')}</th><th>{t('mon.window')}</th>
                  <th className="num">{t('detail.checkpoints')}</th><th className="num">{t('mon.offRoute')}</th><th className="num">{t('detail.compliance')}</th><th>{t('mon.lastPos')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={9}><Empty>{t('mon.empty')}</Empty></td></tr>}
                {shown.map(({ inst, route, result }) => {
                  const cur = result.current;
                  const next = result.checkpoints.find((c) => !c.arrivedMs && !c.skipped);
                  return (
                    <tr key={inst.key} className="click" onClick={() => setDetail(inst)}>
                      <td><StatusBadge status={result.status} /></td>
                      <td><b>{deviceMap.get(inst.deviceId)?.name || inst.deviceId}</b></td>
                      <td>{driverMap.get(inst.driverId)?.name || '—'}</td>
                      <td><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: route.color, marginRight: 6 }} />{route.name}</td>
                      <td>{fmtTime(inst.startMs)}–{fmtTime(inst.endMs)}</td>
                      <td className="num" title={next ? `${t('mon.next')}: ${next.name}` : ''}>{result.arrivedCount}/{result.totalCheckpoints}</td>
                      <td className="num" style={{ color: cur && !cur.inside ? '#d63a3a' : undefined }}>{cur ? `${Math.round(cur.distM)} m` : '-'}</td>
                      <td className="num">{result.compliancePct == null ? '-' : `${result.compliancePct.toFixed(0)}%`}</td>
                      <td>{cur ? fmtTime(cur.t) : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="tms-card" style={{ maxHeight: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
          <div className="tms-card-h">{t('mon.feed')}</div>
          <div className="tms-scroll">
            {feed.length === 0 && <Empty>{t('mon.noAlerts')}</Empty>}
            {feed.slice(0, 150).map((it) => {
              const target = results.get(it.instKey)?.inst;
              return (
                <div key={it.id} className="tms-feed-item" onClick={() => target && setDetail(target)}>
                  <span className={`tms-feed-ico ${it.type}`} />
                  <div>
                    <div>{eventText(it, { t, deviceMap, routeMap })}</div>
                    <div className="tms-sm tms-muted">{fmtDateTime(it.at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {detail && <InstanceDetail inst={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
