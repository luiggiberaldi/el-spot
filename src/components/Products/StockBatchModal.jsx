import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Search, TrendingUp, TrendingDown, Check, Package, X, AlertTriangle, Minus, Plus, Boxes } from 'lucide-react';
import { showToast } from '../Toast';
import { CATEGORY_COLORS } from '../../config/categories';

// ─── FILA DEL CATÁLOGO (VISTA SIMPLIFICADA) ───
function CatalogRow({ p, maxStock, onTapAdd }) {
    const stock = p.stock ?? 0;
    const lowAlert = p.lowStockAlert ?? 5;
    const isLow = stock <= lowAlert;
    const stockPct = Math.min(100, Math.max(0, (stock / maxStock) * 105));

    return (
        <div
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer active:bg-slate-100 dark:active:bg-slate-800/50 transition-all border-b border-slate-100 dark:border-slate-800/40 group"
            onClick={() => onTapAdd(p.id)}
        >
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate group-hover:text-brand transition-colors">
                    {p.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${
                        isLow
                            ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-500 border-amber-200/30 animate-pulse'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-550 dark:text-slate-400 border-slate-200/30'
                    }`}>
                        Stock: {stock}
                    </span>
                </div>
            </div>

            <div className="shrink-0 w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover:bg-brand-light group-hover:text-brand group-hover:border-brand/30 transition-all active:scale-90">
                <Plus size={16} strokeWidth={2.5} />
            </div>
        </div>
    );
}

// ─── FILA EN AJUSTE (VISTA DE CONTROL DE CANTIDAD) ───
function AdjustRow({ p, qty, direction, onSetQty }) {
    const stock = p.stock ?? 0;
    const newStock = direction === 'ingreso' ? stock + qty : Math.max(0, stock - qty);

    return (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50/30 dark:bg-slate-900/10 border-b border-slate-100 dark:border-slate-800/40">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-750 dark:text-slate-200 truncate">{p.name}</p>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-450">
                        {stock}
                    </span>
                    <span className={`text-[11px] font-black flex items-center gap-0.5 ${direction === 'ingreso' ? 'text-emerald-500' : 'text-red-500'}`}>
                        → {newStock} ({direction === 'ingreso' ? '+' : '-'}{qty})
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                {/* Controles de cantidad integrados */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800/70 p-0.5 rounded-full border border-slate-200/50 dark:border-slate-700/50">
                    <button
                        type="button"
                        onClick={() => onSetQty(p.id, qty - 1)}
                        disabled={qty <= 1}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:text-red-500 disabled:opacity-30 transition-colors"
                    >
                        <Minus size={12} strokeWidth={3} />
                    </button>
                    <input
                        type="number"
                        value={qty || ''}
                        placeholder="0"
                        onChange={(e) => onSetQty(p.id, e.target.value)}
                        className="w-10 h-7 text-center text-xs font-black bg-transparent border-none outline-none focus:ring-0 text-slate-800 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                        type="button"
                        onClick={() => onSetQty(p.id, qty + 1)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:text-emerald-500 transition-colors"
                    >
                        <Plus size={12} strokeWidth={3} />
                    </button>
                </div>

                {/* Quitar item */}
                <button
                    type="button"
                    onClick={() => onSetQty(p.id, 0)}
                    className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-950/20 flex items-center justify-center text-red-550 hover:text-red-650 hover:bg-red-100 transition-colors"
                    title="Quitar de la lista"
                >
                    <X size={14} strokeWidth={2.5} />
                </button>
            </div>
        </div>
    );
}

export default function StockBatchModal({
    isOpen,
    onClose,
    products,
    categories,
    adjustStock,
    triggerHaptic,
}) {
    const [direction, setDirection] = useState('ingreso'); // 'ingreso' | 'egreso'
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('todos');
    const [adjustments, setAdjustments] = useState({});
    const [note, setNote] = useState('');
    const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'adjusting'
    const [isApplying, setIsApplying] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    
    const categoryScrollRef = useRef(null);
    const listRef = useRef(null);

    const allProducts = useMemo(() =>
        (products || []).filter(p => !p.isCombo),
    [products]);

    // Filtrar conteo por categoría
    const getCategoryProductCount = (catId) => {
        if (catId === 'todos') return allProducts.length;
        return allProducts.filter(p => p.category === catId).length;
    };

    const selectedProducts = useMemo(() =>
        allProducts.filter(p => (adjustments[p.id] || 0) > 0)
            .sort((a, b) => a.name.localeCompare(b.name)),
    [allProducts, adjustments]);

    const activeAdjustments = useMemo(() =>
        Object.entries(adjustments).filter(([, qty]) => qty > 0),
    [adjustments]);

    const totalItems = activeAdjustments.reduce((sum, [, qty]) => sum + qty, 0);

    const unselectedProducts = useMemo(() => {
        const term = search.toLowerCase().trim();
        return allProducts
            .filter(p => (adjustments[p.id] || 0) === 0)
            .filter(p => {
                const matchesCat = selectedCategory === 'todos' || p.category === selectedCategory;
                const matchesSearch = !term || p.name.toLowerCase().includes(term);
                return matchesCat && matchesSearch;
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [allProducts, search, selectedCategory, adjustments]);

    const setQty = (productId, val) => {
        const num = Math.max(0, parseInt(val) || 0);
        setAdjustments(prev => ({ ...prev, [productId]: num }));
    };

    const tapAdd = useCallback((productId) => {
        triggerHaptic && triggerHaptic();
        setAdjustments(prev => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
    }, [triggerHaptic]);

    const needsNote = direction === 'egreso' && !note.trim();

    const handleApply = async () => {
        if (activeAdjustments.length === 0) return;
        if (needsNote) {
            showToast('Escribe un motivo para el egreso', 'error');
            triggerHaptic && triggerHaptic();
            return;
        }
        if (!showConfirm) {
            setShowConfirm(true);
            return;
        }
        setIsApplying(true);
        triggerHaptic && triggerHaptic();

        try {
            for (const [productId, qty] of activeAdjustments) {
                const delta = direction === 'ingreso' ? qty : -qty;
                await adjustStock(productId, delta);
            }

            showToast(
                `${direction === 'ingreso' ? 'Ingreso' : 'Egreso'} masivo completado con éxito`,
                'success'
            );

            setAdjustments({});
            setNote('');
            setSearch('');
            setSelectedCategory('todos');
            setActiveTab('catalog');
            setShowConfirm(false);
            onClose();
        } catch (e) {
            showToast('Error al aplicar ajuste: ' + e.message, 'error');
        } finally {
            setIsApplying(false);
        }
    };

    const handleClose = () => {
        setAdjustments({});
        setSearch('');
        setNote('');
        setSelectedCategory('todos');
        setActiveTab('catalog');
        setShowConfirm(false);
        onClose();
    };

    const maxStock = useMemo(() =>
        Math.max(1, ...allProducts.map(p => p.stock ?? 0)),
    [allProducts]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={handleClose} />

            <div className="relative bg-white dark:bg-slate-900 w-full max-w-md sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-200 flex flex-col max-h-[92vh] sm:max-h-[85vh]">
                
                {/* Header */}
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 rounded-t-3xl shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-brand-light dark:bg-slate-800 text-brand">
                            <Boxes size={16} strokeWidth={2.5} />
                        </div>
                        <h3 className="text-lg font-black text-slate-850 dark:text-white tracking-tight">
                            {showConfirm ? 'Confirmar Ajuste' : 'Ajuste de Inventario'}
                        </h3>
                    </div>
                    <button onClick={handleClose} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors active:scale-90">
                        <X size={20} />
                    </button>
                </div>

                {showConfirm ? (
                    /* ─── PANTALLA CONFIRMACIÓN ─── */
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 scrollbar-hide">
                        <div className={`p-4 rounded-2xl border ${
                            direction === 'ingreso'
                                ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-250/50 dark:border-emerald-800/30'
                                : 'bg-red-50/50 dark:bg-red-900/10 border-red-250/50 dark:border-red-800/30'
                        }`}>
                            <p className={`text-xs font-black uppercase tracking-widest mb-3.5 ${
                                direction === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                            }`}>
                                {direction === 'ingreso' ? 'Ingreso' : 'Egreso'} masivo de stock
                            </p>
                            <div className="space-y-2 max-h-[35vh] overflow-y-auto scrollbar-hide pr-1">
                                {activeAdjustments.map(([id, qty]) => {
                                    const p = products.find(x => x.id === id);
                                    const stock = p?.stock ?? 0;
                                    const newStock = direction === 'ingreso' ? stock + qty : Math.max(0, stock - qty);
                                    return (
                                        <div key={id} className="flex items-center justify-between text-xs py-2 border-b border-slate-100 dark:border-slate-800/40">
                                            <span className="font-bold text-slate-650 dark:text-slate-350 truncate mr-4">{p?.name || '?'}</span>
                                            <span className="font-black shrink-0 text-slate-500 dark:text-slate-400">
                                                {stock} <span className={direction === 'ingreso' ? 'text-emerald-500' : 'text-red-500'}>→ {newStock} ({direction === 'ingreso' ? '+' : '-'}{qty})</span>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            {note.trim() && (
                                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                                    <p className="text-xs text-slate-500 dark:text-slate-400"><span className="font-bold">Motivo/Nota:</span> {note}</p>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowConfirm(false)}
                                className="flex-1 py-3.5 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-white font-bold rounded-xl active:scale-[0.98] transition-all text-sm border border-slate-200 dark:border-slate-700"
                            >
                                Volver
                            </button>
                            <button
                                type="button"
                                onClick={handleApply}
                                disabled={isApplying}
                                className={`flex-[2] py-3.5 text-white font-bold rounded-xl active:scale-[0.98] transition-all text-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                                    direction === 'ingreso'
                                        ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
                                        : 'bg-red-500 hover:bg-red-600 shadow-red-500/20'
                                }`}
                            >
                                {isApplying ? 'Aplicando...' : `Confirmar ${direction === 'ingreso' ? 'Ingreso' : 'Egreso'}`}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ─── PANTALLA PRINCIPAL ─── */
                    <>
                        <div className="p-5 space-y-4 overflow-y-auto flex-1 scrollbar-hide">
                            {/* Direction Toggle */}
                            <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setDirection('ingreso')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl transition-all ${
                                        direction === 'ingreso'
                                            ? 'bg-white dark:bg-slate-900 shadow-md text-emerald-600 dark:text-emerald-400 font-black'
                                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
                                    }`}
                                >
                                    <TrendingUp size={16} strokeWidth={2.5} /> Ingreso
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDirection('egreso')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl transition-all ${
                                        direction === 'egreso'
                                            ? 'bg-white dark:bg-slate-900 shadow-md text-red-500 font-black'
                                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
                                    }`}
                                >
                                    <TrendingDown size={16} strokeWidth={2.5} /> Egreso
                                </button>
                            </div>

                            {/* Search Bar - Ancho completo */}
                            <div className="relative shrink-0">
                                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-450" />
                                <input
                                    type="text"
                                    placeholder="Buscar producto por nombre..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl py-2.5 pl-10 pr-4 text-xs text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-brand/50 transition-all shadow-sm"
                                />
                            </div>

                            {/* Category Filter Pills (Horizontal Scroll) */}
                            <div className="relative w-full shrink-0">
                                <div 
                                    ref={categoryScrollRef}
                                    className="flex gap-1.5 overflow-x-auto py-1 pl-0.5 pr-2 scrollbar-hide scroll-smooth"
                                >
                                    {/* Pestaña estática para la categoría 'Todos' */}
                                    <button
                                        type="button"
                                        onClick={() => setSelectedCategory('todos')}
                                        className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                                            selectedCategory === 'todos'
                                                ? 'bg-brand text-white border-brand shadow-sm font-black'
                                                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 active:scale-95'
                                        }`}
                                    >
                                        Todos
                                        <span className={`ml-1 text-[9px] ${selectedCategory === 'todos' ? 'opacity-90' : 'text-slate-400'}`}>
                                            · {getCategoryProductCount('todos')}
                                        </span>
                                    </button>

                                    {categories.filter(c => c.id !== 'todos').map(cat => {
                                        const count = getCategoryProductCount(cat.id);
                                        const isActive = selectedCategory === cat.id;
                                        const catColorClass = CATEGORY_COLORS[cat.color] || 'bg-brand text-white border-brand';
                                        
                                        return (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                onClick={() => setSelectedCategory(cat.id)}
                                                className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                                                    isActive
                                                        ? `${catColorClass} shadow-sm border-transparent font-black`
                                                        : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 active:scale-95'
                                                }`}
                                            >
                                                {cat.label}
                                                <span className={`ml-1 text-[9px] ${isActive ? 'opacity-90' : 'text-slate-450 dark:text-slate-500'}`}>
                                                    · {count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Navigation Tabs (Catálogo vs Ajustados) */}
                            <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('catalog')}
                                    className={`flex-1 pb-2.5 text-xs font-bold transition-all border-b-2 text-center ${
                                        activeTab === 'catalog'
                                            ? 'border-brand text-brand font-black'
                                            : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-650'
                                    }`}
                                >
                                    Catálogo ({unselectedProducts.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('adjusting')}
                                    className={`flex-1 pb-2.5 text-xs font-bold transition-all border-b-2 text-center flex items-center justify-center gap-1.5 ${
                                        activeTab === 'adjusting'
                                            ? 'border-brand text-brand font-black'
                                            : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-650'
                                    }`}
                                >
                                    En ajuste
                                    {selectedProducts.length > 0 && (
                                        <span className={`px-1.5 py-0.5 text-[9px] font-black rounded-full ${
                                            direction === 'ingreso'
                                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-450'
                                                : 'bg-red-100 dark:bg-red-950 text-red-500'
                                        }`}>
                                            {selectedProducts.length}
                                        </span>
                                    )}
                                </button>
                            </div>

                            {/* Product List Container */}
                            <div ref={listRef} className="max-h-[38vh] min-h-[22vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col scrollbar-hide">
                                <div className="divide-y divide-slate-100 dark:divide-slate-850">
                                    {activeTab === 'catalog' ? (
                                        /* VISTA CATÁLOGO */
                                        unselectedProducts.length === 0 ? (
                                            <div className="py-12 text-center text-xs text-slate-400 font-medium">
                                                <Package size={22} className="mx-auto mb-2 opacity-40" />
                                                Sin productos disponibles
                                            </div>
                                        ) : unselectedProducts.map(p => (
                                            <CatalogRow
                                                key={p.id} p={p} maxStock={maxStock}
                                                onTapAdd={tapAdd}
                                            />
                                        ))
                                    ) : (
                                        /* VISTA EN AJUSTE */
                                        selectedProducts.length === 0 ? (
                                            <div className="py-12 text-center text-xs text-slate-400 font-medium">
                                                <Boxes size={22} className="mx-auto mb-2 opacity-40 text-slate-300 dark:text-slate-700" />
                                                No has seleccionado productos
                                            </div>
                                        ) : selectedProducts.map(p => (
                                            <AdjustRow
                                                key={p.id} p={p} qty={adjustments[p.id] || 0}
                                                direction={direction} onSetQty={setQty}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Motivo/Nota input (Solo visible en pestaña de ajuste o cuando hay seleccionados) */}
                            {activeTab === 'adjusting' && selectedProducts.length > 0 && (
                                <div className="relative shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-150">
                                    <input
                                        type="text"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        placeholder={direction === 'egreso' ? 'Motivo del egreso (obligatorio)' : 'Nota / motivo (opcional)'}
                                        className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-2xl py-2.5 px-4 text-xs text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-brand/50 transition-all ${
                                            direction === 'egreso' && !note.trim() && activeAdjustments.length > 0
                                                ? 'border-red-300 dark:border-red-800 focus:ring-red-500/30'
                                                : 'border-slate-200 dark:border-slate-800'
                                        }`}
                                    />
                                    {direction === 'egreso' && !note.trim() && activeAdjustments.length > 0 && (
                                        <p className="text-[10px] text-red-400 font-bold mt-1.5 ml-1 flex items-center gap-1">
                                            <AlertTriangle size={10} /> Escribe un motivo para aplicar el egreso
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer (Apply Action) */}
                        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-b-3xl shrink-0">
                             <button
                                 type="button"
                                 onClick={activeTab === 'catalog' && selectedProducts.length > 0 ? () => setActiveTab('adjusting') : handleApply}
                                 disabled={activeAdjustments.length === 0}
                                 className={`w-full py-3.5 font-bold rounded-xl active:scale-95 transition-all text-sm flex justify-center items-center gap-2 ${
                                     activeAdjustments.length === 0
                                         ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-none border border-slate-200/50 dark:border-slate-700/50'
                                         : direction === 'ingreso'
                                             ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25'
                                             : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25'
                                 }`}
                             >
                                 {activeAdjustments.length > 0 && <Check size={16} />}
                                 {activeAdjustments.length === 0
                                     ? 'Toca productos para agregar'
                                     : activeTab === 'catalog'
                                         ? `Revisar ajuste (${selectedProducts.length} prod · ${totalItems} uds) →`
                                         : `Aplicar ${direction === 'ingreso' ? 'Ingreso' : 'Egreso'} (${totalItems} uds)`
                                 }
                             </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
