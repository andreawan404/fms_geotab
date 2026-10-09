// Penjadwalan: ekspansi penugasan (sekali / berulang) menjadi instance harian + deteksi bentrok.
import { addDays, atTime, parseYmd, ymd } from './time.js';

/**
 * Assignment: { id, routeId, deviceId, driverId?, startTime:'HH:MM', endTime:'HH:MM',
 *   date:'YYYY-MM-DD'            // sekali
 *   | recur:{ days:[0..6], from:'YYYY-MM-DD', until?:'YYYY-MM-DD' }   // 0 = Minggu
 *   exceptions?: ['YYYY-MM-DD'], active?: boolean }
 * Jika endTime <= startTime, jadwal berlanjut ke hari berikutnya (shift malam).
 */
export function expand(assignments, fromStr, toStr) {
  const out = [];
  const from = parseYmd(fromStr);
  const to = parseYmd(toStr);
  for (const a of assignments) {
    if (a.active === false) continue;
    const dates = [];
    if (a.date) {
      if (a.date >= fromStr && a.date <= toStr) dates.push(a.date);
    } else if (a.recur) {
      const days = a.recur.days || [];
      const s = a.recur.from ? parseYmd(a.recur.from) : from;
      let d = s > from ? s : from;
      const lim = a.recur.until ? parseYmd(a.recur.until) : to;
      const end = lim < to ? lim : to;
      for (; d <= end; d = addDays(d, 1)) if (days.includes(d.getDay())) dates.push(ymd(d));
    }
    for (const ds of dates) {
      if (a.exceptions?.includes(ds)) continue;
      const startMs = atTime(ds, a.startTime);
      let endMs = atTime(ds, a.endTime);
      if (endMs <= startMs) endMs = atTime(ymd(addDays(parseYmd(ds), 1)), a.endTime);
      out.push({
        key: `${a.id}@${ds}`,
        assignmentId: a.id,
        date: ds,
        startMs,
        endMs,
        routeId: a.routeId,
        deviceId: a.deviceId,
        driverId: a.driverId || null,
        note: a.note || '',
      });
    }
  }
  return out.sort((x, y) => x.startMs - y.startMs);
}

/** Instance yang beririsan dengan [fromMs, toMs] (termasuk shift malam dari hari sebelumnya). */
export function instancesBetween(assignments, fromMs, toMs) {
  const f = ymd(addDays(new Date(fromMs), -1));
  const t = ymd(new Date(toMs));
  return expand(assignments, f, t).filter((i) => i.endMs > fromMs && i.startMs < toMs);
}

/** Bentrok kendaraan / driver untuk calon penugasan terhadap yang sudah ada. */
export function findConflicts(candidate, existing, horizonStart, horizonDays = 60) {
  const fromStr = candidate.date || candidate.recur?.from || horizonStart;
  const toStr = candidate.date || ymd(addDays(parseYmd(fromStr), horizonDays));
  const mine = expand([{ ...candidate, id: candidate.id || '__new__' }], fromStr, toStr);
  const others = expand(existing.filter((e) => e.id !== candidate.id), ymd(addDays(parseYmd(fromStr), -1)), toStr);
  const out = [];
  for (const a of mine) {
    for (const b of others) {
      if (!(a.startMs < b.endMs && b.startMs < a.endMs)) continue;
      if (a.deviceId && a.deviceId === b.deviceId) out.push({ reason: 'vehicle', date: a.date, other: b });
      else if (a.driverId && a.driverId === b.driverId) out.push({ reason: 'driver', date: a.date, other: b });
      if (out.length >= 20) return out;
    }
  }
  return out;
}

/**
 * Rencana menyalin instance penugasan ke tanggal lain sebagai penugasan sekali (bukan berulang).
 * Instance yang bentrok (kendaraan / sopir) dengan penugasan yang ada atau yang baru dibuat dilewati.
 * @returns {{ create: Array, skipped: Array<{inst, reason}> }}
 */
export function planCopy(instances, assignments, targetDate, makeId, nowMs = Date.now()) {
  const byId = new Map(assignments.map((a) => [a.id, a]));
  const pool = [...assignments];
  const create = [];
  const skipped = [];
  for (const inst of instances) {
    const src = byId.get(inst.assignmentId);
    if (!src || inst.date === targetDate) {
      skipped.push({ inst, reason: 'same' });
      continue;
    }
    const cand = {
      id: makeId(),
      routeId: inst.routeId,
      deviceId: inst.deviceId,
      driverId: inst.driverId || '',
      startTime: src.startTime,
      endTime: src.endTime,
      date: targetDate,
      note: inst.note || '',
      active: true,
      createdAt: nowMs,
    };
    const c = findConflicts(cand, pool, targetDate, 1);
    if (c.length) {
      skipped.push({ inst, reason: c[0].reason });
      continue;
    }
    create.push(cand);
    pool.push(cand);
  }
  return { create, skipped };
}
