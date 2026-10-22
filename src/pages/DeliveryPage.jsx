import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Empty, Kpi, Spinner, download } from '../components/ui.jsx';
import { toCSV } from '../core/csv.js';
import { computeOrderFuel } from '../services/fuelDo.js';
import { apiErrorText, fmtNum } from '../lib/orderView.js';
import { fmtDateTime } from '../core/time.js';

const ymd = (d) => d.toISOString().slice(0, 10);
const VERDICT_CLS = { consistent: 'green', in_progress: 'blue', gps_done_tms_open: 'amber', tms_done_no_gps: 'red', not_linked: 'gray', cancelled: 'gray' };

/** Laporan pengiriman gabungan: status TMS customer vs bukti GPS, ketepatan waktu, dan BBM per DO. */
export default function DeliveryPage() {
  const { t, ordersApi, geotab, sensorWindows, toast } = useApp();
  const [days, setDays] = useState(7);
  const [rep, setRep] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const to = new Date(); const from = new Date(Date.now() - (days - 1) * 864e5);
    try { setRep(await ordersApi.integration.delivery({ from: ymd(from), to: ymd(to) })); setErr(''); } catch (e) { setErr(apiErrorText(t, e)); setRep((x) => x || { orders: [], summary: null }); }
  }, [ordersApi, days, t]);
  useEffect(() => { load(); }, [load]);

  const calc = async (o, quiet = false) => {
    setBusy(o.id);
    try {
      const r = await computeOrderFuel({ geotab, sensorWindows, order: o });
      if (!r.ok) { if (!quiet) toast(t(`dlv.fuelFail.${r.reason}`, { doNo: o.doNo }), 'err'); return false; }
      await ordersApi.integration.saveFuel(o.id, r.fuel);
      return true;
    } catch (e) { if (!quiet) toast(apiErrorText(t, e), 'err'); return false; } finally { setBusy(''); }
  };
  const calcAll = async () => {
    let n = 0;
    for (const o of rep.orders.filter((x) => x.deviceId && x.arrived > 0)) if (await calc(o, true)) n++;
    toast(t('dlv.fuelDone', { n })); load();
  };

  const s = rep?.summary;
  const csv = () => {
    const cols = [
      { label: t('ord.doNo'), key: 'doNo' }, { label: t('ord.customer'), key: 'customer' }, { label: t('int.f.plate'), key: 'plate' },
      { label: t('dlv.tms'), get: (o) => o.extStatus || o.status }, { label: t('dlv.verdict'), get: (o) => t(`dlv.v.${o.verdict}`) },
      { label: t('dlv.arrived'), get: (o) => `${o.arrived}/${o.total}` }, { label: t('dlv.ontime'), get: (o) => (o.measured ? `${o.onTime}/${o.measured}` : '') },
      { label: 'L', get: (o) => o.fuel?.fuelL ?? '' }, { label: 'km', get: (o) => o.fuel?.distKm ?? '' }, { label: 'km/L', get: (o) => o.fuel?.kmPerL ?? '' }, { label: 'L/ton-km', get: (o) => o.fuel?.lPerTonKm ?? '' },
    ];
    download(`pengiriman_${ymd(new Date())}.csv`, toCSV(rep.orders, cols, ';'));
  };

  return (
    <div className="tms-page">
      <div className="tms-row" style={{ marginBottom: 10, gap: 8 }}>
        <h2 className="tms-grow">{t('dlv.title')}</h2>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 7, 14, 30].map((d) => <option key={d} value={d}>{t('dlv.lastDays', { n: d })}</option>)}</select>
        <button className="tms-btn" disabled={!rep?.orders.length || !!busy} onClick={calcAll}>{t('dlv.calcAll')}</button>
        <button className="tms-btn" disabled={!rep?.orders.length} onClick={csv}>{t('rep.csv')}</button>
        <button className="tms-btn sm" onClick={load} title={t('refresh')}>↻</button>
      </div>
      <div className="tms-sm tms-muted" style={{ marginBottom: 10 }}>{t('dlv.hint')}</div>
      {err && <div className="tms-banner" style={{ margin: '0 0 10px' }}>{err}</div>}
      {!rep ? <Spinner /> : !rep.orders.length ? <Empty>{t('dlv.empty')}</Empty> : (
        <>
          <div className="tms-kpis" style={{ marginBottom: 12 }}>
            <Kpi label={t('dlv.k.total')} value={fmtNum(s.total)} sub={t('dlv.k.linked', { n: s.linked })} />
            <Kpi label={t('dlv.k.consistent')} value={fmtNum(s.consistent)} tone={s.mismatch ? '' : 'good'} />
            <Kpi label={t('dlv.k.mismatch')} value={fmtNum(s.mismatch)} tone={s.mismatch ? 'bad' : ''} />
            <Kpi label={t('dlv.k.ontime')} value={s.measured ? `${fmtNum((s.onTime / s.measured) * 100, 1)}%` : '-'} sub={s.measured ? `${s.onTime}/${s.measured}` : ''} />
            <Kpi label={t('dlv.k.fuel')} value={s.fuelL ? `${fmtNum(s.fuelL, 1)} L` : '-'} sub={s.fuelL && s.distKm ? `${fmtNum(s.distKm / s.fuelL, 2)} km/L` : ''} />
          </div>
          <div className="tms-card"><div className="tms-card-b"><div className="tms-tablewrap"><table>
            <thead><tr><th>{t('ord.doNo')}</th><th>{t('int.f.plate')}</th><th>{t('dlv.tms')}</th><th>{t('dlv.verdict')}</th><th>{t('dlv.stops')}</th><th>{t('dlv.ontime')}</th><th>BBM</th><th /></tr></thead>
            <tbody>{rep.orders.map((o) => (
              <tr key={o.id}>
                <td><b>{o.doNo}</b><div className="tms-sm tms-muted">{o.customer}</div></td>
                <td>{o.plate || '-'}</td>
                <td>{o.extStatus || o.status}</td>
                <td><span className={`tms-badge ${VERDICT_CLS[o.verdict]}`}>{t(`dlv.v.${o.verdict}`)}</span></td>
                <td>{o.stops.map((st) => (
                  <div key={st.seq} className="tms-sm">{st.seq}. {st.name} · {st.arriveAt ? <>{fmtDateTime(st.arriveAt)}{st.onTime === false && <span style={{ color: '#c62828' }}> (+{st.lateMin} {t('dlv.min')})</span>}</> : <span className="tms-muted">{t('dlv.notYet')}</span>}</div>
                ))}</td>
                <td>{o.measured ? `${o.onTime}/${o.measured}` : '-'}</td>
                <td>{o.fuel ? <div className="tms-sm">{fmtNum(o.fuel.fuelL, 1)} L · {fmtNum(o.fuel.distKm, 0)} km{o.fuel.kmPerL ? ` · ${fmtNum(o.fuel.kmPerL, 2)} km/L` : ''}{o.fuel.lPerTonKm ? <div>{fmtNum(o.fuel.lPerTonKm, 4)} L/ton-km</div> : null}</div> : '-'}</td>
                <td><button className="tms-btn sm" disabled={!o.deviceId || !o.arrived || busy === o.id} onClick={async () => { if (await calc(o)) load(); }}>{busy === o.id ? '…' : t('dlv.calc')}</button></td>
              </tr>
            ))}</tbody></table></div></div></div>
        </>
      )}
    </div>
  );
}
