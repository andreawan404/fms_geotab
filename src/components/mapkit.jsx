import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { corridorRings } from '../core/corridor.js';

export { L };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const STATE_COLOR = { moving: '#1a9e5c', idle: '#e6a100', offline: '#8a94a0', deviating: '#d63a3a' };

export function vehicleState(st) {
  if (!st || !st.communicating) return 'offline';
  return st.driving && st.speed > 2 ? 'moving' : 'idle';
}

/** Hook: membuat peta Leaflet pada div yang dikembalikan. */
export function useMap(tileUrl, { center = [-6.3, 107.1], zoom = 9 } = {}) {
  const ref = useRef(null);
  const [map, setMap] = useState(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const m = L.map(ref.current, { zoomControl: true, preferCanvas: true }).setView(center, zoom);
    L.tileLayer(tileUrl, { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m);
    setMap(m);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      m.remove();
      setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileUrl]);
  return [ref, map];
}

export function MapBox({ mapRef, className = '' }) {
  return <div ref={mapRef} className={`tms-map ${className}`} />;
}

const corridorCache = new Map();
export function corridorOf(path, widthM) {
  if (!path || path.length < 2) return [];
  const key = `${path.length}:${path[0]}:${path[path.length - 1]}:${widthM}`;
  if (!corridorCache.has(key)) {
    if (corridorCache.size > 40) corridorCache.clear();
    corridorCache.set(key, corridorRings(path, widthM));
  }
  return corridorCache.get(key);
}

export function vehicleIcon(name, state, bearing = 0) {
  return L.divIcon({
    className: 'tms-veh-wrap',
    iconSize: [0, 0],
    html: `<div class="tms-veh ${state}"><svg viewBox="0 0 24 24" style="transform:rotate(${Math.round(bearing)}deg)"><path d="M12 2l7 18-7-4-7 4z"/></svg></div><div class="tms-veh-label">${esc(name)}</div>`,
  });
}

export function cpIcon(i, total, state = '') {
  const kind = i === 0 ? 'start' : i === total - 1 ? 'end' : '';
  return L.divIcon({ className: 'tms-cp-wrap', iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="tms-cp ${kind} ${state}">${i + 1}</div>` });
}

/**
 * Gambar rute pada layer group: koridor (poligon), garis tengah, checkpoint (lingkaran radius + penanda).
 * route: { path, widthM, color, checkpoints }
 */
export function drawRoute(group, route, { corridor = true, checkpoints = true, weight = 4, opacity = 0.9, cpStates = null, draggable = false, onCpDrag } = {}) {
  const color = route.color || '#0b5ea8';
  if (corridor && route.path?.length > 1 && route.widthM) {
    for (const ring of corridorOf(route.path, route.widthM)) {
      L.polygon(ring, { color, weight: 1, fillColor: color, fillOpacity: 0.16, interactive: false }).addTo(group);
    }
  }
  if (route.path?.length > 1) L.polyline(route.path, { color, weight, opacity, interactive: false }).addTo(group);
  if (checkpoints) {
    (route.checkpoints || []).forEach((c, i, arr) => {
      L.circle([c.lat, c.lng], { radius: c.radius || 100, color, weight: 1, dashArray: '4 4', fillOpacity: 0.05, interactive: false }).addTo(group);
      const mk = L.marker([c.lat, c.lng], { icon: cpIcon(i, arr.length, cpStates?.[i] || ''), draggable, zIndexOffset: 500 }).addTo(group);
      mk.bindTooltip(esc(c.name || `CP ${i + 1}`), { direction: 'top', offset: [0, -10] });
      if (draggable && onCpDrag) mk.on('dragend', () => onCpDrag(i, mk.getLatLng()));
    });
  }
}

export function fitTo(map, pts, pad = 40) {
  if (!map || !pts?.length) return;
  map.fitBounds(L.latLngBounds(pts), { padding: [pad, pad], maxZoom: 16 });
}
