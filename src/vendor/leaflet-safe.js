// Leaflet selalu menimpa window.L saat dimuat. Di dalam MyGeotab itu merusak Leaflet milik MyGeotab
// (peta & plugin-nya), jadi nilai window.L dikembalikan segera setelah Leaflet dievaluasi.
import './saveL.js';
import L from 'leaflet';

if (window.__tmsPrevL === undefined) delete window.L;
else window.L = window.__tmsPrevL;
delete window.__tmsPrevL;

export default L;
