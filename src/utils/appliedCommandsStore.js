import localforage from 'localforage';

const STORE_NAME = 'el_spot_applied_cmds';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días de retención para el historial de comandos aplicados
const META_KEY = '__meta__';

const store = localforage.createInstance({
    name: 'ElSpotPOSApp',
    storeName: STORE_NAME,
    driver: [
        localforage.INDEXEDDB,
        localforage.LOCALSTORAGE,
        localforage.WEBSQL
    ].filter(Boolean)
});

let memCache = null;

export async function loadAll() {
    if (memCache) return memCache;
    const map = new Map();
    try {
        const now = Date.now();
        await store.iterate((value, key) => {
            if (key === META_KEY) return;
            if (!value || typeof value !== 'object') return;
            if (typeof value.appliedAt !== 'number') return;
            if (now - value.appliedAt < TTL_MS) {
                map.set(key, value.appliedAt);
            }
        });
        memCache = map;
    } catch {
        memCache = new Map();
    }
    return memCache;
}

async function save(key, appliedAt) {
    try {
        await store.setItem(key, { appliedAt });
        if (memCache) memCache.set(key, appliedAt);
    } catch {}
}

function syncMem(key) {
    if (memCache && !memCache.has(key)) memCache.set(key, Date.now());
}

export async function has(commandId) {
    if (!commandId) return false;
    const map = await loadAll();
    return map.has(commandId);
}

export async function isApplied(commandId) {
    return has(commandId);
}

export async function mark(commandId) {
    if (!commandId) return;
    const now = Date.now();
    syncMem(commandId);
    await save(commandId, now);
}

export async function unmark(commandId) {
    if (!commandId) return;
    try {
        await store.removeItem(commandId);
    } catch {}
    if (memCache) memCache.delete(commandId);
}

export async function bulkMark(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const now = Date.now();
    for (const id of ids) {
        if (!id) continue;
        syncMem(id);
    }
    try {
        const ops = ids.filter(Boolean).map(id => store.setItem(id, { appliedAt: now }));
        await Promise.all(ops);
    } catch {}
}

export async function count() {
    const map = await loadAll();
    return map.size;
}

export async function prune() {
    try {
        const now = Date.now();
        const toDelete = [];
        await store.iterate((value, key) => {
            if (key === META_KEY) return;
            if (!value || typeof value !== 'object') {
                toDelete.push(key);
                return;
            }
            if (typeof value.appliedAt !== 'number' || now - value.appliedAt >= TTL_MS) {
                toDelete.push(key);
            }
        });
        for (const key of toDelete) {
            try { await store.removeItem(key); } catch {}
            if (memCache) memCache.delete(key);
        }
        return toDelete.length;
    } catch {
        return 0;
    }
}

export async function clear() {
    try {
        await store.clear();
    } catch {}
    memCache = new Map();
}

export function getMemCache() {
    return memCache;
}

export async function legacyMigrate() {
    try {
        const raw = localStorage.getItem('pda_applied_supervisor_cmds_v1');
        if (!raw) return 0;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || arr.length === 0) return 0;
        let migrated = 0;
        const now = Date.now();
        for (const id of arr) {
            if (!id) continue;
            const existing = await store.getItem(id);
            if (!existing) {
                await store.setItem(id, { appliedAt: now });
                migrated++;
            }
        }
        localStorage.removeItem('pda_applied_supervisor_cmds_v1');
        return migrated;
    } catch {
        return 0;
    }
}
