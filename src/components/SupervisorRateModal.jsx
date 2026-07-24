import React, { useState, useEffect } from 'react';
import { X, TrendingUp, DollarSign, Loader2 } from 'lucide-react';
import { supabaseCloud } from '../config/supabaseCloud';
import { showToast } from './Toast';

export default function SupervisorRateModal({ isOpen, onClose, rates, primaryDeviceId, triggerHaptic }) {
    const [rateMode, setRateMode] = useState('bcv'); // 'bcv', 'euro', 'usdt', 'manual'
    const [customRate, setCustomRate] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const savedMode = localStorage.getItem('bodega_rate_mode') || 'bcv';
            const savedCustom = localStorage.getItem('bodega_custom_rate') || '';
            setRateMode(savedMode);
            setCustomRate(savedCustom);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const bcvPrice = rates?.bcv?.price || 0;
    const euroPrice = rates?.euro?.price || 0;
    const usdtPrice = rates?.usdt?.price || 0;

    const handleApply = async () => {
        triggerHaptic?.();
        
        if (rateMode === 'manual') {
            const val = parseFloat(customRate);
            if (isNaN(val) || val <= 0) {
                showToast('Ingresa un valor de tasa válido mayor a 0', 'error');
                return;
            }
        }

        setLoading(true);
        try {
            const monitorDeviceId = localStorage.getItem('pda_device_id') || 'monitor_web';
            
            const { error } = await supabaseCloud
                .from('supervisor_commands')
                .insert({
                    primary_device_id: primaryDeviceId,
                    monitor_device_id: monitorDeviceId,
                    command_type: 'rate_change',
                    payload: {
                        rateMode,
                        customRate: rateMode === 'manual' ? parseFloat(customRate) : null
                    },
                    status: 'pending'
                });

            if (error) throw error;

            localStorage.setItem('bodega_rate_mode', rateMode);
            localStorage.setItem('bodega_use_auto_rate', JSON.stringify(rateMode !== 'manual'));
            if (rateMode === 'manual') {
                localStorage.setItem('bodega_custom_rate', String(customRate));
            } else {
                localStorage.removeItem('bodega_custom_rate');
            }
            window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: 'bodega_rate_mode' } }));
            window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: 'bodega_custom_rate' } }));

            showToast('¡Comando de tasa enviado a la caja con éxito!', 'success');
            onClose();
        } catch (err) {
            console.error('[SupervisorRateModal] Error al enviar comando:', err);
            showToast('Error al enviar comando: ' + (err.message || 'Error de conexión'), 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-5 sm:p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col gap-4 sm:gap-5 text-white">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                            <TrendingUp size={20} />
                        </div>
                        <div>
                            <h3 className="font-display font-bold text-base text-white">Cambiar Tasa Remota</h3>
                            <p className="text-[10px] text-slate-400 font-medium">El Spot Concept Store</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
                    Selecciona la tasa de cambio de referencia. Se aplicará a los cálculos de precios en bolívares (Bs) en la caja principal de forma inmediata.
                </p>

                {/* Opciones */}
                <div className="flex flex-col gap-2.5">
                    {/* Opción BCV */}
                    <button
                        onClick={() => { triggerHaptic?.(); setRateMode('bcv'); }}
                        className={`p-3.5 rounded-2xl border-2 text-left transition-all flex justify-between items-center active:scale-[0.99] ${
                            rateMode === 'bcv'
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-200'
                        }`}
                    >
                        <div className="flex flex-col">
                            <span className="text-xs font-bold">Dólar BCV Oficial</span>
                            <span className="text-[10px] text-slate-400 font-medium">Tasa oficial del Banco Central</span>
                        </div>
                        <span className="text-sm font-black text-emerald-400">{bcvPrice ? `${bcvPrice.toFixed(2)} Bs` : 'Cargando...'}</span>
                    </button>

                    {/* Opción Euro */}
                    <button
                        onClick={() => { triggerHaptic?.(); setRateMode('euro'); }}
                        className={`p-3.5 rounded-2xl border-2 text-left transition-all flex justify-between items-center active:scale-[0.99] ${
                            rateMode === 'euro'
                                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-200'
                        }`}
                    >
                        <div className="flex flex-col">
                            <span className="text-xs font-bold">Euro BCV</span>
                            <span className="text-[10px] text-slate-400 font-medium">Tasa oficial de Euro BCV</span>
                        </div>
                        <span className="text-sm font-black text-cyan-400">{euroPrice ? `${euroPrice.toFixed(2)} Bs` : 'Cargando...'}</span>
                    </button>

                    {/* Opción USDT */}
                    <button
                        onClick={() => { triggerHaptic?.(); setRateMode('usdt'); }}
                        className={`p-3.5 rounded-2xl border-2 text-left transition-all flex justify-between items-center active:scale-[0.99] ${
                            rateMode === 'usdt'
                                ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-200'
                        }`}
                    >
                        <div className="flex flex-col">
                            <span className="text-xs font-bold">Binance / Paralelo</span>
                            <span className="text-[10px] text-slate-400 font-medium">Tasa promedio de mercado</span>
                        </div>
                        <span className="text-sm font-black text-amber-400">{usdtPrice ? `${usdtPrice.toFixed(2)} Bs` : 'Cargando...'}</span>
                    </button>

                    {/* Opción Manual */}
                    <div
                        className={`p-3.5 rounded-2xl border-2 transition-all flex flex-col gap-3 ${
                            rateMode === 'manual'
                                ? 'border-purple-500 bg-purple-500/10'
                                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                        }`}
                        onClick={() => { if (rateMode !== 'manual') { triggerHaptic?.(); setRateMode('manual'); } }}
                    >
                        <div className="flex justify-between items-center cursor-pointer">
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-white">Tasa Manual Personalizada</span>
                                <span className="text-[10px] text-slate-400 font-medium">Ingresa un valor específico</span>
                            </div>
                            {rateMode !== 'manual' && (
                                <span className="text-[10px] font-bold text-purple-400 uppercase bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">Activar</span>
                            )}
                        </div>
                        {rateMode === 'manual' && (
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    placeholder="Ej. 45.50"
                                    value={customRate}
                                    onChange={(e) => setCustomRate(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3.5 text-sm font-bold outline-none focus:border-purple-500 transition-colors text-white"
                                />
                                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Bs/$</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 pt-1">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold rounded-xl active:scale-[0.98] transition-all text-xs"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={loading}
                        className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 text-xs"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="animate-spin" size={14} />
                                <span>Aplicando...</span>
                            </>
                        ) : (
                            <>
                                <DollarSign size={14} />
                                <span>Aplicar en Caja</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
