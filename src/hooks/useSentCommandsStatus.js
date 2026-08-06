/**
 * useSentCommandsStatus.js — Tracking de estado de comandos enviados por el monitor.
 *
 * SYNC-011: el monitor necesita saber el estado individual de cada comando que
 * envió (pending/processing/applied/failed) para mostrar feedback granular al
 * usuario en vez de "enviado y olvidado".
 *
 * Flujo:
 *   • Pull inicial: `select id, status, error_reason` para los comandos del
 *     monitor (`monitor_device_id = thisDevice`).
 *   • Realtime: escucha UPDATEs en `supervisor_commands` para refrescar el
 *     estado al instante cuando la CAJA los aplica.
 *   • Estado en React: `Map<cmdId, { status, error_reason }>`.
 *
 * @module hooks/useSentCommandsStatus
 */

import { useEffect, useState, useRef } from 'react';
import { supabaseCloud } from '../config/supabaseCloud';
import { isValidDeviceId } from '../utils/deviceId';

const MAX_TRACKED = 200; // Cota de memoria para no crecer indefinidamente.

export function useSentCommandsStatus(monitorDeviceId) {
    const [statuses, setStatuses] = useState(() => new Map());
    const subRef = useRef(null);

    useEffect(() => {
        if (!supabaseCloud || !monitorDeviceId || !isValidDeviceId(monitorDeviceId)) {
            setStatuses(new Map());
            return;
        }

        let cancelled = false;

        // 1. Pull inicial — traer el estado más reciente.
        (async () => {
            try {
                const { data, error } = await supabaseCloud
                    .from('supervisor_commands')
                    .select('id, status, error_reason, created_at')
                    .eq('monitor_device_id', monitorDeviceId)
                    .order('created_at', { ascending: false })
                    .limit(MAX_TRACKED);
                if (cancelled || error) return;
                const map = new Map();
                for (const row of data || []) {
                    map.set(row.id, { status: row.status, error_reason: row.error_reason || null });
                }
                setStatuses(map);
            } catch (_e) { /* silencioso */ }
        })();

        // 2. Realtime over supervisor_commands (UPDATE events).
        try {
            const channel = supabaseCloud
                .channel(`sent_cmds:${monitorDeviceId}`)
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'supervisor_commands',
                    filter: `monitor_device_id=eq.${monitorDeviceId}`,
                }, (payload) => {
                    const row = payload?.new;
                    if (!row?.id) return;
                    setStatuses(prev => {
                        // Si el mapa está saturado y el comando es nuevo, podamos el más viejo.
                        if (!prev.has(row.id) && prev.size >= MAX_TRACKED) {
                            const next = new Map(prev);
                            const firstKey = next.keys().next().value;
                            if (firstKey) next.delete(firstKey);
                            next.set(row.id, { status: row.status, error_reason: row.error_reason || null });
                            return next;
                        }
                        const next = new Map(prev);
                        next.set(row.id, { status: row.status, error_reason: row.error_reason || null });
                        return next;
                    });
                })
                .subscribe();
            subRef.current = channel;
        } catch (_e) { /* silencioso */ }

        return () => {
            cancelled = true;
            if (subRef.current) {
                try {
                    supabaseCloud.removeChannel(subRef.current).catch(() => {});
                } catch (_e) {}
                subRef.current = null;
            }
        };
    }, [monitorDeviceId]);

    return statuses;
}

export default useSentCommandsStatus;
