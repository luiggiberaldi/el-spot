import React, { useState, useEffect } from 'react';
import { X, Package, Barcode, Tag, AlertTriangle, Send, Loader2 } from 'lucide-react';
import { useProductContext } from '../../context/ProductContext';

const EMPTY = {
    name: '', category: '', barcode: '',
    priceUsd: '', priceBsManual: '', costUsd: '', stock: '', lowStockAlert: '5',
    sellByBox: false, boxUnits: '', boxBarcode: '', boxPriceUsd: '',
    sellByHalfBox: false, halfBoxUnits: '', halfBoxBarcode: '', halfBoxPriceUsd: '',
    pricingMode: 'tasa_dia',
};

function productToForm(p) {
    if (!p) return { ...EMPTY };
    const s = (v) => (v == null ? '' : String(v));
    return {
        name: s(p.name), category: s(p.category), barcode: s(p.barcode),
        priceUsd: s(p.priceUsd || p.priceUsdt), priceBsManual: s(p.priceBsManual),
        costUsd: s(p.costUsd), stock: s(p.stock), lowStockAlert: s(p.lowStockAlert ?? 5),
        sellByBox: Boolean(p.sellByBox), boxUnits: s(p.boxUnits), boxBarcode: s(p.boxBarcode),
        boxPriceUsd: s(p.boxPriceUsd),
        sellByHalfBox: Boolean(p.sellByHalfBox), halfBoxUnits: s(p.halfBoxUnits), halfBoxBarcode: s(p.halfBoxBarcode),
        halfBoxPriceUsd: s(p.halfBoxPriceUsd),
        pricingMode: p.pricingMode || (p.forceBcv ? 'bcv' : 'tasa_dia'),
    };
}

const inputCls = 'w-full bg-slate-900 border border-slate-800 p-2.5 rounded-xl font-bold text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500/40';
const labelCls = 'text-[9px] font-bold text-slate-400 ml-1 mb-0.5 block uppercase';

export default function RemoteProductFormModal({ isOpen, onClose, editingProduct, onSubmit, effectiveRate }) {
    const { categories } = useProductContext();
    const [form, setForm] = useState(EMPTY);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (isOpen) setForm(productToForm(editingProduct));
    }, [isOpen, editingProduct]);

    if (!isOpen) return null;

    const set = (field) => (e) => {
        const value = e?.target ? e.target.value : e;
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const priceNum = Number(form.priceUsd) || 0;
    const canSave = form.name.trim().length >= 2 && priceNum > 0;

    const handleSubmit = async () => {
        if (!canSave || sending) return;
        setSending(true);
        try {
            const data = {
                ...(editingProduct || {}),
                name: form.name.trim(),
                category: form.category || editingProduct?.category || 'varios',
                barcode: form.barcode.trim() || null,
                priceUsd: Number(form.priceUsd) || 0,
                priceUsdt: Number(form.priceUsd) || 0,
                priceBsManual: form.priceBsManual !== '' ? Number(form.priceBsManual) : null,
                costUsd: Number(form.costUsd) || 0,
                stock: parseInt(form.stock, 10) || 0,
                lowStockAlert: parseInt(form.lowStockAlert, 10) || 5,
                sellByBox: form.sellByBox,
                boxUnits: form.sellByBox ? parseInt(form.boxUnits, 10) || null : null,
                boxBarcode: form.sellByBox ? form.boxBarcode.trim() || null : null,
                boxPriceUsd: form.sellByBox && form.boxPriceUsd !== '' ? Number(form.boxPriceUsd) : null,
                sellByHalfBox: form.sellByBox && form.sellByHalfBox,
                halfBoxUnits: form.sellByHalfBox ? parseInt(form.halfBoxUnits, 10) || null : null,
                halfBoxBarcode: form.sellByHalfBox ? form.halfBoxBarcode.trim() || null : null,
                halfBoxPriceUsd: form.sellByHalfBox && form.halfBoxPriceUsd !== '' ? Number(form.halfBoxPriceUsd) : null,
            };
            delete data.image;
            if (!editingProduct) data.id = crypto.randomUUID();
            await onSubmit(editingProduct ? 'edit' : 'add', data.id, data);
            onClose();
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto space-y-4 text-white">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                            <Package size={18} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-sm">
                                {editingProduct ? 'Editar producto (remoto)' : 'Nuevo producto (remoto)'}
                            </h3>
                            <p className="text-[10px] text-slate-400 font-medium">Se enviará a la caja al guardar</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="space-y-2">
                    <div>
                        <label className={labelCls}>Nombre del Artículo *</label>
                        <input value={form.name} onChange={set('name')} placeholder="Ej: Audífonos Bluetooth Lenovo" className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className={labelCls}>Categoría</label>
                            <select value={form.category} onChange={set('category')} className={inputCls}>
                                <option value="">Seleccionar...</option>
                                {(categories || []).filter(c => c && c.id !== 'todos').map(c => (
                                    <option key={c.id || c.name} value={c.id || c.name}>{c.label || c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}><Barcode size={9} className="inline mr-0.5" />Código de barras</label>
                            <input value={form.barcode} onChange={set('barcode')} placeholder="Escanear..." className={inputCls} />
                        </div>
                    </div>
                </div>

                {/* Precios */}
                <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1"><Tag size={10} /> Precio Unidad</span>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className={labelCls}>Precio USD ($) *</label>
                            <input type="number" inputMode="decimal" value={form.priceUsd} onChange={set('priceUsd')} placeholder="0.00" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Costo USD ($)</label>
                            <input type="number" inputMode="decimal" value={form.costUsd} onChange={set('costUsd')} placeholder="0.00" className={inputCls} />
                        </div>
                    </div>
                    {priceNum > 0 && (
                        <p className="text-[10px] text-emerald-400 font-bold">
                            Ref. Bs: {(priceNum * (effectiveRate || 1)).toFixed(2)} Bs
                        </p>
                    )}
                </div>

                {/* Stock & Alerta */}
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className={labelCls}>Stock (Uds)</label>
                        <input
                            type="number" inputMode="numeric" value={form.stock} onChange={set('stock')} placeholder="0"
                            disabled={Boolean(editingProduct)}
                            title={editingProduct ? 'Ajusta con +/- en la lista' : undefined}
                            className={`${inputCls} ${editingProduct ? 'opacity-40 cursor-not-allowed' : ''}`}
                        />
                        {editingProduct && <span className="text-[8px] text-slate-400 font-medium block mt-0.5 ml-1">Ajusta stock con +/-</span>}
                    </div>
                    <div>
                        <label className={`${labelCls} text-amber-400 flex items-center gap-0.5`}><AlertTriangle size={9} /> Alerta stock mínimo</label>
                        <input type="number" inputMode="numeric" value={form.lowStockAlert} onChange={set('lowStockAlert')} placeholder="5" className={inputCls} />
                    </div>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={!canSave || sending}
                    className="w-full py-3 rounded-2xl font-bold text-slate-950 uppercase tracking-wider text-xs bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {sending ? 'Guardando...' : 'Enviar Comando a Caja'}
                </button>
            </div>
        </div>
    );
}
