/**
 * useHeartbeat.js — Heartbeat periódico del dispositivo a `device_heartbeats`.
 *
 * SYNC-015: la CAJA (dispositivo primary) envía cada 30s un upsert con su
 * `last_seen` a la tabla `device_heartbeats`. El monitor puede leer esa
 * tabla para mostrar "visto hace X" en tiempo real.
 *
 * Consideraciones:
 *   • Validación estricta del deviceId (SYNC-010) — no escribe rows arbitrarios.
 *   • Silencioso: errores de red no rompen la app.
 *   • Cleanup total: limpia interval + listeners 'online' en unmount.
 *   • Re-entra inmediatamente al volver 'online' (reporta reconexión rápido).
 *
 * @module hooks/useHeartbeat
 */

import { useEffect, useRef } from 'react';
import { supabaseCloud } from '../config/supabaseCloud';
import { isValidDeviceId } from '../utils/deviceId';

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * @param {string|null|undefined} deviceId  deviceId de la CAJA (primary). Si es
 *   null/undefined o inválido, el hook no hace nada.
 */
export function useHeartbeat(deviceId) {
    const deviceIdRef = useRef(deviceId);

    useEffect(() => {
        deviceIdRef.current = deviceId;
    }, [deviceId]);

    useEffect(() => {
        if (!supabaseCloud) return;
        if (!deviceId || !isValidDeviceId(deviceId)) return;

        let cancelled = false;

        const sendHeartbeat = async () => {
            const devId = deviceIdRef.current;
            if (cancelled || !devId || !isValidDeviceId(devId)) return;
            try {
                await supabaseCloud
                    .from('device_heartbeats')
                    .upsert({
                        device_id: devId,
                        last_seen: new Date().toISOString(),
                    }, { onConflict: 'device_id' });
            } catch (_e) {
                // Silencioso — el heartbeat es mejor-esfuerzo.
            }
        };

        // Ping inmediato al montar (reporta reconexión sin esperar 30s).
        sendHeartbeat();

        const intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
        window.addEventListener('online', sendHeartbeat);

        return () => {
            cancelled = true;
            clearInterval(intervalId);
            window.removeEventListener('online', sendHeartbeat);
        };
    }, [deviceId]);
}

export default useHeartbeat;
