import React from "react";
import { DollarSign, Landmark, X } from "lucide-react";
import { formatBs, formatUsd } from "../../utils/calculatorUtils";

export default function PricePickerModal({ product, effectiveRate, bcvRate, rates, onSelect, onClose }) {
    if (!product) return null;

    const actualBcvRate = bcvRate || rates?.bcv?.price || rates?.bcv || effectiveRate;
    const price1 = product.priceUsdt || product.priceUsd || 0;
    const price2 = product.price2Usd || 0;
    const p1Bs = price1 * effectiveRate;
    const p2Bs = price2 * actualBcvRate;

    return (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4 sm:pb-0"
            onClick={onClose}>
            <div
                className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">A cual precio vendes?</p>
                        <h3 className="text-sm font-black text-slate-800 dark:text-white leading-tight truncate">{product.name}</h3>
                    </div>
                    <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer">
                        <X size={16} />
                    </button>
                </div>
                <div className="p-4 space-y-3">
                    {/* Precio 1: Divisas / USDT */}
                    <button type="button" onClick={() => onSelect(product, "usdt", price1)}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-900/10 hover:border-emerald-400 hover:bg-emerald-50 active:scale-98 transition-all cursor-pointer text-left group">
                        <div className="w-11 h-11 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/25 group-hover:scale-105 transition-transform">
                            <DollarSign size={22} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">PRECIO EN DIVISAS</p>
                            <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 leading-none mt-1">${formatUsd(price1)}</p>
                        </div>
                    </button>

                    {/* Precio 2: Bolívares */}
                    <button type="button" onClick={() => onSelect(product, "bcv", price2)}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-blue-200 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-900/10 hover:border-blue-400 hover:bg-blue-50 active:scale-98 transition-all cursor-pointer text-left group">
                        <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-600/25 group-hover:scale-105 transition-transform">
                            <Landmark size={22} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider">PRECIO EN BS BCV</p>
                            <p className="text-xl font-black text-blue-700 dark:text-blue-300 leading-none mt-1">Bs {formatBs(p2Bs)}</p>
                            <p className="text-xs text-blue-600/70 font-bold mt-1">Ref: ${formatUsd(price2)} USD</p>
                        </div>
                    </button>
                </div>
                <p className="text-center text-[10px] text-slate-400 pb-4 font-medium">Tap fuera para cancelar</p>
            </div>
        </div>
    );
}
