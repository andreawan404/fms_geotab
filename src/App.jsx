import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from './AppContext.jsx';
import { Toasts } from './components/ui.jsx';
import FleetPage from './pages/FleetPage.jsx';
import RoutesPage from './pages/RoutesPage.jsx';
import AssignmentsPage from './pages/AssignmentsPage.jsx';
import IntegrationPage from './pages/IntegrationPage.jsx';
import ExceptionsPage from './pages/ExceptionsPage.jsx';
import DeliveryPage from './pages/DeliveryPage.jsx';
import PerformancePage from './pages/PerformancePage.jsx';
import EvidencePage from './pages/EvidencePage.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import MasterPage from './pages/MasterPage.jsx';
import MonitorPage from './pages/MonitorPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import ModePicker from './components/ModePicker.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

// Urutan menu utama. Menu "Laporan" adalah grup dengan sub-menu (laporan armada, bukti pengiriman, exception).
const MENU = ['perf', 'fleet', 'orders', 'delivery', 'integration', 'master', 'routes', 'assignments', 'monitor', { group: 'reports', children: ['reports', 'evidence', 'exceptions'] }, 'settings'];
const TABS = MENU.flatMap((m) => (typeof m === 'string' ? [m] : m.children));
// Mode aplikasi menentukan menu: TMS penuh menyembunyikan menu integrasi, Monitor (TMS customer sendiri) menyembunyikan menu proses TMS
const HIDDEN_BY_MODE = { full: new Set(['integration', 'delivery']), monitor: new Set(['orders', 'evidence', 'master']) };

export default function App({ addInId }) {
  const { t, lang, setLang, results, errors, isMock, reload, loading, ordersApi } = useApp();
  const [tab, setTab] = useState('fleet');
  const [excOpen, setExcOpen] = useState(0);
  const [mode, setMode] = useState('full');
  const [modeSet, setModeSet] = useState(true); // false = admin belum pernah memilih mode -> tampilkan layar pemilihan
  useEffect(() => { ordersApi.integration.mode().then((r) => { setMode(r.mode); setModeSet(r.modeSet !== false); }).catch(() => {}); }, [ordersApi]);
  const chooseMode = async (m) => { await ordersApi.integration.setMode(m); setMode(m); setModeSet(true); };
  const tabs = TABS.filter((k) => !HIDDEN_BY_MODE[mode].has(k));
  const menu = MENU.map((m) => (typeof m === 'string' ? m : { ...m, children: m.children.filter((c) => tabs.includes(c)) })).filter((m) => typeof m === 'string' ? tabs.includes(m) : m.children.length);
  const [openGroup, setOpenGroup] = useState(false);
  useEffect(() => {
    if (!openGroup) return undefined;
    const close = (e) => { if (e.type === 'keydown' ? e.key === 'Escape' : !e.target.closest?.('.tms-navgrp')) setOpenGroup(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [openGroup]);
  useEffect(() => { if (!tabs.includes(tab)) setTab('fleet'); }, [tabs, tab]);
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

  if (!loading && !modeSet) {
    return (
      <div className="tms-page" style={{ maxWidth: 760, margin: '40px auto' }}>
        <h2>{t('mode.chooseTitle')}</h2>
        <div className="tms-sm tms-muted" style={{ margin: '6px 0 14px' }}>{t('mode.chooseHint')}</div>
        <ModePicker value={null} onPick={chooseMode} />
      </div>
    );
  }

  return (
    <div>
      <div className="tms-head">
        <div className="tms-brand">
          <img src={`${(window.TMS_CONFIG && window.TMS_CONFIG.hostUrl) || ''}/logo.svg`} alt="SMA" height="30" style={{ display: 'block' }} />
          TMS
        </div>
        <div className="tms-nav">
          {menu.map((m) => (typeof m === 'string' ? (
            <button key={m} className={tab === m ? 'on' : ''} onClick={() => setTab(m)}>
              {t(`nav.${m}`)}
              {m === 'monitor' && deviating > 0 && <span className="cnt">{deviating}</span>}
            </button>
          ) : (
            <div key={m.group} className="tms-navgrp">
              <button className={m.children.includes(tab) ? 'on' : ''} aria-haspopup="menu" aria-expanded={openGroup} onClick={() => setOpenGroup((v) => !v)}>
                {t(`nav.${m.group}`)} <span aria-hidden="true">▾</span>
                {m.children.includes('exceptions') && excOpen > 0 && <span className="cnt">{excOpen}</span>}
              </button>
              {openGroup && (
                <div className="tms-navmenu" role="menu">
                  {m.children.map((c) => (
                    <button key={c} role="menuitem" className={tab === c ? 'on' : ''} onClick={() => { setTab(c); setOpenGroup(false); }}>
                      {t(c === 'reports' ? 'nav.reports.sub' : `nav.${c}`)}
                      {c === 'exceptions' && excOpen > 0 && <span className="cnt">{excOpen}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )))}
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
      {tab === 'integration' && <IntegrationPage />}
      {tab === 'perf' && <PerformancePage />}
      {tab === 'delivery' && <DeliveryPage />}
      {tab === 'evidence' && <EvidencePage />}
      {tab === 'master' && <MasterPage />}
      {tab === 'routes' && <RoutesPage />}
      {tab === 'assignments' && <AssignmentsPage />}
      {tab === 'monitor' && <MonitorPage />}
      {tab === 'reports' && <ReportsPage />}
      {tab === 'settings' && <SettingsPage mode={mode} onMode={setMode} addInId={addInId} />}
      <Toasts />
    </div>
  );
}
