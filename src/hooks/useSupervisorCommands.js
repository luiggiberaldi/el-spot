import { useEffect } from 'react';
import { supabaseCloud } from '../config/supabaseCloud';
import { applyInventoryCommand, applyInventoryBatch, coalesceCommands } from '../utils/remoteInventoryProcessor';
import { storageService } from '../utils/storageService';
import { pushLocalSync } from './useCloudSync';
import * as appliedStore from '../utils/appliedCommandsStore';
import { isValidDeviceId } from '../utils/deviceId';

async function updateCommandStatus(commandId, status, errorReason = null) {
    const fields = { status };
    if (errorReason) fields.error_reason = String(errorReason).slice(0, 500);
    try {
        const { error } = await supabaseCloud
            .from('supervisor_commands')
            .update(fields)
            .eq('id', commandId);
        if (error) {
            // Fallback si error_reason/applied_at no existen aún en el schema SQL de Supabase
            await supabaseCloud
                .from('supervisor_commands')
                .update({ status })
                .eq('id', commandId);
        }
    } catch (e) {
        console.error('[SupervisorCommands] No se pudo actualizar status:', e);
    }
}

async function applyRateChange(command) {
    const { rateMode, customRate } = command.payload || {};

    // FIX: estas claves son LOCAL_KEYS (localStorage tier), no IndexedDB.
    // storageService.setItem() guarda en IndexedDB Y hace localStorage.removeItem(),
    // así cuando ProductContext lee localStorage.getItem() inmediatamente después
    // obtiene null y setRateMode() nunca se ejecuta. Usar localStorage directamente.
    if (rateMode) {
        localStorage.setItem('bodega_rate_mode', rateMode);
        localStorage.setItem('bodega_use_auto_rate', JSON.stringify(rateMode !== 'manual'));
        pushLocalSync('bodega_rate_mode', rateMode);
        pushLocalSync('bodega_use_auto_rate', rateMode !== 'manual');
    }

    if (customRate !== undefined && customRate !== null) {
        localStorage.setItem('bodega_custom_rate', String(customRate));
        pushLocalSync('bodega_custom_rate', parseFloat(customRate));
    }

    window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: 'bodega_rate_mode' } }));
    window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: 'bodega_custom_rate' } }));
    window.dispatchEvent(new CustomEvent('supervisor_rate_applied', {
        detail: { rateMode, customRate }
    }));
}

async function claimCommand(commandId, claimerId) {
    try {
        const { data: updated, error } = await supabaseCloud
            .from('supervisor_commands')
            .update({ status: 'processing' })
            .eq('id', commandId)
            .eq('status', 'pending')
            .select('id');

        if (!error && Array.isArray(updated) && updated.length > 0) {
            console.log(`[SupervisorCommands] 📌 Command ${commandId} claimed (processing).`);
            return true;
        }

        // Guarda-rail: si 'processing' no está en el CHECK constraint o RLS devolvió [],
        // verificar si el comando sigue en 'pending' para procesarlo directamente.
        console.warn(`[SupervisorCommands] claim con 'processing' devolvió ${error ? error.message : '0 filas'}. Verificando estado pending...`);
        const { data: check } = await supabaseCloud
            .from('supervisor_commands')
            .select('id, status')
            .eq('id', commandId)
            .eq('status', 'pending')
            .maybeSingle();

        if (check?.id) {
            console.log(`[SupervisorCommands] 🟢 Command ${commandId} confirmado en 'pending'. Procediendo sin estado 'processing'...`);
            return true;
        }

        console.warn(`[SupervisorCommands] ❌ Command ${commandId} no está pending en Supabase.`);
        return false;
    } catch (e) {
        console.error('[SupervisorCommands] claim exception:', e);
        return false;
    }
}

export function useSupervisorCommands(deviceId) {
    useEffect(() => {
        if (!supabaseCloud || !deviceId) return;
        if (!isValidDeviceId(deviceId)) {
            console.warn('[SupervisorCommands] deviceId inválido, hook desactivado:', deviceId);
            return;
        }

        let disposed = false;
        const appliedIds = new Set();
        const inFlight = new Map();

        (async () => {
            try {
                await appliedStore.legacyMigrate();
                await appliedStore.prune();
                await appliedStore.loadAll();
                if (disposed) return;
                const cache = appliedStore.getMemCache();
                if (cache) {
                    cache.forEach((_, id) => appliedIds.add(id));
                }
            } catch {}
        })();

        const processCommand = (command) => {
            if (!command || command.status !== 'pending') return Promise.resolve();
            if (appliedIds.has(command.id)) {
                appliedIds.delete(command.id);
                appliedStore.unmark(command.id);
            }

            const existing = inFlight.get(command.id);
            if (existing) return existing;

            if (command.command_type === 'rate_change') {
                const p = (async () => {
                    try {
                        const ver = command.payload_version ?? command.payload?.version ?? 1;
                        if (!Number.isFinite(ver) || ver < 1 || ver > 1) {
                            console.warn(`[SupervisorCommands] payload_version no soportado: ${ver} (cmd ${command.id})`);
                            if (!disposed) await updateCommandStatus(command.id, 'failed', `payload_version no soportado: ${ver}`);
                            appliedIds.add(command.id);
                            return;
                        }

                        const claimed = await claimCommand(command.id, deviceId);
                        if (!claimed) return;

                        appliedIds.add(command.id);
                        await appliedStore.mark(command.id);
                        await applyRateChange(command);
                        if (!disposed) await updateCommandStatus(command.id, 'applied');
                    } catch (err) {
                        console.error('[SupervisorCommands] Error al aplicar rate_change:', err);
                        if (!disposed) await updateCommandStatus(command.id, 'failed', err?.message);
                    } finally {
                        inFlight.delete(command.id);
                    }
                })();
                inFlight.set(command.id, p);
                return p;
            } else if (command.command_type === 'inventory_update') {
                const p = (async () => {
                    try {
                        const ver = command.payload_version ?? command.payload?.version ?? 1;
                        if (!Number.isFinite(ver) || ver < 1 || ver > 1) {
                            console.warn(`[SupervisorCommands] payload_version no soportado: ${ver} (cmd ${command.id})`);
                            if (!disposed) await updateCommandStatus(command.id, 'failed', `payload_version no soportado: ${ver}`);
                            appliedIds.add(command.id);
                            return;
                        }

                        const claimed = await claimCommand(command.id, deviceId);
                        if (!claimed) return;

                        appliedIds.add(command.id);
                        await appliedStore.mark(command.id);
                        const result = await applyInventoryCommand(command.payload);
                        if (disposed) return;
                        if (result.success) {
                            await updateCommandStatus(command.id, 'applied');
                            window.dispatchEvent(new CustomEvent('supervisor_inventory_applied', {
                                detail: {
                                    action: command.payload?.action,
                                    productName: result.productName || ''
                                }
                            }));
                        } else {
                            await updateCommandStatus(command.id, 'failed', result.error);
                        }
                    } catch (err) {
                        console.error('[SupervisorCommands] Error al aplicar inventory_update:', err);
                        if (!disposed) await updateCommandStatus(command.id, 'failed', err?.message);
                    } finally {
                        inFlight.delete(command.id);
                    }
                })();
                inFlight.set(command.id, p);
                return p;
            } else {
                console.warn(`[SupervisorCommands] command_type no soportado: "${command.command_type}" (cmd ${command.id})`);
                appliedIds.add(command.id);
                if (!disposed) updateCommandStatus(command.id, 'failed', `command_type no soportado: ${command.command_type}`);
                return Promise.resolve();
            }
        };

        const catchUpPending = async () => {
            try {
                const { data, error } = await supabaseCloud
                    .from('supervisor_commands')
                    .select('id, command_type, payload, payload_version, status')
                    .eq('primary_device_id', deviceId)
                    .eq('status', 'pending')
                    .order('created_at', { ascending: true });
                
                if (error) {
                    console.error('[SupervisorCommands] ❌ Error en query de comandos pendientes:', error);
                    return;
                }
                if (disposed) return;

                const rawPending = data || [];
                if (rawPending.length > 0) {
                    console.log(`[SupervisorCommands] 📡 ${rawPending.length} comando(s) PENDING encontrados en Supabase para deviceId: ${deviceId}`);
                }

                const pending = [];
                for (const cmd of rawPending) {
                    if (appliedIds.has(cmd.id)) {
                        console.log(`[SupervisorCommands] 🔄 Comando ${cmd.id} está 'pending' en Supabase pero figuraba en local. Removiendo de appliedIds para permitir re-ejecución...`);
                        appliedIds.delete(cmd.id);
                        appliedStore.unmark(cmd.id);
                    }
                    pending.push(cmd);
                }
                if (pending.length === 0) return;

                console.log(`[SupervisorCommands] ⚙️ Procesando ${pending.length} comando(s) nuevos...`);
                const requests = pending.map(cmd => claimCommand(cmd.id, deviceId));
                const claimResults = await Promise.all(requests);
                const claimed = pending.filter((cmd, i) => claimResults[i]);
                if (claimed.length === 0) {
                    console.warn('[SupervisorCommands] ⚠️ Ningún comando pudo ser reclamado (claim failed).');
                    return;
                }

                const coalesced = coalesceCommands(claimed);

                // SYNC-012: descartar comandos con payload_version no soportada
                const SUPPORTED_PAYLOAD_VER = 1;
                const supported = [];
                const unsupported = [];
                for (const cmd of coalesced) {
                    const ver = cmd.payload_version ?? cmd.payload?.version ?? 1;
                    if (Number.isFinite(ver) && ver === SUPPORTED_PAYLOAD_VER) {
                        supported.push(cmd);
                    } else {
                        unsupported.push(cmd);
                    }
                }
                if (unsupported.length > 0) {
                    console.warn(`[SupervisorCommands] ${unsupported.length} comando(s) con payload_version no soportado`);
                    if (!disposed) {
                        await Promise.all(unsupported.map(cmd => {
                            const idsToMark = cmd._coalescedIds || [cmd.id];
                            return Promise.all(idsToMark.map(id => updateCommandStatus(id, 'failed', `payload_version no soportado: ${cmd.payload_version ?? 'null'}`)));
                        }));
                    }
                    unsupported.forEach(cmd => {
                        const idsToMark = cmd._coalescedIds || [cmd.id];
                        idsToMark.forEach(id => appliedIds.add(id));
                    });
                }
                if (supported.length === 0) return;

                const inventoryPayloads = supported
                    .filter(cmd => cmd.command_type === 'inventory_update')
                    .map(cmd => ({ ...cmd.payload, _cmdId: cmd.id, _coalescedIds: cmd._coalescedIds }));
                const rateCommands = supported.filter(cmd => cmd.command_type === 'rate_change');

                const allSupportedIds = supported.flatMap(c => c._coalescedIds || [c.id]);
                await appliedStore.bulkMark(allSupportedIds);
                allSupportedIds.forEach(id => appliedIds.add(id));

                if (inventoryPayloads.length > 0) {
                    try {
                        const batch = await applyInventoryBatch(inventoryPayloads.map(p => {
                            const { _cmdId, _coalescedIds, ...rest } = p;
                            return rest;
                        }));
                        await Promise.all((batch.results || []).map(async (r, i) => {
                            const payload = inventoryPayloads[i];
                            const idsToUpdate = payload._coalescedIds || (payload._cmdId ? [payload._cmdId] : []);
                            if (!disposed && idsToUpdate.length > 0) {
                                if (r.success) {
                                    await Promise.all(idsToUpdate.map(id => updateCommandStatus(id, 'applied')));
                                    window.dispatchEvent(new CustomEvent('supervisor_inventory_applied', {
                                        detail: {
                                            action: payload.action,
                                            productName: r.productName || ''
                                        }
                                    }));
                                } else {
                                    await Promise.all(idsToUpdate.map(id => updateCommandStatus(id, 'failed', r.error)));
                                }
                            }
                        }));
                    } catch (err) {
                        console.error('[SupervisorCommands] Error en applyInventoryBatch:', err);
                        for (const payload of inventoryPayloads) {
                            const idsToUpdate = payload._coalescedIds || (payload._cmdId ? [payload._cmdId] : []);
                            if (!disposed && idsToUpdate.length > 0) {
                                await Promise.all(idsToUpdate.map(id => updateCommandStatus(id, 'failed', err?.message)));
                            }
                        }
                    }
                }

                for (const cmd of rateCommands) {
                    if (disposed) continue;
                    try {
                        await applyRateChange(cmd);
                        await updateCommandStatus(cmd.id, 'applied');
                    } catch (err) {
                        console.error('[SupervisorCommands] Error al aplicar rate_change coalesced:', err);
                        await updateCommandStatus(cmd.id, 'failed', err?.message);
                    }
                }
            } catch (err) {
                console.error('[SupervisorCommands] Error en catch-up:', err);
            }
        };

        const channel = supabaseCloud
            .channel(`supervisor_commands:${deviceId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'supervisor_commands',
                filter: `primary_device_id=eq.${deviceId}`
            }, (payload) => processCommand(payload.new))
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') catchUpPending();
            });

        // Red de seguridad contra micro-cortes: Polling periódico cada 12s
        const intervalId = setInterval(() => {
            if (!disposed && navigator.onLine !== false) {
                catchUpPending();
            }
        }, 12000);

        const handleOnline = () => {
            if (!disposed) catchUpPending();
        };
        window.addEventListener('online', handleOnline);

        return () => {
            disposed = true;
            clearInterval(intervalId);
            window.removeEventListener('online', handleOnline);
            supabaseCloud.removeChannel(channel).catch(() => {});
        };
    }, [deviceId]);
}
