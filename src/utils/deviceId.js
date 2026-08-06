/**
 * deviceId.js — Validación y sanitización de device IDs.
 *
 * SYNC-010: varios hooks aceptan `deviceId` pasado por props o recuperado de
 * localStorage/Supabase sin validación. Un deviceId malicioso o corrupto podría:
 *   • Inyectarse en queries a `sync_documents` / `supervisor_commands` filtrando
 *     o corrompiendo datos de otro dispositivo.
 *   • Generar suscripciones Realtime a canales arbitrarios.
 *
 * Este módulo centraliza la validación con un regex estricto (A-Za-z0-9_- hasta
 * 128 chars) y provee helpers de sanitización.
 *
 * @module utils/deviceId
 */

const DEVICE_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * @param {string} id
 * @returns {boolean} true si `id` es un string válido como deviceId.
 */
export function isValidDeviceId(id) {
    return typeof id === 'string' && DEVICE_ID_REGEX.test(id);
}

/**
 * Sanitiza un valor potencialmente corrupto. Devuelve el string sólo si pasa
 * la validación, o `null` en caso contrario. Útil para validar entradas antes
 * de usarlas en queries.
 *
 * @param {any} id
 * @returns {string|null}
 */
export function sanitizeDeviceId(id) {
    if (typeof id !== 'string') return null;
    const trimmed = id.trim();
    return DEVICE_ID_REGEX.test(trimmed) ? trimmed : null;
}

export { DEVICE_ID_REGEX };
