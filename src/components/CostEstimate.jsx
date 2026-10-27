import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { COST_DEFAULTS, estimateCost, fmtRp, tollClassOf, tollRatePerKm } from '../core/cost.js';
import { fmtNum } from '../lib/orderView.js';

/**
 * Perkiraan biaya BBM + tol untuk satu rute.
 * vehicles: [{ id, label, type, geotabDeviceId, fuelKmPerL, tollClass }] (boleh kosong).
 * tollM: jarak ruas tol dari mesin rute (null = tidak terdeteksi).
 */
export default function CostEstimate({ distanceM, tollM, vehicles = [], vehicleId: initialId = '', onVehicle }) {
  const { t, settings, vehicleEconomy } = useApp();
  const cost = { ...COST_DEFAULTS, ...(settings.cost || {}) };
  const [vid, setVid] = useState(initialId);
  const veh = useMemo(() => vehicles.find((x) => x.id === vid) || null, [vehicles, vid]);
  const [kmpl, setKmpl] = useState('');
  const [src, setSrc] = useState('manual');
  const [cls, setCls] = useState(1);
  const [tollRp, setTollRp] = useState('');

  useEffect(() => { setVid(initialId); }, [initialId]);
  // sumber km/L: data aktual GPS 30 hari -> data master kendaraan -> manual
  useEffect(() => {
    let dead = false;
    setCls(tollClassOf(veh));
    if (!veh) { setSrc('manual'); return undefined; }
    const master = Number(veh.fuelKmPerL) > 0 ? Number(veh.fuelKmPerL) : null;
    if (master) { setKmpl(String(master)); setSrc('master'); } else { setKmpl(''); setSrc('manual'); }
    if (veh.geotabDeviceId && vehicleEconomy) {
      setSrc('loading');
      vehicleEconomy(veh.geotabDeviceId).then((r) => {
        if (dead) return;
        if (r?.kmPerL) { setKmpl(r.kmPerL.toFixed(1)); setSrc({ actual: Math.round(r.distKm) }); } else setSrc(master ? 'master' : 'manual');
      });
    }
    return () => { dead = true; };
  }, [veh?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const est = estimateCost({ distanceM, tollM, kmPerL: Number(kmpl) || null, tollClass: cls, tollOverrideRp: tollRp === '' ? null : Number(tollRp), cost });
  const srcText = typeof src === 'object' ? t('cost.src.actual', { km: fmtNum(src.actual) }) : t(`cost.src.${src}`);
  if (!(distanceM > 0)) return null;
  return (
    <div className="tms-cost">
      <div className="tms-row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <b>{t('cost.title')}</b>
        {est.totalRp != null && <span className="tms-badge green">{fmtRp(est.totalRp)}</span>}
      </div>
      <div className="tms-cost-grid">
        <label className="tms-field"><span className="tms-field-label">{t('cost.vehicle')}</span>
          <select value={vid} onChange={(e) => { setVid(e.target.value); onVehicle?.(e.target.value); }}>
            <option value="">{vehicles.length ? t('cost.pickVehicle') : t('cost.genericVehicle')}</option>
            {vehicles.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </label>
        <label className="tms-field"><span className="tms-field-label">{t('cost.kmPerL')}</span>
          <input type="number" min="0" step="0.1" value={kmpl} onChange={(e) => { setKmpl(e.target.value); setSrc('manual'); }} />
          <span className="tms-hint">{srcText}</span>
        </label>
        <label className="tms-field"><span className="tms-field-label">{t('mst.f.tollClass')}</span>
          <select value={cls} onChange={(e) => setCls(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((c) => <option key={c} value={c}>{t('cost.class', { n: c })}</option>)}
          </select>
        </label>
        <label className="tms-field"><span className="tms-field-label">{t('cost.tollManual')}</span>
          <input type="number" min="0" step="1000" value={tollRp} placeholder={est.tollSource === 'route' ? String(est.tollRp) : ''} onChange={(e) => setTollRp(e.target.value)} />
          <span className="tms-hint">{t('cost.tollManualHint')}</span>
        </label>
      </div>
      <table className="tms-cost-t">
        <tbody>
          <tr>
            <td>{t('cost.fuel')}</td>
            <td className="tms-muted">{est.fuelL != null ? t('cost.fuelFormula', { l: fmtNum(est.fuelL, 1), price: cost.fuelPriceRp ? fmtRp(cost.fuelPriceRp) : '?' }) : t('cost.needKmPerL')}</td>
            <td className="num"><b>{fmtRp(est.fuelRp)}</b></td>
          </tr>
          <tr>
            <td>{t('cost.toll')}</td>
            <td className="tms-muted">
              {est.tollSource === 'route' && t('cost.tollFormula', { km: fmtNum(est.tollKm, 1), rate: fmtRp(tollRatePerKm(cost, cls)), cls: t('cost.class', { n: cls }) })}
              {est.tollSource === 'manual' && t('cost.src.manual')}
              {est.tollSource === 'unknown' && t('cost.tollUnknown')}
            </td>
            <td className="num"><b>{fmtRp(est.tollRp)}</b></td>
          </tr>
          <tr className="tot"><td>{t('cost.total')}</td><td className="tms-muted">{fmtNum(est.distKm, 1)} km</td><td className="num"><b>{fmtRp(est.totalRp)}</b></td></tr>
        </tbody>
      </table>
      {est.missing.includes('fuelPrice') && <div className="tms-sm" style={{ color: '#b45309' }}>{t('cost.needPrice')}</div>}
      <div className="tms-sm tms-muted" style={{ marginTop: 4 }}>{t('cost.note')}</div>
    </div>
  );
}
