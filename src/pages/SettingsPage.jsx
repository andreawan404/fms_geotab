import React, { useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Field, Spinner } from '../components/ui.jsx';
import { findRoutes } from '../services/routing.js';
import { errMessage } from '../services/geotab.js';

const DEF_KEYS = ['widthM', 'radius', 'avgSpeedKmh', 'confirmSec', 'confirmMeters', 'gpsMarginM', 'recoverSec', 'graceMin'];

export default function SettingsPage({ addInId }) {
  const { t, settings, saveSettings, toast, loading, isMock } = useApp();
  const [s, setS] = useState(() => JSON.parse(JSON.stringify(settings)));
  const [busy, setBusy] = useState('');
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

      <div className="tms-row" style={{ marginBottom: 16 }}>
        <button className="tms-btn pri" onClick={save} disabled={busy === 'save'}>{t('save')}</button>
      </div>

      <div className="tms-card">
        <div className="tms-card-h">{t('set.about')}</div>
        <div className="tms-card-b tms-sm">
          <p style={{ margin: '0 0 6px' }}>{t('set.aboutBody')}</p>
          <div className="tms-muted">addInId: <code>{addInId}</code>{isMock ? ` · ${t('set.demoMode')}` : ''}</div>
          <p style={{ margin: '10px 0 0' }}>{t('set.ruleGuide')}</p>
        </div>
      </div>
    </div>
  );
}
