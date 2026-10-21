import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from './AppContext.jsx';
import { Toasts } from './components/ui.jsx';
import FleetPage from './pages/FleetPage.jsx';
import RoutesPage from './pages/RoutesPage.jsx';
import AssignmentsPage from './pages/AssignmentsPage.jsx';
import ExceptionsPage from './pages/ExceptionsPage.jsx';
import PerformancePage from './pages/PerformancePage.jsx';
import EvidencePage from './pages/EvidencePage.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import MasterPage from './pages/MasterPage.jsx';
import MonitorPage from './pages/MonitorPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

const TABS = ['fleet', 'orders', 'exceptions', 'evidence', 'perf', 'master', 'routes', 'assignments', 'monitor', 'reports', 'settings'];

export default function App({ addInId }) {
  const { t, lang, setLang, results, errors, isMock, reload, loading, ordersApi } = useApp();
  const [tab, setTab] = useState('fleet');
  const [excOpen, setExcOpen] = useState(0);
  // Badge exception terbuka: cek tiap 2 menit selagi bukan halaman Exception (halaman itu memperbarui sendiri)
  useEffect(() => {
    if (isMock) return undefined;
    const poll = () => ordersApi.insights.exceptions({ status: 'open' }).then((r) => setExcOpen(r.counts.open)).catch(() => {});
    poll();
    const i = setInterval(() => tab !== 'exceptions' && poll(), 120000);
    return () => clearInterval(i);
  }, [ordersApi, isMock, tab]);
  const deviating = useMemo(() => [...results.values()].filter((r) => r.result.currentlyDeviating && Date.now() <= r.inst.endMs).length, [results]);
  const fatal = errors.store || errors.devices;

  return (
    <div>
      <div className="tms-head">
        <div className="tms-brand">
          <img src={`${(window.TMS_CONFIG && window.TMS_CONFIG.hostUrl) || ''}/logo.svg`} alt="SMA" height="30" style={{ display: 'block' }} />
          TMS
        </div>
        <div className="tms-nav">
          {TABS.map((k) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {t(`nav.${k}`)}
              {k === 'monitor' && deviating > 0 && <span className="cnt">{deviating}</span>}
              {k === 'exceptions' && excOpen > 0 && <span className="cnt">{excOpen}</span>}
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
      {tab === 'orders' && <OrdersPage />}
      {tab === 'exceptions' && <ExceptionsPage onCount={setExcOpen} />}
      {tab === 'perf' && <PerformancePage />}
      {tab === 'evidence' && <EvidencePage />}
      {tab === 'master' && <MasterPage />}
      {tab === 'routes' && <RoutesPage />}
      {tab === 'assignments' && <AssignmentsPage />}
      {tab === 'monitor' && <MonitorPage />}
      {tab === 'reports' && <ReportsPage />}
      {tab === 'settings' && <SettingsPage addInId={addInId} />}
      <Toasts />
    </div>
  );
}
