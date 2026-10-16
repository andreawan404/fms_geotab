import React, { useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { Modal } from './ui.jsx';

/** Dialog "Tandai ditangani": catatan opsional. ids = daftar id alert. */
export default function AckDialog({ ids, onClose }) {
  const { t, ackAlert, toast } = useApp();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await ackAlert(ids, note.trim());
      toast(t('ack.done', { n: ids.length }));
      onClose();
    } catch (e) {
      toast(e.message || String(e), 'err');
      setBusy(false);
    }
  };
  return (
    <Modal
      onClose={onClose}
      title={t('ack.title')}
      footer={
        <>
          <button className="tms-btn" onClick={onClose}>{t('cancel')}</button>
          <button className="tms-btn primary" disabled={busy} onClick={go}>{t('ack.confirm', { n: ids.length })}</button>
        </>
      }
    >
      <label className="tms-field">
        <span>{t('ack.note')}</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('ack.notePh')} autoFocus />
      </label>
    </Modal>
  );
}
