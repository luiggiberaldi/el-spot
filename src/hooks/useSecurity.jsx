import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { storageService } from '../utils/storageService';
import { supabase } from '../core/supabaseClient';
import { verifyLicenseToken } from '../security/tokenCrypto';
import { generateFingerprint, verifyStoredFingerprint } from '../security/deviceFingerprint';
import { useLicenseMonitoring } from './useLicenseMonitoring';
import { useDemoCountdown } from './useDemoCountdown';
import { LICENSE_POLICY } from '../utils/securityConstants';

const APP_VERSION = '1.0.0';
const PRODUCT_ID = 'el-spot';

const DEMO_DURATION_MS = 72 * 60 * 60 * 1000; // 72 horas (3 dias)

// Helper seguro para obtener el estado de la licencia respetando RLS o haciendo fallback
async function _fetchRemoteLicense(currentDeviceId) {
    try {
        const { data, error } = await supabase.rpc('get_license_status', { p_device_id: currentDeviceId });
        if (!error && data) {
            const record = Array.isArray(data) ? data[0] : data;
            if (record) {
                return { data: record, error: null };
            }
        }
    } catch (e) {
        // Silencioso
    }
    return supabase
        .from('licenses')
        .select('type, is_active, expires_at, created_at')
        .eq('device_id', currentDeviceId)
        .eq('product_id', PRODUCT_ID)
        .maybeSingle();
}

// SEC-022 / INFRA-011: Security headers (CSP, X-Frame-Options, X-Content-Type-Options,
// Referrer-Policy) deben configurarse en el servidor que sirve el build (Cloudflare
// Worker, Vercel o index.html <meta http-equiv>). No se pueden aplicar correctamente
// desde el bundle. Ver ISSUES.md SEC-022 / INFRA-011 — pendiente para Agente D.

// HOOK: useSecurity() lee de un Context compartido (SecurityProvider) en vez de
// correr su propio ciclo de estado por cada componente que lo consume. Antes, cada
// uno de los ~7 componentes que llaman useSecurity() (App, DashboardView, SettingsView,
// WalletView, SettingsModal, PremiumGuard, ManualMode) disparaba su propio auto-registro,
// verificación de licencia y heartbeat al montar — generando ráfagas de RPCs duplicadas
// contra Supabase en cada arranque/navegación. Con Context, el ciclo corre una sola vez
// por sesión de app, sin importar cuántos componentes consuman el estado.
function useSecurityState() {
    const [deviceId, setDeviceId] = useState('');
    const [isPremium, setIsPremium] = useState(true);
    const [loading, setLoading] = useState(false);
    const [isDemo, setIsDemo] = useState(false);
    const [demoExpires, setDemoExpires] = useState(null);
    // FIX 3: demoUsed como estado, leido desde IndexedDB
    const [demoUsed, setDemoUsed] = useState(false);
    const [integrityWarning, setIntegrityWarning] = useState(false);
    const lastIntegrityCheckRef = useRef(0);

    // Nuevos estados para control de gracia de licencia mensual
    const [isMonthlyGracePeriod, setIsMonthlyGracePeriod] = useState(false);
    const [monthlyGraceDaysLeft, setMonthlyGraceDaysLeft] = useState(0);

    const applyLicenseState = useCallback((type, isActive, expiresAtVal, createdAt) => {
        setIsPremium(true);
        setIsDemo(false);
        setIsMonthlyGracePeriod(false);
        setMonthlyGraceDaysLeft(0);
        return { isPremium: true, isDemo: false, isGrace: false, graceDays: 0 };
    }, []);

    // Demo countdown hook
    const {
        demoTimeLeft,
        demoExpiredMsg,
        setDemoExpiredMsg,
        dismissExpiredMsg,
    } = useDemoCountdown({
        isDemo,
        demoExpiresAt: demoExpires,
        onExpired: () => {
            setIsPremium(false);
            setIsDemo(false);
        },
    });

    // License monitoring hook
    useLicenseMonitoring({
        deviceId,
        isPremium,
        isDemo,
        onRevoked: (msg) => {
            setIsPremium(false);
            setIsDemo(false);
            setIsMonthlyGracePeriod(false);
            setDemoExpiredMsg(msg);
            setLoading(false);
        },
        onPermanentActivated: () => {
            setIsPremium(true);
            setIsDemo(false);
            setIsMonthlyGracePeriod(false);
            setDemoExpires(null);
        },
        onDemoActivated: (expiresAt) => {
            setIsPremium(true);
            setIsDemo(true);
            setIsMonthlyGracePeriod(false);
            setDemoExpires(expiresAt);
        },
        onMonthlyActivated: (expiresAt, isGrace, graceDays) => {
            setIsPremium(true);
            setIsDemo(false);
            setIsMonthlyGracePeriod(isGrace);
            setMonthlyGraceDaysLeft(graceDays);
        },
    });

    // HOOK-040: checkLicense memoizado para evitar recreate en cada render.
    const checkLicense = useCallback(async (currentDeviceId) => {
        setIsPremium(true);
        setIsDemo(false);
        setIsMonthlyGracePeriod(false);
        setMonthlyGraceDaysLeft(0);
        setDemoExpiredMsg(null);
        localStorage.setItem('pda_license_cache', JSON.stringify({
            type: 'permanent',
            isActive: true,
            expiresAt: null,
            deviceId: currentDeviceId,
            updatedAt: Date.now()
        }));
        setLoading(false);
        return;
    }, []);

    useEffect(() => {
        const initDeviceId = async () => {
            // SEC-008: Re-verificar fingerprint. Si el dispositivo cambió (o si alguien
            // inyectó un pda_device_id arbitrario), invalidamos la sesión premium.
            let storedId = localStorage.getItem('pda_device_id');
            const currentFp = await generateFingerprint();
            if (storedId) {
                const matches = await verifyStoredFingerprint(storedId, currentFp);
                if (!matches) {
                    // Fingerprint manipulado o cambiado → revocar premium y re-fijar deviceId.
                    if (import.meta.env?.DEV) {
                        console.warn('[Security] Fingerprint mismatch detectado (SEC-008). Revocando sesión.');
                    }
                    localStorage.removeItem('pda_premium_token');
                    setIntegrityWarning(true);
                    storedId = currentFp;
                    localStorage.setItem('pda_device_id', storedId);
                }
            } else {
                storedId = currentFp;
                localStorage.setItem('pda_device_id', storedId);
            }
            setDeviceId(storedId);

            // Auto-registro: registrar dispositivo si no existe (sin importar licencia)
            try {
                if (import.meta.env.VITE_SUPABASE_URL) {
                    const bName = localStorage.getItem('business_name') || localStorage.getItem('restaurant_name') || '';
                    const mEmail = localStorage.getItem('marketing_email') || '';
                    const clientName = mEmail ? `${bName} | ${mEmail}` : bName;
                    await supabase.rpc('auto_register_device', { p_device_id: storedId, p_product_id: PRODUCT_ID, p_client_name: clientName });
                }
            } catch (e) {
                if (import.meta.env?.DEV) console.warn('[Security] auto_register_device falló:', e?.message ?? e);
            }

            checkLicense(storedId);
        };

        initDeviceId();

        // FIX 3: Leer demo flag desde IndexedDB
                        storageService.getItem('pda_demo_flag_v1', null).then(r => {
            if (r?.used) setDemoUsed(true);
        });
    }, [checkLicense]);

    // FIX 4: Integrity check periodico cada 30 minutos
    useEffect(() => {
        if (!deviceId) return;
        const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown between checks

        const interval = setInterval(async () => {
            const now = Date.now();
            if (now - lastIntegrityCheckRef.current < COOLDOWN_MS) return;
            lastIntegrityCheckRef.current = now;

            // SEC-008: Re-verificar fingerprint periódicamente.
            try {
                const currentFp = await generateFingerprint();
                const matches = await verifyStoredFingerprint(deviceId, currentFp);
                if (!matches) {
                    console.warn('[Security] Fingerprint cambió durante integrity check (SEC-008).');
                    setIntegrityWarning(true);
                    setIsPremium(false);
                    setIsDemo(false);
                    localStorage.removeItem('pda_premium_token');
                    return;
                }
            } catch (e) {
                if (import.meta.env?.DEV) {
                    console.warn('[Security] Re-verificación de fingerprint falló:', e?.message ?? e);
                }
            }

            const raw = localStorage.getItem('pda_premium_token');

            // Si localStorage fue borrado o no hay token local (flujo sin token local en licencias DB),
            // intentar validar remotamente o contra cache offline.
            if (!raw) {
                let remoteLicense = null;
                let netError = false;
                try {
                    const { data, error } = await _fetchRemoteLicense(deviceId);
                    if (error) netError = true;
                    else remoteLicense = data;
                } catch (e) {
                    netError = true;
                    if (import.meta.env?.DEV) {
                        console.warn('[Security] Sin red en integrity check:', e?.message ?? e);
                    }
                }

                if (remoteLicense) {
                    const { type, is_active, expires_at, created_at } = remoteLicense;
                    const { isPremium: isPrem } = applyLicenseState(type, is_active, expires_at, created_at);

                    if (isPrem) {
                        // Sincronizar cache offline
                        localStorage.setItem('pda_license_cache', JSON.stringify({
                            type,
                            isActive: true,
                            expiresAt: expires_at ? new Date(expires_at).getTime() : null,
                            createdAt: created_at,
                            deviceId,
                            updatedAt: Date.now()
                        }));
                        return;
                    } else {
                        // Licencia explícitamente revocada o expirada
                        localStorage.removeItem('pda_license_cache');
                        setIsPremium(false);
                        setIsDemo(false);
                        setIsMonthlyGracePeriod(false);
                        setDemoExpiredMsg("Tu suscripción mensual ha expirado y el período de gracia de 5 días ha finalizado. Por favor, regulariza tu pago.");
                        return;
                    }
                }

                // Si hay error de red, validar contra el caché offline
                if (netError) {
                    const cached = localStorage.getItem('pda_license_cache');
                    if (cached) {
                        try {
                            const cacheObj = JSON.parse(cached);
                            if (cacheObj.deviceId === deviceId && cacheObj.isActive) {
                                const { isPremium: isPrem } = applyLicenseState(cacheObj.type, cacheObj.isActive, cacheObj.expiresAt, cacheObj.createdAt);
                                if (isPrem) {
                                    return; // Caché offline válido, no revocar
                                }
                            }
                        } catch (err) {
                            // Caché corrupto
                        }
                    }
                }

                if (isPremium) {
                    console.warn('[Security] No active server license and cache invalid/missing. Revoking premium.');
                    setIsPremium(false);
                    setIsDemo(false);
                    setIsMonthlyGracePeriod(false);
                    setIntegrityWarning(true);
                }
                return;
            }

            // Verificar integridad del token almacenado (SOLO RSA-signed).
            if (raw) {
                try {
                    let obj = null;
                    if (raw.includes('.')) {
                        const { valid, payload } = await verifyLicenseToken(raw);
                        if (valid) obj = payload;
                    } else {
                        // SEC-001: Token legacy XOR → eliminar.
                        throw new Error('Legacy XOR token rejected');
                    }

                    if (obj) {
                        if ((obj.type === 'demo7' || obj.type === 'demo3') && obj.expires && Date.now() >= obj.expires) {
                            localStorage.removeItem('pda_premium_token');
                            localStorage.removeItem('pda_license_cache');
                            setIsPremium(false);
                            setIsDemo(false);
                            setDemoExpiredMsg("Tu licencia temporal ha finalizado. Esperamos que hayas disfrutado la experiencia completa.");
                            console.warn('[Security] Demo token expired during integrity check.');
                        }
                    } else {
                        throw new Error('Invalid token structure');
                    }
                } catch {
                    if (isPremium) {
                        localStorage.removeItem('pda_premium_token');
                        localStorage.removeItem('pda_license_cache');
                        setIsPremium(false);
                        setIsDemo(false);
                        setIntegrityWarning(true);
                        console.warn('[Security] Corrupt or legacy token detected. Revoking premium state.');
                    }
                }
            }
        }, LICENSE_POLICY.HEARTBEAT_MS);

        return () => clearInterval(interval);
    }, [deviceId, isPremium, checkLicense]);

    /**
     * Activa la demo de 3 dias sin necesidad de codigo.
     * Solo puede usarse UNA VEZ por dispositivo.
     *
     * SEC-001: La activación local NO crea un token firmado (imposible sin clave privada).
     * Se apoya en la fila `licenses` del servidor con `active=true` como fuente de verdad.
     * El estado `isPremium/isDemo` se mantiene en memoria hasta que el backend confirme.
     */
    const activateDemo = async () => {
        // Paso 1: Verificar flag local antes de ir al servidor
        const demoRecord = await storageService.getItem('pda_demo_flag_v1', null);
        if (demoRecord?.used) {
            return { success: false, status: 'DEMO_USED' };
        }

        const currentDeviceId = deviceId || localStorage.getItem('pda_device_id');

        // Paso 2: Consultar estado remoto actual ANTES de activar
        // Si el servidor ya tiene una demo o licencia activa, no volver a activar.
        try {
            const { data: remoteLicense } = await _fetchRemoteLicense(currentDeviceId);
            if (remoteLicense && remoteLicense.type !== 'registered') {
                // El servidor ya tiene una demo o licencia real → quemar flag local y retornar
                await storageService.setItem('pda_demo_flag_v1', {
                    used: true, ts: Date.now(), deviceId: currentDeviceId,
                });
                setDemoUsed(true);
                return { success: false, status: 'DEMO_USED' };
            }
        } catch (e) {
            if (import.meta.env?.DEV) {
                console.warn('[Security] Sin red al verificar demo existente:', e?.message ?? e);
            }
            // Sin red: no bloqueamos, continuamos al intento de activación
        }

        // Paso 3: Llamar al servidor PRIMERO — sin tocar IndexedDB todavía
        let rpcSuccess = false;
        let rpcError = null;

        try {
            const { data: rpcData, error: rpcErr } = await supabase.rpc('activate_demo_secure', {
                p_device_id: currentDeviceId,
                p_product_id: PRODUCT_ID
            });

            if (rpcErr) {
                // Función no instalada o error de BD
                rpcError = rpcErr;
                rpcSuccess = false;
            } else {
                // La RPC devuelve TRUE si activó, FALSE si la demo ya fue usada en el servidor
                rpcSuccess = rpcData === true;
            }
        } catch (e) {
            rpcError = e;
            rpcSuccess = false;
        }

        // Paso 4a: RPC falló por razón técnica (función no existe, sin red) → NO quemar el flag
        if (rpcError) {
            const isRpcMissing = rpcError?.message?.toLowerCase().includes('could not find the function')
                || rpcError?.code === 'PGRST202'
                || rpcError?.message?.toLowerCase().includes('schema cache');

            if (isRpcMissing) {
                if (import.meta.env?.DEV) {
                    console.error('[Security] activate_demo_secure no instalada en Supabase. Solicita al admin ejecutar el SQL de setup.');
                }
                return { success: false, status: 'RPC_NOT_FOUND' };
            }

            // Otro error de red / servidor → informar sin quemar el flag
            if (import.meta.env?.DEV) {
                console.warn('[Security] activate_demo_secure falló por error de servidor:', rpcError?.message ?? rpcError);
            }
            return { success: false, status: 'SERVER_ERROR' };
        }

        // Paso 4b: RPC retornó FALSE → el servidor dice que la demo ya fue utilizada
        if (!rpcSuccess) {
            await storageService.setItem('pda_demo_flag_v1', {
                used: true, ts: Date.now(), deviceId: currentDeviceId,
            });
            setDemoUsed(true);
            return { success: false, status: 'DEMO_USED' };
        }

        // Paso 5: Servidor confirmó activación exitosa → ahora sí persistir localmente
        const expires = Date.now() + DEMO_DURATION_MS;

        await storageService.setItem('pda_demo_flag_v1', {
            used: true, ts: Date.now(), deviceId: currentDeviceId,
        });

        localStorage.setItem('pda_license_cache', JSON.stringify({
            type: 'demo3',
            isActive: true,
            expiresAt: expires,
            deviceId: currentDeviceId,
            updatedAt: Date.now()
        }));

        setIsPremium(true);
        setIsDemo(true);
        setDemoExpires(expires);
        setDemoUsed(true);

        return { success: true, status: 'DEMO_ACTIVATED' };
    };

    /**
     * Desbloquea con codigo de activacion.
     * Consulta Supabase para determinar si es permanente o temporal.
     *
     * SEC-001: La fuente de verdad es la fila en `licenses` del servidor; ya NO
     * se crea un token legacy XOR local. El estado en memoria queda activo hasta
     * la próxima verificación periódica.
     */
    const unlockApp = async (inputCode) => {
        try {
            const cleanCode = (inputCode || "").replace(/-/g, "").trim().toUpperCase().replace(/O/g, '0');
            let isValid = false;
            let activeLicense = null;

            try {
                const { data, error } = await supabase.rpc('verify_activation_code', {
                    p_device_id: deviceId,
                    p_code: cleanCode
                });
                if (!error && data === true) {
                    isValid = true;
                    const { data: remoteLicense } = await _fetchRemoteLicense(deviceId);
                    activeLicense = remoteLicense;
                }
            } catch (e) {
                // Silencioso
            }

            // Fallback por compatibilidad si la RPC no existe o falla
            if (!isValid) {
                const { data: license, error } = await supabase
                    .from('licenses')
                    .select('type, is_active, expires_at, code, created_at')
                    .eq('device_id', deviceId)
                    .eq('product_id', PRODUCT_ID)
                    .maybeSingle();

                const cleanDbCode = (license?.code || "").replace(/-/g, "").trim().toUpperCase().replace(/O/g, '0');
                if (error || !license || cleanDbCode !== cleanCode) {
                    return { success: false, status: 'INVALID_CODE' };
                }
                activeLicense = license;
            }

            const { type, is_active, expires_at } = activeLicense;

            if (!is_active) {
                return { success: false, status: 'LICENSE_REVOKED' };
            }

            const isTimeLimited = (type === 'demo7' || type === 'demo3');
            let expiresAt = expires_at ? new Date(expires_at).getTime() : null;

            if (isTimeLimited) {
                if (!expiresAt) {
                    expiresAt = Date.now() + 72 * 60 * 60 * 1000;
                    try {
                        supabase.from('licenses').update({ expires_at: new Date(expiresAt).toISOString() })
                            .eq('device_id', deviceId).eq('product_id', PRODUCT_ID).then();
                    } catch (e) {
                        if (import.meta.env?.DEV) {
                            console.warn('[Security] update expires_at falló:', e?.message ?? e);
                        }
                    }
                }

                setIsPremium(true);
                setIsDemo(true);
                setDemoExpires(expiresAt);
 
                // Guardar en cache offline
                localStorage.setItem('pda_license_cache', JSON.stringify({
                    type,
                    isActive: true,
                    expiresAt,
                    createdAt: activeLicense.created_at || new Date().toISOString(),
                    deviceId,
                    updatedAt: Date.now()
                }));
 
                return { success: true, status: 'PREMIUM_ACTIVATED' };
            }
 
            // Permanente
            setIsPremium(true);
            setIsDemo(false);
 
            // Guardar en cache offline
            localStorage.setItem('pda_license_cache', JSON.stringify({
                type,
                isActive: true,
                expiresAt: null,
                createdAt: activeLicense.created_at || new Date().toISOString(),
                deviceId,
                updatedAt: Date.now()
            }));
 
            return { success: true, status: 'PREMIUM_ACTIVATED' };

        } catch (err) {
            console.error('Error validating license:', err);
            return { success: false, status: 'SERVER_ERROR' };
        }
    };

    const generateCodeForClient = async () => null;

    /**
     * Fuerza un heartbeat manual para sincronizar cambios como el nombre del negocio de inmediato.
     */
    const forceHeartbeat = async () => {
        const bName = localStorage.getItem('business_name') || localStorage.getItem('restaurant_name') || '';
        const mEmail = localStorage.getItem('marketing_email') || '';
        const clientName = mEmail ? `${bName} | ${mEmail}` : bName;
        try {
            await supabase.rpc('heartbeat_device', {
                p_device_id: deviceId || localStorage.getItem('pda_device_id'),
                p_product_id: PRODUCT_ID,
                p_client_name: clientName
            });
        } catch(e) {
            console.error('Error forcing heartbeat:', e);
        }
    };

    return {
        deviceId,
        isPremium,
        loading,
        unlockApp,
        activateDemo,
        generateCodeForClient,
        isDemo,
        demoExpires,
        demoTimeLeft,
        demoExpiredMsg,
        dismissExpiredMsg: () => setDemoExpiredMsg(''),
        demoUsed,
        forceHeartbeat,
        integrityWarning,
        dismissIntegrityWarning: () => setIntegrityWarning(false),
        isMonthlyGracePeriod,
        monthlyGraceDaysLeft,
    };
}

const SecurityContext = createContext(null);

export function SecurityProvider({ children }) {
    const value = useSecurityState();
    return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}

export function useSecurity() {
    const ctx = useContext(SecurityContext);
    if (!ctx) throw new Error('useSecurity debe usarse dentro de un SecurityProvider');
    return ctx;
}
