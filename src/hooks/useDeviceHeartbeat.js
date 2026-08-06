/**
 * useDeviceHeartbeat.js — Observador (monitor) del heartbeat de la CAJA.
 *
 * SYNC-015: el monitor (dispositivo "dueño" / OwnerMonitorView) lee el
 * `last_seen` de la CAJA vinculada en `device_heartbeats` vía Realtime y lo
 * actualiza live en el estado React.
 *
 * Devuelve:
 *   • `lastSeen` (Date|null)  — última vez que la CAJA reportó presencia.
 *   • `secondsAgo` (number|null) — segundos transcurridos (refresh 1s).
 *   • `isAlive` (boolean) — true si la CAJA reportó en los últimos 90s.
 *
 * Consideraciones:
 *   • Validación SYNC-010: deviceId inválido → no hace nada.
 *   • Silencioso: errores de red no rompen la UI.
 *   • Realtime over `device_heartbeats` actualiza `last_seen` sin polling.
 *   • Timer de 1s refresca `secondsAgo` para feedback visual "visto hace Xs".
 *
 * @module hooks/useDeviceHeartbeat
 */

import { useEffect, useState, useRef } from 'react';
import { supabaseCloud } from '../config/supabaseCloud';
import { isValidDeviceId } from '../utils/deviceId';

const ALIVE_THRESHOLD_MS = 90_000; // CAJA viva si heartbeat < 90s (3 missed pings).

export function useDeviceHeartbeat(pairedDeviceId) {
    const [lastSeen, setLastSeen] = useState(null);
    const [, forceTick] = useState(0);
    const subscriptionRef = useRef(null);

    useEffect(() => {
        if (!supabaseCloud || !pairedDeviceId || !isValidDeviceId(pairedDeviceId)) {
            setLastSeen(null);
            return;
        }

        let cancelled = false;

        // 1. Pull inicial del último heartbeat.
        (async () => {
            try {
                const { data, error } = await supabaseCloud
                    .from('device_heartbeats')
                    .select('last_seen')
                    .eq('device_id', pairedDeviceId)
                    .maybeSingle();
                if (!cancelled && !error && data?.last_seen) {
                    setLastSeen(new Date(data.last_seen));
                } else if (!cancelled) {
                    setLastSeen(null);
                }
            } catch (_e) {
                if (!cancelled) setLastSeen(null);
            }
        })();

        // 2. Suscripción Realtime para updates live.
        try {
            const channel = supabaseCloud
                .channel(`heartbeat:${pairedDeviceId}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'device_heartbeats',
                    filter: `device_id=eq.${pairedDeviceId}`,
                }, (payload) => {
                    const newLast = payload?.new?.last_seen;
                    if (newLast) setLastSeen(new Date(newLast));
                })
                .subscribe();
            subscriptionRef.current = channel;
        } catch (_e) { /* silencioso */ }

        return () => {
            cancelled = true;
            if (subscriptionRef.current) {
                try {
                    supabaseCloud.removeChannel(subscriptionRef.current).catch(() => {});
                } catch (_e) {}
                subscriptionRef.current = null;
            }
        };
    }, [pairedDeviceId]);

    // 3. Tick 1s para refrescar `secondsAgo` / `isAlive`.
    useEffect(() => {
        if (!lastSeen) return;
        const id = setInterval(() => forceTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, [lastSeen]);

    const secondsAgo = lastSeen ? Math.max(0, Math.floor((Date.now() - lastSeen.getTime()) / 1000)) : null;
    const isAlive = lastSeen ? (Date.now() - lastSeen.getTime() < ALIVE_THRESHOLD_MS) : false;

    return { lastSeen, secondsAgo, isAlive };
}

export default useDeviceHeartbeat;
