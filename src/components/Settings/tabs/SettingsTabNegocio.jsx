// v1.2.1: Calibrador y preview de ticket ocultados hasta nuevo aviso
import React, { useState, useRef, useEffect } from 'react';
import { Store, Printer, Coins, Check, Tag } from 'lucide-react';
import { SectionCard, Toggle } from '../../SettingsShared';
import { generarPreviewLabel } from '../../../utils/labelGenerator';


const CalibratorSlider = ({ label, value, setValue, baseKey, mode, paperWidth, min, max, step = 0.5, unit = 'mm', triggerHaptic }) => {
    const valFloat = parseFloat(value || '0');
    const is80 = paperWidth === '80';
    const suffix = is80
        ? (mode === 'mixto' ? '_80_mixto' : '_80_unico')
        : (mode === 'mixto' ? '_mixto' : '_unico');
    const storageKey = `${baseKey}${suffix}`;
    
    const handleIncrement = () => {
        const newVal = Math.min(max, valFloat + 1);
        const formatted = Number(newVal.toFixed(1)).toString();
        setValue(formatted);
        localStorage.setItem(storageKey, formatted);
        triggerHaptic?.();
    };

    const handleDecrement = () => {
        const newVal = Math.max(min, valFloat - 1);
        const formatted = Number(newVal.toFixed(1)).toString();
        setValue(formatted);
        localStorage.setItem(storageKey, formatted);
        triggerHaptic?.();
    };

    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold w-full">
                <span>{label}</span>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-0.5 shadow-sm">
                    <input
                        type="number"
                        step={step}
                        min={min}
                        max={max}
                        value={value}
                        onChange={e => {
                            const rawVal = e.target.value;
                            setValue(rawVal);
                            if (rawVal !== '' && !isNaN(parseFloat(rawVal))) {
                                localStorage.setItem(storageKey, rawVal);
                            }
                        }}
                        className="w-10 bg-transparent text-[10px] font-black text-brand text-right focus:outline-none focus:ring-0 p-0 border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[9px] font-black text-slate-400/80 dark:text-slate-500 select-none">{unit}</span>
                </div>
            </div>
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={handleDecrement}
                    className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-350 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-black transition-all active:scale-[0.85] select-none"
                >
                    -
                </button>
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={e => {
                        setValue(e.target.value);
                        localStorage.setItem(storageKey, e.target.value);
                        triggerHaptic?.();
                    }}
                    className="flex-1 h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand"
                />
                <button
                    type="button"
                    onClick={handleIncrement}
                    className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-350 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-black transition-all active:scale-[0.85] select-none"
                >
                    +
                </button>
            </div>
        </div>
    );
};

export default function SettingsTabNegocio({
    businessName, setBusinessName,
    businessRif, setBusinessRif,
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
    copEnabled, setCopEnabled,
    autoCopEnabled, setAutoCopEnabled,
    tasaCopManual, setTasaCopManual,
    copPrimary, setCopPrimary,
    calculatedTasaCop,
    effectiveRate,
    handleSaveBusinessData,
    forceHeartbeat,
    showToast,
    triggerHaptic,
}) {
    const [showCalibrator, setShowCalibrator] = useState(false);

    // ─── PdfPreview: 100% pixel-perfect usando jsPDF real embebido en iframe ──
    // generarPreviewLabel usa exactamente el mismo código que generarEtiquetas,
    // devuelve un blobURL del PDF que mostramos directamente — cero simulación.
    const PdfPreview = () => {
        const [pdfUrl, setPdfUrl] = useState(null);
        const [loading, setLoading] = useState(true);
        const prevUrlRef = useRef(null);

        const isMixto = labelCurrencyMode === 'mixto';
        const PX_MM   = 3.78;
        const is80 = paperWidth === '80';
        const W_PX = (is80 ? 80 : 58) * PX_MM;
        const H_PX = (is80
            ? (isMixto ? 80 : (hasSecondaryPrice ? 68 : 60))
            : (isMixto ? 60 : (hasSecondaryPrice ? 50 : 44))
        ) * PX_MM;

        useEffect(() => {
            let cancelled = false;
            setLoading(true);
            generarPreviewLabel(effectiveRate, copEnabled, calculatedTasaCop).then(url => {
                if (cancelled) return;
                if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
                prevUrlRef.current = url;
                setPdfUrl(url);
                setLoading(false);
            }).catch(() => {
                if (!cancelled) setLoading(false);
            });
            return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [
            labelCurrencyMode,
            paperWidth,
            labelOffsetNameX, labelOffsetNameY,
            labelOffsetPriceX, labelOffsetPriceY,
            labelOffsetSecPriceX, labelOffsetSecPriceY,
            labelOffsetFooterX, labelOffsetFooterY,
            labelOffsetFontName, labelOffsetFontPrice,
            labelOffsetFontSecPrice, labelOffsetFontFooter,
            effectiveRate, copEnabled, calculatedTasaCop,
        ]);

        return (
            <div
                className="relative border border-slate-200 dark:border-slate-700 shadow-md rounded bg-white overflow-hidden"
                style={{ width: `${W_PX}px`, height: `${H_PX}px` }}
            >
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-slate-400 text-xs">
                        Generando…
                    </div>
                )}
                {pdfUrl && (
                    <iframe
                        key={pdfUrl}
                        src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                        title="Vista previa del ticket"
                        style={{
                            width: `${W_PX}px`,
                            height: `${H_PX}px`,
                            border: 'none',
                            display: 'block',
                        }}
                    />
                )}
            </div>
        );
    };


    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">

            {/* Impresora - Sólo Tamaño de Ticket */}
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

        </div>
    );
}
