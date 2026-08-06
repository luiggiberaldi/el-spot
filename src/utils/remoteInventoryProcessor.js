// remoteInventoryProcessor.js — Aplica comandos de inventario del supervisor en la CAJA de El Spot.
import { storageService } from './storageService';
import { withLock } from './withLock';

const PRODUCTS_KEY = 'bodega_products_v1';
const VALID_ACTIONS = ['add', 'edit', 'delete', 'adjust_stock'];
const BARCODE_FIELDS = ['barcode', 'boxBarcode', 'halfBoxBarcode'];

function collectBarcodes(product) {
    return BARCODE_FIELDS
        .map(f => (product?.[f] ?? '').toString().trim())
        .filter(Boolean);
}

function findBarcodeConflict(candidate, products, excludeId = null) {
    const own = collectBarcodes(candidate);
    const dupInside = own.find((code, i) => own.indexOf(code) !== i);
    if (dupInside) return `El código "${dupInside}" está repetido dentro del mismo producto`;

    for (const p of products) {
        if (excludeId && p.id === excludeId) continue;
        const other = collectBarcodes(p);
        const clash = own.find(code => other.includes(code));
        if (clash) return `El código "${clash}" ya pertenece a "${p.name}"`;
    }
    return null;
}

function validateProductData(data) {
    if (!data || typeof data !== 'object') return 'Datos de producto ausentes';
    if (!data.name || !String(data.name).trim()) return 'El nombre es obligatorio';
    const price = Number(data.priceUsd);
    if (isNaN(price) || price < 0) return 'Precio USD inválido';
    return null;
}

function normalizeProduct(data) {
    const normalized = { ...data };
    normalized.name = String(data.name).trim();
    normalized.priceUsd = Number(data.priceUsd) || 0;
    normalized.priceUsdt = normalized.priceUsd;
    normalized.priceBsManual = data.priceBsManual != null && data.priceBsManual !== '' ? Number(data.priceBsManual) : null;
    normalized.stock = Number(data.stock) || 0;
    for (const f of BARCODE_FIELDS) {
        normalized[f] = (data[f] ?? '').toString().trim() || null;
    }
    normalized.sellByBox = Boolean(data.sellByBox);
    normalized.sellByHalfBox = Boolean(data.sellByBox) && Boolean(data.sellByHalfBox);
    normalized.unit = data.unit || 'unidad';
    normalized.packagingType = data.packagingType || 'suelto';
    normalized.lowStockAlert = Number(data.lowStockAlert) || 5;

    const VALID_MODES = ['tasa_dia', 'bcv', 'dual_usd', 'bs_fijo'];
    if (VALID_MODES.includes(data.pricingMode)) {
        normalized.pricingMode = data.pricingMode;
        normalized.forceBcv = data.pricingMode === 'bcv';
        if (data.pricingMode !== 'bs_fijo') normalized.priceBsManual = null;
        if (data.pricingMode !== 'dual_usd') normalized.priceBsUsdRef = null;
    }

    return normalized;
}

export async function applyInventoryCommand(payload) {
    if (!payload || !VALID_ACTIONS.includes(payload.action)) {
        return { success: false, error: `Acción inválida: ${payload?.action}` };
    }
    const { action, productId, data } = payload;
    if (action !== 'add' && !productId) {
        return { success: false, error: 'productId requerido' };
    }

    const lockResult = await withLock('pos_write_lock', async () => {
        const products = await storageService.getItem(PRODUCTS_KEY, []) || [];

        if (action === 'add') {
            const validationError = validateProductData(data);
            if (validationError) return { success: false, error: validationError };
            const normalized = normalizeProduct(data);
            normalized.id = data.id || productId || crypto.randomUUID();
            if (products.some(p => p.id === normalized.id)) {
                return { success: false, error: 'Ya existe un producto con ese ID' };
            }
            const conflict = findBarcodeConflict(normalized, products);
            if (conflict) return { success: false, error: conflict };
            normalized.createdAt = new Date().toISOString();
            await storageService.setItem(PRODUCTS_KEY, [...products, normalized]);
            return { success: true, productName: normalized.name };
        }

        const existing = products.find(p => p.id === productId);
        if (!existing) return { success: false, error: 'Producto no encontrado en la caja' };

        if (action === 'edit') {
            const validationError = validateProductData(data);
            if (validationError) return { success: false, error: validationError };
            const normalized = normalizeProduct(data);
            normalized.id = productId;
            if (normalized.image === undefined) normalized.image = existing.image;
            for (const f of BARCODE_FIELDS) {
                if (data[f] === undefined || data[f] === null || data[f] === '') {
                    normalized[f] = existing[f];
                }
            }
            if (data.stock === undefined || data.stock === null || data.stock === '') {
                normalized.stock = existing.stock;
            }
            const conflict = findBarcodeConflict(normalized, products, productId);
            if (conflict) return { success: false, error: conflict };
            const updated = products.map(p => p.id === productId ? { ...existing, ...normalized } : p);
            await storageService.setItem(PRODUCTS_KEY, updated);
            return { success: true, productName: normalized.name };
        }

        if (action === 'delete') {
            await storageService.setItem(PRODUCTS_KEY, products.filter(p => p.id !== productId));
            return { success: true, productName: existing.name };
        }

        const delta = Number(data?.delta);
        if (isNaN(delta) || delta === 0) return { success: false, error: 'Delta de stock inválido' };
        const allowNeg = localStorage.getItem('allow_negative_stock') === 'true';
        const current = Number(existing.stock) || 0;
        const expectedStock = data?.expectedStock;
        if (expectedStock !== undefined && expectedStock !== null && Number(expectedStock) !== current) {
            return {
                success: false,
                error: `Stock actual (${current}) no coincide con el esperado (${Number(expectedStock)}). La caja ha cambiado desde el ajuste.`
            };
        }
        const next = allowNeg ? current + delta : Math.max(0, current + delta);
        const updated = products.map(p => p.id === productId ? { ...p, stock: next } : p);
        await storageService.setItem(PRODUCTS_KEY, updated);
        return { success: true, productName: existing.name };
    });

    return lockResult ?? { success: false, error: 'Fallo inesperado al aplicar el comando' };
}

export async function applyInventoryBatch(payloads) {
    if (!Array.isArray(payloads) || payloads.length === 0) {
        return { success: true, results: [] };
    }
    const valid = payloads.filter(p => p && VALID_ACTIONS.includes(p.action));
    if (valid.length === 0) {
        return { success: false, error: 'Ningún comando válido en el lote', results: [] };
    }

    const results = [];
    const lockResult = await withLock('pos_write_lock', async () => {
        let products = await storageService.getItem(PRODUCTS_KEY, []) || [];
        const allowNeg = localStorage.getItem('allow_negative_stock') === 'true';
        let dirty = false;

        for (const payload of valid) {
            const { action, productId, data } = payload;

            if (action === 'add') {
                const validationError = validateProductData(data);
                if (validationError) { results.push({ success: false, error: validationError }); continue; }
                const normalized = normalizeProduct(data);
                normalized.id = data.id || productId || crypto.randomUUID();
                if (products.some(p => p.id === normalized.id)) {
                    results.push({ success: false, error: 'Ya existe un producto con ese ID' });
                    continue;
                }
                const conflict = findBarcodeConflict(normalized, products);
                if (conflict) { results.push({ success: false, error: conflict }); continue; }
                normalized.createdAt = new Date().toISOString();
                products = [...products, normalized];
                dirty = true;
                results.push({ success: true, productName: normalized.name });
                continue;
            }

            const existing = products.find(p => p.id === productId);
            if (!existing) {
                results.push({ success: false, error: 'Producto no encontrado en la caja' });
                continue;
            }

            if (action === 'edit') {
                const validationError = validateProductData(data);
                if (validationError) { results.push({ success: false, error: validationError }); continue; }
                const normalized = normalizeProduct(data);
                normalized.id = productId;
                if (normalized.image === undefined) normalized.image = existing.image;
                for (const f of BARCODE_FIELDS) {
                    if (data[f] === undefined || data[f] === null || data[f] === '') {
                        normalized[f] = existing[f];
                    }
                }
                if (data.stock === undefined || data.stock === null || data.stock === '') {
                    normalized.stock = existing.stock;
                }
                const conflict = findBarcodeConflict(normalized, products, productId);
                if (conflict) { results.push({ success: false, error: conflict }); continue; }
                products = products.map(p => p.id === productId ? { ...existing, ...normalized } : p);
                dirty = true;
                results.push({ success: true, productName: normalized.name });
                continue;
            }

            if (action === 'delete') {
                products = products.filter(p => p.id !== productId);
                dirty = true;
                results.push({ success: true, productName: existing.name });
                continue;
            }

            if (action === 'adjust_stock') {
                const delta = Number(data?.delta);
                if (isNaN(delta) || delta === 0) {
                    results.push({ success: false, error: 'Delta de stock inválido' });
                    continue;
                }
                const current = Number(existing.stock) || 0;
                const expectedStock = data?.expectedStock;
                if (expectedStock !== undefined && expectedStock !== null && Number(expectedStock) !== current) {
                    results.push({
                        success: false,
                        error: `Stock actual (${current}) no coincide con el esperado (${Number(expectedStock)})`
                    });
                    continue;
                }
                const next = allowNeg ? current + delta : Math.max(0, current + delta);
                products = products.map(p => p.id === productId ? { ...p, stock: next } : p);
                dirty = true;
                results.push({ success: true, productName: existing.name });
                continue;
            }
        }

        if (dirty) {
            await storageService.setItem(PRODUCTS_KEY, products);
        }
        return { success: true, results };
    });

    return lockResult ?? { success: false, error: 'Fallo inesperado al aplicar el lote', results: [] };
}

export function coalesceCommands(commands) {
    if (!Array.isArray(commands) || commands.length === 0) return [];
    const adjustByProduct = new Map();
    const rateChange = { last: null, originalIdx: -1 };
    const rest = [];

    commands.forEach((cmd, idx) => {
        const payload = cmd.payload || {};
        if (cmd.command_type === 'inventory_update' && payload.action === 'adjust_stock') {
            const pid = payload.productId;
            if (!pid) return;
            const prev = adjustByProduct.get(pid);
            if (prev) {
                const newDelta = (prev.payload.data?.delta || 0) + (payload.data?.delta || 0);
                const expected = payload.data?.expectedStock ?? prev.payload.data?.expectedStock;
                prev.payload.data = { delta: newDelta, expectedStock: expected };
            } else {
                adjustByProduct.set(pid, { ...cmd, payload: { ...payload, data: { ...payload.data } } });
            }
        } else if (cmd.command_type === 'rate_change') {
            rateChange.last = { ...cmd, payload: { ...payload } };
            if (rateChange.originalIdx === -1) rateChange.originalIdx = idx;
        } else {
            rest.push({ ...cmd, payload: { ...payload } });
        }
    });

    const out = [...rest];
    for (const adj of adjustByProduct.values()) {
        if (adj.payload.data && adj.payload.data.delta !== 0) out.push(adj);
    }
    if (rateChange.last) out.push(rateChange.last);
    return out;
}
