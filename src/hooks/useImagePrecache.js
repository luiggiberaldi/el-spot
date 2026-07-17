import { useEffect, useRef, useState } from 'react';
import { useProductContext } from '../context/ProductContext';

/**
 * OFFLINE-IMG: Precalentador del cache de imágenes de producto.
 *
 * El service worker ya cachea las imágenes de Storage con CacheFirst
 * (`product-images-cache` en vite.config.js), pero solo las que el usuario
 * llegó a VER estando online. Este hook recorre TODO el inventario y hace un
 * fetch silencioso de cada imagen para que el SW las guarde todas — así el
 * inventario y la caja se ven completos sin internet.
 *
 * Diseño:
 *  - Debounce de 5s tras cambios en `products` (agrupa ediciones/sync).
 *  - Skip por URL si ya está en Cache Storage (`caches.match` → 0 red).
 *  - Lotes de 4 fetches concurrentes para no saturar equipos de gama baja.
 *  - Hash de la lista de URLs para no re-recorrer si nada cambió.
 *  - Errores individuales silenciosos: una URL rota no aborta el resto.
 */

const BATCH_SIZE = 4;
const DEBOUNCE_MS = 5000;

function urlListHash(urls) {
    const str = urls.join('|');
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return `${urls.length}_${h >>> 0}`;
}

async function precacheImages(urls) {
    let cacheStorage = null;
    try {
        // Cache Storage API; puede no existir en WebViews viejas.
        cacheStorage = typeof caches !== 'undefined' ? caches : null;
    } catch { /* contexto sin Cache Storage */ }

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        if (!navigator.onLine) return; // se cayó la conexión a mitad: abortar sin ruido
        const batch = urls.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (url) => {
            try {
                if (cacheStorage) {
                    const hit = await cacheStorage.match(url);
                    if (hit) return; // ya cacheada por el SW: 0 red
                }
                // El fetch pasa por el SW → la regla CacheFirst la persiste.
                await fetch(url, { mode: 'no-cors' });
            } catch { /* URL rota u offline parcial: continuar con el resto */ }
        }));
    }
}

export function useImagePrecache() {
    const { products, isLoadingProducts } = useProductContext();
    const lastHashRef = useRef('');
    const runningRef = useRef(false);
    // Contador que fuerza un nuevo intento al recuperar conexión (el reset del
    // hash solo no re-dispararía el efecto).
    const [onlineTick, setOnlineTick] = useState(0);

    useEffect(() => {
        const onOnline = () => {
            lastHashRef.current = '';
            setOnlineTick(t => t + 1);
        };
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, []);

    useEffect(() => {
        if (isLoadingProducts) return;
        if (!('serviceWorker' in navigator)) return;

        const timer = setTimeout(async () => {
            // Sin SW controlador (primera carga, dev, Electron file://) el fetch no
            // pasaría por la regla de cache: no tiene sentido precalentar.
            if (!navigator.serviceWorker.controller) return;
            if (!navigator.onLine) return;
            if (runningRef.current) return;

            const urls = [...new Set(
                (products || [])
                    .map(p => p?.image)
                    .filter(img => typeof img === 'string' && /^https?:/i.test(img))
            )];
            if (urls.length === 0) return;

            const hash = urlListHash(urls);
            if (hash === lastHashRef.current) return; // nada nuevo que cachear

            runningRef.current = true;
            try {
                await precacheImages(urls);
                lastHashRef.current = hash;
            } finally {
                runningRef.current = false;
            }
        }, DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [products, isLoadingProducts, onlineTick]);
}

/** Microcomponente para montar el hook dentro de <ProductProvider>. */
export function ImagePrecacheRunner() {
    useImagePrecache();
    return null;
}
