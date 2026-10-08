import React, { useMemo, useState } from 'react';
import { useApp } from './AppContext.jsx';
import { Toasts } from './components/ui.jsx';
import FleetPage from './pages/FleetPage.jsx';
import RoutesPage from './pages/RoutesPage.jsx';
import AssignmentsPage from './pages/AssignmentsPage.jsx';
import MonitorPage from './pages/MonitorPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

const TABS = ['fleet', 'routes', 'assignments', 'monitor', 'reports', 'settings'];

export default function App({ addInId }) {
  const { t, lang, setLang, results, errors, isMock, reload, loading } = useApp();
  const [tab, setTab] = useState('fleet');
  const deviating = useMemo(() => [...results.values()].filter((r) => r.result.currentlyDeviating && Date.now() <= r.inst.endMs).length, [results]);
  const fatal = errors.store || errors.devices;

  return (
    <div>
      <div className="tms-head">
        <div className="tms-brand">
          <svg width="22" height="22" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0b5ea8" /><path d="M8 24c0-6 4-6 8-8s4-6 8-8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /><circle cx="8" cy="24" r="3" fill="#fff" /><circle cx="24" cy="8" r="3" fill="#ffb703" /></svg>
          TMS
        </div>
        <div className="tms-nav">
          {TABS.map((k) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {t(`nav.${k}`)}
              {k === 'monitor' && deviating > 0 && <span className="cnt">{deviating}</span>}
            </button>
          ))}
        </div>
        <div className="tms-head-r">
          {isMock && <span className="tms-demo">DEMO</span>}
          <button className="tms-btn sm" onClick={reload} disabled={loading} title={t('refresh')}>↻</button>
          <div className="tms-lang">
            {['id', 'en'].map((l) => (
              <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
      </div>
      {fatal && <div className="tms-banner">{errors.store ? `${t('err.store')}: ${errors.store}` : `${t('err.devices')}: ${errors.devices}`}</div>}
      {tab === 'fleet' && <FleetPage />}
      {tab === 'routes' && <RoutesPage />}
      {tab === 'assignments' && <AssignmentsPage />}
      {tab === 'monitor' && <MonitorPage />}
      {tab === 'reports' && <ReportsPage />}
      {tab === 'settings' && <SettingsPage addInId={addInId} />}
      <Toasts />
    </div>
  );
}
