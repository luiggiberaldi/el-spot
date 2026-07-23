import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, Wifi, WifiOff } from 'lucide-react';

/**
 * SyncStatus — Indicador visual de conectividad.
 * Muestra un icono de nube en la barra superior que refleja:
 * - Online:  Nube verde con check
 * - Offline: Nube roja tachada
 */
export default function SyncStatus({ variant = 'dark' }) {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const goOnline = () => setIsOnline(true);
        const goOffline = () => setIsOnline(false);

        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    return (
        <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-extrabold tracking-wide transition-all duration-300 ${
                variant === 'dark'
                    ? isOnline
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-950/40 backdrop-blur-sm'
                        : 'bg-red-950/80 text-red-400 border border-red-500/40 animate-pulse backdrop-blur-sm'
                    : isOnline
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 animate-pulse'
            }`}
            title={isOnline ? 'Conectado a Internet' : 'Sin conexión a Internet'}
        >
            {isOnline ? (
                <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="inline">Online</span>
                </>
            ) : (
                <>
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                    <span>Offline</span>
                </>
            )}
        </div>
    );
}
