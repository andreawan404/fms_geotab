import { describe, it, expect } from 'vitest';
import { vehicleLabel } from '../src/lib/vehicle.js';

describe('vehicleLabel', () => {
  it('menyembunyikan nopol yang sudah ada di nama (abaikan spasi dan tanda hubung)', () => {
    expect(vehicleLabel({ name: 'Mitsubishi SMA B 9708 TCR', plate: 'B 9708 TCR' }).plate).toBe('');
    expect(vehicleLabel({ name: 'Mitsubishi SMA B 9743 TCM', plate: 'B-9743-TCM' }).plate).toBe('');
  });
  it('menampilkan nopol bila belum ada di nama; kosong bila tidak punya nopol', () => {
    expect(vehicleLabel({ name: 'BRV SMA', plate: 'B 1219 ROS' })).toEqual({ name: 'BRV SMA', plate: 'B 1219 ROS' });
    expect(vehicleLabel({ name: 'EXPANDER SMA Teltonika', plate: '' }).plate).toBe('');
    expect(vehicleLabel(undefined)).toEqual({ name: '', plate: '' });
  });
});
