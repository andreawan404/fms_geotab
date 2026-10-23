import React from 'react';
import { useApp } from '../AppContext.jsx';

/** Pilihan mode aplikasi (TMS penuh / Monitor) sebagai dua kartu. */
export default function ModePicker({ value, onPick, busy }) {
  const { t } = useApp();
  return (
    <div className="tms-row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
      {['full', 'monitor'].map((m) => (
        <label key={m} style={{ flex: '1 1 300px', border: `2px solid ${value === m ? '#0b5fa5' : '#d9dee5'}`, background: value === m ? '#eef5fc' : '#fff', borderRadius: 8, padding: 12, cursor: busy ? 'wait' : 'pointer' }}>
          <input type="radio" name="app-mode" disabled={busy} checked={value === m} onChange={() => onPick(m)} /> <b>{t(`int.mode.${m}`)}</b>
          <div className="tms-sm tms-muted" style={{ marginTop: 4 }}>{t(`mode.${m}Menus`)}</div>
        </label>
      ))}
    </div>
  );
}
