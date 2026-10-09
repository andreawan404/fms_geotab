import React, { useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Field, Spinner } from '../components/ui.jsx';
import { findRoutes } from '../services/routing.js';
import { errMessage } from '../services/geotab.js';
import { APP_VERSION, CHANGELOG } from '../changelog.js';

const DEF_KEYS = ['widthM', 'radius', 'avgSpeedKmh', 'confirmSec', 'confirmMeters', 'gpsMarginM', 'recoverSec', 'graceMin', 'lateStartMin'];

export default function SettingsPage({ addInId }) {
  const { t, lang, settings, saveSettings, toast, loading, isMock, geotab, devices } = useApp();
  const [s, setS] = useState(() => JSON.parse(JSON.stringify(settings)));
  const [busy, setBusy] = useState('');
  const [probe, setProbe] = useState(null);
  if (loading) return <Spinner text={t('loading')} />;
  const setRouting = (p) => setS((x) => ({ ...x, routing: { ...x.routing, ...p } }));
  const setDef = (k, v) => setS((x) => ({ ...x, defaults: { ...x.defaults, [k]: Number(v) } }));

  const save = async () => {
    setBusy('save');
    try {
      await saveSettings({ ...s, pollSec: Math.max(5, Number(s.pollSec) || 15) });
      toast(t('saved'));
    } catch (e) {
      toast(errMessage(e), 'err');
    }
    setBusy('');
  };
  const idList = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
  const sensors = s.sensors || { engineHours: [], fuel: [] };
  const checkSensors = async () => {
    setBusy('probe');
    try {
      setProbe(await geotab.probeSensors(devices.map((d) => d.id), sensors));
    } catch (e) {
      toast(errMessage(e), 'err');
    }
    setBusy('');
  };
  const test = async () => {
    setBusy('test');
    try {
      const [r] = await findRoutes(s, [[-6.2088, 106.8456], [-6.1754, 106.8272]]);
      toast(t('set.testOk', { km: (r.distanceM / 1000).toFixed(1) }));
    } catch (e) {
      toast(errMessage(e), 'err');
    }
    setBusy('');
  };

  return (
    <div className="tms-page" style={{ maxWidth: 900 }}>
      <h2 style={{ marginBottom: 12 }}>{t('set.title')}</h2>

      <div className="tms-card" style={{ marginBottom: 12 }}>
        <div className="tms-card-h">{t('set.routing')}</div>
        <div className="tms-card-b">
          <div className="tms-grid2">
            <Field label={t('set.provider')}>
              <select value={s.routing.provider} onChange={(e) => setRouting({ provider: e.target.value })}>
                <option value="osrm">OSRM</option>
                <option value="ors">OpenRouteService</option>
              </select>
            </Field>
            <Field label={t('set.country')} hint={t('set.countryHint')}>
              <input value={s.routing.country} maxLength={2} onChange={(e) => setRouting({ country: e.target.value.toUpperCase() })} />
            </Field>
          </div>
          {s.routing.provider === 'ors' ? (
            <Field label="OpenRouteService API key" hint={t('set.orsHint')}>
              <input type="password" value={s.routing.orsKey} onChange={(e) => setRouting({ orsKey: e.target.value.trim() })} autoComplete="off" />
            </Field>
          ) : (
            <Field label="OSRM URL" hint={t('set.osrmHint')}>
              <input value={s.routing.osrmUrl} onChange={(e) => setRouting({ osrmUrl: e.target.value.trim() })} />
            </Field>
          )}
          <Field label={t('set.tiles')} hint={t('set.tilesHint')}>
            <input value={s.tileUrl} onChange={(e) => setS({ ...s, tileUrl: e.target.value.trim() })} />
          </Field>
          <button className="tms-btn" onClick={test} disabled={busy === 'test'}>{busy === 'test' ? t('loading') : t('set.test')}</button>
          <div className="tms-sm tms-muted" style={{ marginTop: 8 }}>{t('set.keyWarn')}</div>
        </div>
      </div>

      <div className="tms-card" style={{ marginBottom: 12 }}>
        <div className="tms-card-h">{t('set.defaults')}</div>
        <div className="tms-card-b">
          <div className="tms-grid3">
            {DEF_KEYS.map((k) => (
              <Field key={k} label={t(`param.${k}`)} hint={t(`param.${k}.hint`)}>
                <input type="number" min="0" value={s.defaults[k]} onChange={(e) => setDef(k, e.target.value)} />
              </Field>
            ))}
            <Field label={t('set.poll')} hint={t('set.pollHint')}>
              <input type="number" min="5" value={s.pollSec} onChange={(e) => setS({ ...s, pollSec: e.target.value })} />
            </Field>
          </div>
        </div>
      </div>

      <div className="tms-card" style={{ marginBottom: 16 }}>
        <div className="tms-card-h">{t('set.sensors')}</div>
        <div className="tms-card-b">
          <p className="tms-sm tms-muted" style={{ margin: '0 0 10px' }}>{t('set.sensorsHint')}</p>
          <div className="tms-grid3">
            <Field label={t('set.sensorHours')} hint={t('set.sensorIdsHint')}>
              <input value={(sensors.engineHours || []).join(', ')} onChange={(e) => setS((x) => ({ ...x, sensors: { ...sensors, engineHours: idList(e.target.value) } }))} />
            </Field>
            <Field label={t('set.sensorFuel')} hint={t('set.sensorIdsHint')}>
              <input value={(sensors.fuel || []).join(', ')} onChange={(e) => setS((x) => ({ ...x, sensors: { ...sensors, fuel: idList(e.target.value) } }))} />
            </Field>
            <Field label={t('set.unitEcon')}>
              <select value={s.units?.fuelEcon || 'kmpl'} onChange={(e) => setS((x) => ({ ...x, units: { ...x.units, fuelEcon: e.target.value } }))}>
                <option value="kmpl">km/L</option>
                <option value="l100">L/100 km</option>
              </select>
            </Field>
          </div>
          <div className="tms-row" style={{ margin: '10px 0' }}>
            <button className="tms-btn" onClick={checkSensors} disabled={busy === 'probe'}>{busy === 'probe' ? t('set.sensorChecking') : t('set.sensorCheck')}</button>
            <span className="tms-sm tms-muted">{t('set.sensorSave')}</span>
          </div>
          {probe && (
            <div className="tms-tablewrap">
              <table>
                <thead><tr><th>{t('asg.vehicle')}</th><th>{t('col.engineHours')}</th><th>{t('col.fuelUsed')}</th></tr></thead>
                <tbody>
                  {devices.map((d) => {
                    const r = probe[d.id] || {};
                    return (
                      <tr key={d.id}>
                        <td><b>{d.name}</b></td>
                        <td>{r.engineHours ? <span className="tms-badge green">{'\u2713'} {r.engineHours}</span> : <span className="tms-badge gray">{t('set.sensorNone')}</span>}</td>
                        <td>{r.fuel ? <span className="tms-badge green">{'\u2713'} {r.fuel}</span> : <span className="tms-badge gray">{t('set.sensorNone')}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="tms-row" style={{ marginBottom: 16 }}>
        <button className="tms-btn pri" onClick={save} disabled={busy === 'save'}>{t('save')}</button>
      </div>

      <div className="tms-card">
        <div className="tms-card-h">{t('set.about')}</div>
        <div className="tms-card-b tms-sm">
          <p style={{ margin: '0 0 6px' }}>{t('set.aboutBody')}</p>
          <div className="tms-muted">v{APP_VERSION} · addInId: <code>{addInId}</code>{isMock ? ` · ${t('set.demoMode')}` : ''}</div>
          <p style={{ margin: '10px 0 0' }}>{t('set.ruleGuide')}</p>
        </div>
      </div>

      <div className="tms-card" style={{ marginTop: 16 }}>
        <div className="tms-card-h">{t('set.changelog')}</div>
        <div className="tms-card-b tms-sm">
          {CHANGELOG.map((e) => (
            <div key={e.v} style={{ marginBottom: 12 }}>
              <b>v{e.v}</b> <span className="tms-muted">{e.date}</span>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{(lang === 'en' ? e.en : e.id).map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
