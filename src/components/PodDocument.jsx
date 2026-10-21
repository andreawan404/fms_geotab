import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Modal, Spinner } from './ui.jsx';
import { portalBase } from '../services/ordersApi.js';
import { buildPodHtml } from '../lib/podDoc.js';
import { apiErrorText } from '../lib/orderView.js';

/** Dokumen POD: lihat, cetak / simpan PDF, dan tambah catatan amandemen (POD asli tidak berubah). */
export default function PodDocument({ podId, onClose, onChanged }) {
  const { t, ordersApi, toast } = useApp();
  const [pod, setPod] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const frame = useRef(null);

  const load = () => ordersApi.pod.get(podId).then(setPod).catch((e) => setErr(apiErrorText(t, e)));
  useEffect(() => { load(); }, [podId]); // eslint-disable-line react-hooks/exhaustive-deps

  const html = useMemo(() => (pod ? buildPodHtml(pod, portalBase() || location.origin, t) : ''), [pod, t]);
  const print = () => { const w = frame.current?.contentWindow; if (w) { w.focus(); w.print(); } };
  const amend = async () => {
    setBusy(true);
    try { await ordersApi.dispatch.amendPod(podId, note); setNote(''); toast(t('pod.amended')); await load(); onChanged?.(); } catch (e) { setErr(apiErrorText(t, e)); } finally { setBusy(false); }
  };

  return (
    <Modal title={t(pod?.kind === 'pickup' ? 'pod.docTitlePop' : 'pod.docTitle')} onClose={onClose} xwide footer={<button className="tms-btn" onClick={onClose}>{t("close")}</button>}>
      {err && <div className="tms-banner err">{err}</div>}
      {!pod && !err && <Spinner />}
      {pod && (
        <>
          <div className="tms-row" style={{ marginBottom: 8, gap: 8 }}>
            <button className="tms-btn primary" onClick={print}>{t('pod.print')}</button>
            <span className="tms-sm tms-muted">{t('pod.printHint')}</span>
          </div>
          <iframe ref={frame} title="POD" srcDoc={html} sandbox="allow-same-origin allow-modals" style={{ width: '100%', height: '60vh', border: '1px solid #d9dee5', borderRadius: 8, background: '#fff' }} />
          <div style={{ marginTop: 10 }}>
            <b>{t('pod.sec.amend')}</b>
            <div className="tms-sm tms-muted">{t('pod.amendHint')}</div>
            <div className="tms-row" style={{ gap: 8, marginTop: 4 }}>
              <input className="tms-input" style={{ flex: 1 }} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={t('pod.amendPh')} />
              <button className="tms-btn" disabled={busy || note.trim().length < 3} onClick={amend}>{t('pod.amendAdd')}</button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
