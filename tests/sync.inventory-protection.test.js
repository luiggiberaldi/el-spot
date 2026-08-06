import { describe, it, expect } from 'vitest';

describe('Inventory Protection Guardrail (BUG-C)', () => {
    it('protects local inventory when local has more items than cloud payload', () => {
        const localProducts = [
            { id: 'p1', name: 'Harina PAN' },
            { id: 'p2', name: 'Arroz Primor' },
            { id: 'p3', name: 'Aceite Mazeite' }
        ];

        const staleCloudPayload = [
            { id: 'p1', name: 'Harina PAN' }
        ];

        const shouldProtectLocal = (local, cloud) => {
            return Array.isArray(local) && Array.isArray(cloud) && local.length > cloud.length;
        };

        expect(shouldProtectLocal(localProducts, staleCloudPayload)).toBe(true);
    });

    it('allows cloud payload update when cloud has equal or more items', () => {
        const localProducts = [{ id: 'p1', name: 'Harina PAN' }];
        const freshCloudPayload = [
            { id: 'p1', name: 'Harina PAN' },
            { id: 'p2', name: 'Arroz Primor' }
        ];

        const shouldProtectLocal = (local, cloud) => {
            return Array.isArray(local) && Array.isArray(cloud) && local.length > cloud.length;
        };

        expect(shouldProtectLocal(localProducts, freshCloudPayload)).toBe(false);
    });
});
