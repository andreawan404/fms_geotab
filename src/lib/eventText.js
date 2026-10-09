export function eventText(it, { t, deviceMap, routeMap }) {
  const device = deviceMap.get(it.deviceId)?.name || it.deviceId;
  const route = routeMap.get(it.routeId)?.name || '';
  return t(`alert.${it.type}`, { device, route, cp: it.cpName || '', dist: Math.round(it.distM || 0), min: it.min ?? '' });
}
