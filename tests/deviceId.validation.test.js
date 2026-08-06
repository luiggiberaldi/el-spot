import { describe, it, expect } from 'vitest';
import { isValidDeviceId, sanitizeDeviceId } from '../src/utils/deviceId';

describe('DeviceId Validation (SYNC-010)', () => {
    it('validates correct device IDs', () => {
        expect(isValidDeviceId('PDA-V2-A1B2C3D4E5F678901234567890123456')).toBe(true);
        expect(isValidDeviceId('POS_STORE_001')).toBe(true);
        expect(isValidDeviceId('device-12345')).toBe(true);
    });

    it('rejects invalid or malicious device IDs', () => {
        expect(isValidDeviceId('')).toBe(false);
        expect(isValidDeviceId(null)).toBe(false);
        expect(isValidDeviceId(undefined)).toBe(false);
        expect(isValidDeviceId('device; DROP TABLE users;')).toBe(false);
        expect(isValidDeviceId('id with spaces')).toBe(false);
        expect(isValidDeviceId('a'.repeat(200))).toBe(false); // excede 128 caracteres
    });

    it('sanitizes potentially corrupt inputs', () => {
        expect(sanitizeDeviceId('  POS_STORE_001  ')).toBe('POS_STORE_001');
        expect(sanitizeDeviceId('invalid id!')).toBeNull();
        expect(sanitizeDeviceId(12345)).toBeNull();
    });
});
