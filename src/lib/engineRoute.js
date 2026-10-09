// Menyusun objek rute untuk mesin tracking dari rute tersimpan + default pengaturan.
export function engineRoute(route, settings) {
  const d = settings.defaults;
  return {
    path: route.path,
    widthM: route.widthM || d.widthM,
    params: {
      gpsMarginM: d.gpsMarginM,
      confirmSec: d.confirmSec,
      confirmMeters: d.confirmMeters,
      recoverSec: d.recoverSec,
      graceMin: d.graceMin,
      lateStartMin: d.lateStartMin ?? 10,
      ...(route.params || {}),
    },
    checkpoints: (route.checkpoints || []).map((c) => ({ ...c, radius: c.radius || d.radius })),
  };
}

export const routeVersion = (r) => `${r.updatedAt || 0}:${r.widthM}:${r.path?.length || 0}:${r.checkpoints?.length || 0}`;
