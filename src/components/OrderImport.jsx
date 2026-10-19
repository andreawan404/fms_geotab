import React, { useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Modal, downloadBlob } from './ui.jsx';
import { parseCsv, readXlsx, writeXlsx } from '../core/xlsx.js';
import { checkImport, guideRows, rowsToOrders, templateRows } from '../core/orderImport.js';
import { apiErrorText, fmtNum, issueText } from '../lib/orderView.js';

const CHUNK = 25;

export function downloadTemplate() {
  const bytes = writeXlsx([
    { name: 'DO', rows: templateRows(), widths: [16, 22, 12, 10, 28, 9, 11, 22, 30, 10, 10, 9, 18, 18, 16, 16, 22, 24, 10, 8, 7, 10, 10, 8, 8, 10, 10, 10, 10, 10, 10, 10, 10] },
    { name: 'Petunjuk', rows: guideRows(), widths: [16, 8, 90] },
  ]);
  downloadBlob('template-do.xlsx', bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/** Import DO dari Excel/CSV: baca -> pratinjau + validasi per DO -> kirim yang valid. */
export default function OrderImport({ onClose, onDone, existing }) {
  const { t, ordersApi, toast } = useApp();
  const [chk, setChk] = useState(null);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [open, setOpen] = useState(null);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr('');
    setResult(null);
    setFileName(f.name);
    try {
      const rows = /\.csv$/i.test(f.name) ? parseCsv(await f.text()) : readXlsx(new Uint8Array(await f.arrayBuffer()));
      const parsed = rowsToOrders(rows);
      setChk(checkImport(parsed, existing));
    } catch (ex) {
      setChk(null);
      setErr(`${t('imp.readFail')}: ${ex.message || ex}`);
    }
  };

  const valid = chk ? chk.items.filter((x) => x.status === 'ok') : [];
  const run = async () => {
    setBusy(true);
    const all = [];
    try {
      for (let i = 0; i < valid.length; i += CHUNK) {
        setProgress({ done: i, total: valid.length });
        const r = await ordersApi.importOrders(valid.slice(i, i + CHUNK).map((x) => x.order));
        all.push(...r.results);
      }
      setProgress(null);
      setResult({ created: all.filter((r) => r.ok).length, failed: all.filter((r) => !r.ok) });
      toast(t('imp.done', { n: all.filter((r) => r.ok).length }));
      onDone?.();
    } catch (ex) {
      setProgress(null);
      setErr(apiErrorText(t, ex));
    }
    setBusy(false);
  };

  const badge = (s) => <span className={`tms-badge ${s === 'ok' ? 'green' : s === 'duplicate' ? 'amber' : 'red'}`}>{t(`imp.st.${s}`)}</span>;
  const rowMsgs = (x) => [
    ...x.rowIssues.map((i) => t(`imp.issue.${i.code}`, { row: i.row, field: i.field, value: i.value ?? '' })),
    ...x.errors.map((e) => issueText(t, e)),
  ];

  return (
    <Modal wide onClose={onClose} title={t('imp.title')} footer={(
      <>
        <button className="tms-btn" onClick={onClose}>{result ? t('close') : t('cancel')}</button>
        {!result && <button className="tms-btn pri" disabled={busy || !valid.length} onClick={run}>{busy ? t('saving') : t('imp.go', { n: valid.length })}</button>}
      </>
    )}>
      <div className="tms-banner" style={{ margin: '0 0 10px', background: '#eef5fc', color: '#0b3f73', borderColor: '#c9def3' }}>{t('imp.help')}</div>
      <div className="tms-row" style={{ marginBottom: 10 }}>
        <input type="file" accept=".xlsx,.csv" onChange={onFile} style={{ width: 'auto', flex: 1 }} />
        <button className="tms-btn" onClick={downloadTemplate}>⬇ {t('imp.template')}</button>
      </div>
      {err && <div className="tms-issue err">{err}</div>}
      {chk && !result && (
        <>
          <div className="tms-sm tms-muted" style={{ marginBottom: 6 }}>{fileName} · {t('imp.counts', { ok: chk.counts.ok, err: chk.counts.error, dup: chk.counts.duplicate })}</div>
          {chk.global.map((g, i) => <div key={i} className="tms-issue err">{t(`imp.issue.${g.code}`, { row: g.row, field: g.field, value: g.value ?? '' })}</div>)}
          <div className="tms-tablewrap" style={{ maxHeight: 340 }}>
            <table>
              <thead><tr><th>{t('imp.col.state')}</th><th>{t('ord.doNo')}</th><th>{t('ord.customer')}</th><th className="num">{t('ord.stopsShort')}</th><th className="num">{t('ord.sum.weight')} (kg)</th><th>{t('imp.col.rows')}</th></tr></thead>
              <tbody>
                {chk.items.map((x, i) => {
                  const msgs = rowMsgs(x);
                  return (
                    <React.Fragment key={i}>
                      <tr className={msgs.length || x.duplicate ? 'click' : ''} onClick={() => setOpen(open === i ? null : i)}>
                        <td>{badge(x.status)}</td>
                        <td><b>{x.order.doNo}</b></td>
                        <td>{x.order.customer}</td>
                        <td className="num">{x.order.stops.length}</td>
                        <td className="num">{fmtNum(x.summary.loadedWeight, 1)}</td>
                        <td className="tms-sm tms-muted">{x.order._rows[0]}–{x.order._rows[x.order._rows.length - 1]}</td>
                      </tr>
                      {(open === i || (x.status === 'error' && msgs.length && i < 3)) && (msgs.length > 0 || x.duplicate) && (
                        <tr><td colSpan={6} style={{ background: '#fbfcfd' }}>
                          {x.duplicate && <div className="tms-issue warn">{t('imp.dupNote')}</div>}
                          {msgs.slice(0, 12).map((m, k) => <div key={k} className="tms-issue err">{m}</div>)}
                          {msgs.length > 12 && <div className="tms-sm tms-muted">{t('imp.moreIssues', { n: msgs.length - 12 })}</div>}
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {progress && <div className="tms-sm" style={{ marginTop: 8 }}>{t('imp.progress', { done: progress.done, total: progress.total })}</div>}
      {result && (
        <div style={{ marginTop: 8 }}>
          <div className="tms-issue ok">✓ {t('imp.done', { n: result.created })}</div>
          {result.failed.map((f, i) => <div key={i} className="tms-issue err"><b>{f.doNo}</b>: {apiErrorText(t, { code: f.code, details: f.details })}</div>)}
        </div>
      )}
    </Modal>
  );
}
