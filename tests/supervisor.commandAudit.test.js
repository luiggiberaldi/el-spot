import { describe, it, expect } from 'vitest';

describe('Supervisor Command Audit Logic', () => {
    const sampleCommands = [
        {
            id: 'cmd-1',
            command_type: 'rate_change',
            payload: { rateMode: 'manual', customRate: 45.5 },
            status: 'applied',
            created_at: '2026-08-05T20:00:00.000Z',
            applied_at: '2026-08-05T20:00:05.000Z'
        },
        {
            id: 'cmd-2',
            command_type: 'inventory_update',
            payload: { action: 'stock', productId: 'p1', data: { stock: 10 } },
            status: 'pending',
            created_at: '2026-08-05T20:05:00.000Z',
            applied_at: null
        },
        {
            id: 'cmd-3',
            command_type: 'inventory_update',
            payload: { action: 'edit', productId: 'p2', data: { priceUsd: 15 } },
            status: 'failed',
            error_reason: 'Conexión rechazada por timeout',
            created_at: '2026-08-05T20:10:00.000Z',
            applied_at: null
        }
    ];

    it('calculates latency correctly in seconds', () => {
        const calcLatency = (createdAt, appliedAt) => {
            if (!createdAt || !appliedAt) return null;
            const created = new Date(createdAt).getTime();
            const applied = new Date(appliedAt).getTime();
            const diffSec = Math.max(0, Math.round((applied - created) / 1000));
            if (diffSec < 60) return `${diffSec}s`;
            return `${Math.floor(diffSec / 60)}m ${diffSec % 60}s`;
        };

        expect(calcLatency(sampleCommands[0].created_at, sampleCommands[0].applied_at)).toBe('5s');
        expect(calcLatency(sampleCommands[1].created_at, sampleCommands[1].applied_at)).toBeNull();
    });

    it('filters commands accurately by status', () => {
        const filterCommands = (list, filter) => {
            return list.filter(cmd => {
                if (filter === 'applied') return cmd.status === 'applied';
                if (filter === 'pending') return cmd.status === 'pending' || cmd.status === 'processing';
                if (filter === 'failed') return cmd.status === 'failed';
                return true;
            });
        };

        expect(filterCommands(sampleCommands, 'all')).toHaveLength(3);
        expect(filterCommands(sampleCommands, 'applied')).toHaveLength(1);
        expect(filterCommands(sampleCommands, 'pending')).toHaveLength(1);
        expect(filterCommands(sampleCommands, 'failed')).toHaveLength(1);
    });
});
