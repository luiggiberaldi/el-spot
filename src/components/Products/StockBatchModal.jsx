import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Search, TrendingUp, TrendingDown, Check, Package, X, AlertTriangle, Minus, Plus } from 'lucide-react';
import { showToast } from '../Toast';
import CustomSelect from '../CustomSelect';

function ProductRow({ p, qty, direction, isSelected, maxStock, onTapAdd, onSetQty, copEnabled, tasaCop, copPrimary }) {
    const stock = p.stock ?? 0;
    const lowAlert = p.lowStockAlert ?? 5;
    const isLow = stock <= lowAlert;
    const stockPct = Math.min(100, Math.max(0, (stock / maxStock) * 100));
    const newStock = direction === 'ingreso' ? stock + qty : Math.max(0, stock - qty);

    return (
        <div
            className={`flex items-center gap-3 px-3.5 py-3 transition-all border-b border-slate-100 dark:border-slate-805/40 ${
                isSelected
                    ? direction === 'ingreso'
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'bg-red-50/50 dark:bg-red-950/20'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer active:bg-slate-100 dark:active:bg-slate-850'
            }`}
            onClick={!isSelected ? () => onTapAdd(p.id) : undefined}
        >
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{p.name}</p>
                <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden max-w-[80px]">
                        <div
                            className={`h-full rounded-full transition-all ${isLow ? 'bg-amber-500' : 'bg-brand'}`}
                            style={{ width: `${stockPct}%` }}
                        />
                    </div>
                    <span className={`text-[11px] font-bold ${isLow ? 'text-amber-500 animate-pulse' : 'text-slate-450 dark:text-slate-400'}`}>
                        Stock: {stock}
                    </span>
                    {isSelected && (
                        <span className={`text-[11px] font-black flex items-center gap-0.5 ${direction === 'ingreso' ? 'text-emerald-500' : 'text-red-500'}`}>
                            → {newStock}
                        </span>
                    )}
                </div>
            </div>

            {isSelected ? (
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        onClick={() => onSetQty(p.id, qty - 1)}
                        disabled={qty <= 1}
                        className="w-8 h-8 rounded-lg bg-white dark:bg-slate-805 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-red-500 disabled:opacity-30 transition-all active:scale-90"
                    >
                        <Minus size={14} strokeWidth={2.5} />
                    </button>
                    <input
                        type="number"
                        value={qty || ''}
                        placeholder="0"
                        onChange={(e) => onSetQty(p.id, e.target.value)}
                        className="w-12 h-8 text-center text-sm font-black bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                        type="button"
                        onClick={() => onSetQty(p.id, qty + 1)}
                        className="w-8 h-8 rounded-lg bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-emerald-500 transition-all active:scale-90"
                    >
                        <Plus size={14} strokeWidth={2.5} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onSetQty(p.id, 0)}
                        className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-red-500 hover:text-red-650 transition-all active:scale-90 ml-1"
                    >
                        <X size={14} strokeWidth={2.5} />
                    </button>
                </div>
            ) : (
                <div className="shrink-0 w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-650 group-hover:bg-slate-100">
                    <Plus size={14} />
                </div>
            )}
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
    copEnabled,
    tasaCop,
    copPrimary
}) {
    const [direction, setDirection] = useState('ingreso'); // 'ingreso' | 'egreso'
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('todos');
    const [adjustments, setAdjustments] = useState({});
    const [note, setNote] = useState('');
    const [isApplying, setIsApplying] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const listRef = useRef(null);

    const allProducts = useMemo(() =>
        (products || []).filter(p => !p.isCombo),
    [products]);

    const categoryOptions = useMemo(() => {
        return [
            { value: 'todos', label: `Todas las categorías (${allProducts.length})` },
            ...categories
                .filter(c => c.id !== 'todos')
                .map(cat => {
                    const count = allProducts.filter(p => p.category === cat.id).length;
                    return count > 0 ? { value: cat.id, label: `${cat.label} (${count})` } : null;
                })
                .filter(Boolean)
        ];
    }, [allProducts, categories]);

    const selectedProducts = useMemo(() =>
        allProducts.filter(p => (adjustments[p.id] || 0) > 0)
            .sort((a, b) => a.name.localeCompare(b.name)),
    [allProducts, adjustments]);

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

    const activeAdjustments = useMemo(() =>
        Object.entries(adjustments).filter(([, qty]) => qty > 0),
    [adjustments]);

    const totalItems = activeAdjustments.reduce((sum, [, qty]) => sum + qty, 0);

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

            <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-200 flex flex-col max-h-[90vh] sm:max-h-[85vh]">
                
                {/* Header */}
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 rounded-t-3xl">
                    <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${direction === 'ingreso' ? 'bg-emerald-100 dark:bg-emerald-900/20' : 'bg-red-100 dark:bg-red-900/20'}`}>
                            {direction === 'ingreso'
                                ? <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400" />
                                : <TrendingDown size={16} className="text-red-500 dark:text-red-400" />
                            }
                        </div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white">
                            {showConfirm ? 'Confirmar Ajuste' : 'Ajuste por Lote'}
                        </h3>
                    </div>
                    <button onClick={handleClose} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {showConfirm ? (
                    /* ─── PANTALLA CONFIRMACIÓN ─── */
                    <div className="p-5 space-y-4 overflow-y-auto flex-1">
                        <div className={`p-4 rounded-xl border ${
                            direction === 'ingreso'
                                ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200/50 dark:border-emerald-800/30'
                                : 'bg-red-50/50 dark:bg-red-900/10 border-red-200/50 dark:border-red-800/30'
                        }`}>
                            <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${
                                direction === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                            }`}>
                                {direction === 'ingreso' ? 'Ingreso' : 'Egreso'} masivo de stock
                            </p>
                            <div className="space-y-2 max-h-[30vh] overflow-y-auto scrollbar-hide pr-1">
                                {activeAdjustments.map(([id, qty]) => {
                                    const p = products.find(x => x.id === id);
                                    const stock = p?.stock ?? 0;
                                    const newStock = direction === 'ingreso' ? stock + qty : Math.max(0, stock - qty);
                                    return (
                                        <div key={id} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800/40">
                                            <span className="font-bold text-slate-600 dark:text-slate-300 truncate mr-4">{p?.name || '?'}</span>
                                            <span className="font-bold shrink-0 text-slate-500 dark:text-slate-400">
                                                {stock} <span className={direction === 'ingreso' ? 'text-emerald-500' : 'text-red-500'}>→ {newStock} ({direction === 'ingreso' ? '+' : '-'}{qty})</span>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            {note.trim() && (
                                <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800">
                                    <p className="text-xs text-slate-500 dark:text-slate-400"><span className="font-bold">Motivo/Nota:</span> {note}</p>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 mt-4">
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
                                className={`flex-[2] py-3.5 text-white font-bold rounded-xl active:scale-[0.98] transition-all text-sm shadow-md ${
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
                        <div className="p-5 space-y-3.5 overflow-y-auto flex-1 scrollbar-hide">
                            {/* Direction Toggle */}
                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => setDirection('ingreso')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold rounded-lg transition-all ${
                                        direction === 'ingreso'
                                            ? 'bg-white dark:bg-slate-900 shadow-sm text-emerald-500'
                                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
                                    }`}
                                >
                                    <TrendingUp size={16} /> Ingreso
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDirection('egreso')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold rounded-lg transition-all ${
                                        direction === 'egreso'
                                            ? 'bg-white dark:bg-slate-900 shadow-sm text-red-500'
                                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
                                    }`}
                                >
                                    <TrendingDown size={16} /> Egreso
                                </button>
                            </div>

                            {/* Filters Bar */}
                            <div className="flex gap-2">
                                {/* Search input */}
                                <div className="relative flex-1">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 pl-8.5 pr-3 text-xs text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-brand/50 transition-all"
                                    />
                                </div>
                                {/* Category Dropdown */}
                                <div className="w-[45%] shrink-0">
                                    <CustomSelect
                                        value={selectedCategory}
                                        onChange={setSelectedCategory}
                                        options={categoryOptions}
                                        className="text-xs"
                                    />
                                </div>
                            </div>

                            {/* Product List Container */}
                            <div ref={listRef} className="max-h-[35vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col scrollbar-hide">
                                
                                {/* Selected sticky top section */}
                                {selectedProducts.length > 0 && (
                                    <div className="sticky top-0 z-10 border-b-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                                        <div className={`px-3.5 py-1.5 text-[9px] font-black uppercase tracking-wider ${
                                            direction === 'ingreso'
                                                ? 'bg-emerald-100/60 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                                : 'bg-red-100/60 dark:bg-red-900/30 text-red-500 dark:text-red-400'
                                        }`}>
                                            Seleccionados ({selectedProducts.length})
                                        </div>
                                        <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[18vh] overflow-y-auto scrollbar-hide">
                                            {selectedProducts.map(p => (
                                                <ProductRow
                                                    key={p.id} p={p} qty={adjustments[p.id] || 0}
                                                    direction={direction} isSelected maxStock={maxStock}
                                                    onTapAdd={tapAdd} onSetQty={setQty}
                                                    copEnabled={copEnabled} tasaCop={tasaCop} copPrimary={copPrimary}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Available section */}
                                {selectedProducts.length > 0 && unselectedProducts.length > 0 && (
                                    <div className="px-3.5 py-1.5 text-[9px] font-black uppercase tracking-wider bg-slate-50 dark:bg-slate-900/40 text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                        Toca para agregar
                                    </div>
                                )}

                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {unselectedProducts.length === 0 && selectedProducts.length === 0 ? (
                                        <div className="py-8 text-center text-xs text-slate-400 font-medium">
                                            <Package size={20} className="mx-auto mb-1.5 opacity-40" />
                                            Sin resultados
                                        </div>
                                    ) : unselectedProducts.map(p => (
                                        <ProductRow
                                            key={p.id} p={p} qty={0}
                                            direction={direction} isSelected={false} maxStock={maxStock}
                                            onTapAdd={tapAdd} onSetQty={setQty}
                                            copEnabled={copEnabled} tasaCop={tasaCop} copPrimary={copPrimary}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Motivo/Nota input */}
                            <div className="relative">
                                <input
                                    type="text"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder={direction === 'egreso' ? 'Motivo del egreso (obligatorio)' : 'Nota / motivo (opcional)'}
                                    className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-xl py-2.5 px-3.5 text-xs text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-brand/50 transition-all ${
                                        direction === 'egreso' && !note.trim() && activeAdjustments.length > 0
                                            ? 'border-red-300 dark:border-red-800 focus:ring-red-500/30'
                                            : 'border-slate-200 dark:border-slate-800'
                                    }`}
                                />
                                {direction === 'egreso' && !note.trim() && activeAdjustments.length > 0 && (
                                    <p className="text-[10px] text-red-400 font-bold mt-1 ml-1 flex items-center gap-1">
                                        <AlertTriangle size={10} /> Escribe un motivo para aplicar el egreso
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Footer (Apply Action) */}
                        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-b-3xl">
                            <button
                                type="button"
                                onClick={handleApply}
                                disabled={activeAdjustments.length === 0}
                                className={`w-full py-3.5 text-white font-bold rounded-xl active:scale-95 transition-all text-sm flex justify-center items-center gap-2 ${
                                    direction === 'ingreso'
                                        ? 'bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50'
                                        : 'bg-red-500 hover:bg-red-600 disabled:bg-red-500/50'
                                }`}
                            >
                                <Check size={16} />
                                {activeAdjustments.length === 0
                                    ? 'Selecciona productos'
                                    : `Siguiente: Aplicar ${direction === 'ingreso' ? 'Ingreso' : 'Egreso'} (${totalItems} uds)`
                                }
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
