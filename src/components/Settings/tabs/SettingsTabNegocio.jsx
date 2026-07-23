import React, { useState, useRef, useEffect } from 'react';
import { Store, Printer, Coins, Check, Tag, Landmark, Package, FileText, DollarSign, CreditCard } from 'lucide-react';
import { SectionCard, Toggle } from '../../SettingsShared';
import PaymentMethodsManager from '../PaymentMethodsManager';
import CasheaIcon from '../../CasheaIcon';

export default function SettingsTabNegocio({
    paperWidth, setPaperWidth,
    labelCurrencyMode, setLabelCurrencyMode,
    labelOffsetNameX, setLabelOffsetNameX,
    labelOffsetNameY, setLabelOffsetNameY,
    labelOffsetPriceX, setLabelOffsetPriceX,
    labelOffsetPriceY, setLabelOffsetPriceY,
    labelOffsetSecPriceX, setLabelOffsetSecPriceX,
    labelOffsetSecPriceY, setLabelOffsetSecPriceY,
    labelOffsetFooterX, setLabelOffsetFooterX,
    labelOffsetFooterY, setLabelOffsetFooterY,
    labelOffsetFontName, setLabelOffsetFontName,
    labelOffsetFontPrice, setLabelOffsetFontPrice,
    labelOffsetFontSecPrice, setLabelOffsetFontSecPrice,
    labelOffsetFontFooter, setLabelOffsetFontFooter,
    allowNegativeStock, setAllowNegativeStock,
    copEnabled, setCopEnabled,
    autoCopEnabled, setAutoCopEnabled,
    tasaCopManual, setTasaCopManual,
    copPrimary, setCopPrimary,
    calculatedTasaCop,
    effectiveRate,
    bcvMarginPctState,
    setBcvMarginPct,
    handleSaveBusinessData,
    forceHeartbeat,
    showToast,
    triggerHaptic,
}) {
    const [casheaEnabled, setCasheaEnabled] = useState(() => localStorage.getItem('cashea_enabled') === 'true');
    const [casheaMinAmount, setCasheaMinAmount] = useState(() => localStorage.getItem('cashea_min_amount') || '0');
    const [receiptCurrency, setReceiptCurrency] = useState(() => localStorage.getItem('receipt_currency_mode') || 'bs');
    const [cashAdvanceEnabled, setCashAdvanceEnabled] = useState(() => localStorage.getItem('allow_cash_advance') === 'true');
    const [cashAdvancePct, setCashAdvancePct] = useState(() => localStorage.getItem('cash_advance_default_pct') || '10');

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">

                {/* Recargo BCV por defecto de la Tienda */}
                <SectionCard icon={Landmark} title="Recargo BCV de la Tienda" subtitle="Porcentaje de recargo automático al cobrar en Bs" iconColor="text-blue-600">
                    <div className="space-y-3">
                        <div>
                            <label className="text-[11px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400 block mb-1 font-mono">% Recargo por Defecto en Bs</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={bcvMarginPctState}
                                    onChange={e => setBcvMarginPct(e.target.value)}
                                    placeholder="49"
                                    className="w-full bg-slate-50 dark:bg-slate-950 p-2.5 pr-8 rounded-xl font-black text-blue-700 dark:text-blue-400 outline-none border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500/40 text-xs"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 pointer-events-none">%</span>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                            Este porcentaje se aplica sobre el precio base USD para sugerir el monto de cobro en Bolívares.
                        </p>
                    </div>
                </SectionCard>

                {/* Impresora - Ancho de Ticket */}
                <SectionCard icon={Printer} title="Tamaño de Ticket" subtitle="Configuración del ancho de papel" iconColor="text-brand">
                    <label className="text-[11px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400 block mb-1.5">Ancho de Papel</label>
                    <div className="grid grid-cols-2 gap-2">
                        {[{ val: '58', label: '58 mm (Pequeña)' }, { val: '80', label: '80 mm (Estándar)' }].map(opt => (
                            <button
                                key={opt.val}
                                onClick={() => { setPaperWidth(opt.val); localStorage.setItem('printer_paper_width', opt.val); triggerHaptic?.(); }}
                                className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all border ${paperWidth === opt.val
                                    ? 'bg-brand-light dark:bg-brand/10 border-brand text-brand-dark dark:text-brand shadow-sm'
                                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </SectionCard>

                {/* Etiquetas de Precios */}
                <SectionCard icon={Tag} title="Etiquetas de Productos" subtitle="Moneda a mostrar en la etiqueta" iconColor="text-brand">
                    <div className="space-y-4">
                        <div>
                            <label className="text-[11px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400 block mb-1.5">Moneda del Precio</label>
                            <div className="grid grid-cols-3 gap-1.5">
                                {[
                                    { val: 'bs', label: 'Bs' },
                                    { val: 'usd', label: '$' },
                                    { val: 'mixto', label: 'Mixto' }
                                ].map(opt => (
                                    <button
                                        key={opt.val}
                                        onClick={() => {
                                            setLabelCurrencyMode(opt.val);
                                            localStorage.setItem('label_currency_mode', opt.val);
                                            triggerHaptic?.();
                                            showToast(`Moneda de etiqueta cambiada a ${opt.label}`, 'success');
                                        }}
                                        className={`py-2.5 px-2 text-xs font-bold rounded-xl transition-all border text-center ${labelCurrencyMode === opt.val
                                            ? 'bg-brand-light dark:bg-brand/10 border-brand text-brand-dark dark:text-brand shadow-sm'
                                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </SectionCard>

                {/* Ticket de Venta */}
                <SectionCard icon={FileText} title="Ticket de Venta" subtitle="Moneda del comprobante" iconColor="text-blue-500">
                    <div className="space-y-3">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Elige en qué moneda se expresarán los precios y totales del ticket al imprimir o compartir:
                        </p>
                        <div className="grid grid-cols-3 gap-2 pt-1">
                            {[
                                { id: 'bs', label: 'Bolívares' },
                                { id: 'usd', label: 'Dólares ($)' },
                                { id: 'mixto', label: 'Mixto' }
                            ].map(opt => {
                                const isSelected = receiptCurrency === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => {
                                            setReceiptCurrency(opt.id);
                                            localStorage.setItem('receipt_currency_mode', opt.id);
                                            forceHeartbeat?.();
                                            showToast(`Ticket configurado en ${opt.label}`, 'success');
                                            triggerHaptic?.();
                                        }}
                                        className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                                            isSelected
                                                ? 'bg-brand text-white border-transparent shadow-sm'
                                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-850 hover:border-brand/40'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </SectionCard>

                {/* Reglas de Inventario */}
                <SectionCard icon={Package} title="Inventario" subtitle="Reglas de ventas" iconColor="text-emerald-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Vender sin Stock</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Permitir ventas si el inventario es 0</p>
                        </div>
                        <Toggle
                            enabled={allowNegativeStock}
                            onChange={() => {
                                const newVal = !allowNegativeStock;
                                setAllowNegativeStock(newVal);
                                localStorage.setItem('allow_negative_stock', newVal.toString());
                                forceHeartbeat?.();
                                showToast(newVal ? 'Se permite vender sin stock' : 'No se permite vender sin stock', 'success');
                                triggerHaptic?.();
                            }}
                        />
                    </div>
                </SectionCard>

                {/* Financiamiento Cashea */}
                <SectionCard icon={CasheaIcon} title="Financiamiento Cashea" subtitle="Configuración de Cashea" iconColor="text-purple-500">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Activar Cashea</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Habilitar cobros financiados por Cashea en caja</p>
                            </div>
                            <Toggle
                                enabled={casheaEnabled}
                                onChange={() => {
                                    const newVal = !casheaEnabled;
                                    setCasheaEnabled(newVal);
                                    localStorage.setItem('cashea_enabled', newVal.toString());
                                    forceHeartbeat?.();
                                    showToast(newVal ? 'Módulo Cashea activado' : 'Módulo Cashea desactivado', 'success');
                                    triggerHaptic?.();
                                }}
                            />
                        </div>

                        {casheaEnabled && (
                            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 animate-in fade-in">
                                <div>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Compra Mínima ($)</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Monto mínimo en dólares para permitir Cashea</p>
                                </div>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    value={casheaMinAmount}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setCasheaMinAmount(val);
                                        localStorage.setItem('cashea_min_amount', val);
                                        forceHeartbeat?.();
                                    }}
                                    className="w-24 text-right font-bold text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-white outline-none focus:ring-1 focus:ring-purple-500"
                                />
                            </div>
                        )}
                    </div>
                </SectionCard>

                {/* Avance de Efectivo */}
                <SectionCard icon={DollarSign} title="Avance de Efectivo" subtitle="Configuración de Avances" iconColor="text-amber-500">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Habilitar Avances</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Permitir avances de efectivo con comisión en caja</p>
                            </div>
                            <Toggle
                                enabled={cashAdvanceEnabled}
                                onChange={() => {
                                    const newVal = !cashAdvanceEnabled;
                                    setCashAdvanceEnabled(newVal);
                                    localStorage.setItem('allow_cash_advance', newVal.toString());
                                    forceHeartbeat?.();
                                    showToast(newVal ? 'Módulo de Avance de Efectivo activado' : 'Módulo de Avance de Efectivo desactivado', 'success');
                                    triggerHaptic?.();
                                }}
                            />
                        </div>

                        {cashAdvanceEnabled && (
                            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 animate-in fade-in">
                                <div>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Comisión por Defecto (%)</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Porcentaje de recargo por el servicio de avance</p>
                                </div>
                                <input
                                    type="number"
                                    placeholder="10"
                                    value={cashAdvancePct}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setCashAdvancePct(val);
                                        localStorage.setItem('cash_advance_default_pct', val);
                                        forceHeartbeat?.();
                                    }}
                                    className="w-24 text-right font-bold text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-white outline-none focus:ring-1 focus:ring-amber-500"
                                />
                            </div>
                        )}
                    </div>
                </SectionCard>

            </div>

            {/* Métodos de Pago Activos */}
            <div className="pt-2">
                <PaymentMethodsManager
                    copEnabled={copEnabled}
                    setCopEnabled={setCopEnabled}
                    autoCopEnabled={autoCopEnabled}
                    setAutoCopEnabled={setAutoCopEnabled}
                    tasaCopManual={tasaCopManual}
                    setTasaCopManual={setTasaCopManual}
                    copPrimary={copPrimary}
                    setCopPrimary={setCopPrimary}
                    calculatedTasaCop={calculatedTasaCop}
                    effectiveRate={effectiveRate}
                    showToast={showToast}
                    triggerHaptic={triggerHaptic}
                />
            </div>
        </div>
    );
}
