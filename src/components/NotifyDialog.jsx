import React, { useEffect, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Modal, Spinner } from './ui.jsx';
import { fmtDateTime } from '../core/time.js';
import { apiErrorText } from '../lib/orderView.js';

const lines = (v) => (Array.isArray(v) ? v.join('\n') : '');

/** Pengaturan notifikasi exception ke admin: email (Brevo) dan WhatsApp. */
export default function NotifyDialog({ onClose }) {
  const { t, ordersApi, toast } = useApp();
  const [d, setD] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [test, setTest] = useState(null);

  const load = async () => {
    try {
      const r = await ordersApi.insights.notify();
      setD(r);
      setF((cur) => cur || { ...r.settings, emails: lines(r.settings.emails), phones: lines(r.settings.phones) });
    } catch (e) { setErr(apiErrorText(t, e)); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (quiet) => {
    setBusy(true); setErr('');
    try {
      const s = await ordersApi.insights.saveNotify({ ...f, renotifyMin: Number(f.renotifyMin) || 0 });
      setF({ ...s, emails: lines(s.emails), phones: lines(s.phones) });
      if (!quiet) toast(t('ntf.saved'));
      return true;
    } catch (e) {
      const bad = Array.isArray(e.details) ? e.details.map((x) => x.value).filter(Boolean).join(', ') : '';
      setErr(`${apiErrorText(t, e)}${bad ? `: ${bad}` : ''}`);
      return false;
    } finally { setBusy(false); }
  };
  const sendTest = async () => {
    if (!(await save(true))) return;
    setBusy(true); setTest(null);
    try { setTest((await ordersApi.insights.testNotify()).results); load(); } catch (e) { setErr(apiErrorText(t, e)); } finally { setBusy(false); }
  };

  const wa = d?.providers.wa;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <Modal wide title={t('ntf.title')} onClose={onClose}
      footer={<><button className="tms-btn" onClick={onClose}>{t('close')}</button><button className="tms-btn" disabled={busy || !f} onClick={sendTest}>{t('ntf.test')}</button><button className="tms-btn pri" disabled={busy || !f} onClick={() => save(false)}>{t('save')}</button></>}>
      {!f ? (err ? <div className="tms-banner">{err}</div> : <Spinner />) : (
        <>
          {err && <div className="tms-banner" style={{ marginBottom: 8 }}>{err}</div>}
          <div className="tms-sm tms-muted" style={{ marginBottom: 10 }}>{t('ntf.hint')}</div>

          <div className="tms-card" style={{ marginBottom: 10 }}><div className="tms-card-b">
            <label className="tms-row" style={{ gap: 8 }}><input type="checkbox" checked={f.emailEnabled} onChange={set('emailEnabled')} /><b>{t('ntf.email')}</b>
              <span className={`tms-badge ${d.providers.email.configured ? 'green' : 'amber'}`}>{d.providers.email.configured ? t('ntf.ready') : t('ntf.notReady')}</span></label>
            {!d.providers.email.configured && <div className="tms-sm tms-muted">{t('ntf.emailSetup')}</div>}
            <textarea className="tms-input" style={{ width: '100%', marginTop: 6 }} rows={3} value={f.emails} onChange={set('emails')} placeholder={t('ntf.emailPh')} />
          </div></div>

          <div className="tms-card" style={{ marginBottom: 10 }}><div className="tms-card-b">
            <label className="tms-row" style={{ gap: 8 }}><input type="checkbox" checked={f.waEnabled} onChange={set('waEnabled')} /><b>WhatsApp</b>
              <span className={`tms-badge ${wa.configured ? 'green' : 'amber'}`}>{wa.configured ? `${t('ntf.ready')} (${wa.provider})` : t('ntf.notReady')}</span></label>
            {!wa.configured && <div className="tms-sm tms-muted">{t('ntf.waSetup')}</div>}
            <textarea className="tms-input" style={{ width: '100%', marginTop: 6 }} rows={3} value={f.phones} onChange={set('phones')} placeholder={t('ntf.waPh')} />
          </div></div>

          <div className="tms-row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <label>{t('ntf.minSev')}{' '}
              <select style={{ width: 'auto' }} value={f.minSeverity} onChange={set('minSeverity')}>
                <option value="high">{t('ntf.sev.high')}</option><option value="medium">{t('ntf.sev.medium')}</option><option value="low">{t('ntf.sev.low')}</option>
              </select>
            </label>
            <label>{t('ntf.remind')}{' '}<input type="number" min="0" max="1440" style={{ width: 80 }} value={f.renotifyMin} onChange={set('renotifyMin')} /> {t('ntf.minutes')}</label>
          </div>
          <div className="tms-sm tms-muted" style={{ marginBottom: 10 }}>{t('ntf.remindHint')}</div>

          {test && (
            <div className="tms-banner" style={{ marginBottom: 8 }}>
              <b>{t('ntf.testResult')}</b>
              <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>{test.map((r, i) => <li key={i}>{r.channel} → {r.to}: <b>{r.status}</b>{r.error ? ` (${r.error})` : ''}</li>)}</ul>
            </div>
          )}
          <b>{t('ntf.log')}</b>
          {d.log.length === 0 ? <div className="tms-sm tms-muted">{t('ntf.logEmpty')}</div> : (
            <div className="tms-tablewrap" style={{ marginTop: 4 }}><table><tbody>
              {d.log.map((l, i) => <tr key={i}><td>{fmtDateTime(l.at)}</td><td>{l.channel}</td><td>{l.to}</td><td className="num">{l.items}</td><td><span className={`tms-badge ${l.status === 'sent' ? 'green' : l.status === 'failed' ? 'red' : 'gray'}`}>{l.status}</span></td><td className="tms-sm tms-muted">{l.error}</td></tr>)}
            </tbody></table></div>
          )}
        </>
      )}
    </Modal>
  );
}
