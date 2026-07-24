import React, { useState, useEffect, useMemo } from 'react';
import { useProductContext } from '../context/ProductContext';
import { useMonitorSync } from '../hooks/useMonitorSync';
import { storageService } from '../utils/storageService';
import { supabaseCloud } from '../config/supabaseCloud';
import { showToast } from '../components/Toast';
import SupervisorRateModal from '../components/SupervisorRateModal';
import RemoteProductFormModal from '../components/Monitor/RemoteProductFormModal';
import { 
    TrendingUp, Package, Coins, Users, LogOut, 
    RefreshCw, Wifi, WifiOff, Clock, FileText, DollarSign,
    Wallet, CreditCard, Smartphone, Banknote, ArrowDownRight,
    ShieldCheck, Hash, AlertTriangle, Search, X, ChevronLeft, ChevronRight,
    Pencil, Trash2, Plus, UploadCloud, MinusCircle, PlusCircle, Loader2
} from 'lucide-react';
import { formatBs, formatCop } from '../utils/calculatorUtils';
import { getLocalISODate } from '../utils/dateHelpers';

const toTitleCase = (str) => {
    if (!str) return '';
    return String(str).charAt(0).toUpperCase() + String(str).slice(1).toLowerCase();
};

const getPaymentLabel = (methodId) => {
    const labels = {
        efectivo_bs: 'Efectivo Bs',
        pago_movil: 'Pago Móvil',
        punto_venta: 'Punto de Venta',
        efectivo_usd: 'Efectivo $',
        efectivo_cop: 'Efectivo COP',
        transferencia_cop: 'Transferencia COP',
        fiado: 'Crédito / Fiado',
        cashea: 'Cashea',
    };
    return labels[methodId] || methodId || 'Otro';
};

// Helper: icon por método de pago
const PAYMENT_METHOD_ICONS = {
    efectivo_bs: Banknote,
    pago_movil: Smartphone,
    punto_venta: CreditCard,
    efectivo_usd: DollarSign,
    efectivo_cop: Coins,
    transferencia_cop: CreditCard,
    fiado: Clock,
    cashea: Clock,
};

function getMethodIcon(methodId) {
    return PAYMENT_METHOD_ICONS[methodId] || Wallet;
}

const PENDING_KEY = 'pda_pending_inventory_changes_v1';

export default function OwnerMonitorView({ theme, toggleTheme, triggerHaptic }) {
    const pairedDeviceId = localStorage.getItem('pda_paired_device_id');
    const { products, effectiveRate: bcvRate, copEnabled, tasaCop, rates } = useProductContext();
    const { isConnected, lastSync, loading: syncLoading, triggerRefresh } = useMonitorSync(pairedDeviceId);

    const [sales, setSales] = useState([]);
    const [activeCashier, setActiveCashier] = useState({ nombre: 'Ninguno', rol: '' });
    const [loadingData, setLoadingData] = useState(true);
    const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
    const [showRateModal, setShowRateModal] = useState(false);
    const [viewTab, setViewTab] = useState('activo'); // 'activo', 'cierres', 'inventario'
    const [selectedCierreId, setSelectedCierreId] = useState(null);
    const [searchTermInventario, setSearchTermInventario] = useState('');
    const [filterStockInventario, setFilterStockInventario] = useState('todos'); // 'todos', 'bajo', 'agotado'

    // ── Edición remota de inventario ──
    const [showRemoteForm, setShowRemoteForm] = useState(false);
    const [remoteEditingProduct, setRemoteEditingProduct] = useState(null);
    const [confirmModalConfig, setConfirmModalConfig] = useState(null);
    const [pendingChanges, setPendingChanges] = useState(() => {
        try {
            const raw = localStorage.getItem(PENDING_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch { return []; }
    });
    const [uploading, setUploading] = useState(false);

    // Aplicar borradores pendientes optimísticamente en la vista del supervisor
    const productsWithDrafts = useMemo(() => {
        let list = Array.isArray(products) ? [...products] : [];
        
        for (const change of pendingChanges) {
            if (change.action === 'add') {
                const exists = list.some(p => p.id === change.productId);
                if (!exists) {
                    list.unshift({
                        id: change.productId,
                        name: change.data.name || 'Nuevo Producto',
                        priceUsd: change.data.priceUsd || change.data.priceUsdt || 0,
                        costUsd: change.data.costUsd || 0,
                        stock: change.data.stock || 0,
                        category: change.data.category || 'varios',
                        barcode: change.data.barcode || '',
                        ...change.data,
                        isDraft: true
                    });
                }
            } else if (change.action === 'edit') {
                list = list.map(p => p.id === change.productId ? { ...p, ...change.data, isDraft: true } : p);
            } else if (change.action === 'adjust_stock') {
                list = list.map(p => {
                    if (p.id === change.productId) {
                        const currentStock = p.stock || 0;
                        const delta = change.data?.delta || 0;
                        return { ...p, stock: Math.max(0, currentStock + delta), draftDelta: (p.draftDelta || 0) + delta };
                    }
                    return p;
                });
            } else if (change.action === 'delete') {
                list = list.filter(p => p.id !== change.productId);
            }
        }
        return list;
    }, [products, pendingChanges]);

    const filteredProducts = useMemo(() => {
        if (!productsWithDrafts) return [];
        return productsWithDrafts.filter(p => {
            const matchesSearch = (p.name || '').toLowerCase().includes(searchTermInventario.toLowerCase()) || 
                                 (p.barcode && p.barcode.includes(searchTermInventario));
            
            if (!matchesSearch) return false;
            
            if (filterStockInventario === 'bajo') {
                return p.stock > 0 && p.stock <= (p.minStock || 5);
            }
            if (filterStockInventario === 'agotado') {
                return p.stock <= 0;
            }
            return true;
        });
    }, [productsWithDrafts, searchTermInventario, filterStockInventario]);

    const persistPending = (next) => {
        setPendingChanges(next);
        try { localStorage.setItem(PENDING_KEY, JSON.stringify(next)); } catch {}
    };

    const handleRemoteSubmit = async (action, productId, data) => {
        triggerHaptic?.();
        const productName = data.name || 'Producto';
        const payloadData = { id: productId, ...data };
        const existingIdx = pendingChanges.findIndex(c => c.productId === productId && (c.action === 'add' || c.action === 'edit'));
        
        let next = [...pendingChanges];
        const newEntry = {
            id: crypto.randomUUID(),
            action,
            productId,
            data: payloadData,
            productName,
            timestamp: new Date().toISOString()
        };

        if (existingIdx >= 0) {
            next[existingIdx] = newEntry;
        } else {
            next.push(newEntry);
        }

        persistPending(next);
        showToast(action === 'add' ? `"${productName}" añadido al borrador` : `"${productName}" editado en borrador`, 'info');
    };

    const handleStockAdjust = (product, delta) => {
        triggerHaptic?.();
        let next = [...pendingChanges];
        const idx = next.findIndex(c => c.productId === product.id && c.action === 'adjust_stock');

        if (idx >= 0) {
            const newDelta = (next[idx].data?.delta || 0) + delta;
            if (newDelta === 0) {
                next.splice(idx, 1);
            } else {
                next[idx] = {
                    ...next[idx],
                    data: { delta: newDelta }
                };
            }
        } else {
            next.push({
                id: crypto.randomUUID(),
                action: 'adjust_stock',
                productId: product.id,
                data: { delta },
                productName: product.name,
                timestamp: new Date().toISOString()
            });
        }

        persistPending(next);
        showToast(`Stock (${delta > 0 ? '+' : ''}${delta}) añadido a borrador`, 'info');
    };

    const handleDeleteProduct = (product) => {
        triggerHaptic?.();
        setConfirmModalConfig({
            title: `¿Eliminar "${product.name}"?`,
            message: 'Se añadirá la eliminación del producto al borrador de cambios para procesarse en la caja registradora.',
            confirmText: 'Sí, Eliminar',
            cancelText: 'Cancelar',
            iconBg: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
            confirmBtnClass: 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20',
            onConfirm: () => {
                triggerHaptic?.();
                let next = pendingChanges.filter(c => c.productId !== product.id);
                next.push({
                    id: crypto.randomUUID(),
                    action: 'delete',
                    productId: product.id,
                    data: {},
                    productName: product.name,
                    timestamp: new Date().toISOString()
                });
                persistPending(next);
                showToast(`"${product.name}" marcado para eliminar en borrador`, 'info');
            }
        });
    };

    const handleUploadPendingChanges = async () => {
        if (!pairedDeviceId || !supabaseCloud || pendingChanges.length === 0) return;
        setUploading(true);
        triggerHaptic?.();

        try {
            const monitorDeviceId = localStorage.getItem('pda_device_id') || 'monitor_web';
            const rows = pendingChanges.map(c => ({
                primary_device_id: pairedDeviceId,
                monitor_device_id: monitorDeviceId,
                command_type: 'inventory_update',
                payload: { action: c.action, productId: c.productId, data: c.data },
                status: 'pending'
            }));

            const { error } = await supabaseCloud
                .from('supervisor_commands')
                .insert(rows);

            if (error) throw error;

            persistPending([]);
            showToast(`¡${rows.length} cambios enviados a la caja con éxito!`, 'success');
        } catch (err) {
            console.error('[OwnerMonitorView] Error al enviar lote de comandos:', err);
            showToast('Error al subir cambios a la caja: ' + (err.message || ''), 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleClearPending = () => {
        triggerHaptic?.();
        setConfirmModalConfig({
            title: '¿Descartar cambios en borrador?',
            message: 'Se descartarán todas las modificaciones de inventario pendientes sin enviarse a la caja registradora.',
            confirmText: 'Sí, Descartar Todo',
            cancelText: 'Mantener Cambios',
            iconBg: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
            confirmBtnClass: 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20',
            onConfirm: () => {
                triggerHaptic?.();
                persistPending([]);
                showToast('Borrador de cambios descartado', 'info');
            }
        });
    };

    const [currentPageInventario, setCurrentPageInventario] = useState(1);
    const ITEMS_PER_PAGE_INVENTARIO = 15;

    useEffect(() => {
        setCurrentPageInventario(1);
    }, [searchTermInventario, filterStockInventario]);

    const totalPagesInventario = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE_INVENTARIO);

    const paginatedProducts = useMemo(() => {
        const start = (currentPageInventario - 1) * ITEMS_PER_PAGE_INVENTARIO;
        return filteredProducts.slice(start, start + ITEMS_PER_PAGE_INVENTARIO);
    }, [filteredProducts, currentPageInventario]);

    const inventoryMetrics = useMemo(() => {
        if (!products) {
            return { totalCost: 0, totalRetail: 0, totalQty: 0, lowStockCount: 0, outOfStockCount: 0, expectedProfit: 0, count: 0 };
        }
        let totalCost = 0;
        let totalRetail = 0;
        let totalQty = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;

        products.forEach(p => {
            const stock = p.stock || 0;
            const cost = p.costUsd || p.costPrice || 0;
            const retail = p.priceUsd || 0;
            const minStock = p.minStock || 5;

            totalCost += cost * stock;
            totalRetail += retail * stock;
            totalQty += stock;

            if (stock <= 0) {
                outOfStockCount++;
            } else if (stock <= minStock) {
                lowStockCount++;
            }
        });

        const expectedProfit = Math.max(0, totalRetail - totalCost);

        return {
            totalCost,
            totalRetail,
            totalQty,
            lowStockCount,
            outOfStockCount,
            expectedProfit,
            count: products.length
        };
    }, [products]);

    const today = getLocalISODate();

    // 1. Cargar datos locales (que son actualizados por useMonitorSync)
    const loadLocalData = async () => {
        try {
            const [savedSales, savedAuth] = await Promise.all([
                storageService.getItem('bodega_sales_v1', []),
                storageService.getItem('abasto-auth-storage', null)
            ]);

            setSales(savedSales);
            
            if (savedAuth && savedAuth.state && savedAuth.state.usuarioActivo) {
                setActiveCashier({
                    nombre: savedAuth.state.usuarioActivo.nombre || 'Cajero',
                    rol: savedAuth.state.usuarioActivo.rol || 'CAJERO'
                });
            } else {
                setActiveCashier({ nombre: 'Ninguno', rol: '' });
            }
        } catch (e) {
            console.error('[OwnerMonitorView] Error cargando datos locales:', e);
        } finally {
            setLoadingData(false);
        }
    };

    useEffect(() => {
        loadLocalData();

        // Escuchar actualizaciones del almacenamiento causadas por la sincronización en tiempo real
        const handleUpdate = () => {
            loadLocalData();
        };

        window.addEventListener('app_storage_update', handleUpdate);
        window.addEventListener('storage', handleUpdate);
        return () => {
            window.removeEventListener('app_storage_update', handleUpdate);
            window.removeEventListener('storage', handleUpdate);
        };
    }, []);

    // ── TURNO ACTIVO ──
    
    // Apertura de caja del turno activo
    const activeShiftApertura = useMemo(() => {
        const aperturas = sales.filter(s => s.tipo === 'APERTURA_CAJA' && !s.cajaCerrada);
        if (aperturas.length === 0) return null;
        return aperturas.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    }, [sales]);

    // Filtrar ventas del turno activo (cajaCerrada !== true)
    const activeShiftSales = useMemo(() => {
        return sales.filter(s => {
            if (s.status === 'ANULADA') return false;
            if (s.tipo !== 'VENTA' && s.tipo !== 'VENTA_FIADA' && s.tipo !== 'VENTA_CASHEA') return false;
            if (s.cajaCerrada) return false;
            
            // Restringir a transacciones posteriores a la última apertura activa si existe
            if (activeShiftApertura) {
                return new Date(s.timestamp) >= new Date(activeShiftApertura.timestamp);
            }
            return true;
        });
    }, [sales, activeShiftApertura]);

    // Métricas del turno activo
    const activeShiftMetrics = useMemo(() => {
        let usd = 0;
        let bs = 0;
        activeShiftSales.forEach(s => {
            usd += s.totalUsd || 0;
            bs += s.totalBs || 0;
        });

        // Calcular ganancia estimada si los productos tienen costo
        let costSum = 0;
        activeShiftSales.forEach(s => {
            if (!s.items) return;
            s.items.forEach(item => {
                const prod = products.find(p => p.id === item.productId || p.id === item.id);
                const costVal = prod?.costUsd || prod?.costPrice || 0;
                if (costVal > 0) {
                    costSum += costVal * item.qty;
                }
            });
        });

        const profitUsd = Math.max(0, usd - costSum);

        return {
            totalUsd: usd,
            totalBs: bs,
            profitUsd,
            count: activeShiftSales.length
        };
    }, [activeShiftSales, products]);

    // Desglose por método de pago del turno activo
    const activeShiftPaymentBreakdown = useMemo(() => {
        const breakdown = {};
        // Incluye ventas, cobros de deuda, y pagos de proveedor en el flujo de caja
        const activeFlow = sales.filter(s => {
            if (s.status === 'ANULADA') return false;
            if (s.cajaCerrada) return false;
            
            // Restringir a transacciones posteriores a la última apertura activa si existe
            if (activeShiftApertura) {
                return new Date(s.timestamp) >= new Date(activeShiftApertura.timestamp);
            }
            return true;
        });

        activeFlow.forEach(sale => {
            if (sale.tipo === 'VENTA_FIADA') {
                if (!breakdown['fiado']) {
                    breakdown['fiado'] = { totalUsd: 0, totalBs: 0, count: 0, label: 'Fiado (Por Cobrar)', currency: 'FIADO' };
                }
                breakdown['fiado'].totalUsd += sale.totalUsd || 0;
                breakdown['fiado'].totalBs += sale.totalBs || 0;
                breakdown['fiado'].count += 1;
                return;
            }

            if (sale.payments && sale.payments.length > 0) {
                sale.payments.forEach(p => {
                    const methodId = p.methodId || 'efectivo_bs';
                    if (!breakdown[methodId]) {
                        const label = p.methodLabel || getPaymentLabel(methodId) || toTitleCase(methodId.replace(/_/g, ' '));
                        breakdown[methodId] = { totalUsd: 0, totalBs: 0, count: 0, label, currency: p.currency || 'BS' };
                    }
                    breakdown[methodId].totalUsd += p.amountUsd || 0;
                    breakdown[methodId].totalBs += p.amountBs || 0;
                    breakdown[methodId].count += 1;
                });
            } else {
                const methodId = sale.paymentMethod || sale.metodoPago || 'efectivo_bs';
                if (!breakdown[methodId]) {
                    const label = getPaymentLabel(methodId) || toTitleCase(methodId.replace(/_/g, ' '));
                    let currency = 'BS';
                    if (methodId.includes('usd') || methodId.includes('zelle') || methodId.includes('binance')) currency = 'USD';
                    else if (methodId.includes('cop')) currency = 'COP';
                    breakdown[methodId] = { totalUsd: 0, totalBs: 0, count: 0, label, currency };
                }
                breakdown[methodId].totalUsd += sale.totalUsd || 0;
                breakdown[methodId].totalBs += sale.totalBs || 0;
                breakdown[methodId].count += 1;
            }
        });

        return Object.entries(breakdown)
            .sort(([, a], [, b]) => b.totalUsd - a.totalUsd);
    }, [sales, activeShiftApertura]);

    // Ticket promedio del turno activo
    const activeShiftAvgTicket = useMemo(() => {
        if (activeShiftSales.length === 0) return 0;
        return activeShiftMetrics.totalUsd / activeShiftSales.length;
    }, [activeShiftMetrics.totalUsd, activeShiftSales.length]);


    // ── HISTORIAL DE CIERRES DE CAJA ──

    // Reconstruir cierres agrupados por cierreId
    const registerCloses = useMemo(() => {
        const explicitCloses = sales.filter(s => s.tipo === 'REGISTRO_CIERRE');
        
        // Agrupar transacciones cerradas por cierreId
        const groups = {};
        sales.forEach(s => {
            if (s.cierreId && s.tipo !== 'REGISTRO_CIERRE') {
                const cId = s.cierreId;
                if (!groups[cId]) {
                    groups[cId] = {
                        cierreId: cId,
                        timestamp: new Date(cId).toISOString(),
                        sales: []
                    };
                }
                groups[cId].sales.push(s);
            }
        });

        // Formatear cada grupo combinando datos explícitos de arqueo si existen
        return Object.values(groups).map(g => {
            const explicit = explicitCloses.find(ec => ec.cierreId === g.cierreId);
            
            // Filtrar para métricas generales y de caja
            const salesForStats = g.sales.filter(s => s.tipo === 'VENTA' || s.tipo === 'VENTA_FIADA' || s.tipo === 'VENTA_CASHEA');
            const salesForCashFlow = g.sales.filter(s => {
                if (s.tipo === 'PAGO_PROVEEDOR' && s.afectaCaja === false) return false;
                return s.tipo === 'VENTA' || s.tipo === 'VENTA_FIADA' || s.tipo === 'VENTA_CASHEA' || s.tipo === 'COBRO_DEUDA' || s.tipo === 'PAGO_PROVEEDOR' || s.tipo === 'GASTO_INTERNO';
            });
            
            const totalUsd = salesForStats.reduce((sum, s) => sum + (s.totalUsd || 0), 0);
            const totalBs = salesForStats.reduce((sum, s) => sum + (s.totalBs || 0), 0);
            const totalItems = salesForStats.reduce((sum, s) => sum + (s.items ? s.items.reduce((is, it) => is + it.qty, 0) : 0), 0);
            
            // Reconstruir desglose de pagos del cierre
            const breakdown = {};
            salesForCashFlow.forEach(sale => {
                if (sale.tipo === 'VENTA_FIADA') {
                    if (!breakdown['fiado']) {
                        breakdown['fiado'] = { totalUsd: 0, totalBs: 0, count: 0, label: 'Fiado (Por Cobrar)', currency: 'FIADO' };
                    }
                    breakdown['fiado'].totalUsd += sale.totalUsd || 0;
                    breakdown['fiado'].totalBs += sale.totalBs || 0;
                    breakdown['fiado'].count += 1;
                    return;
                }
                if (sale.payments && sale.payments.length > 0) {
                    sale.payments.forEach(p => {
                        const mId = p.methodId || 'efectivo_bs';
                        if (!breakdown[mId]) {
                            breakdown[mId] = { totalUsd: 0, totalBs: 0, count: 0, label: p.methodLabel || getPaymentLabel(mId), currency: p.currency || 'BS' };
                        }
                        breakdown[mId].totalUsd += p.amountUsd || 0;
                        breakdown[mId].totalBs += p.amountBs || 0;
                        breakdown[mId].count += 1;
                    });
                } else {
                    const mId = sale.paymentMethod || sale.metodoPago || 'efectivo_bs';
                    if (!breakdown[mId]) {
                        breakdown[mId] = { totalUsd: 0, totalBs: 0, count: 0, label: getPaymentLabel(mId), currency: mId.includes('usd') ? 'USD' : 'BS' };
                    }
                    breakdown[mId].totalUsd += sale.totalUsd || 0;
                    breakdown[mId].totalBs += sale.totalBs || 0;
                    breakdown[mId].count += 1;
                }
            });

            const sortedBreakdown = Object.entries(breakdown)
                .sort(([, a], [, b]) => b.totalUsd - a.totalUsd);

            const apertura = g.sales.find(s => s.tipo === 'APERTURA_CAJA') || null;

            return {
                cierreId: g.cierreId,
                timestamp: g.timestamp,
                sales: salesForStats,
                totalUsd,
                totalBs,
                totalItems,
                paymentBreakdown: sortedBreakdown,
                apertura,
                reconData: explicit?.summary?.reconData || null,
                cashier: explicit?.summary?.cashier || { nombre: 'Cajero', rol: 'CAJERO' }
            };
        }).sort((a, b) => b.cierreId - a.cierreId);
    }, [sales]);

    // Establecer primer cierre por defecto si cambia la lista
    useEffect(() => {
        if (registerCloses.length > 0 && !selectedCierreId) {
            setSelectedCierreId(registerCloses[0].cierreId);
        }
    }, [registerCloses, selectedCierreId]);


    // ── COMPONENTES GENERALES ──

    // Productos Críticos (Stock <= 0)
    const criticalProducts = useMemo(() => {
        return products
            .filter(p => p.stock <= 0)
            .slice(0, 10);
    }, [products]);

    // Desvincular Monitor
    const handleDisconnect = async () => {
        triggerHaptic?.();
        
        try {
            if (supabaseCloud && pairedDeviceId) {
                await supabaseCloud.rpc('unpair_monitor', { p_device_id: pairedDeviceId });
            }
        } catch (err) {
            console.warn('[OwnerMonitorView] Error al llamar unpair RPC:', err);
        }

        localStorage.removeItem('pda_paired_device_id');
        localStorage.removeItem('pda_pairing_mode');
        localStorage.removeItem('monitor_last_sync');
        localStorage.removeItem('business_name');
        localStorage.removeItem('business_rif');
        
        try {
            const { default: localforage } = await import('localforage');
            localforage.config({ name: 'ElSpotPOSApp', storeName: 'el_spot_app_data' });
            await localforage.clear();
        } catch (e) {
            console.warn(e);
        }

        showToast('Dispositivo desvinculado con éxito', 'success');
        setTimeout(() => window.location.reload(), 1000);
    };

    // Formateadores
    const formatTime = (isoString) => {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch {
            return '';
        }
    };

    // Determinar si la caja está actualmente inactiva (sin turno abierto)
    const isShiftActive = activeShiftApertura !== null || activeShiftSales.length > 0;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-sans pb-12 transition-colors duration-300 overflow-x-hidden">
            {/* Header del Monitor — v1.4.0 High Contrast Obsidian El Spot */}
            <header className="sticky top-0 z-50 bg-black backdrop-blur-md border-b border-zinc-800 px-4 py-2.5 flex items-center justify-between shadow-xl">
                <div className="flex items-center gap-3">
                    <img 
                        src="/logo-header-negro.png" 
                        alt="El Spot Concept Store" 
                        className="h-10 sm:h-12 w-auto object-contain drop-shadow-sm" 
                        onError={(e) => {
                            if (!e.currentTarget.dataset.fallback) {
                                e.currentTarget.dataset.fallback = 'true';
                                e.currentTarget.src = '/logo.png';
                            }
                        }}
                    />
                    <div className="hidden sm:flex flex-col border-l border-zinc-800 pl-3">
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                            <ShieldCheck size={12} className="text-emerald-400" /> Modo Supervisor
                        </span>
                        <p className="text-[10px] text-zinc-400 font-bold truncate max-w-[180px]">
                            {localStorage.getItem('business_name') || 'El Spot Concept Store'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    {/* Badge Modo Supervisor en móvil */}
                    <div className="sm:hidden flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg text-[9px] font-black text-emerald-400 uppercase tracking-wider">
                        <ShieldCheck size={11} /> Supervisor
                    </div>

                    {/* Status Badge */}
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase shadow-sm transition-colors duration-300 ${
                        isConnected 
                            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
                            : 'bg-rose-500/10 border border-rose-500/30 text-rose-400 animate-pulse'
                    }`}>
                        {isConnected ? (
                            <>
                                <Wifi size={12} className="shrink-0 text-emerald-400" />
                                <span>En Vivo</span>
                            </>
                        ) : (
                            <>
                                <WifiOff size={12} className="shrink-0 text-rose-400" />
                                <span>Desconectado</span>
                            </>
                        )}
                    </div>

                    <button 
                        onClick={() => { triggerHaptic?.(); setShowRateModal(true); }}
                        className="px-3 py-1.5 rounded-xl text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 bg-emerald-500/10 transition-colors active:scale-95 flex items-center gap-1.5 text-xs font-bold shrink-0"
                        title="Cambiar Tasa Remota"
                    >
                        <TrendingUp size={14} />
                        <span className="hidden sm:inline">Cambiar Tasa</span>
                    </button>

                    <button 
                        onClick={async () => { 
                            triggerHaptic?.(); 
                            await triggerRefresh(); 
                            showToast?.('Datos actualizados', 'success');
                        }}
                        disabled={syncLoading}
                        className="p-2 rounded-xl text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 border border-zinc-800 bg-zinc-900 transition-colors disabled:opacity-50 active:scale-95"
                        title="Actualizar Datos"
                    >
                        <RefreshCw size={15} className={syncLoading ? "animate-spin text-emerald-400" : ""} />
                    </button>

                    <button 
                        onClick={() => { triggerHaptic?.(); setShowDisconnectConfirm(true); }}
                        className="p-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 border border-zinc-800 bg-zinc-900 transition-colors active:scale-95"
                        title="Desvincular Dispositivo"
                    >
                        <LogOut size={15} />
                    </button>
                </div>
            </header>

            {/* Banner Offline */}
            {!isConnected && lastSync && (
                <div className="mx-4 mt-4 p-3.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 rounded-2xl flex gap-3 items-center text-amber-800 dark:text-amber-400 shadow-sm animate-fade-in">
                    <Clock size={18} className="shrink-0" />
                    <p className="text-xs font-semibold leading-relaxed">
                        Sin conexión a internet. Mostrando últimos datos sincronizados el {lastSync.toLocaleDateString()} a las {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
                    </p>
                </div>
            )}

            {/* Contenido Principal */}
            <main className="max-w-7xl mx-auto px-4 mt-6 space-y-6">
                {/* Selector de Pestañas */}
                <div className="flex bg-slate-200/60 dark:bg-slate-900/60 p-1 rounded-2xl w-full max-w-md shadow-sm">
                    <button
                        onClick={() => { triggerHaptic?.(); setViewTab('activo'); }}
                        className={`flex-1 py-2 px-2.5 text-center text-[10px] sm:text-xs font-black rounded-xl transition-all shrink-0 ${
                            viewTab === 'activo' 
                                ? 'bg-white dark:bg-slate-800 text-slate-850 dark:text-white shadow-sm' 
                                : 'text-slate-400 hover:text-slate-650 dark:hover:text-slate-200'
                        }`}
                    >
                        <span className="sm:hidden">Turno Activo</span>
                        <span className="hidden sm:inline">Turno Activo (En Vivo)</span>
                    </button>
                    <button
                        onClick={() => { triggerHaptic?.(); setViewTab('cierres'); }}
                        className={`flex-1 py-2 px-2.5 text-center text-[10px] sm:text-xs font-black rounded-xl transition-all shrink-0 ${
                            viewTab === 'cierres' 
                                ? 'bg-white dark:bg-slate-800 text-slate-850 dark:text-white shadow-sm' 
                                : 'text-slate-400 hover:text-slate-650 dark:hover:text-slate-200'
                        }`}
                    >
                        <span className="sm:hidden">Cierres</span>
                        <span className="hidden sm:inline">Cierres de Caja</span>
                    </button>
                    <button
                        onClick={() => { triggerHaptic?.(); setViewTab('inventario'); }}
                        className={`flex-1 py-2 px-2.5 text-center text-[10px] sm:text-xs font-black rounded-xl transition-all shrink-0 ${
                            viewTab === 'inventario' 
                                ? 'bg-white dark:bg-slate-800 text-slate-850 dark:text-white shadow-sm' 
                                : 'text-slate-400 hover:text-slate-650 dark:hover:text-slate-200'
                        }`}
                    >
                        <span>Inventario</span>
                    </button>
                </div>

                {/* ── SECCIÓN 1: TURNO ACTIVO ── */}
                {viewTab === 'activo' && (
                    <div className="space-y-6">
                        {/* Fila 1: Tarjetas de Métricas de Turno Activo */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            {/* Ventas Turno USD */}
                            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex flex-col justify-between min-h-[105px] sm:min-h-[125px]">
                                <div className="flex items-center justify-between w-full">
                                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">Vendido Turno (USD)</span>
                                    <div className="w-7 h-7 sm:w-9 sm:h-9 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl flex items-center justify-center text-emerald-500 shrink-0">
                                        <DollarSign size={16} />
                                    </div>
                                </div>
                                <div className="mt-2.5 min-w-0">
                                    <span className="font-outfit text-base sm:text-xl lg:text-2xl font-black text-slate-800 dark:text-white tabular-nums block break-words leading-none">
                                        ${activeShiftMetrics.totalUsd.toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            {/* Ventas Turno Bs */}
                            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex flex-col justify-between min-h-[105px] sm:min-h-[125px]">
                                <div className="flex items-center justify-between w-full">
                                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">Vendido Turno (Bs)</span>
                                    <div className="w-7 h-7 sm:w-9 sm:h-9 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl flex items-center justify-center text-emerald-500 shrink-0">
                                        <Coins size={16} />
                                    </div>
                                </div>
                                <div className="mt-2.5 min-w-0">
                                    <span className="font-outfit text-base sm:text-xl lg:text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums block break-words leading-none">
                                        {formatBs(activeShiftMetrics.totalBs)} Bs
                                    </span>
                                    <span className="text-[9px] text-slate-400 block font-medium mt-1">
                                        Tasa: {bcvRate ? `${bcvRate.toFixed(2)} Bs/$` : 'N/D'}
                                    </span>
                                </div>
                            </div>

                            {/* Margen Estimado Turno */}
                            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex flex-col justify-between min-h-[105px] sm:min-h-[125px]">
                                <div className="flex items-center justify-between w-full">
                                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">Ganancia Turno</span>
                                    <div className="w-7 h-7 sm:w-9 sm:h-9 bg-blue-50 dark:bg-blue-950/20 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                                        <TrendingUp size={16} />
                                    </div>
                                </div>
                                <div className="mt-2.5 min-w-0">
                                    <span className="font-outfit text-base sm:text-xl lg:text-2xl font-black text-blue-600 dark:text-blue-400 tabular-nums block break-words leading-none">
                                        ${activeShiftMetrics.profitUsd.toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            {/* Cajero Activo */}
                            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex flex-col justify-between min-h-[105px] sm:min-h-[125px]">
                                <div className="flex items-center justify-between w-full">
                                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">Cajero de Turno</span>
                                    <div className="w-7 h-7 sm:w-9 sm:h-9 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex items-center justify-center text-slate-450 shrink-0">
                                        <Users size={16} />
                                    </div>
                                </div>
                                <div className="mt-2.5 min-w-0">
                                    <span className="text-sm sm:text-base lg:text-lg font-black text-slate-800 dark:text-white block truncate leading-none">
                                        {isShiftActive ? activeCashier.nombre : 'Ninguno'}
                                    </span>
                                    <span className="text-[9px] text-slate-400 block font-medium mt-1">
                                        {activeShiftMetrics.count} {activeShiftMetrics.count === 1 ? 'venta' : 'ventas'} en curso
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Si la caja no está activa */}
                        {!isShiftActive ? (
                            <div className="py-16 px-6 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-4 max-w-lg mx-auto flex flex-col items-center">
                                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 text-slate-450 rounded-full">
                                    <Clock size={42} />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-sm font-black text-slate-800 dark:text-white">Caja Cerrada / Turno Inactivo</h4>
                                    <p className="text-xs text-slate-400 leading-relaxed px-4">
                                        No hay un turno de caja activo en este momento. Abre la caja en el dispositivo del punto de venta para comenzar a registrar movimientos en vivo.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Desglose Diario por Método de Pago */}
                                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
                                    <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800/80">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                                                <Wallet size={18} className="text-violet-500" />
                                                Ingresos del Turno Activo
                                            </h3>
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
                                                En Curso
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-5 sm:p-6">
                                        {/* Apertura de caja */}
                                        <div className="mb-5 p-4 bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/50 rounded-2xl">
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="w-7 h-7 bg-amber-100 dark:bg-amber-950/30 rounded-lg flex items-center justify-center">
                                                    <ArrowDownRight size={14} className="text-amber-600 dark:text-amber-400" />
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Fondo de Apertura de Turno</span>
                                            </div>
                                            {activeShiftApertura ? (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                                    <div className="space-y-0.5">
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">USD Inicial</span>
                                                        <span className="font-outfit text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums">${(activeShiftApertura.openingUsd || 0).toFixed(2)}</span>
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Bs Inicial</span>
                                                        <span className="font-outfit text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums">{formatBs(activeShiftApertura.openingBs || 0)} Bs</span>
                                                    </div>
                                                    {activeShiftApertura.openingCop > 0 && (
                                                        <div className="space-y-0.5">
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase block">COP Inicial</span>
                                                            <span className="font-outfit text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums">{(activeShiftApertura.openingCop || 0).toLocaleString()} COP</span>
                                                        </div>
                                                    )}
                                                    <div className="space-y-0.5 col-span-2 sm:col-span-3">
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Hora de apertura</span>
                                                        <span className="text-xs font-bold text-slate-500">{formatTime(activeShiftApertura.timestamp)}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-slate-400 font-bold">Caja iniciada sin fondo declarado.</p>
                                            )}
                                        </div>

                                        {/* Tabla desglose */}
                                        {activeShiftPaymentBreakdown.length === 0 ? (
                                            <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                                                <Wallet size={28} className="mx-auto text-slate-300 mb-2" />
                                                <p className="text-xs font-black">Sin transacciones registradas</p>
                                                <p className="text-[10px] text-slate-450 mt-1">El desglose por método de pago aparecerá aquí.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2.5">
                                                {activeShiftPaymentBreakdown.map(([methodId, data]) => {
                                                    const IconComp = getMethodIcon(methodId);
                                                    const pct = activeShiftMetrics.totalUsd > 0 
                                                        ? Math.round((data.totalUsd / activeShiftMetrics.totalUsd) * 100) 
                                                        : 0;

                                                    return (
                                                        <div key={methodId} className="flex items-center gap-3 p-3.5 bg-slate-50/70 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/40 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                            <div className="w-9 h-9 bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0 shadow-sm">
                                                                <IconComp size={16} />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-xs font-black text-slate-700 dark:text-slate-200 truncate">{data.label}</span>
                                                                    <span className="font-outfit text-xs font-black text-slate-800 dark:text-white tabular-nums shrink-0">${data.totalUsd.toFixed(2)}</span>
                                                                </div>
                                                                <div className="flex items-center justify-between gap-2 mt-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[9px] font-bold text-slate-400">{data.count} {data.count === 1 ? 'transacción' : 'transacciones'}</span>
                                                                        <span className="text-[9px] font-black text-violet-500 bg-violet-50 dark:bg-violet-950/20 dark:text-violet-400 px-1.5 py-0.5 rounded-md">{pct}%</span>
                                                                    </div>
                                                                    <span className="font-outfit text-[10px] font-bold text-slate-400 tabular-nums">{formatBs(data.totalBs)} Bs</span>
                                                                </div>
                                                                <div className="mt-1.5 h-1 bg-slate-200/60 dark:bg-slate-800 rounded-full overflow-hidden">
                                                                    <div 
                                                                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500" 
                                                                        style={{ width: `${Math.max(2, pct)}%` }} 
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                {/* Resumen total */}
                                                <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between px-1">
                                                    <div className="flex items-center gap-2">
                                                        <Hash size={14} className="text-slate-400" />
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                                            Total Acumulado ({activeShiftMetrics.count} {activeShiftMetrics.count === 1 ? 'venta' : 'ventas'})
                                                        </span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="font-outfit text-sm font-black text-slate-850 dark:text-white tabular-nums">${activeShiftMetrics.totalUsd.toFixed(2)}</span>
                                                        <span className="font-outfit text-[10px] font-bold text-slate-400 ml-2">{formatBs(activeShiftMetrics.totalBs)} Bs</span>
                                                    </div>
                                                </div>

                                                {/* Ticket promedio */}
                                                <div className="flex items-center justify-between px-1 mt-1">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ticket Promedio</span>
                                                    <span className="font-outfit text-xs font-black text-blue-650 dark:text-blue-400 tabular-nums">${activeShiftAvgTicket.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Dashboard de Columnas */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Columna Izquierda: Listado de Ventas en Vivo */}
                                    <div className="lg:col-span-2 space-y-4">
                                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800 p-6 shadow-sm">
                                            <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                                <FileText size={18} className="text-slate-400" />
                                                Ventas del Turno en Tiempo Real
                                            </h3>
                                            
                                            {loadingData || syncLoading ? (
                                                <div className="py-8 flex justify-center text-slate-400 gap-2 items-center">
                                                    <RefreshCw className="animate-spin" size={18} />
                                                    <span className="text-xs font-bold">Cargando transacciones...</span>
                                                </div>
                                            ) : activeShiftSales.length === 0 ? (
                                                <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                                                    <Clock size={36} className="mx-auto text-slate-350 dark:text-slate-700 mb-2" />
                                                    <p className="text-xs font-black">No se han registrado ventas en este turno</p>
                                                    <p className="text-[10px] text-slate-400 mt-1">Las ventas de la caja activa aparecerán aquí al instante.</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1">
                                                    {activeShiftSales.slice().reverse().map(sale => (
                                                        <div 
                                                            key={sale.id}
                                                            className="p-4 border border-slate-100 dark:border-slate-800/80 hover:border-slate-200 rounded-2xl bg-slate-50/50 dark:bg-slate-800/20 flex justify-between items-start transition-colors"
                                                        >
                                                            <div className="space-y-1 min-w-0 flex-1 pr-3">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
                                                                        #{sale.id.slice(-4).toUpperCase()}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-400 font-bold">{formatTime(sale.timestamp)}</span>
                                                                </div>
                                                                <p className="text-xs font-black text-slate-700 dark:text-slate-200 mt-1.5 truncate">
                                                                    {sale.items?.map(i => `${i.name} (x${i.qty})`).join(', ') || 'Venta de productos'}
                                                                </p>
                                                                <div className="flex gap-2 items-center mt-1">
                                                                    <span className="text-[10px] font-black text-slate-400 uppercase">{sale.metodoPago || sale.paymentMethod || 'Efectivo'}</span>
                                                                    {sale.clientName && (
                                                                        <span className="text-[10px] text-slate-400 font-bold">• {sale.clientName}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="text-right space-y-0.5 shrink-0">
                                                                <span className="font-outfit text-sm font-black text-slate-800 dark:text-white block">${(sale.totalUsd || 0).toFixed(2)}</span>
                                                                <span className="font-outfit text-[10px] font-bold text-slate-400 block">{formatBs(sale.totalBs || 0)} Bs</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Columna Derecha: Stock Crítico */}
                                    <div className="space-y-6">
                                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800 p-6 shadow-sm">
                                            <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                                <Package size={18} className="text-rose-500" />
                                                Stock Crítico (Agotados)
                                            </h3>

                                            {criticalProducts.length === 0 ? (
                                                <div className="py-6 text-center text-slate-400">
                                                    <p className="text-xs font-black text-emerald-600">¡Todo en orden!</p>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">No hay productos sin inventario.</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {criticalProducts.map(prod => (
                                                        <div key={prod.id} className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                                            <div className="min-w-0 pr-2">
                                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block truncate">{prod.name}</span>
                                                                <span className="font-outfit text-[10px] text-slate-400">Precio: ${prod.price?.toFixed(2)}</span>
                                                            </div>
                                                            <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-rose-600 shrink-0">
                                                                Agotado
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── SECCIÓN 2: CIERRES DE CAJA (HISTORIAL + DETALLE ARQUEO) ── */}
                {viewTab === 'cierres' && (
                    <div>
                        {registerCloses.length === 0 ? (
                            <div className="py-16 px-6 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-4 max-w-lg mx-auto flex flex-col items-center">
                                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 text-slate-450 rounded-full">
                                    <ShieldCheck size={42} />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-sm font-black text-slate-800 dark:text-white">Sin cierres registrados</h4>
                                    <p className="text-xs text-slate-400 leading-relaxed px-4">
                                        Cuando el cajero complete un cierre de caja en el dispositivo principal, aparecerá el arqueo detallado, reporte contable y discrepancias aquí.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Selector / Lista de Cierres */}
                                <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-3xl p-5 shadow-sm h-fit space-y-4">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Historial de Cierres</span>
                                    <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                                        {registerCloses.map(c => {
                                            const dateObj = new Date(c.cierreId);
                                            const isSelected = selectedCierreId === c.cierreId || (!selectedCierreId && registerCloses[0].cierreId === c.cierreId);
                                            return (
                                                <button
                                                    key={c.cierreId}
                                                    onClick={() => setSelectedCierreId(c.cierreId)}
                                                    className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                                                        isSelected 
                                                            ? 'bg-emerald-500/10 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-400' 
                                                            : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 border-slate-200/65 dark:border-slate-800/60 text-slate-600 dark:text-slate-300'
                                                    }`}
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <span className="text-xs font-black block truncate">
                                                            Cierre #{c.cierreNumber || String(c.cierreId).slice(-4)}
                                                        </span>
                                                        <span className="text-[9px] text-slate-400 font-bold block mt-0.5">
                                                            {dateObj.toLocaleDateString()} • {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <span className="font-outfit text-xs font-black tabular-nums shrink-0">${c.totalUsd.toFixed(2)}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Zona de Resumen del Cierre Seleccionado */}
                                <div className="lg:col-span-2 space-y-6">
                                    {(() => {
                                        const activeC = registerCloses.find(c => c.cierreId === selectedCierreId) || registerCloses[0];
                                        if (!activeC) return null;

                                        const expectedUsd = activeC.reconData?.expectedUsd ?? activeC.totalUsd;
                                        // Declarados
                                        const declaredUsd = activeC.reconData?.cashUsd ?? null;
                                        const declaredBs = activeC.reconData?.cashBs ?? null;
                                        const declaredCop = activeC.reconData?.cashCop ?? null;
                                        
                                        const diffUsd = declaredUsd !== null ? declaredUsd - expectedUsd : null;
                                        const isCuadrado = declaredUsd === null || Math.abs(diffUsd) <= 0.50;

                                        return (
                                            <div className="space-y-6 animate-fade-in">
                                                {/* Resumen Principal */}
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                                    <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
                                                        <span className="text-[9px] font-black uppercase text-slate-400">Total USD</span>
                                                        <strong className="font-outfit text-base sm:text-lg font-black text-slate-800 dark:text-white block mt-1">${activeC.totalUsd.toFixed(2)}</strong>
                                                    </div>
                                                    <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
                                                        <span className="text-[9px] font-black uppercase text-slate-400">Total Bs</span>
                                                        <strong className="font-outfit text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 block mt-1">{formatBs(activeC.totalBs)} Bs</strong>
                                                    </div>
                                                    <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
                                                        <span className="text-[9px] font-black uppercase text-slate-400">Cajero</span>
                                                        <strong className="text-xs font-black text-slate-700 dark:text-slate-200 block truncate mt-1">{activeC.cashier?.nombre || 'Cajero'}</strong>
                                                    </div>
                                                    <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
                                                        <span className="text-[9px] font-black uppercase text-slate-400">Arqueo Físico</span>
                                                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md inline-block mt-1 ${
                                                            declaredUsd === null 
                                                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-500' 
                                                                : isCuadrado 
                                                                    ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' 
                                                                    : 'bg-amber-100 dark:bg-amber-955/30 text-amber-700 dark:text-amber-400 animate-pulse'
                                                        }`}>
                                                            {declaredUsd === null ? 'Sin Declarar' : isCuadrado ? 'Cuadrado' : 'Diferencia'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Arqueo Detallado de Efectivo */}
                                                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800 p-5 shadow-sm">
                                                    <h3 className="text-xs font-black text-slate-800 dark:text-white mb-4 uppercase tracking-wider">Cuadre de Efectivo</h3>
                                                    
                                                    {declaredUsd === null ? (
                                                        <div className="py-6 px-4 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/30 rounded-2xl text-center">
                                                            <AlertTriangle size={24} className="text-amber-500 mx-auto mb-1.5" />
                                                            <p className="text-xs font-black text-amber-800 dark:text-amber-400">Cierre simplificado sin arqueo</p>
                                                            <p className="text-[10px] text-slate-500 mt-0.5">El cajero completó el cierre de caja sin declarar el saldo físico.</p>
                                                        </div>
                                                    ) : (
                                                        <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-x-auto custom-scrollbar text-xs">
                                                            <div className="min-w-[320px]">
                                                                <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-850/50 text-[10px] font-black text-slate-400 uppercase border-b border-slate-150 dark:border-slate-800">
                                                                <span>Moneda</span>
                                                                <span className="text-center">Esperado</span>
                                                                <span className="text-center">Declarado</span>
                                                                <span className="text-right">Diferencia</span>
                                                            </div>

                                                            {/* USD Row */}
                                                            <div className="grid grid-cols-4 gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 items-center">
                                                                <span className="font-bold text-slate-700 dark:text-slate-200">Dólares ($)</span>
                                                                <span className="font-outfit font-mono text-slate-400 text-center">${expectedUsd.toFixed(2)}</span>
                                                                <span className="font-outfit font-mono font-black text-slate-700 dark:text-white text-center">${declaredUsd.toFixed(2)}</span>
                                                                <span className={`font-outfit font-mono font-black text-right ${
                                                                    diffUsd === 0 ? 'text-slate-400' : diffUsd > 0 ? 'text-emerald-600' : 'text-rose-600'
                                                                }`}>
                                                                    {diffUsd > 0 ? '+' : ''}{diffUsd.toFixed(2)}
                                                                </span>
                                                            </div>

                                                            {/* Bs Row */}
                                                            <div className="grid grid-cols-4 gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 items-center">
                                                                <span className="font-bold text-slate-700 dark:text-slate-200">Bolívares (Bs)</span>
                                                                <span className="font-outfit font-mono text-slate-400 text-center">{formatBs(activeC.reconData?.expectedBs || 0)}</span>
                                                                <span className="font-outfit font-mono font-black text-slate-700 dark:text-white text-center">{formatBs(declaredBs)}</span>
                                                                <span className={`font-outfit font-mono font-black text-right ${
                                                                    (declaredBs - (activeC.reconData?.expectedBs || 0)) === 0 
                                                                        ? 'text-slate-400' 
                                                                        : (declaredBs - (activeC.reconData?.expectedBs || 0)) > 0 
                                                                            ? 'text-emerald-600' 
                                                                            : 'text-rose-600'
                                                                }`}>
                                                                    {(declaredBs - (activeC.reconData?.expectedBs || 0)) > 0 ? '+' : ''}
                                                                    {formatBs(declaredBs - (activeC.reconData?.expectedBs || 0))}
                                                                </span>
                                                            </div>

                                                            {/* COP Row si aplica */}
                                                            {activeC.reconData?.expectedCop > 0 && (
                                                                <div className="grid grid-cols-4 gap-2 px-4 py-3 items-center">
                                                                    <span className="font-bold text-slate-700 dark:text-slate-200">Pesos (COP)</span>
                                                                    <span className="font-outfit font-mono text-slate-400 text-center">{(activeC.reconData.expectedCop).toLocaleString()}</span>
                                                                    <span className="font-outfit font-mono font-black text-slate-700 dark:text-white text-center">{(declaredCop).toLocaleString()}</span>
                                                                    <span className={`font-outfit font-mono font-black text-right ${
                                                                        (declaredCop - activeC.reconData.expectedCop) === 0 
                                                                            ? 'text-slate-400' 
                                                                            : (declaredCop - activeC.reconData.expectedCop) > 0 
                                                                                ? 'text-emerald-600' 
                                                                                : 'text-rose-600'
                                                                    }`}>
                                                                        {(declaredCop - activeC.reconData.expectedCop) > 0 ? '+' : ''}
                                                                        {(declaredCop - activeC.reconData.expectedCop).toLocaleString()}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Desglose de Métodos de Pago */}
                                                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800 p-5 shadow-sm">
                                                    <h3 className="text-xs font-black text-slate-800 dark:text-white mb-4 uppercase tracking-wider">Desglose de Ingresos</h3>
                                                    <div className="space-y-2.5">
                                                        {activeC.paymentBreakdown.map(([methodId, data]) => {
                                                            const IconComp = getMethodIcon(methodId);
                                                            const pct = activeC.totalUsd > 0 ? Math.round((data.totalUsd / activeC.totalUsd) * 100) : 0;
                                                            return (
                                                                <div key={methodId} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 rounded-2xl">
                                                                    <div className="w-8 h-8 bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-700 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                                                                        <IconComp size={14} />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center justify-between text-xs">
                                                                            <span className="font-black text-slate-700 dark:text-slate-200">{data.label}</span>
                                                                            <span className="font-outfit font-black text-slate-800 dark:text-white">${data.totalUsd.toFixed(2)}</span>
                                                                        </div>
                                                                        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                                                                            <span>{data.count} tx • {pct}%</span>
                                                                            <span className="font-outfit">{formatBs(data.totalBs)} Bs</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Ventas del Cierre */}
                                                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800 p-6 shadow-sm">
                                                    <h3 className="text-xs font-black text-slate-800 dark:text-white mb-4 uppercase tracking-wider">Ventas Cerradas en este Turno</h3>
                                                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                                                        {activeC.sales.slice().reverse().map(sale => (
                                                            <div key={sale.id} className="p-3.5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-800/20 flex justify-between items-center text-xs">
                                                                    <div className="min-w-0 flex-1 pr-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/40">
                                                                                #{sale.id.slice(-4).toUpperCase()}
                                                                            </span>
                                                                            <span className="text-[9px] text-slate-400 font-bold">{formatTime(sale.timestamp)}</span>
                                                                        </div>
                                                                        <p className="font-black text-slate-700 dark:text-slate-250 truncate mt-1">
                                                                            {sale.items?.map(i => `${i.name} (x${i.qty})`).join(', ') || 'Venta de productos'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="text-right shrink-0">
                                                                        <span className="font-outfit font-black text-slate-850 dark:text-white block">${(sale.totalUsd || 0).toFixed(2)}</span>
                                                                        <span className="font-outfit text-[9px] text-slate-400 block">{formatBs(sale.totalBs || 0)} Bs</span>
                                                                    </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── SECCIÓN 3: INVENTARIO EN TIEMPO REAL ── */}
                {viewTab === 'inventario' && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Fila de Resumen de Inventario */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            {/* Total Productos */}
                            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex flex-col justify-between min-h-[90px] sm:min-h-[110px]">
                                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">Total Artículos</span>
                                <div className="flex items-end justify-between mt-1">
                                    <span className="font-outfit text-xl sm:text-2xl font-black text-slate-800 dark:text-white tabular-nums leading-none">
                                        {inventoryMetrics.count}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-bold">{inventoryMetrics.totalQty} unds</span>
                                </div>
                            </div>

                            {/* Valorización Costo */}
                            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex flex-col justify-between min-h-[90px] sm:min-h-[110px]">
                                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">Valor Inventario (Costo)</span>
                                <div className="flex items-end justify-between mt-1">
                                    <span className="font-outfit text-xl sm:text-2xl font-black text-slate-800 dark:text-white tabular-nums leading-none">
                                        ${inventoryMetrics.totalCost.toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            {/* Valorización Venta */}
                            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex flex-col justify-between min-h-[90px] sm:min-h-[110px]">
                                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">Valor Estimado (Venta)</span>
                                <div className="flex items-end justify-between mt-1">
                                    <span className="font-outfit text-xl sm:text-2xl font-black text-slate-800 dark:text-white tabular-nums leading-none">
                                        ${inventoryMetrics.totalRetail.toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            {/* Ganancia Potencial */}
                            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex flex-col justify-between min-h-[90px] sm:min-h-[110px]">
                                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">Ganancia en Stock</span>
                                <div className="flex items-end justify-between mt-1">
                                    <span className="font-outfit text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 tabular-nums leading-none">
                                        ${inventoryMetrics.expectedProfit.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Barra de Filtro y Búsqueda */}
                        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
                            {/* Input de Búsqueda */}
                            <div className="relative flex-1">
                                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-450">
                                    <Search size={14} />
                                </span>
                                <input
                                    type="text"
                                    placeholder="Buscar producto por nombre o código..."
                                    value={searchTermInventario}
                                    onChange={(e) => setSearchTermInventario(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500/70 transition-colors"
                                />
                                {searchTermInventario && (
                                    <button 
                                        onClick={() => setSearchTermInventario('')}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-650"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            {/* Filtro de Segmentación de Stock */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
                                <button
                                    onClick={() => {
                                        triggerHaptic?.();
                                        setRemoteEditingProduct(null);
                                        setShowRemoteForm(true);
                                    }}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-2xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
                                >
                                    <Plus size={15} />
                                    <span>Nuevo Producto</span>
                                </button>

                                <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-2xl border border-slate-200/60 dark:border-slate-850 w-full sm:w-auto overflow-x-auto custom-scrollbar shadow-inner">
                                    <button
                                        onClick={() => { triggerHaptic?.(); setFilterStockInventario('todos'); }}
                                        className={`flex-1 shrink-0 whitespace-nowrap px-3 py-1.5 text-[10px] sm:text-xs font-black rounded-xl transition-all ${
                                            filterStockInventario === 'todos'
                                                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                                                : 'text-slate-450 hover:text-slate-650 dark:hover:text-slate-350'
                                        }`}
                                    >
                                        Todos ({inventoryMetrics.count})
                                    </button>
                                    <button
                                        onClick={() => { triggerHaptic?.(); setFilterStockInventario('bajo'); }}
                                        className={`flex-1 shrink-0 whitespace-nowrap px-3 py-1.5 text-[10px] sm:text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1 ${
                                            filterStockInventario === 'bajo'
                                                ? 'bg-amber-500 text-white shadow-sm'
                                                : 'text-amber-600 dark:text-amber-400 hover:text-amber-700'
                                        }`}
                                    >
                                        Bajo Stock ({inventoryMetrics.lowStockCount})
                                    </button>
                                    <button
                                        onClick={() => { triggerHaptic?.(); setFilterStockInventario('agotado'); }}
                                        className={`flex-1 shrink-0 whitespace-nowrap px-3 py-1.5 text-[10px] sm:text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1 ${
                                            filterStockInventario === 'agotado'
                                                ? 'bg-rose-500 text-white shadow-sm'
                                                : 'text-rose-600 dark:text-rose-400 hover:text-rose-700'
                                        }`}
                                    >
                                        Agotados ({inventoryMetrics.outOfStockCount})
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Listado de Productos en Tarjetas Independientes */}
                        <div className="space-y-3.5">
                            {filteredProducts.length === 0 ? (
                                <div className="py-16 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center space-y-3">
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 text-slate-300 dark:text-slate-600 rounded-full">
                                        <Package size={36} />
                                    </div>
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-black text-slate-700 dark:text-slate-200">No se encontraron productos</p>
                                        <p className="text-[10px] text-slate-450">Intenta buscando con otro término o cambiando los filtros.</p>
                                    </div>
                                </div>
                            ) : (
                                paginatedProducts.map((p) => {
                                    const stock = p.stock || 0;
                                    const minStock = p.minStock || 5;
                                    const isAgotado = stock <= 0;
                                    const isBajo = !isAgotado && stock <= minStock;
                                    const costVal = p.costUsd || p.costPrice || 0;
                                    const profitUsd = Math.max(0, p.priceUsd - costVal);
                                    const profitPct = p.priceUsd > 0 ? Math.round((profitUsd / p.priceUsd) * 100) : 0;

                                    return (
                                        <div key={p.id} className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-emerald-500/30 dark:hover:border-emerald-500/30 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4">
                                            {/* Encabezado: Nombre, Badges y Acciones (Editar/Borrar) */}
                                            <div className="flex items-start justify-between gap-3 min-w-0">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-white uppercase leading-tight">{p.name}</h4>
                                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${
                                                            isAgotado 
                                                                ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400' 
                                                                : isBajo 
                                                                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400' 
                                                                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'
                                                        }`}>
                                                            {isAgotado ? 'Agotado' : isBajo ? 'Bajo Stock' : 'Disponible'}
                                                        </span>
                                                        {p.hasWarranty && (p.warrantyDays > 0 || p.warrantyDays === null) && (
                                                            <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center gap-1 shrink-0">
                                                                <ShieldCheck size={9} />
                                                                {p.warrantyDays ? `${p.warrantyDays}d Garantía` : 'Garantía'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1 font-medium flex-wrap">
                                                        {p.barcode && (
                                                            <span className="flex items-center gap-1">
                                                                <Hash size={10} /> {p.barcode}
                                                            </span>
                                                        )}
                                                        <span>Categoría: {toTitleCase(p.category || 'Varios')}</span>
                                                    </div>
                                                </div>

                                                {/* Acciones Editar y Borrar en Móvil & Desktop */}
                                                <div className="flex items-center gap-1 shrink-0 bg-slate-100/70 dark:bg-slate-800/50 p-1 rounded-xl">
                                                    <button
                                                        onClick={() => {
                                                            triggerHaptic?.();
                                                            setRemoteEditingProduct(p);
                                                            setShowRemoteForm(true);
                                                        }}
                                                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-500 hover:bg-white dark:hover:bg-slate-700 transition-colors"
                                                        title="Editar producto remotamente"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteProduct(p)}
                                                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-500 hover:bg-white dark:hover:bg-slate-700 transition-colors"
                                                        title="Eliminar producto remotamente"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Sección de Datos Financieros + Stock Adjuster */}
                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 lg:gap-6 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800/60">
                                                {/* Bloque Financiero: Costo, Venta, Ganancia en 3 Mini Cajas */}
                                                <div className="grid grid-cols-3 gap-2 bg-slate-50/80 dark:bg-slate-800/30 p-2 rounded-2xl border border-slate-100 dark:border-slate-800/50 sm:bg-transparent sm:dark:bg-transparent sm:border-none sm:p-0 sm:gap-4 text-center sm:text-right">
                                                    {/* Costo */}
                                                    <div className="flex flex-col justify-center">
                                                        <span className="text-[8px] text-slate-400 uppercase font-black block">Costo</span>
                                                        <span className="font-outfit text-xs font-black text-slate-500 tabular-nums">${(p.costUsd || p.costPrice || 0).toFixed(2)}</span>
                                                    </div>
                                                    {/* Venta */}
                                                    <div className="flex flex-col justify-center border-x border-slate-200/50 dark:border-slate-700/40 px-1 sm:border-none sm:px-0">
                                                        <span className="text-[8px] text-slate-400 uppercase font-black block">Venta</span>
                                                        <span className="font-outfit text-xs font-black text-slate-800 dark:text-white tabular-nums block">${p.priceUsd.toFixed(2)}</span>
                                                        <span className="font-outfit text-[8px] text-slate-400 block tabular-nums leading-none mt-0.5">{bcvRate ? `${formatBs(p.priceUsd * bcvRate)} Bs` : 'N/D'}</span>
                                                    </div>
                                                    {/* Ganancia */}
                                                    <div className="flex flex-col justify-center">
                                                        <span className="text-[8px] text-slate-400 uppercase font-black block">Ganancia</span>
                                                        <span className="font-outfit text-xs font-black text-blue-600 dark:text-blue-400 tabular-nums block">${profitUsd.toFixed(2)}</span>
                                                        <span className="text-[8px] text-slate-400 block font-bold leading-none mt-0.5">+{profitPct}%</span>
                                                    </div>
                                                </div>

                                                {/* Stock con controles +/- */}
                                                <div className="flex items-center justify-center sm:justify-end gap-2">
                                                    <button
                                                        onClick={() => handleStockAdjust(p, -1)}
                                                        className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:text-slate-300 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 transition-colors active:scale-90 flex items-center justify-center shrink-0"
                                                        title="Disminuir 1 stock en caja"
                                                    >
                                                        <MinusCircle size={16} />
                                                    </button>

                                                    <div className={`flex-1 sm:flex-initial w-20 text-center py-1 px-2 rounded-2xl border ${
                                                        isAgotado 
                                                            ? 'bg-rose-50/50 border-rose-150/70 text-rose-700 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400' 
                                                            : isBajo 
                                                                ? 'bg-amber-50/50 border-amber-150/70 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-400' 
                                                                : 'bg-slate-50 border-slate-150/70 text-slate-700 dark:bg-slate-850/60 dark:border-slate-800 dark:text-slate-300'
                                                    }`}>
                                                        <span className="text-[7px] uppercase font-black block leading-none mb-0.5 text-slate-400">Stock</span>
                                                        <span className="font-outfit text-xs font-black tabular-nums leading-none">
                                                            {p.isWeight ? `${stock.toFixed(1)}k` : `${stock} u`}
                                                        </span>
                                                    </div>

                                                    <button
                                                        onClick={() => handleStockAdjust(p, 1)}
                                                        className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 dark:bg-slate-800 dark:hover:bg-emerald-950/40 dark:text-slate-300 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-700 transition-colors active:scale-90 flex items-center justify-center shrink-0"
                                                        title="Aumentar 1 stock en caja"
                                                    >
                                                        <PlusCircle size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Controles de Paginación */}
                        {totalPagesInventario > 1 && (
                            <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-4 py-3 sm:px-6 rounded-3xl border border-slate-200/60 dark:border-slate-800 shadow-sm mt-4">
                                <button
                                    onClick={() => {
                                        if (currentPageInventario > 1) {
                                            triggerHaptic?.();
                                            setCurrentPageInventario(prev => prev - 1);
                                        }
                                    }}
                                    disabled={currentPageInventario === 1}
                                    className="p-2 rounded-xl text-slate-500 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-slate-800 dark:hover:text-emerald-450 border border-slate-200 dark:border-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors duration-150"
                                >
                                    <ChevronLeft size={16} />
                                </button>

                                <span className="text-xs font-black text-slate-500 dark:text-slate-400">
                                    Página {currentPageInventario} de {totalPagesInventario}
                                    <span className="text-[10px] text-slate-450 font-medium ml-2">
                                        ({filteredProducts.length} productos)
                                    </span>
                                </span>

                                <button
                                    onClick={() => {
                                        if (currentPageInventario < totalPagesInventario) {
                                            triggerHaptic?.();
                                            setCurrentPageInventario(prev => prev + 1);
                                        }
                                    }}
                                    disabled={currentPageInventario === totalPagesInventario}
                                    className="p-2 rounded-xl text-slate-500 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-slate-800 dark:hover:text-emerald-450 border border-slate-200 dark:border-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors duration-150"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Modal de Confirmación de Desvinculación */}
            {showDisconnectConfirm && (
                <div className="fixed inset-0 z-[999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 max-w-sm w-full shadow-2xl space-y-5 animate-scale-in">
                        <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/20 rounded-2xl flex items-center justify-center text-rose-500 mx-auto">
                            <LogOut size={22} />
                        </div>
                        <div className="space-y-1.5 text-center">
                            <h4 className="text-base font-black text-slate-800 dark:text-white">Desvincular Supervisor</h4>
                            <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                                ¿Estás seguro de que deseas desvincular este dispositivo? Se perderá el acceso en tiempo real a las transacciones de esta caja.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => { triggerHaptic?.(); setShowDisconnectConfirm(false); }}
                                className="flex-1 py-3 px-4 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-350 font-black text-xs rounded-2xl border border-slate-200 dark:border-slate-700 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => { 
                                    setShowDisconnectConfirm(false);
                                    handleDisconnect();
                                }}
                                className="flex-1 py-3 px-4 bg-rose-500 hover:bg-rose-600 text-white font-black text-xs rounded-2xl shadow-lg shadow-rose-500/20 transition-colors"
                            >
                                Desvincular
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal para Cambiar Tasa Remota */}
            <SupervisorRateModal
                isOpen={showRateModal}
                onClose={() => setShowRateModal(false)}
                rates={rates}
                primaryDeviceId={pairedDeviceId}
                triggerHaptic={triggerHaptic}
            />

            {/* Modal para Crear / Editar Producto Remoto */}
            <RemoteProductFormModal
                isOpen={showRemoteForm}
                onClose={() => setShowRemoteForm(false)}
                editingProduct={remoteEditingProduct}
                onSubmit={handleRemoteSubmit}
                effectiveRate={bcvRate}
            />

            {/* Barra Flotante de Cambios Pendientes en Borrador */}
            {pendingChanges.length > 0 && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[250] w-full max-w-lg px-3 sm:px-4 animate-in slide-in-from-bottom-5 duration-300 pb-[env(safe-area-inset-bottom)]">
                    <div className="bg-slate-900/95 border border-emerald-500/40 text-white rounded-3xl p-3.5 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center border border-emerald-500/30 shrink-0 font-black text-sm">
                                {pendingChanges.length}
                            </div>
                            <div className="min-w-0">
                                <h4 className="text-xs font-bold text-white truncate">
                                    {pendingChanges.length === 1 ? '1 cambio pendiente en borrador' : `${pendingChanges.length} cambios pendientes en borrador`}
                                </h4>
                                <p className="text-[10px] text-slate-400 font-medium truncate">
                                    Toca "Subir a Caja" para aplicarlos en el POS
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={handleClearPending}
                                disabled={uploading}
                                className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors text-xs font-bold"
                                title="Descartar borrador"
                            >
                                <Trash2 size={16} />
                            </button>
                            <button
                                onClick={handleUploadPendingChanges}
                                disabled={uploading}
                                className="py-2 px-3.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-2xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                            >
                                {uploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                                <span>{uploading ? 'Subiendo...' : 'Subir a Caja'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Personalizado de Confirmación */}
            {confirmModalConfig && (
                <div className="fixed inset-0 z-[350] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-5 text-center">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto border ${confirmModalConfig.iconBg || 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                            <AlertTriangle size={24} />
                        </div>
                        <div className="space-y-1.5">
                            <h3 className="text-base font-black text-slate-800 dark:text-white">{confirmModalConfig.title}</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                                {confirmModalConfig.message}
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => { triggerHaptic?.(); setConfirmModalConfig(null); }}
                                className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-black text-xs rounded-2xl border border-slate-200 dark:border-slate-700 transition-colors"
                            >
                                {confirmModalConfig.cancelText || 'Cancelar'}
                            </button>
                            <button
                                onClick={() => {
                                    const action = confirmModalConfig.onConfirm;
                                    setConfirmModalConfig(null);
                                    action?.();
                                }}
                                className={`flex-1 py-3 px-4 font-black text-xs rounded-2xl shadow-lg transition-colors ${confirmModalConfig.confirmBtnClass || 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-500/20'}`}
                            >
                                {confirmModalConfig.confirmText || 'Aceptar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
