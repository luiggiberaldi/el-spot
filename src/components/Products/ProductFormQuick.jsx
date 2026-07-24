import React, { useRef, useState } from 'react';
import { Camera, X, AlertTriangle, Package, Tag, Scale, Droplets, ChevronDown, ChevronUp, Barcode, Banknote, CheckCircle, Plus, Search, Link, Sparkles, ShieldCheck, Landmark, Building2, TrendingUp, Store, SlidersHorizontal, Coins, CircleX, DollarSign, Percent, Zap } from 'lucide-react';
import { useProductContext } from '../../context/ProductContext';
import CustomSelect from '../CustomSelect';
import { showToast } from '../Toast';

const PACKAGING_TYPES = [
    { id: 'suelto', label: 'Suelto', Icon: Tag, desc: 'Unidad individual', color: 'emerald' },
    { id: 'lote', label: 'Bulto', Icon: Package, desc: 'Caja, bulto o paquete', color: 'indigo' },
    { id: 'granel', label: 'Granel', Icon: Scale, desc: 'Por Kg o Litro', color: 'amber' },
];

export default function ProductFormQuick({
    image, setImage,
    name, setName,
    barcode, setBarcode,
    category, setCategory,
    priceUsd, handlePriceUsdChange,
    priceBs, handlePriceBsChange,
    handlePriceCopChange,
    priceCop,
    costUsd, handleCostUsdChange,
    costBs, handleCostBsChange,
    costCop, handleCostCopChange,
    stock, setStock,
    lowStockAlert, setLowStockAlert,

    unitsPerPackage, setUnitsPerPackage,
    sellByUnit, setSellByUnit,
    unitPriceUsd, setUnitPriceUsd,
    unitPriceCop, setUnitPriceCop,

    packagingType, setPackagingType,
    stockInLotes, setStockInLotes,
    granelUnit, setGranelUnit,
    hasWarranty, setHasWarranty,
    warrantyDays, setWarrantyDays,
    price2Usd, handlePrice2UsdChange,
    price2Bs, handlePrice2BsChange,
    effectiveRate,
    bcvRate,
    bcvMarginPct,
    copEnabled,
    copPrimary,
    tasaCop,

    handleImageUpload,
    categories,
    isSearchingImage,
    handleLoadImageFromUrl,
    handleAutoSearchImage,
    imageMatches,
    setImageMatches,
    handleSelectImage
}) {
    const fileInputRef = useRef(null);
    const [showSummary, setShowSummary] = useState(false);
    
    // Categorías en línea y % Recargo Tienda
    const { setCategories, bcvMarginPct: bcvMarginPctFromCtx, rates } = useProductContext();
    const usdtRate = rates?.usdt?.price || 0;
    const bcvMarginNum = parseFloat(bcvMarginPct || bcvMarginPctFromCtx || 49);
    const [customPctVal, setCustomPctVal] = useState("");
    const [showCustomPct, setShowCustomPct] = useState(false);
    const [isPrice2Active, setIsPrice2Active] = useState(() => {
        return price2Usd !== '' && price2Usd !== null && price2Usd !== undefined && (parseFloat(price2Usd) > 0 || parseFloat(price2Bs) > 0);
    });

    React.useEffect(() => {
        if (price2Usd !== '' && price2Usd !== null && price2Usd !== undefined && parseFloat(price2Usd) > 0) {
            setIsPrice2Active(true);
        }
    }, [price2Usd]);

    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");

    const handleAddCategory = () => {
        if (!newCategoryName.trim()) return;
        const catId = newCategoryName.trim().toLowerCase().replace(/\s+/g, '_');
        
        setCategories(prev => {
            if(prev.find(c => c.id === catId)) return prev;
            return [...prev, { id: catId, label: newCategoryName.trim(), icon: '◆', color: 'emerald' }];
        });
        
        setCategory(catId);
        setIsAddingCategory(false);
        setNewCategoryName("");
    };

    const isLote = packagingType === 'lote';
    const isGranel = packagingType === 'granel';
    const parsedUnits = parseInt(unitsPerPackage) || 0;
    const parsedPrice = parseFloat(priceUsd) || 0;
    const parsedCost = parseFloat(costUsd) || 0;

    // Margin for the main product (lote or suelto or granel)
    const mainMarginPct = parsedCost > 0 ? ((parsedPrice - parsedCost) / parsedCost * 100) : null;
    const mainMarginUsd = parsedPrice - parsedCost;

    // Unit margin for lote with sellByUnit
    const effectiveUnitPrice = copEnabled && tasaCop > 0 && unitPriceCop
        ? parseFloat(unitPriceCop) / tasaCop
        : unitPriceUsd
            ? parseFloat(unitPriceUsd)
            : (parsedUnits > 0 ? parsedPrice / parsedUnits : 0);
    const unitCost = parsedUnits > 0 && parsedCost > 0 ? parsedCost / parsedUnits : 0;
    const unitMarginPct = unitCost > 0 ? ((effectiveUnitPrice - unitCost) / unitCost * 100) : null;
    const unitMarginUsd = effectiveUnitPrice - unitCost;

    // Stock equivalence for lote
    const parsedStockLotes = parseInt(stockInLotes) || 0;
    const stockUnitsCalc = parsedStockLotes * (parsedUnits || 1);

    // Alert equivalence
    const parsedAlert = parseInt(lowStockAlert) || 0;
    const alertLotesCalc = parsedUnits > 0 ? (parsedAlert / parsedUnits) : 0;

    // Unit label for granel
    const granelLabel = granelUnit === 'kg' ? 'Kilo' : 'Litro';

    const priceSuffix = isLote ? ' / Bulto' : isGranel ? ` / ${granelLabel}` : '';

    return (
        <div className="space-y-4">
            {/* File Upload Zone — Layout Horizontal / Vertical Adaptable 1:1 */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4 bg-slate-50 dark:bg-slate-800/60 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 select-none text-center sm:text-left">
                {/* Previsualización Cuadrada 1:1 */}
                <div 
                    onClick={() => fileInputRef.current?.click()} 
                    className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 transition-colors relative overflow-hidden group"
                >
                    {image ? (
                        <img src={image} className="w-full h-full object-contain p-1" alt="Product preview" />
                    ) : (
                        <>
                            <Camera size={24} className="text-slate-400 group-hover:text-emerald-500 transition-colors mb-1" />
                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider text-center px-1">Subir Foto</span>
                        </>
                    )}
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                </div>

                {/* Panel Informativo y Acciones */}
                <div className="flex-1 min-w-0 flex flex-col justify-center items-center sm:items-start gap-1.5 w-full">
                    <div>
                        <p className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Foto del Producto</p>
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-snug mt-0.5">Formato recomendado: PNG, JPG o WEBP (1:1).</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-1 w-full">
                        <button 
                            type="button" 
                            onClick={() => fileInputRef.current?.click()} 
                            className="flex-1 sm:flex-none px-3 py-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-xl font-black text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                            <Camera size={14} />
                            <span>{image ? 'Cambiar foto' : 'Subir imagen'}</span>
                        </button>

                        {image && (
                            <button 
                                type="button" 
                                onClick={() => setImage('')} 
                                className="flex-1 sm:flex-none px-3 py-2 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-900/60 rounded-xl font-black text-xs transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                            >
                                <X size={14} />
                                <span>Eliminar</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {imageMatches && imageMatches.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-150 dark:border-slate-700/50 rounded-2xl p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200 select-none">
                    <div className="flex justify-between items-center px-0.5">
                        <span className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                            <Sparkles size={11} className="animate-pulse" /> Selecciona la foto correcta ({imageMatches.length})
                        </span>
                        <button 
                            type="button" 
                            onClick={() => setImageMatches([])} 
                            className="text-[9px] font-extrabold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors uppercase tracking-wider"
                        >
                            Cerrar
                        </button>
                    </div>
                    <div className="flex gap-2.5 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 items-stretch">
                        {imageMatches.map((m, idx) => (
                            <div 
                                key={idx}
                                onClick={() => handleSelectImage(m.dataUri)}
                                className="flex-shrink-0 w-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5 cursor-pointer hover:border-amber-500 hover:scale-102 active:scale-98 transition-all flex flex-col items-center justify-between gap-1.5 text-center group"
                            >
                                <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-800 flex items-center justify-center relative shrink-0">
                                    <img src={m.dataUri} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" alt={m.title} crossOrigin="anonymous" />
                                </div>
                                <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 leading-tight uppercase break-words w-full">
                                    {m.title}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {/* Name */}
                <div className="relative">
                    <label className="text-xs font-black text-slate-600 dark:text-slate-300 ml-1 mb-1.5 block uppercase tracking-wide">Nombre del producto</label>
                    <input 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        autoFocus 
                        placeholder="Ej: Harina PAN 1kg"
                        className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 pr-10 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50 capitalize text-sm sm:text-base" 
                    />
                    {name && name.trim().length >= 3 && (
                        <CheckCircle size={18} className="absolute right-3 top-[38px] text-emerald-500 transition-all duration-300" />
                    )}
                </div>

                {/* Barcode */}
                <div>
                    <label className="text-xs font-black text-slate-600 dark:text-slate-300 ml-1 mb-1.5 block uppercase tracking-wide">Cód. de Barras <span className="font-medium text-slate-400 normal-case">(Opcional)</span></label>
                    <div className="relative">
                        <input value={barcode} onChange={e => setBarcode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} placeholder="Ej: 7591111222233"
                            className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 pl-10 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm sm:text-base" />
                        <Barcode size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                </div>

                {/* Category (full width) */}
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-black text-slate-600 dark:text-slate-300 ml-1 block uppercase tracking-wide">Categoría</label>
                        <button 
                            onClick={() => setIsAddingCategory(!isAddingCategory)}
                            className="text-[10px] font-bold text-emerald-500 hover:text-emerald-600 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md transition-colors"
                        >
                            {isAddingCategory ? <X size={12} /> : <Plus size={12} />}
                            {isAddingCategory ? 'Cancelar' : 'Nueva'}
                        </button>
                    </div>
                    {isAddingCategory ? (
                        <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                            <input 
                                autoFocus
                                value={newCategoryName}
                                onChange={e => setNewCategoryName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                                placeholder="Nombre de categoría..."
                                className="flex-1 bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm"
                            />
                            <button 
                                onClick={handleAddCategory}
                                disabled={!newCategoryName.trim()}
                                className="bg-emerald-500 text-white px-4 rounded-xl font-bold disabled:opacity-50 hover:bg-emerald-600 transition-colors text-sm"
                            >
                                Guardar
                            </button>
                        </div>
                    ) : (
                        <CustomSelect
                            value={category}
                            onChange={setCategory}
                            options={categories.filter(c => c.id !== 'todos').map(c => ({ value: c.id, label: c.label }))}
                        />
                    )}
                </div>

                {/* ─── PACKAGING TYPE CARDS ─── */}
                <div>
                    <label className="text-xs font-black text-slate-600 dark:text-slate-300 ml-1 mb-1.5 block uppercase tracking-wide">Tipo de Empaque</label>
                    <div className="grid grid-cols-3 gap-2">
                        {PACKAGING_TYPES.map(pt => {
                            const selected = packagingType === pt.id;
                            const colorMap = {
                                emerald: selected ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : '',
                                indigo: selected ? 'border-brand bg-brand-light dark:bg-surface-800/20' : '',
                                amber: selected ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : '',
                            };
                            const textColor = {
                                emerald: 'text-emerald-700 dark:text-emerald-400',
                                indigo: 'text-brand-dark dark:text-brand',
                                amber: 'text-amber-700 dark:text-amber-400',
                            };
                            return (
                                <button key={pt.id}
                                    type="button"
                                    onClick={() => setPackagingType(pt.id)}
                                    className={`flex flex-col items-center gap-1 p-2 sm:p-3 rounded-xl border-2 transition-all active:scale-95 ${selected
                                        ? colorMap[pt.color]
                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                                        }`}>
                                    <pt.Icon size={20} strokeWidth={2} className={selected ? textColor[pt.color] : 'text-slate-400'} />
                                    <span className={`text-[10px] font-black uppercase ${selected ? textColor[pt.color] : 'text-slate-500'}`}>{pt.label}</span>
                                    <span className="text-[8px] text-slate-400 leading-tight text-center hidden sm:block">{pt.desc}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ─── GRANEL: Unit selector ─── */}
                {isGranel && (
                    <div className="flex gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                        {['kg', 'litro'].map(u => (
                            <button key={u} type="button" onClick={() => setGranelUnit(u)}
                                className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${granelUnit === u
                                    ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                                    }`}>
                                {u === 'kg' ? <><Scale size={14} className="inline -mt-0.5" /> Kilogramo</> : <><Droplets size={14} className="inline -mt-0.5" /> Litro</>}
                            </button>
                        ))}
                    </div>
                )}

                {/* ─── CAMPO OPCIONAL: Unidades por Bulto/Caja (para Suelto y Granel) ─── */}
                {!isLote && (
                    <div className="bg-slate-50 dark:bg-slate-800/30 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/50 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                Uds. por Bulto / Caja
                            </label>
                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">Opcional</span>
                        </div>
                        <input
                            type="number"
                            inputMode="numeric"
                            value={unitsPerPackage}
                            onChange={e => setUnitsPerPackage(e.target.value)}
                            placeholder="Ej: 24  (déjalo vacío si no aplica)"
                            className="w-full bg-white dark:bg-slate-800 p-3 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-brand/50 text-sm border border-slate-200/60 dark:border-slate-700/60"
                        />
                        {parsedUnits > 1 && (
                            <p className="text-[10px] text-brand font-bold mt-1.5 ml-1">
                                ✓ En ajuste por lote podrás elegir entre unidades sueltas o bultos de {parsedUnits} uds
                            </p>
                        )}
                        {!parsedUnits || parsedUnits <= 1 ? (
                            <p className="text-[10px] text-slate-400 mt-1.5 ml-1">
                                Complétalo si el producto se maneja en cajas o bultos para activar ajuste por bulto en inventario
                            </p>
                        ) : null}
                    </div>
                )}

                {/* ─── LOTE: Units per package ─── */}
                {isLote && (
                    <div className="bg-brand-light dark:bg-surface-800/10 p-4 rounded-xl border border-surface-200 dark:border-surface-800/30 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div>
                            <label className="text-xs font-bold text-brand-dark dark:text-brand ml-1 mb-1 block uppercase">¿Cuántas unidades trae el bulto?</label>
                            <input type="number" inputMode="numeric" value={unitsPerPackage} onChange={e => setUnitsPerPackage(e.target.value)} placeholder="Ej: 24"
                                className="w-full bg-white dark:bg-slate-800 p-3.5 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-brand/50 text-sm" />
                        </div>

                        {/* Toggle: sell by unit */}
                        {parsedUnits > 1 && (
                            <label className="flex items-center gap-3 cursor-pointer select-none p-2 rounded-lg hover:bg-brand-light/50 dark:hover:bg-surface-800/20 transition-colors">
                                <div className={`w-11 h-6 rounded-full relative transition-colors duration-200 shrink-0 ${sellByUnit ? 'bg-brand' : 'bg-slate-300 dark:bg-slate-600'}`}
                                    onClick={() => setSellByUnit(!sellByUnit)}>
                                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ${sellByUnit ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                                </div>
                                <div onClick={() => setSellByUnit(!sellByUnit)}>
                                    <span className="text-xs font-bold text-brand-dark dark:text-brand">¿También vender por unidad suelta?</span>
                                    <p className="text-[10px] text-brand/70 dark:text-brand/50 mt-0.5">Permite vender unidades individuales del bulto</p>
                                </div>
                            </label>
                        )}
                    </div>
                )}

                {/* ─── COST SECTION (first) ─── */}
                <div className="bg-slate-50 dark:bg-slate-800/30 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/50">
                    <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wide block mb-2.5 ml-0.5">
                        Costo de Adquisición <span className="font-medium text-slate-400">({priceSuffix ? priceSuffix.replace(' / ', '') : 'Unidad'})</span>
                    </span>
                    <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                            {copEnabled && copPrimary && tasaCop > 0 ? 'COP' : '$'}
                        </span>
                        {copEnabled && copPrimary && tasaCop > 0 ? (
                            <input type="number" inputMode="decimal" value={costCop} onChange={e => handleCostCopChange(e.target.value)} placeholder="4100"
                                className="w-full bg-white dark:bg-slate-900 p-3 pl-14 rounded-xl font-black text-slate-800 dark:text-white outline-none border-2 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-slate-400/40 focus:border-slate-400 transition-all text-sm shadow-2xs" />
                        ) : (
                            <input type="number" inputMode="decimal" value={costUsd} onChange={e => handleCostUsdChange(e.target.value)} placeholder="1.00"
                                className="w-full bg-white dark:bg-slate-900 p-3 pl-8 rounded-xl font-black text-slate-800 dark:text-white outline-none border-2 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-slate-400/40 focus:border-slate-400 transition-all text-sm shadow-2xs" />
                        )}
                    </div>
                </div>

                {/* ─── LOTE: Auto unit cost ─── */}
                {isLote && parsedUnits > 1 && parsedCost > 0 && (
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 px-3 py-2 rounded-xl text-[11px]">
                        <span className="text-slate-500 font-medium">Costo por unidad:</span>
                        <span className="font-bold text-slate-700 dark:text-white flex items-center gap-1.5">
                            {copEnabled && copPrimary && tasaCop > 0 ? `${Math.round((parsedCost / parsedUnits) * tasaCop).toLocaleString('es-CO')} COP` : `$${(parsedCost / parsedUnits).toFixed(2)}`}
                            <span className="text-[8px] bg-brand-light dark:bg-surface-800/30 text-brand px-1.5 py-0.5 rounded font-black">AUTO</span>
                        </span>
                    </div>
                )}

                {/* ─── COP INPUT (primero si copEnabled) ─── */}
                {copEnabled && (
                    <div className="relative">
                        <label className="text-[10px] sm:text-xs font-bold text-amber-600 dark:text-amber-400 ml-1 mb-1 block uppercase tracking-wider">
                            Precio de Venta (Pesos COP){priceSuffix}
                        </label>
                        <input
                            type="number"
                            inputMode="decimal"
                            placeholder="Ej: 15000"
                            value={priceCop}
                            onChange={e => handlePriceCopChange(e.target.value)}
                            className="w-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 p-3.5 pr-10 sm:p-4 sm:pr-10 rounded-xl font-black text-amber-800 dark:text-amber-400 outline-none focus:ring-2 focus:ring-amber-500/50 transition-all text-sm sm:text-base"
                        />
                        <Banknote size={16} className="absolute right-3 top-[38px] sm:top-[42px] text-amber-400" />
                        <p className="text-[10px] text-amber-600/70 dark:text-amber-500/60 mt-1 ml-1">
                            Calcula automáticamente el precio en USD y Bs
                        </p>
                    </div>
                )}

                {/* ─── PRICE SECTION ─── */}
                <div className="bg-emerald-500/8 dark:bg-emerald-500/12 p-3.5 rounded-xl border-2 border-emerald-400/30 dark:border-emerald-500/25">
                    <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wide block mb-2.5 ml-0.5">
                        Precio de Venta <span className="font-medium text-emerald-500/70">({priceSuffix ? priceSuffix.replace(' / ', '') : 'Unidad'})</span>
                    </span>
                    <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-emerald-600 dark:text-emerald-400">
                            {copEnabled ? 'USD' : '$'}
                        </span>
                        <input type="number" inputMode="decimal" value={priceUsd} onChange={e => handlePriceUsdChange(e.target.value)} placeholder="1.50"
                            className="w-full bg-white dark:bg-slate-900 p-3 pl-12 pr-10 rounded-xl font-black text-emerald-900 dark:text-emerald-300 outline-none border-2 border-emerald-300 dark:border-emerald-700/60 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all text-sm sm:text-base shadow-2xs" />
                        {parseFloat(priceUsd) > 0 && (
                            <CheckCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 transition-all duration-300" />
                        )}
                    </div>
                </div>

                {/* ─── PRECIO EN BOLÍVARES / BCV ─── */}
                {(() => {
                    const actualBcvRate = bcvRate || effectiveRate;
                    const has2 = isPrice2Active || (price2Usd !== '' && price2Usd !== null && price2Usd !== undefined);
                    const parsedPrice2Bs = parseFloat(price2Bs);
                    const bcvBsDisplay = (parsedPrice2Bs > 0)
                        ? price2Bs
                        : (price2Usd && parseFloat(price2Usd) > 0 ? (parseFloat(price2Usd) * actualBcvRate).toFixed(2) : '');

                    // Calcular si el recargo actual coincide con el de tienda o es custom
                    const priceUsdNum = parseFloat(priceUsd) || 0;
                    const currentP2Usd = parseFloat(price2Usd) || 0;
                    const expectedStoreP2Usd = priceUsdNum > 0 ? parseFloat((priceUsdNum * (1 + bcvMarginNum / 100)).toFixed(2)) : 0;
                    const isStoreMarginActive = has2 && expectedStoreP2Usd > 0 && Math.abs(currentP2Usd - expectedStoreP2Usd) < 0.01;
                    const customPctCalc = (has2 && priceUsdNum > 0 && !isStoreMarginActive)
                        ? Math.round(((currentP2Usd / priceUsdNum) - 1) * 100)
                        : null;

                    return (
                        <div className={`p-4 rounded-2xl border transition-all duration-300 ${
                            has2
                                ? 'bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/50 dark:from-blue-950/30 dark:via-slate-900 dark:to-indigo-950/30 border-blue-400/60 dark:border-blue-500/50 shadow-md shadow-blue-500/5 ring-1 ring-blue-500/20'
                                : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/60'
                        }`}>
                            {/* Cabecera con Tasa BCV oficial en tiempo real */}
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                <div className="flex items-start gap-2.5 min-w-0">
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                                        has2 ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xs ring-2 ring-blue-600/20' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                                    }`}>
                                        <Building2 size={16} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Precio en Bolívares / BCV</p>
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[9px] font-black rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700/50 shrink-0">
                                                <Landmark size={11} className="text-blue-600 dark:text-blue-400" /> Tasa BCV: {actualBcvRate} Bs
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">Cobro en Bs con recargo sobre BCV</p>
                                    </div>
                                </div>

                                {/* Selector de segmentos */}
                                <div className="flex items-center bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-xl shrink-0 border border-slate-300/40 dark:border-slate-700/50 w-full sm:w-auto">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsPrice2Active(false);
                                            handlePrice2UsdChange('');
                                        }}
                                        className={`flex-1 sm:flex-none justify-center px-2.5 py-1.5 text-[9px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                                            !has2 ? 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-xs' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600'
                                        }`}
                                    >
                                        <CircleX size={11} className="text-slate-400" /> Sin Recargo Bs
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsPrice2Active(true);
                                            if (!price2Usd || parseFloat(price2Usd) <= 0) {
                                                const p1 = parseFloat(priceUsd) || 0;
                                                const suggested = p1 > 0 ? (p1 * (1 + bcvMarginNum / 100)).toFixed(2) : '3.73';
                                                handlePrice2UsdChange(suggested);
                                            }
                                        }}
                                        className={`flex-1 sm:flex-none justify-center px-2.5 py-1.5 text-[9px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                                            has2 ? 'bg-blue-600 text-white shadow-xs ring-1 ring-blue-500/30' : 'text-slate-400 dark:text-slate-500 hover:text-blue-600'
                                        }`}
                                    >
                                        <Coins size={11} className={has2 ? 'text-white' : 'text-blue-500'} /> Con Precio Bs
                                    </button>
                                </div>
                            </div>

                            {/* Sugerencia automática & Chips rápidos */}
                            {parseFloat(priceUsd) > 0 && (() => {
                                const p2UsdSug = (parseFloat(priceUsd) * (1 + bcvMarginNum / 100)).toFixed(2);
                                const p2BsSugNum = parseFloat((parseFloat(p2UsdSug) * actualBcvRate).toFixed(2));
                                const p2BsSugFormatted = p2BsSugNum.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                return (
                                    <div className="mt-3 space-y-2.5">
                                        <div className="flex items-center justify-between gap-2 p-2 px-3 bg-blue-500/10 dark:bg-blue-900/30 border border-blue-200/80 dark:border-blue-700/50 rounded-xl">
                                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                                <p className="text-[10px] sm:text-xs font-bold text-blue-800 dark:text-blue-200">
                                                    Sugerido (+{bcvMarginNum}% Tienda): <span className="font-black text-blue-950 dark:text-white">${p2UsdSug} USD</span> <span className="text-blue-500 font-bold">➜</span> <span className="font-black text-blue-950 dark:text-white">Bs {p2BsSugFormatted}</span>
                                                </p>
                                            </div>
                                            {!has2 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsPrice2Active(true);
                                                        handlePrice2UsdChange(p2UsdSug);
                                                    }}
                                                    className="text-[9px] font-black bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 active:scale-95 transition-all cursor-pointer uppercase shrink-0 shadow-xs flex items-center gap-1"
                                                >
                                                    <CheckCircle size={10} /> Usar +{bcvMarginNum}%
                                                </button>
                                            )}
                                        </div>

                                        {/* Chips de Recargo Rápido */}
                                        <div className="flex items-center gap-2 flex-wrap pt-1">
                                            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide">Recargo:</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsPrice2Active(true);
                                                    setShowCustomPct(false);
                                                    handlePrice2UsdChange(p2UsdSug);
                                                }}
                                                className={`px-3 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    isStoreMarginActive
                                                        ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-500/30'
                                                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700'
                                                }`}
                                            >
                                                <Store size={13} /> {isStoreMarginActive ? '✓ ' : ''}+{bcvMarginNum}% Tienda
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setShowCustomPct(prev => !prev)}
                                                className={`px-3 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    showCustomPct || (customPctCalc !== null && customPctCalc > 0)
                                                        ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-500/30'
                                                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700'
                                                }`}
                                            >
                                                <SlidersHorizontal size={13} /> {customPctCalc !== null && customPctCalc > 0 ? `+${customPctCalc}% Personalizado` : 'Personalizado'}
                                            </button>

                                            {showCustomPct && (
                                                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2 py-1.5 rounded-xl border-2 border-blue-400 dark:border-blue-600 shadow-md animate-in fade-in zoom-in-95 duration-150">
                                                    <input
                                                        type="number"
                                                        inputMode="decimal"
                                                        value={customPctVal}
                                                        onChange={e => setCustomPctVal(e.target.value)}
                                                        placeholder="%"
                                                        className="w-16 text-sm font-black px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white outline-none border border-slate-200 dark:border-slate-700 text-center"
                                                        autoFocus
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                const pct = parseFloat(customPctVal);
                                                                if (!isNaN(pct) && pct >= 0) {
                                                                    setIsPrice2Active(true);
                                                                    handlePrice2UsdChange((parseFloat(priceUsd) * (1 + pct / 100)).toFixed(2));
                                                                    setShowCustomPct(false);
                                                                }
                                                            }
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const pct = parseFloat(customPctVal);
                                                            if (!isNaN(pct) && pct >= 0) {
                                                                setIsPrice2Active(true);
                                                                handlePrice2UsdChange((parseFloat(priceUsd) * (1 + pct / 100)).toFixed(2));
                                                                setShowCustomPct(false);
                                                            }
                                                        }}
                                                        className="px-3 py-1 text-xs font-black rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:scale-95 cursor-pointer"
                                                    >
                                                        Aplicar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Campos de entrada bidireccionales con Alta Legibilidad */}
                            {has2 && (
                                <div className="pt-3.5 mt-3.5 border-t border-blue-500/20 dark:border-blue-500/25 space-y-2.5 animate-in fade-in duration-200">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-[10px] font-black text-slate-700 dark:text-slate-200 tracking-wide uppercase">Precio en Dólares (BCV)</span>
                                                <span className="text-[9px] font-black px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-md border border-blue-200/60 dark:border-blue-800/40">USD</span>
                                            </div>
                                            <div className="relative">
                                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-blue-600 pointer-events-none">$</span>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    value={price2Usd}
                                                    onChange={e => {
                                                        setIsPrice2Active(true);
                                                        handlePrice2UsdChange(e.target.value);
                                                    }}
                                                    placeholder="3.73"
                                                    className="w-full bg-white dark:bg-slate-900 p-3 pl-8 rounded-xl font-black text-blue-950 dark:text-white text-sm sm:text-base outline-none border-2 border-blue-300 dark:border-blue-700 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all shadow-2xs"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-[10px] font-black text-emerald-800 dark:text-emerald-300 tracking-wide uppercase">Monto Final Bolívares</span>
                                                <span className="text-[9px] font-black px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 rounded-md border border-emerald-200 dark:border-emerald-800/40 flex items-center gap-1">
                                                    <Landmark size={10} /> Bs BCV
                                                </span>
                                            </div>
                                            <div className="relative">
                                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-emerald-700 dark:text-emerald-400 pointer-events-none">Bs</span>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    value={bcvBsDisplay}
                                                    onChange={e => {
                                                        setIsPrice2Active(true);
                                                        handlePrice2BsChange(e.target.value);
                                                    }}
                                                    placeholder="2749.87"
                                                    className="w-full bg-emerald-50/70 dark:bg-emerald-950/40 p-3 pl-10 rounded-xl font-black text-emerald-950 dark:text-emerald-100 text-sm sm:text-base outline-none border-2 border-emerald-400 dark:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all shadow-2xs"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* 💡 Tarjeta de Valor y Ganancia Real USDT (Reposición) */}
                                    {usdtRate > 0 && parseFloat(bcvBsDisplay) > 0 && (() => {
                                        const bsMonto = parseFloat(bcvBsDisplay) || 0;
                                        const realUsdtValue = (bsMonto / usdtRate).toFixed(2);
                                        const costUsdNum = parseFloat(costUsd) || 0;
                                        const realProfitVal = (parseFloat(realUsdtValue) - costUsdNum).toFixed(2);
                                        const realMarginPct = costUsdNum > 0 ? (((parseFloat(realUsdtValue) - costUsdNum) / costUsdNum) * 100).toFixed(1) : null;

                                        return (
                                            <div className="mt-3 p-3 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 rounded-xl flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                                                <div className="flex items-center gap-2">
                                                    <Sparkles size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                                                    <div>
                                                        <p className="text-[10px] font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">Valor Real al cambiar Bs ➔ USDT</p>
                                                        <p className="text-xs font-extrabold text-emerald-950 dark:text-emerald-100">
                                                            ${realUsdtValue} USDT <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">(Tasa USDT: {usdtRate} Bs/$)</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                {costUsdNum > 0 && (
                                                    <div className="bg-white/80 dark:bg-slate-900/80 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/50 text-right">
                                                        <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 block uppercase">Ganancia Real USDT</span>
                                                        <span className={`text-xs font-black ${parseFloat(realProfitVal) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                                                            {parseFloat(realProfitVal) >= 0 ? '+' : ''}${realProfitVal} USDT {realMarginPct !== null && `(${realMarginPct}%)`}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* ─── COP CONFUSION WARNING ─── */}
                {copEnabled && parsedPrice >= 100 && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 p-2.5 rounded-xl flex items-center gap-2 text-xs animate-in fade-in slide-in-from-top-1">
                        <AlertTriangle size={16} className="text-red-500 shrink-0" />
                        <span className="text-red-700 dark:text-red-400 font-medium">
                            {parsedPrice >= 1000
                                ? `¿Seguro que son $${parsedPrice.toLocaleString()} USD? Si es en pesos colombianos, usa el campo "Pesos COP" arriba.`
                                : `Precio alto en USD ($${parsedPrice.toFixed(2)}). Si es en pesos colombianos, usa el campo "Pesos COP" arriba.`
                            }
                        </span>
                    </div>
                )}

                {/* ─── COP PREVIEW ─── */}
                {copEnabled && parsedPrice > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/30 p-2.5 rounded-xl flex items-center justify-between text-sm animate-in fade-in slide-in-from-top-1">
                        <span className="text-amber-800 dark:text-amber-500 font-bold flex items-center gap-1.5 text-xs uppercase tracking-wider hidden sm:flex">
                            <Banknote size={16} /> Equivalente en COP
                        </span>
                        <span className="text-amber-800 dark:text-amber-500 font-bold flex items-center gap-1.5 text-xs uppercase tracking-wider sm:hidden">
                            <Banknote size={16} /> COP
                        </span>
                        <span className="font-black text-amber-600 dark:text-amber-400 text-lg">
                            {priceCop && parseFloat(priceCop) > 0
                                ? Math.round(parseFloat(priceCop)).toLocaleString('es-CO')
                                : Math.round(parsedPrice * tasaCop).toLocaleString('es-CO')}
                        </span>
                    </div>
                )}

                {/* ─── LOTE: Unit Price (Bimoneda) ─── */}
                {isLote && sellByUnit && parsedUnits > 1 && (
                    <div className="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-surface-300 dark:border-surface-800/40 space-y-2 animate-in fade-in slide-in-from-top-1">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-bold text-brand-dark dark:text-brand uppercase tracking-wider">Precio por Unidad Suelta</label>
                            {parsedPrice > 0 && parsedUnits > 0 && (
                                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                                    Auto: {copEnabled && tasaCop > 0
                                        ? `${Math.round((parsedPrice / parsedUnits) * tasaCop).toLocaleString('es-CO')} COP`
                                        : `$${(parsedPrice / parsedUnits).toFixed(2)}`}
                                </span>
                            )}
                        </div>
                        {copEnabled ? (
                            /* ── COP mode: COP input primary, USD + Bs derived ── */
                            <div className="space-y-2">
                                <div>
                                    <label className="text-[9px] font-bold text-amber-600 ml-0.5 mb-0.5 block">Pesos COP</label>
                                    <input type="number" inputMode="decimal" value={unitPriceCop}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setUnitPriceCop(val);
                                            setUnitPriceUsd(val && parseFloat(val) > 0 && tasaCop > 0
                                                ? (parseFloat(val) / tasaCop).toFixed(4)
                                                : '');
                                        }}
                                        placeholder={parsedPrice > 0 && parsedUnits > 0 && tasaCop > 0
                                            ? Math.round((parsedPrice / parsedUnits) * tasaCop).toString()
                                            : '0'}
                                        className="w-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 p-3 rounded-xl font-black text-amber-800 dark:text-amber-400 outline-none focus:ring-2 focus:ring-amber-500/50 text-sm" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[9px] font-bold text-emerald-500 ml-0.5 mb-0.5 block">USD ($)</label>
                                        <div className="w-full bg-emerald-50/50 dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/30 p-3 rounded-xl font-black text-emerald-700 dark:text-emerald-400 text-sm">
                                            {effectiveUnitPrice > 0 ? effectiveUnitPrice.toFixed(2) : '—'}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-brand ml-0.5 mb-0.5 block">Bolívares (Bs)</label>
                                        <div className="w-full bg-brand-light/50 dark:bg-slate-900 border border-surface-200 dark:border-surface-800/30 p-3 rounded-xl font-black text-brand-dark dark:text-brand text-sm flex items-center justify-between">
                                            {effectiveRate > 0 && effectiveUnitPrice > 0
                                                ? (effectiveUnitPrice * effectiveRate).toFixed(2)
                                                : '—'}
                                            <span className="text-[8px] bg-brand-light dark:bg-surface-800/30 text-brand px-1.5 py-0.5 rounded font-black">Bs</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* ── No COP mode: USD input primary, Bs derived ── */
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[9px] font-bold text-emerald-500 ml-0.5 mb-0.5 block">USD ($)</label>
                                    <input type="number" inputMode="decimal" value={unitPriceUsd}
                                        onChange={e => setUnitPriceUsd(e.target.value)}
                                        placeholder={parsedPrice > 0 && parsedUnits > 0 ? (parsedPrice / parsedUnits).toFixed(2) : '0.00'}
                                        className="w-full bg-brand-light/50 dark:bg-slate-900 border border-surface-200 dark:border-surface-700/30 p-3 rounded-xl font-black text-brand-dark dark:text-brand outline-none focus:ring-2 focus:ring-brand/50 text-sm" />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-brand ml-0.5 mb-0.5 block">Bolívares (Bs)</label>
                                    <div className="w-full bg-brand-light/50 dark:bg-slate-900 border border-surface-200 dark:border-surface-800/30 p-3 rounded-xl font-black text-brand-dark dark:text-brand text-sm flex items-center justify-between">
                                        {effectiveRate > 0
                                            ? (effectiveUnitPrice * effectiveRate).toFixed(2)
                                            : '—'}
                                        <span className="text-[8px] bg-brand-light dark:bg-surface-800/30 text-brand px-1.5 py-0.5 rounded font-black">Bs</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <p className="text-[9px] text-slate-400 italic">Déjalo vacío para usar el precio auto-calculado (lote ÷ unidades)</p>
                    </div>
                )}

                {/* ─── MARGIN PANEL ─── */}
                <div className={`p-3 rounded-xl border space-y-1.5 min-h-[60px] ${mainMarginPct !== null && mainMarginPct < 0
                    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30'
                    : mainMarginPct !== null && mainMarginPct === 0
                        ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'
                    }`}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Margen de Ganancia</p>
                    {parsedPrice > 0 && parsedCost > 0 ? (
                        <div className="space-y-1.5">
                            {/* Main margin */}
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 font-medium">{isLote ? 'Margen Bulto:' : isGranel ? `Margen / ${granelLabel}:` : 'Margen / Unidad:'}</span>
                                <span className={`font-black ${mainMarginPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {mainMarginPct.toFixed(1)}%
                                    <span className="text-xs ml-1.5 opacity-80 font-bold">(${mainMarginUsd.toFixed(2)})</span>
                                </span>
                            </div>

                            {/* Unit margin for lote with sellByUnit */}
                            {isLote && sellByUnit && parsedUnits > 1 && unitMarginPct !== null && (
                                <div className="flex justify-between items-center text-sm border-t border-slate-200/50 dark:border-slate-700/50 pt-1.5">
                                    <span className="text-slate-500 font-medium">Margen Unidad:</span>
                                    <span className={`font-black ${unitMarginPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {unitMarginPct.toFixed(1)}%
                                        <span className="text-xs ml-1.5 opacity-80 font-bold">(${unitMarginUsd.toFixed(2)})</span>
                                    </span>
                                </div>
                            )}

                            {/* Warnings */}
                            {mainMarginPct < 0 && (
                                <p className="text-[10px] font-bold text-rose-500 flex items-center gap-1 mt-1">
                                    <AlertTriangle size={11} /> Estás vendiendo a pérdida
                                </p>
                            )}
                            {mainMarginPct === 0 && (
                                <p className="text-[10px] font-bold text-amber-500 flex items-center gap-1 mt-1">
                                    <AlertTriangle size={11} /> Punto de equilibrio (sin ganancia)
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="text-xs text-slate-400 italic">
                            Ingresa Precio y Costo para calcular tu margen.
                            {parsedPrice > 0 && parsedCost === 0 && (
                                <p className="text-[10px] font-bold text-amber-500 flex items-center gap-1 mt-1 not-italic">
                                    <AlertTriangle size={11} /> Sin costo: no podrás ver tu ganancia real en reportes
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* ─── STOCK & ALERTA SECTION ─── */}
                {isLote ? (
                    <div className="grid grid-cols-3 gap-3 animate-in fade-in duration-200">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 ml-1 mb-1 block uppercase truncate">Bultos / Cajas</label>
                            <input 
                                type="number" 
                                step="any"
                                value={stockInLotes || ''} 
                                onChange={e => {
                                    const lotesVal = e.target.value;
                                    setStockInLotes(lotesVal);
                                    const numLotes = parseFloat(lotesVal) || 0;
                                    const derivedUnits = Math.round(numLotes * parsedUnits);
                                    setStock(lotesVal ? derivedUnits.toString() : '');
                                }} 
                                placeholder="0"
                                className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm" 
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 ml-1 mb-1 block uppercase truncate">Equiv. Unidades</label>
                            <input 
                                type="number" 
                                value={stock || ''} 
                                onChange={e => {
                                    const unitsVal = e.target.value;
                                    setStock(unitsVal);
                                    const numUnits = parseFloat(unitsVal) || 0;
                                    const derivedLotes = parsedUnits > 0 ? parseFloat((numUnits / parsedUnits).toFixed(2)) : 0;
                                    setStockInLotes(unitsVal ? derivedLotes.toString() : '');
                                }} 
                                placeholder="0"
                                className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm" 
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-amber-500 ml-1 mb-1 block uppercase flex items-center gap-1 truncate">
                                <AlertTriangle size={10} /> Alerta (Uds)
                            </label>
                            <input 
                                type="number" 
                                inputMode="numeric" 
                                value={lowStockAlert} 
                                onChange={e => setLowStockAlert(e.target.value)} 
                                placeholder="5"
                                className="w-full bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 p-3.5 rounded-xl font-bold text-amber-700 dark:text-amber-400 outline-none focus:ring-2 focus:ring-amber-500/50 text-sm" 
                            />
                            {parsedAlert > 0 && parsedUnits > 0 && (
                                <p className="text-[9px] text-amber-500/80 font-bold mt-1 ml-1 truncate">= {alertLotesCalc.toFixed(1)} bultos</p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3 animate-in fade-in duration-200">
                        <div>
                            <label className="text-xs font-bold text-slate-400 ml-1 mb-1 block uppercase">Stock</label>
                            <input 
                                type="number" 
                                inputMode="numeric" 
                                value={stock} 
                                onChange={e => setStock(e.target.value)} 
                                placeholder="0"
                                className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm" 
                            />
                            {!isLote && parsedUnits > 1 && (parseInt(stock) || 0) > 0 && (() => {
                                const parsedStock = parseInt(stock) || 0;
                                const bultos = Math.floor(parsedStock / parsedUnits);
                                const sobrante = parsedStock % parsedUnits;
                                let msg = '';
                                if (bultos > 0) {
                                    msg = `= ${bultos} bulto${bultos !== 1 ? 's' : ''}`;
                                    if (sobrante > 0) {
                                        msg += ` y ${sobrante} ud${sobrante !== 1 ? 's' : ''} suelta${sobrante !== 1 ? 's' : ''}`;
                                    } else {
                                        msg += ' exacto' + (bultos !== 1 ? 's' : '');
                                    }
                                } else {
                                    msg = `= ${sobrante} ud${sobrante !== 1 ? 's' : ''} suelta${sobrante !== 1 ? 's' : ''} (menos de 1 bulto)`;
                                }
                                return (
                                    <p className="text-[10px] text-brand font-bold mt-1 ml-1 animate-in fade-in duration-200">
                                        {msg}
                                    </p>
                                );
                            })()}
                        </div>
                        <div>
                            <label className="text-xs font-bold text-amber-500 ml-1 mb-1 block uppercase flex items-center gap-1">
                                <AlertTriangle size={10} /> Alerta mín.
                            </label>
                            <input 
                                type="number" 
                                inputMode="numeric" 
                                value={lowStockAlert} 
                                onChange={e => setLowStockAlert(e.target.value)} 
                                placeholder="5"
                                className="w-full bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 p-3.5 rounded-xl font-bold text-amber-700 dark:text-amber-400 outline-none focus:ring-2 focus:ring-amber-500/50 text-sm" />
                        </div>
                    </div>
                )}

                {/* ─── GARANTÍA DEL PRODUCTO ─── */}
                <div className={`p-4 rounded-2xl border transition-all duration-200 ${
                    hasWarranty 
                        ? 'bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-amber-500/10 dark:from-amber-500/10 dark:via-orange-500/10 dark:to-transparent border-amber-500/30 dark:border-amber-500/40 shadow-sm shadow-amber-500/5' 
                        : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/60'
                }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                                hasWarranty 
                                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25 ring-4 ring-amber-500/15' 
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
                            }`}>
                                <ShieldCheck size={20} />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">
                                        Garantía del Producto
                                    </p>
                                </div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">
                                    Ofrece cobertura de servicio o reemplazo al cliente
                                </p>
                            </div>
                        </div>

                        {/* Selector de Segmentos Interactivo */}
                        <div className="flex items-center bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl shrink-0 border border-slate-300/40 dark:border-slate-700/50 self-start sm:self-auto">
                            <button
                                type="button"
                                onClick={() => setHasWarranty(false)}
                                className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                                    !hasWarranty
                                        ? 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 shadow-sm'
                                        : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                                }`}
                            >
                                <X size={11} /> Sin Garantía
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setHasWarranty(true);
                                    if (!warrantyDays || warrantyDays <= 0) {
                                        setWarrantyDays('30');
                                    }
                                }}
                                className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                                    hasWarranty
                                        ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-500/30'
                                        : 'text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400'
                                }`}
                            >
                                <ShieldCheck size={11} /> Con Garantía
                            </button>
                        </div>
                    </div>

                    {hasWarranty && (
                        <div className="pt-3.5 mt-3.5 border-t border-amber-500/20 dark:border-amber-500/25 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="flex items-center justify-between">
                                <label className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                                    Días de Cobertura
                                </label>
                                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                    {warrantyDays === '365' ? '1 Año completo' : `${warrantyDays || 0} días seleccionados`}
                                </span>
                            </div>
                            
                            {/* Chips de selección rápida */}
                            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                                {[
                                    { days: 7, label: '7d' },
                                    { days: 15, label: '15d' },
                                    { days: 30, label: '30d' },
                                    { days: 60, label: '60d' },
                                    { days: 90, label: '90d' },
                                    { days: 180, label: '180d' },
                                    { days: 365, label: '1 Año' },
                                ].map((item) => {
                                    const isSelected = String(warrantyDays) === String(item.days);
                                    return (
                                        <button
                                            key={item.days}
                                            type="button"
                                            onClick={() => setWarrantyDays(item.days.toString())}
                                            className={`py-2 px-1 text-xs font-black rounded-xl border transition-all active:scale-95 cursor-pointer text-center ${
                                                isSelected
                                                    ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20 ring-2 ring-amber-500/30'
                                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-amber-400 dark:hover:border-amber-500 hover:bg-amber-50/50 dark:hover:bg-amber-950/20'
                                            }`}
                                        >
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Input personalizado de días */}
                            <div className="relative flex items-center">
                                <div className="absolute left-3 text-amber-500 pointer-events-none">
                                    <ShieldCheck size={16} />
                                </div>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min="1"
                                    value={warrantyDays}
                                    onChange={(e) => setWarrantyDays(e.target.value)}
                                    placeholder="Ej: 30"
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 pl-9 pr-28 py-2.5 rounded-xl font-black text-slate-800 dark:text-white text-sm outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all shadow-inner"
                                />
                                <span className="absolute right-3 text-xs font-bold text-slate-400 dark:text-slate-500 pointer-events-none uppercase tracking-wider">
                                    Días de garantía
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* ─── PRE-SAVE SUMMARY ─── */}
                {name && parsedPrice > 0 && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                        <button onClick={() => setShowSummary(!showSummary)}
                            type="button"
                            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                            <span>📋 Resumen antes de guardar</span>
                            {showSummary ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {showSummary && (
                            <div className="px-3 py-2.5 space-y-1.5 text-xs bg-white dark:bg-slate-900 animate-in fade-in slide-in-from-top-1 duration-150">
                                <div className="flex justify-between"><span className="text-slate-400">Nombre:</span><span className="font-bold text-slate-700 dark:text-white">{name}</span></div>
                                <div className="flex justify-between"><span className="text-slate-400">Categoría:</span><span className="font-bold text-slate-700 dark:text-white">{categories.find(c => c.id === category)?.label || category}</span></div>
                                <div className="flex justify-between"><span className="text-slate-400">Tipo:</span><span className="font-bold text-slate-700 dark:text-white">{PACKAGING_TYPES.find(p => p.id === packagingType)?.label}</span></div>
                                <div className="flex justify-between"><span className="text-slate-400">Precio USD/BS:</span><span className="font-bold text-emerald-600">${parsedPrice.toFixed(2)}{priceSuffix} / {(parsedPrice * effectiveRate).toFixed(2)} Bs</span></div>
                                {copEnabled && tasaCop > 0 && <div className="flex justify-between"><span className="text-amber-500/80">Precio COP:</span><span className="font-bold text-amber-600">{(priceCop && parseFloat(priceCop) > 0 ? Math.round(parseFloat(priceCop)) : Math.round(parsedPrice * tasaCop)).toLocaleString('es-CO')} COP{priceSuffix}</span></div>}
                                {parsedCost > 0 && <div className="flex justify-between"><span className="text-slate-400">Costo:</span><span className="font-bold text-slate-600">${parsedCost.toFixed(2)}{priceSuffix}</span></div>}
                                {mainMarginPct !== null && <div className="flex justify-between"><span className="text-slate-400">Margen:</span><span className={`font-black ${mainMarginPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{mainMarginPct.toFixed(1)}%</span></div>}
                                {isLote && <div className="flex justify-between"><span className="text-slate-400">Uds/Bulto:</span><span className="font-bold text-brand">{parsedUnits}</span></div>}
                                {isLote && sellByUnit && <div className="flex justify-between"><span className="text-slate-400">Venta suelta:</span><span className="font-bold text-brand">Sí — ${effectiveUnitPrice.toFixed(2)}/ud</span></div>}
                                <div className="flex justify-between"><span className="text-slate-400">Stock:</span><span className="font-bold text-slate-700 dark:text-white">{isLote ? `${parsedStockLotes} bultos (${stockUnitsCalc} uds)` : `${stock || 0}`}</span></div>
                                {barcode && <div className="flex justify-between"><span className="text-slate-400">Código:</span><span className="font-bold text-slate-700 dark:text-white">{barcode}</span></div>}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
