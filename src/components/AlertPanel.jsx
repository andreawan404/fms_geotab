import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Empty, Modal } from './ui.jsx';
import { SEVERITY, ongoingItems, recentItems, relParts } from '../lib/alertView.js';
import { fmtDateTime, fmtTime } from '../core/time.js';
import { vehicleLabel } from '../lib/vehicle.js';

const WINDOWS = [5, 10, 30];
const LS = 'tms.alertWindow';

function useNow(ms = 20000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(iv);
  }, [ms]);
  return now;
}

export const useRel = () => {
  const { t } = useApp();
  return (ms, now) => {
    const p = relParts(ms, now);
    return p.unit === 'now' ? t('rel.now') : t(`rel.${p.unit}`, { n: p.n });
  };
};

/** Panel alert live: yang sedang berlangsung (tidak kedaluwarsa) + kejadian N menit terakhir. */
export default function AlertPanel({ onOpen }) {
  const { t, results, feed, deviceMap, routeMap } = useApp();
  const rel = useRel();
  const now = useNow();
  const [win, setWin] = useState(() => {
    try {
      const v = Number(localStorage.getItem(LS));
      return WINDOWS.includes(v) ? v : 10;
    } catch {
      return 10;
    }
  });
  const [all, setAll] = useState(false);
  const pick = (v) => {
    setWin(v);
    try {
      localStorage.setItem(LS, String(v));
    } catch {
      /* abaikan */
    }
  };

  const ongoing = useMemo(() => ongoingItems(results, now), [results, now]);
  const recent = useMemo(() => recentItems(feed, ongoing, now, win), [feed, ongoing, now, win]);
  const dname = (id) => vehicleLabel(deviceMap.get(id) || { name: id }).name;
  const rname = (id) => routeMap.get(id)?.name || '';
  const open = (instKey) => onOpen?.(results.get(instKey)?.inst);

  const text = (it) => t(`ev.${it.type}`, { route: rname(it.routeId), cp: it.cpName || '', dist: Math.round(it.distM || 0), min: it.min ?? '' });

  return (
    <div className="tms-card tms-alertpanel">
      <div className="tms-card-h">
        <span className="tms-grow">{t('mon.feed')}</span>
        <select className="tms-win" value={win} onChange={(e) => pick(Number(e.target.value))} title={t('panel.window')}>
          {WINDOWS.map((w) => <option key={w} value={w}>{t('panel.lastN', { n: w })}</option>)}
        </select>
      </div>
      <div className="tms-scroll">
        {ongoing.length > 0 && (
          <>
            <div className="tms-feed-sec err">{t('panel.ongoing')} <b>{ongoing.length}</b></div>
            {ongoing.map((o) => (
              <div key={o.key} className={`tms-alert-item ${o.kind === 'deviating' ? 'err' : 'warn'} live`} onClick={() => open(o.instKey)}>
                <span className="dot" />
                <div className="body">
                  <div className="ttl"><b>{dname(o.deviceId)}</b><span className="rel">{rel(o.since, now)}</span></div>
                  <div className="txt">
                    {o.kind === 'deviating'
                      ? t('panel.deviatingNow', { time: fmtTime(o.since), dist: Math.round(o.distM), route: rname(o.routeId) })
                      : t('panel.lateNow', { cp: o.cpName, min: o.min, route: rname(o.routeId) })}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
        <div className="tms-feed-sec">{t('panel.recent')} <b>{recent.length}</b></div>
        {recent.length === 0 && <Empty>{t('panel.emptyRecent', { n: win })}</Empty>}
        {recent.map((it) => (
          <div key={it.id} className={`tms-alert-item ${SEVERITY[it.type] || 'mute'}`} onClick={() => open(it.instKey)} title={fmtDateTime(it.at)}>
            <span className="dot" />
            <div className="body">
              <div className="ttl"><b>{dname(it.deviceId)}</b><span className="rel">{rel(it.at, now)}</span></div>
              <div className="txt">{text(it)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="tms-card-f">
        <button className="tms-btn sm" onClick={() => setAll(true)}>{t('panel.viewAll')} ({feed.length})</button>
      </div>
      {all && <AllAlertsModal onClose={() => setAll(false)} onOpen={onOpen} />}
    </div>
  );
}

// Daftar lengkap sementara; digantikan halaman Riwayat Alert (v1.12.0).
function AllAlertsModal({ onClose, onOpen }) {
  const { t, feed, results, deviceMap, routeMap } = useApp();
  const text = (it) => t(`ev.${it.type}`, { route: routeMap.get(it.routeId)?.name || '', cp: it.cpName || '', dist: Math.round(it.distM || 0), min: it.min ?? '' });
  return (
    <Modal wide onClose={onClose} title={t('panel.allTitle')} footer={<button className="tms-btn" onClick={onClose}>{t('close')}</button>}>
      {feed.length === 0 && <Empty>{t('mon.noAlerts')}</Empty>}
      {feed.map((it) => (
        <div key={it.id} className={`tms-alert-item ${SEVERITY[it.type] || 'mute'}`} onClick={() => { const i = results.get(it.instKey)?.inst; if (i) { onClose(); onOpen?.(i); } }}>
          <span className="dot" />
          <div className="body">
            <div className="ttl"><b>{vehicleLabel(deviceMap.get(it.deviceId) || { name: it.deviceId }).name}</b><span className="rel">{fmtDateTime(it.at)}</span></div>
            <div className="txt">{text(it)}</div>
          </div>
        </div>
      ))}
    </Modal>
  );
}
