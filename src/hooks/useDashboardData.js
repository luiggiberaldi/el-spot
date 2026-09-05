import { useState, useEffect, useRef } from 'react';
import { storageService } from '../utils/storageService';
import { useAuthStore } from './store/useAuthStore';

const SALES_KEY = 'bodega_sales_v1';

export function useDashboardData(isActive, requestPermission) {
    const [sales, setSales] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [isLoadingLocal, setIsLoadingLocal] = useState(true);
    const hasRequestedPermRef = useRef(false);
    const usuarioActivo = useAuthStore(s => s.usuarioActivo);

    // BUGFIX: recargar al cambiar de usuario (además de al activarse la vista).
    // El logout/login no desmonta la vista, así que sin esto la lista podía
    // quedar con el estado de la sesión anterior.
    useEffect(() => {
        if (!isActive) return;
        let mounted = true;
        const load = async () => {
            const [savedSales, savedCustomers] = await Promise.all([
                storageService.getItem(SALES_KEY, []),
                storageService.getItem('bodega_customers_v1', []),
            ]);
            if (mounted) {
                setSales(savedSales);
                setCustomers(savedCustomers);
                setIsLoadingLocal(false);
            }
        };
        load();
        // Solicitar permiso de notificaciones al primer uso
        if (!hasRequestedPermRef.current) { hasRequestedPermRef.current = true; requestPermission(); }
        return () => { mounted = false; };
    }, [isActive, usuarioActivo?.id]);

    const refreshData = async () => {
        const [savedSales, savedCustomers] = await Promise.all([
            storageService.getItem(SALES_KEY, []),
            storageService.getItem('bodega_customers_v1', []),
        ]);
        setSales(savedSales);
        setCustomers(savedCustomers);
    };

    return { sales, setSales, customers, setCustomers, isLoadingLocal, refreshData };
}
