import React from 'react';
import { Tag, AlertTriangle, Minus, Plus, Pencil, Trash2, Package, Layers, Clock, Printer, ShieldCheck } from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_ICONS, UNITS } from '../../config/categories';
import { formatUsd, formatBs, formatCop, smartCashRounding, getCop, getUsd } from '../../utils/calculatorUtils';
import { showToast } from '../Toast';
import { useProductContext } from '../../context/ProductContext';

export default function ProductCard({
    product: p,
    effectiveRate,
    bcvRate,
    streetRate,
    rates: ratesProp,
    categories,
    onAdjustStock,
    copEnabled,
    copPrimary,
    tasaCop,
    daysRemaining,
    isSelected,
    onToggleSelect,
    onPrint,
    readOnly = false,

    onEdit,
    onDelete
}) {
    let rates = ratesProp;
    if (!rates) {
        try {
            const ctx = useProductContext();
            rates = ctx?.rates;
        } catch (e) { }
    }

    const effectiveUsd = getUsd(p, tasaCop);
    const valBs = effectiveUsd * effectiveRate;
    const valCop = getCop(p, tasaCop);
    const isLowStock = (p.stock ?? 0) <= (p.lowStockAlert ?? 5);

    const costUsd = p.costUsd || (p.costBs && effectiveRate > 0 ? p.costBs / effectiveRate : 0);
    const bcvRateVal = bcvRate || effectiveRate || 0;
    // Validador estricto: sólo usar rates.usdt.price si es mayor que bcvRate (evita fallback a tasa vieja 36.35)
    const rawUsdt = rates?.usdt?.price ?? 0;
    const usdtRateVal = (rawUsdt > bcvRateVal && rawUsdt > 0) ? rawUsdt : (bcvRateVal || streetRate || 0);

    // Si el producto tiene precio BCV (p.price2Usd), calculamos el valor y ganancia real al cobrar en Bs
    const bcvBsTotal = (p.price2Usd && p.price2Usd > 0) ? (p.price2Usd * bcvRateVal) : 0;
    const realUsdtVal = (bcvBsTotal > 0 && usdtRateVal > 0) ? (bcvBsTotal / usdtRateVal) : (p.price2Usd || effectiveUsd);
    const realProfitUsd = realUsdtVal - costUsd;
    const realBsMarginPct = (costUsd > 0 && realUsdtVal > 0) ? (((realUsdtVal - costUsd) / costUsd) * 100) : null;

    const nominalMargin = costUsd > 0 ? (((effectiveUsd - costUsd) / costUsd) * 100) : null;
    const margin = (p.price2Usd && p.price2Usd > 0) ? realBsMarginPct : nominalMargin;

    const catInfo = categories.find(c => c.id === p.category);
    const unitInfo = UNITS.find(u => u.id === p.unit);
    const efectivoPrecio = streetRate > 0 ? `$${smartCashRounding(valBs / streetRate)}` : null;

    const copyTicketDebugLog = (e) => {
        e.stopPropagation();
        const paperWidth = localStorage.getItem('printer_paper_width') || '58';
        const mode = localStorage.getItem('label_currency_mode') || 'mixto';
        const isMixto = mode === 'mixto';

        let suffix, LABEL_W, labelH, marginX, marginY, centerX;
        let defNameX, defNameY, defPriceX, defPriceY, defSecPriceX, defSecPriceY, defFooterX, defFooterY;
        let defFontName, defFontPrice, defFontSecPrice, defFontFooter;

        const hasSecondaryPrice = copEnabled && tasaCop > 0;

        if (paperWidth === '80') {
            suffix = isMixto ? '_80_mixto' : '_80_unico';
            LABEL_W = 80;
            labelH = isMixto ? 80 : (hasSecondaryPrice ? 68 : 60);
            marginX = 6;
            marginY = 4.5;
            centerX = 40.0;

            defNameX = '0';
            defNameY = '0';
            defPriceX = '0';
            defPriceY = isMixto ? '-6' : '-2';
            defSecPriceX = '0';
            defSecPriceY = isMixto ? '-3' : '2';
            defFooterX = '0';
            defFooterY = '0';

            defFontName = '4';
            defFontPrice = '14';
            defFontSecPrice = isMixto ? '12' : '0';
            defFontFooter = '3';
        } else {
            suffix = isMixto ? '_mixto' : '_unico';
            LABEL_W = 58;
            labelH = isMixto ? 60 : (hasSecondaryPrice ? 50 : 44);
            marginX = 4.5;
            marginY = 3.5;
            centerX = isMixto ? (LABEL_W / 2 - 3) : (LABEL_W / 2 + 0.5);

            defNameX = isMixto ? '-1.5' : '1';
            defNameY = isMixto ? '2' : '0';
            defPriceX = isMixto ? '-1.5' : '1';
            defPriceY = isMixto ? '-7.5' : '-3';
            defSecPriceX = isMixto ? '-1.5' : '1';
            defSecPriceY = isMixto ? '-3' : '2';
            defFooterX = isMixto ? '-1.5' : '1';
            defFooterY = isMixto ? '-1' : '1';

            defFontName = isMixto ? '5' : '5';
            defFontPrice = isMixto ? '10' : '10';
            defFontSecPrice = isMixto ? '12.5' : '0';
            defFontFooter = isMixto ? '4' : '4';
        }

        const nameX = parseFloat(localStorage.getItem(`label_offset_name_x${suffix}`) || defNameX);
        const nameY = parseFloat(localStorage.getItem(`label_offset_name_y${suffix}`) || defNameY);
        const priceX = parseFloat(localStorage.getItem(`label_offset_price_x${suffix}`) || defPriceX);
        const priceYOffset = parseFloat(localStorage.getItem(`label_offset_price_y${suffix}`) || defPriceY);
        const secPriceX = parseFloat(localStorage.getItem(`label_offset_sec_price_x${suffix}`) || defSecPriceX);
        const secPriceYOffset = parseFloat(localStorage.getItem(`label_offset_sec_price_y${suffix}`) || defSecPriceY);
        const footerX = parseFloat(localStorage.getItem(`label_offset_footer_x${suffix}`) || defFooterX);
        const footerYOffset = parseFloat(localStorage.getItem(`label_offset_footer_y${suffix}`) || defFooterY);

        const fontName = parseFloat(localStorage.getItem(`label_offset_font_name${suffix}`) || defFontName);
        const fontPrice = parseFloat(localStorage.getItem(`label_offset_font_price${suffix}`) || defFontPrice);
        const fontSecPrice = parseFloat(localStorage.getItem(`label_offset_font_sec_price${suffix}`) || defFontSecPrice);
        const fontFooter = parseFloat(localStorage.getItem(`label_offset_font_footer${suffix}`) || defFontFooter);

        // --- CÁLCULO FÍSICO DE COORDENADAS REALES ---
        const maxHalfWidth = Math.min(centerX, LABEL_W - centerX);
        const printableWidth = (maxHalfWidth - marginX) * 2;

        // 1. TÍTULO
        const titleStartY = marginY + 2.5;
        const finalTitleY = titleStartY + nameY;
        let baseTitleFontSize = paperWidth === '80' ? (isMixto ? 14 : 17) : ((mode === 'bs' || mode === 'usd') ? 11.5 : 10);
        let calcTitleFontSize = baseTitleFontSize + fontName;
        if (calcTitleFontSize < 5) calcTitleFontSize = 5;
        // Altura del bloque de título
        const isLongName = p.name.length > (paperWidth === '80' ? 24 : 18);
        const linesCount = isLongName ? 2 : 1;
        const titleHeight = linesCount * (calcTitleFontSize * 0.3527 * 1.25);
        const titleEndY = titleStartY + titleHeight;

        // 2. FOOTER
        const footerY = labelH - marginY - 2;
        const finalFooterY = footerY + footerYOffset;
        const footerStartY = hasSecondaryPrice ? footerY - 5.5 : footerY - 1.5;

        // 3. PRECIOS
        const freeSpace = footerStartY - titleEndY;
        let basePriceFontSize = paperWidth === '80' ? (isMixto ? 32 : 42) : ((mode === 'bs' || mode === 'usd') ? 28 : 24);
        let finalPriceFontSize = basePriceFontSize + fontPrice;
        if (finalPriceFontSize < 5) finalPriceFontSize = 5;

        let baseSecPriceFontSize = paperWidth === '80' ? (isMixto ? 18 : 11) : 11;
        let finalSecondaryFontSize = baseSecPriceFontSize + fontSecPrice;
        if (finalSecondaryFontSize < 5) finalSecondaryFontSize = 5;

        let priceHeight = finalPriceFontSize * 0.3527 * 0.75;
        let secondaryHeight = finalSecondaryFontSize * 0.3527 * 0.75;
        const showSecondary = isMixto;
        let priceBlockHeight = showSecondary ? (priceHeight + secondaryHeight + 3.5) : priceHeight;

        // Proporcional
        const maxAllowedBlockHeight = freeSpace * 0.82;
        if (priceBlockHeight > maxAllowedBlockHeight && maxAllowedBlockHeight > 4) {
            const scaleFactor = maxAllowedBlockHeight / priceBlockHeight;
            finalPriceFontSize = Math.max(5, finalPriceFontSize * scaleFactor);
            finalSecondaryFontSize = Math.max(5, finalSecondaryFontSize * scaleFactor);
            priceHeight = finalPriceFontSize * 0.3527 * 0.75;
            secondaryHeight = finalSecondaryFontSize * 0.3527 * 0.75;
            priceBlockHeight = showSecondary ? (priceHeight + secondaryHeight + 3.5) : priceHeight;
        }

        const calculatedPriceY = titleEndY + ((freeSpace - priceBlockHeight) / 2) + priceHeight;
        const finalPriceY = calculatedPriceY + priceYOffset;

        const calculatedSecPriceY = calculatedPriceY + secondaryHeight + 3.5;
        const finalSecPriceY = calculatedSecPriceY + secPriceYOffset;

        const baseFooterFontSize = paperWidth === '80' ? 8.5 : 6.5;

        // Formatear texto del log con coordenadas reales en mm
        const logString = `=== COORDENADAS FÍSICAS DE ETIQUETA REAL (jsPDF) ===
Producto: ${p.name.toUpperCase()}
Modo Moneda: ${mode.toUpperCase()}
Dimensiones de Hoja: ${LABEL_W}mm ancho x ${labelH}mm alto
Tasa BCV: ${effectiveRate} Bs | Tasa COP: ${tasaCop || 'N/A'}
Margen Horizontal Central (Compensado): X = ${centerX.toFixed(2)} mm

--- ELEMENTOS Y COORDENADAS FÍSICAS EN PAPEL ---
[TÍTULO DEL PRODUCTO]
  * X Central (Base): ${centerX.toFixed(2)} mm  |  Con Desplazamiento X: ${(centerX + nameX).toFixed(2)} mm
  * Y Baseline (Base): ${titleStartY.toFixed(2)} mm  |  Con Calibración Y: ${finalTitleY.toFixed(2)} mm
  * Tamaño Fuente: ${calcTitleFontSize.toFixed(1)} pt  |  Líneas Estimadas: ${linesCount}

[PRECIO PRINCIPAL]
  * X Central (Base): ${centerX.toFixed(2)} mm  |  Con Desplazamiento X: ${(centerX + priceX).toFixed(2)} mm
  * Y Baseline (Base): ${calculatedPriceY.toFixed(2)} mm  |  Con Calibración Y: ${finalPriceY.toFixed(2)} mm
  * Tamaño Fuente: ${finalPriceFontSize.toFixed(1)} pt

${showSecondary ? `[PRECIO SECUNDARIO]
  * X Central (Base): ${centerX.toFixed(2)} mm  |  Con Desplazamiento X: ${(centerX + secPriceX).toFixed(2)} mm
  * Y Baseline (Base): ${calculatedSecPriceY.toFixed(2)} mm  |  Con Calibración Y: ${finalSecPriceY.toFixed(2)} mm
  * Tamaño Fuente: ${finalSecondaryFontSize.toFixed(1)} pt` : '[PRECIO SECUNDARIO]: Inactivo en este modo'}

[PIE DE PÁGINA (BARCODE/FECHA)]
  * X Central (Base): ${centerX.toFixed(2)} mm  |  Con Desplazamiento X: ${(centerX + footerX).toFixed(2)} mm
  * Y Baseline (Base): ${footerY.toFixed(2)} mm  |  Con Calibración Y: ${finalFooterY.toFixed(2)} mm
  * Tamaño Fuente: ${(baseFooterFontSize + fontFooter).toFixed(1)} pt`;

        navigator.clipboard.writeText(logString).then(() => {
            showToast('¡Coordenadas reales copiadas al portapapeles!', 'success');
        }).catch((err) => {
            console.error('Error al copiar log:', err);
            showToast('Error al copiar coordenadas reales', 'error');
        });
    };

    return (
        <div className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm border flex flex-col overflow-hidden group ${isLowStock ? 'border-amber-300 dark:border-amber-700' : 'border-slate-100 dark:border-slate-800'} ${isSelected ? 'ring-2 ring-brand border-brand shadow-brand/20 bg-brand/5 dark:bg-brand/10' : ''}`}>
            {/* Image */}
            <div className="w-full h-24 lg:h-20 bg-white dark:bg-slate-900 overflow-hidden relative shrink-0">
                {/* Select Checkbox */}
                <div className="absolute top-1 left-1 z-10 w-6 h-6 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 rounded backdrop-blur-sm">
                    <input type="checkbox" checked={isSelected} onChange={onToggleSelect} className="w-4 h-4 rounded border-slate-300 text-brand focus:ring-brand cursor-pointer shadow-sm" />
                </div>
                {p.image ? (
                    <img
                        src={p.image}
                        className="w-full h-full object-contain p-1"
                        alt={p.name}
                        decoding="async"
                        loading="lazy"
                        onError={(e) => {
                            // IMG-FIX: la WebView de Android descarta bitmaps bajo presión
                            // de memoria y dejaba el <img> en blanco sin reintento. Forzamos
                            // una recarga con cache-busting (una sola vez, solo URLs remotas).
                            const img = e.currentTarget;
                            // OFFLINE-IMG: sin conexión no reintentar (el ?cb= nunca
                            // coincidiría con el cache del SW y ensucia el cache).
                            if (img.dataset.retried || !navigator.onLine || !/^https?:/i.test(p.image)) return;
                            img.dataset.retried = '1';
                            img.src = `${p.image}${p.image.includes('?') ? '&' : '?'}cb=${Date.now()}`;
                        }}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-600">
                        <Tag size={24} />
                    </div>
                )}
                {/* Category badge */}
                {catInfo && catInfo.id !== 'otros' && (
                    <div className={`absolute top-1 left-8 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${CATEGORY_COLORS[catInfo.color] || ''}`}>
                        {(() => { const CatIcon = CATEGORY_ICONS[catInfo.id]; return CatIcon ? <CatIcon size={9} /> : catInfo.icon; })()} {catInfo.label}
                    </div>
                )}
                {/* Low stock alert */}
                {isLowStock && (
                    <div className="absolute top-1 right-1 bg-amber-500/90 backdrop-blur-sm text-white text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <AlertTriangle size={9} /> Bajo
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="p-3 lg:p-2.5 flex flex-col flex-1">
                {/* Nombre del producto — más grande y legible */}
                <h3 className="font-black text-slate-800 dark:text-slate-100 text-[14px] lg:text-[13px] leading-tight line-clamp-2 mb-1.5">{p.name}</h3>

                {/* Units per package info */}
                {p.unit === 'paquete' && p.unitsPerPackage && (
                    <div className="flex items-center gap-1 text-[11px] font-bold text-brand dark:text-brand mb-1.5 mt-[-2px]">
                        <Package size={11} /> Bulto · {p.unitsPerPackage} uds
                    </div>
                )}

                {/* Warranty info */}
                {p.hasWarranty && (p.warrantyDays > 0 || p.warrantyDays === null) && (
                    <div className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/40 px-1.5 py-0.5 rounded-md mb-2 w-fit">
                        <ShieldCheck size={11} className="text-emerald-500 shrink-0" />
                        <span>Garantía: {p.warrantyDays ? `${p.warrantyDays}d` : 'Sí'}</span>
                    </div>
                )}

                {/* Precio Principal USD — Alineado Inline con Margen % */}
                <div className="mb-2">
                    {copEnabled && tasaCop > 0 ? (
                        copPrimary ? (
                            <>
                                <p className="text-[10px] font-bold text-amber-600/60 dark:text-amber-400/60 uppercase tracking-widest leading-none mb-0.5">Precio COP</p>
                                <div className="flex items-center justify-between gap-1">
                                    <p className="text-xl font-black text-amber-600 dark:text-amber-400 leading-none">
                                        {formatCop(valCop)} <span className="text-[11px] font-bold text-amber-600/60 dark:text-amber-400/60">COP {(p.unit === 'kg' || p.unit === 'litro') ? `/ ${unitInfo?.short || 'ud'}` : ''}</span>
                                    </p>
                                    {!readOnly && margin !== null && (!p.price2Usd || p.price2Usd <= 0) && (
                                        <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg shrink-0 ${
                                            margin >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                        }`}>
                                            {margin >= 0 ? '+' : ''}{margin.toFixed(0)}%
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded">{formatUsd(effectiveUsd)} USD</span>
                                    <span className="text-[11px] font-bold text-brand-dark dark:text-brand bg-brand-light dark:bg-surface-800/20 px-1.5 py-0.5 rounded">{formatBs(valBs)} Bs</span>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-[10px] font-bold text-emerald-600/60 dark:text-emerald-400/60 uppercase tracking-widest leading-none mb-0.5">Precio USD</p>
                                <div className="flex items-center justify-between gap-1">
                                    <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 leading-none">
                                        {formatUsd(effectiveUsd)} <span className="text-[11px] font-bold text-emerald-600/60 dark:text-emerald-400/60">USD {(p.unit === 'kg' || p.unit === 'litro') ? `/ ${unitInfo?.short || 'ud'}` : ''}</span>
                                    </p>
                                    {!readOnly && margin !== null && (!p.price2Usd || p.price2Usd <= 0) && (
                                        <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg shrink-0 ${
                                            margin >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                        }`}>
                                            {margin >= 0 ? '+' : ''}{margin.toFixed(0)}%
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                    <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">{formatCop(valCop)} COP</span>
                                    <span className="text-[11px] font-bold text-brand-dark dark:text-brand bg-brand-light dark:bg-surface-800/20 px-1.5 py-0.5 rounded">{formatBs(valBs)} Bs</span>
                                </div>
                            </>
                        )
                    ) : (
                        <>
                            <p className="text-[10px] font-bold text-amber-600/60 dark:text-amber-400/60 uppercase tracking-widest leading-none mb-0.5">Precio USD</p>
                            <div className="flex items-center justify-between gap-1">
                                <p className="text-xl font-black text-amber-600 dark:text-amber-400 leading-none">
                                    {formatUsd(effectiveUsd)} <span className="text-[11px] font-bold text-amber-600/60 dark:text-amber-400/60">USD {(p.unit === 'kg' || p.unit === 'litro') ? `/ ${unitInfo?.short || 'ud'}` : ''}</span>
                                </p>
                                {!readOnly && margin !== null && (!p.price2Usd || p.price2Usd <= 0) && (
                                    <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg shrink-0 ${
                                        margin >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                    }`}>
                                        {margin >= 0 ? '+' : ''}{margin.toFixed(0)}%
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Bloque BCV — Estilo Minimalista Integrado */}
                {p.price2Usd && p.price2Usd > 0 && (
                    <div className="w-full mb-2 bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-lg p-2 space-y-1.5 select-none">
                        {/* Fila Principal: Label BCV + Precios */}
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-700/60 px-1.5 py-0.5 rounded">
                                    BCV
                                </span>
                                <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                                    ${formatUsd(p.price2Usd)}
                                </span>
                            </div>
                            <div className="text-right">
                                <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                                    {formatBs(bcvBsTotal)} Bs
                                </span>
                                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 leading-none mt-0.5">
                                    Tasa: {formatBs(bcvRateVal)} Bs/$
                                </p>
                            </div>
                        </div>

                        {/* Fila Inferior: Reposición y Ganancia Real */}
                        {usdtRateVal > 0 && (
                            <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-700/50 flex items-center justify-between text-[11px] gap-1 flex-wrap">
                                <span className="font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                    💡 Reposición: <strong className="text-slate-800 dark:text-slate-100">${realUsdtVal.toFixed(2)} USDT</strong>
                                </span>
                                {costUsd > 0 && (
                                    <span className={`font-black whitespace-nowrap ${
                                        realProfitUsd >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                                    }`}>
                                        {realProfitUsd >= 0 ? '+' : ''}${realProfitUsd.toFixed(2)}
                                        {realBsMarginPct !== null ? ` (${realBsMarginPct >= 0 ? '+' : ''}${realBsMarginPct.toFixed(0)}%)` : ''}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {p.unit === 'paquete' && p.sellByUnit && (
                    <p className="text-[11px] font-bold text-brand dark:text-brand mb-2 flex items-center gap-0.5">
                        <Layers size={11} />
                        {copEnabled && tasaCop > 0
                            ? copPrimary
                                ? `${formatCop(p.unitPriceCop || (p.priceCop ? Math.round(p.priceCop / (p.unitsPerPackage || 1)) : Math.round((p.unitPriceUsd ?? effectiveUsd / (p.unitsPerPackage || 1)) * tasaCop)))} COP / ud · $${(p.unitPriceUsd ?? effectiveUsd / (p.unitsPerPackage || 1)).toFixed(2)}`
                                : `$${(p.unitPriceUsd ?? effectiveUsd / (p.unitsPerPackage || 1)).toFixed(2)} / ud · ${formatCop(p.unitPriceCop || (p.priceCop ? Math.round(p.priceCop / (p.unitsPerPackage || 1)) : Math.round((p.unitPriceUsd ?? effectiveUsd / (p.unitsPerPackage || 1)) * tasaCop)))} COP`
                            : `$${(p.unitPriceUsd ?? effectiveUsd / (p.unitsPerPackage || 1)).toFixed(2)} / ud`
                        }
                    </p>
                )}

                {/* Stock Control Prominente */}
                <div className="mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-1 select-none">
                        {!readOnly && (
                        <button onClick={() => onAdjustStock(p.id, -1)} className="w-10 h-10 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 shadow-sm active:scale-95 transition-all">
                            <Minus size={18} strokeWidth={2.5} />
                        </button>
                        )}
                        <div className="flex flex-col items-center justify-center px-2 text-center min-w-[50px]">
                            <span className={`text-base font-black leading-none mb-0.5 ${isLowStock ? 'text-amber-500' : 'text-slate-800 dark:text-slate-100'}`}>
                                {p.stock ?? 0}
                            </span>
                            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider leading-none">{(p.unit === 'kg' || p.unit === 'litro') ? unitInfo?.short : 'UND'}</span>
                            {p.unit === 'paquete' && p.unitsPerPackage > 0 && Math.floor((p.stock ?? 0) / p.unitsPerPackage) > 0 && (
                                <span className="text-[10px] text-slate-400 leading-none">= {Math.floor((p.stock ?? 0) / p.unitsPerPackage)} bultos</span>
                            )}
                        </div>
                        {!readOnly && (
                        <button onClick={() => onAdjustStock(p.id, 1)} className="w-10 h-10 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 shadow-sm active:scale-95 transition-all">
                            <Plus size={18} strokeWidth={2.5} />
                        </button>
                        )}
                    </div>

                    {/* Days Remaining Badge */}
                    {daysRemaining !== null && daysRemaining !== undefined && (
                        <div className={`flex items-center justify-center gap-1 mt-1.5 py-1 rounded-lg text-[11px] font-bold ${
                            daysRemaining <= 3
                                ? 'bg-red-50 dark:bg-red-900/20 text-red-500'
                                : daysRemaining <= 7
                                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-500'
                                    : 'bg-brand-light dark:bg-surface-800/20 text-brand'
                        }`}>
                            <Clock size={10} />
                            {daysRemaining <= 3
                                ? `Agotado en ~${daysRemaining}d`
                                : `~${daysRemaining} dias de stock`
                            }
                        </div>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="flex border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 divide-x divide-slate-100 dark:divide-slate-800">
                <button 
                    onClick={onPrint} 
                    className="flex-1 py-2 flex items-center justify-center text-slate-400 hover:text-brand hover:bg-brand/10 transition-colors" 
                    title="Imprimir Etiqueta"
                >
                    <Printer size={15} />
                </button>

                {!readOnly && (
                    <button 
                        onClick={() => onEdit(p)} 
                        className="flex-1 py-2 flex items-center justify-center text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                        title="Editar Producto"
                    >
                        <Pencil size={15} />
                    </button>
                )}
                {!readOnly && (
                    <button 
                        onClick={() => onDelete(p.id)} 
                        className="flex-1 py-2 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        title="Eliminar Producto"
                    >
                        <Trash2 size={15} />
                    </button>
                )}
            </div>
        </div>
    );
}
