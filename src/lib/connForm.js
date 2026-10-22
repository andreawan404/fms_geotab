// Konversi antara konfigurasi konektor (objek) dan bentuk formulir datar (teks) di add-in.
export const kvToText = (o) => Object.entries(o || {}).map(([k, v]) => `${k}=${v}`).join('\n');
export const textToKv = (t) => Object.fromEntries(String(t || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf('='); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }).filter(([k]) => k));

export const PRESET = {
  request: { method: 'GET', path: '/v1/deliveries', query: { updated_since: '{{since}}' }, headers: {}, body: '' },
  itemsPath: 'data',
  pagination: { type: 'none', pageParam: 'page', sizeParam: '', size: 100, cursorParam: 'cursor', nextPath: '', maxPages: 5 },
  mapping: {
    timezoneMin: 420,
    order: { externalId: 'id', doNo: 'do_number', customer: 'customer_name', date: 'created_at', plate: 'vehicle_plate', status: 'status', statusMap: { ON_THE_WAY: 'running', DELIVERED: 'done', CANCELLED: 'cancelled' }, defaultStatus: 'assigned' },
    stops: { path: 'stops', typeField: 'type', typeMap: { PICKUP: 'pickup', DELIVERY: 'delivery' }, name: 'name', address: 'address', lat: 'lat', lng: 'lng', windowStart: 'eta_from', windowEnd: 'eta_to', radius: '' },
    items: { path: '', description: 'name', qty: 'qty', unit: 'unit', weightKg: 'weight' },
  },
};

export function toForm(c) {
  const cfg = c.config || PRESET;
  const o = cfg.mapping.order; const s = cfg.mapping.stops; const i = cfg.mapping.items;
  return {
    id: c.id, name: c.name || '', enabled: c.enabled !== false, baseUrl: c.baseUrl || '', authType: c.authType || 'bearer', authName: c.authName || '', secret: '', hasSecret: !!c.hasSecret, intervalMin: c.intervalMin || 10,
    method: cfg.request.method, path: cfg.request.path, query: kvToText(cfg.request.query), headers: kvToText(cfg.request.headers), body: cfg.request.body || '',
    itemsPath: cfg.itemsPath, pgType: cfg.pagination.type, pageParam: cfg.pagination.pageParam, sizeParam: cfg.pagination.sizeParam, pgSize: cfg.pagination.size, cursorParam: cfg.pagination.cursorParam, nextPath: cfg.pagination.nextPath, maxPages: cfg.pagination.maxPages,
    tz: cfg.mapping.timezoneMin,
    oExternalId: o.externalId || '', oDoNo: o.doNo || '', oCustomer: o.customer || '', oDate: o.date || '', oPlate: o.plate || '', oStatus: o.status || '', oStatusMap: kvToText(o.statusMap), oDefault: o.defaultStatus || 'assigned',
    sPath: s.path || '', sTypeField: s.typeField || '', sTypeMap: kvToText(s.typeMap), sFixed: s.fixedType || '', sName: s.name || '', sAddress: s.address || '', sLat: s.lat || '', sLng: s.lng || '', sFrom: s.windowStart || '', sTo: s.windowEnd || '', sRadius: s.radius || '',
    iPath: i.path || '', iDesc: i.description || '', iQty: i.qty || '', iUnit: i.unit || '', iWeight: i.weightKg || '',
  };
}

export function fromForm(f) {
  return {
    id: f.id, name: f.name, enabled: f.enabled, baseUrl: f.baseUrl.trim(), authType: f.authType, authName: f.authName, secret: f.secret, intervalMin: Number(f.intervalMin) || 10,
    config: {
      request: { method: f.method, path: f.path, query: textToKv(f.query), headers: textToKv(f.headers), body: f.body },
      itemsPath: f.itemsPath,
      pagination: { type: f.pgType, pageParam: f.pageParam, sizeParam: f.sizeParam, size: Number(f.pgSize) || 100, cursorParam: f.cursorParam, nextPath: f.nextPath, maxPages: Number(f.maxPages) || 5 },
      mapping: {
        timezoneMin: Number(f.tz),
        order: { externalId: f.oExternalId, doNo: f.oDoNo, customer: f.oCustomer, date: f.oDate, plate: f.oPlate, status: f.oStatus, statusMap: textToKv(f.oStatusMap), defaultStatus: f.oDefault },
        stops: { path: f.sPath, typeField: f.sTypeField, typeMap: textToKv(f.sTypeMap), fixedType: f.sFixed, name: f.sName, address: f.sAddress, lat: f.sLat, lng: f.sLng, windowStart: f.sFrom, windowEnd: f.sTo, radius: f.sRadius },
        items: { path: f.iPath, description: f.iDesc, qty: f.iQty, unit: f.iUnit, weightKg: f.iWeight },
      },
    },
  };
}
