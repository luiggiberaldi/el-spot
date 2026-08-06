import { useEffect } from 'react';
import { supabaseCloud } from '../config/supabaseCloud';
import { applyInventoryCommand, applyInventoryBatch, coalesceCommands } from '../utils/remoteInventoryProcessor';
import { storageService } from '../utils/storageService';
import { pushLocalSync } from './useCloudSync';
import * as appliedStore from '../utils/appliedCommandsStore';
import { isValidDeviceId } from '../utils/deviceId';

async function updateCommandStatus(commandId, status, errorReason = null) {
    const fields = { status };
    if (status === 'applied') fields.applied_at = new Date().toISOString();
    if (errorReason) fields.error_reason = String(errorReason).slice(0, 500);
    try {
        await supabaseCloud
            .from('supervisor_commands')
            .update(fields)
            .eq('id', commandId);
    } catch (e) {
        console.error('[SupervisorCommands] No se pudo actualizar status:', e);
    }
}

async function applyRateChange(command) {
    const { rateMode, customRate } = command.payload || {};

    if (rateMode) {
        await storageService.setItem('bodega_rate_mode', rateMode);
        await storageService.setItem('bodega_use_auto_rate', rateMode !== 'manual');
        pushLocalSync('bodega_rate_mode', rateMode);
        pushLocalSync('bodega_use_auto_rate', rateMode !== 'manual');
    }

    if (customRate !== undefined && customRate !== null) {
        await storageService.setItem('bodega_custom_rate', String(customRate));
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
        const { data, error } = await supabaseCloud
            .rpc('claim_command', {
                p_command_id: commandId,
                p_claimer_id: claimerId
            });
        if (error) {
            console.error('[SupervisorCommands] claim_command error:', error);
            return false;
        }
        return Boolean(data);
    } catch (e) {
        console.error('[SupervisorCommands] claim_command exception:', e);
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
            if (appliedIds.has(command.id)) return Promise.resolve();

            const existing = inFlight.get(command.id);
            if (existing) return existing;

            if (command.command_type === 'rate_change') {
                appliedIds.add(command.id);
                appliedStore.mark(command.id);
                const p = (async () => {
                    try {
                        // SYNC-012: validar payload_version antes de aplicar.
                        const ver = command.payload_version ?? 1;
                        if (!Number.isFinite(ver) || ver < 1 || ver > 1) {
                            console.warn(`[SupervisorCommands] payload_version no soportado: ${ver} (cmd ${command.id})`);
                            if (!disposed) await updateCommandStatus(command.id, 'failed', `payload_version no soportado: ${ver}`);
                            return;
                        }

                        const claimed = await claimCommand(command.id, deviceId);
                        if (!claimed) return;
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
                appliedIds.add(command.id);
                appliedStore.mark(command.id);
                const p = (async () => {
                    try {
                        // SYNC-012: validar payload_version — si es futura, marcar failed
                        // y no intentar aplicar (evita corromper datos con schema desconocido).
                        const ver = command.payload_version ?? 1;
                        if (!Number.isFinite(ver) || ver < 1 || ver > 1) {
                            console.warn(`[SupervisorCommands] payload_version no soportado: ${ver} (cmd ${command.id})`);
                            if (!disposed) await updateCommandStatus(command.id, 'failed', `payload_version no soportado: ${ver}`);
                            return;
                        }

                        const claimed = await claimCommand(command.id, deviceId);
                        if (!claimed) return;
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
            }
            return Promise.resolve();
        };

        const catchUpPending = async () => {
            try {
                const { data, error } = await supabaseCloud
                    .from('supervisor_commands')
                    .select('*')
                    .eq('primary_device_id', deviceId)
                    .eq('status', 'pending')
                    .order('created_at', { ascending: true });
                if (error || disposed) return;
                const pending = (data || []).filter(cmd => !appliedIds.has(cmd.id));
                if (pending.length === 0) return;

                const requests = pending.map(cmd => claimCommand(cmd.id, deviceId));
                const claimResults = await Promise.all(requests);
                const claimed = pending.filter((cmd, i) => claimResults[i]);
                if (claimed.length === 0) return;

                const coalesced = coalesceCommands(claimed);

                // SYNC-012: descartar comandos con payload_version no soportada
                // antes de aplicar (esquema futura → marcar failed, no corromper).
                const SUPPORTED_PAYLOAD_VER = 1;
                const supported = [];
                const unsupported = [];
                for (const cmd of coalesced) {
                    const ver = cmd.payload_version ?? 1;
                    if (Number.isFinite(ver) && ver === SUPPORTED_PAYLOAD_VER) {
                        supported.push(cmd);
                    } else {
                        unsupported.push(cmd);
                    }
                }
                if (unsupported.length > 0) {
                    console.warn(`[SupervisorCommands] ${unsupported.length} comando(s) con payload_version no soportado`);
                    if (!disposed) {
                        await Promise.all(unsupported.map(cmd =>
                            updateCommandStatus(cmd.id, 'failed', `payload_version no soportado: ${cmd.payload_version ?? 'null'}`)
                        ));
                    }
                    unsupported.forEach(cmd => appliedIds.add(cmd.id));
                }
                if (supported.length === 0) return;

                const inventoryPayloads = supported
                    .filter(cmd => cmd.command_type === 'inventory_update')
                    .map(cmd => ({ ...cmd.payload, _cmdId: cmd.id }));
                const rateCommands = supported.filter(cmd => cmd.command_type === 'rate_change');

                const idMark = supported.map(c => c.id);
                await appliedStore.bulkMark(idMark);
                idMark.forEach(id => appliedIds.add(id));

                if (inventoryPayloads.length > 0) {
                    try {
                        const batch = await applyInventoryBatch(inventoryPayloads.map(p => {
                            const { _cmdId, ...rest } = p;
                            return rest;
                        }));
                        await Promise.all((batch.results || []).map(async (r, i) => {
                            const payload = inventoryPayloads[i];
                            const cmdId = payload._cmdId;
                            if (!disposed && cmdId) {
                                if (r.success) {
                                    await updateCommandStatus(cmdId, 'applied');
                                    window.dispatchEvent(new CustomEvent('supervisor_inventory_applied', {
                                        detail: {
                                            action: payload.action,
                                            productName: r.productName || ''
                                        }
                                    }));
                                } else {
                                    await updateCommandStatus(cmdId, 'failed', r.error);
                                }
                            }
                        }));
                    } catch (err) {
                        console.error('[SupervisorCommands] Error en applyInventoryBatch:', err);
                        for (const payload of inventoryPayloads) {
                            if (!disposed && payload._cmdId) {
                                await updateCommandStatus(payload._cmdId, 'failed', err?.message);
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

        return () => {
            disposed = true;
            supabaseCloud.removeChannel(channel).catch(() => {});
        };
    }, [deviceId]);
}
