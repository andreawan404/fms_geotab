import React from 'react';
import { useApp } from '../AppContext.jsx';
import { fmtKm, fmtTime, pad, ymd } from '../core/time.js';

// durasi ringkas tanpa detik: 1j 05m / 18m
const dur = (sec) => { const m = Math.max(0, Math.round(sec / 60)); const h = Math.floor(m / 60); return h ? `${h}j ${pad(m % 60)}m` : `${m}m`; };

const clock = (ms, base) => {
  if (!ms) return '-';
  const same = base && ymd(new Date(ms)) === ymd(new Date(base));
  return same ? fmtTime(ms) : `${ymd(new Date(ms)).slice(5)} ${fmtTime(ms)}`;
};

/** Tabel ETA tiap titik: jarak dan waktu dari titik sebelumnya, waktu kumulatif, dan (bila jam berangkat diketahui) jam tiba. */
export default function EtaTable({ eta, departMs }) {
  const { t } = useApp();
  if (!eta) return null;
  const clk = Number.isFinite(departMs);
  return (
    <div className="tms-eta">
      <div className="tms-row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <b>{t('eta.title')}</b>
        <span className="tms-badge blue">{fmtKm(eta.totalM)} · {dur(eta.totalS)}</span>
        {clk && <span className="tms-badge green">{t('eta.arrive')} {clock(eta.arriveMs, departMs)}</span>}
        {eta.approx && <span className="tms-badge gray">{t('eta.approx')}</span>}
      </div>
      <div className="tms-tablewrap">
        <table>
          <thead>
            <tr><th>#</th><th>{t('eta.stop')}</th><th className="num">{t('eta.leg')}</th><th className="num">{t('eta.legTime')}</th><th>{clk ? t('eta.eta') : t('eta.cum')}</th></tr>
          </thead>
          <tbody>
            {eta.rows.map((r) => (
              <tr key={r.i}>
                <td>{r.i + 1}</td>
                <td>{r.name}</td>
                <td className="num">{r.i === 0 ? '-' : fmtKm(r.legM)}</td>
                <td className="num">{r.i === 0 ? '-' : dur(r.legS)}</td>
                <td>
                  {clk ? <b>{clock(r.etaMs, departMs)}</b> : (r.i === 0 ? t('eta.start') : `+${dur(r.offsetS)}`)}
                  {r.late && <> <span className="tms-badge amber">{t('eta.late')}</span></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tms-sm tms-muted" style={{ marginTop: 4 }}>{t('eta.note')}</div>
    </div>
  );
}
