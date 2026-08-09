/**
 * GENERADOR DE ETIQUETAS "ONE-CLICK" (VERSIÓN CONTINUA ULTRA-COMPATIBLE)
 * Genera un único ticket de PDF de 58mm o 80mm de ancho con todas las etiquetas apiladas
 * una debajo de la otra de forma continua en una sola hoja, ideal para papel térmico.
 * 
 * ==========================================
 * 🛡️ CONFIGURACIÓN FÍSICA BLINDADA POR DEFECTO (58mm):
 * - Ancho de etiqueta: 58.0 mm
 * - Alto de etiqueta: Mixto = 60.0 mm | Único (sin COP) = 44.0 mm | Único (con COP) = 50.0 mm
 * - Centro Mixto (compensado): 26.00 mm (Calculado: LABEL_W/2 - 3)
 * - Centro Único/Individual (compensado): 29.50 mm (Calculado: LABEL_W/2 + 0.5)
 * ==========================================
 */
import { round2, mulR, ceilR, round0 } from './dinero';
import { getUsd } from './calculatorUtils';

// Dimensiones de la etiqueta individual en mm
const LABEL_W = 58;

/**
 * Helper para calcular los textos de la etiqueta en el orden exacto:
 * 1. Precio $ Efectivo (Oferta Cash)
 * 2. Precio $ BCV (Con recargo sobre BCV)
 * 3. Cantidad final en Bolívares (Bs)
 */
export function computeLabelPriceTexts(p, effectiveRate, copEnabled, tasaCop, bcvMarginPct = 25, labelCurrencyMode = 'mixto') {
    const cashUsdRaw = getUsd(p, tasaCop);
    const marginMult = 1 + (parseFloat(bcvMarginPct) >= 0 ? parseFloat(bcvMarginPct) : 25) / 100;
    
    // Si el producto tiene price2Usd personalizado se usa, si no, se auto-calcula con el % de tienda
    const bcvUsdRaw = (p.price2Usd && parseFloat(p.price2Usd) > 0)
        ? round0(parseFloat(p.price2Usd))
        : round0(cashUsdRaw * marginMult);

    const priceBsRaw = mulR(bcvUsdRaw, effectiveRate);

    const textCashUsd = copEnabled && tasaCop > 0
        ? `${(p.priceCop || round2(mulR(cashUsdRaw, tasaCop))).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} COP`
        : `$${round2(cashUsdRaw)}`;

    const textBcvUsd = `$${round0(bcvUsdRaw)}`;
    const textBs = `Bs ${ceilR(priceBsRaw).toLocaleString('es-VE')}`;

    let mainText = '';
    let secondaryText = '';
    let tertiaryText = '';
    let promoTagText = '';
    let mainTagText = ''; // Badge sobre el precio principal
    let showSecondary = false;

    if (labelCurrencyMode === 'bs') {
        mainText = textBs;
        showSecondary = false;
    } else if (labelCurrencyMode === 'usd') {
        mainText = textCashUsd;
        showSecondary = false;
    } else { // 'mixto': Precio normal arriba, luego badge promo, luego precio efectivo
        mainText = textBcvUsd;      // 1er lugar (Gigante): Precio normal/BCV sin sufijo
        mainTagText = 'PRECIO';     // Badge encima del precio normal
        promoTagText = 'PROMO $ EFECTIVO';
        
        if (Math.abs(bcvUsdRaw - cashUsdRaw) > 0.009) {
            secondaryText = textCashUsd; // 2do lugar (Grande): Precio efectivo/cash
            showSecondary = true;
        }
        // Sin tertiaryText (Bs eliminados)
        tertiaryText = '';
    }

    return { mainText, secondaryText, tertiaryText, promoTagText, mainTagText, showSecondary, cashUsdRaw, bcvUsdRaw, priceBsRaw };
}

export const generarEtiquetas = async (productos, effectiveRate, copEnabled, tasaCop, bcvMarginPct = 25) => {
    const paperWidthSetting = localStorage.getItem('printer_paper_width') || '58';
    if (paperWidthSetting === '80') {
        return generarEtiquetas80(productos, effectiveRate, copEnabled, tasaCop, bcvMarginPct);
    }

    const { default: jsPDF } = await import('jspdf');
    if (!productos || productos.length === 0) return;

    const labelCurrencyMode = localStorage.getItem('label_currency_mode') || 'mixto';
    const hasSecondaryPrice = copEnabled && tasaCop > 0;
    
    let labelH = 60;
    if (labelCurrencyMode === 'bs' || labelCurrencyMode === 'usd') {
        labelH = hasSecondaryPrice ? 50 : 44;
    }

    const marginX = 4.0; // Margen horizontal en mm
    const marginY = 3.0; // Margen vertical en mm
    const totalHeight = labelH * productos.length;

    const doc = new jsPDF('p', 'mm', [LABEL_W, totalHeight]);
    const width = doc.internal.pageSize.getWidth();   // 58 mm
    const centerX = (width / 2) + 4.0; // Desplazado +4mm a la derecha por calibración física
    const printableWidth = width - (marginX * 2); // 50 mm imprimibles

    const isMixto = labelCurrencyMode === 'mixto';
    const modeSuffix = isMixto ? '_mixto' : '_unico';

    const defNameX = '0';
    const defNameY = '0';
    const defPriceX = '0';
    const defPriceY = '0';
    const defSecPriceX = '0';
    const defSecPriceY = '0';

    const defFontName = '0';
    const defFontPrice = '0';
    const defFontSecPrice = '0';

    const offsetNameX       = parseFloat(localStorage.getItem(`label_offset_name_x${modeSuffix}`)       || defNameX);
    const offsetNameY       = parseFloat(localStorage.getItem(`label_offset_name_y${modeSuffix}`)       || defNameY);
    const offsetPriceX      = parseFloat(localStorage.getItem(`label_offset_price_x${modeSuffix}`)      || defPriceX);
    const offsetPriceY      = parseFloat(localStorage.getItem(`label_offset_price_y${modeSuffix}`)      || defPriceY);
    const offsetSecPriceX   = parseFloat(localStorage.getItem(`label_offset_sec_price_x${modeSuffix}`)  || defSecPriceX);
    const offsetSecPriceY   = parseFloat(localStorage.getItem(`label_offset_sec_price_y${modeSuffix}`)  || defSecPriceY);
    const offsetFontName     = parseFloat(localStorage.getItem(`label_offset_font_name${modeSuffix}`)      || defFontName);
    const offsetFontPrice    = parseFloat(localStorage.getItem(`label_offset_font_price${modeSuffix}`)     || defFontPrice);
    const offsetFontSecPrice = parseFloat(localStorage.getItem(`label_offset_font_sec_price${modeSuffix}`) || defFontSecPrice);

    const centrarTexto = (texto, y, fontSize, fontStyle = 'normal', color = [0, 0, 0], offsetX = 0, offsetY = 0) => {
        doc.setFont('helvetica', fontStyle);
        doc.setFontSize(fontSize);
        doc.setTextColor(...color);
        const textWidth = doc.getTextWidth(texto);
        doc.text(texto, centerX - textWidth / 2 + offsetX, y + offsetY);
    };

    const centrarLineas = (lineas, y, fontSize, lineHeight = 1.15, offsetX = 0, offsetY = 0) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontSize);
        doc.setTextColor(0, 0, 0);
        lineas.forEach((line, i) => {
            const textWidth = doc.getTextWidth(line);
            doc.text(line, centerX - textWidth / 2 + offsetX, y + offsetY + i * (fontSize * 0.3527 * lineHeight));
        });
    };

    productos.forEach((p, index) => {
        const offsetY = index * labelH;

        if (index > 0) {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.35);
            doc.setLineDashPattern([2, 2], 0);
            doc.line(marginX, offsetY, width - marginX, offsetY);
            doc.setLineDashPattern([], 0);
        }

        const titleStartY = offsetY + marginY + 2.5;

        // --- 1. TÍTULO DEL PRODUCTO GRANDE Y LEGIBLE ---
        let baseTitleFontSize = isMixto ? 13 : 14.5;
        let titleFontSize = baseTitleFontSize + offsetFontName;
        if (titleFontSize < 6) titleFontSize = 6;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(titleFontSize);
        let titleLines = doc.splitTextToSize(p.name.toUpperCase(), printableWidth);

        while (titleLines.length > 2 && titleFontSize > 7) {
            titleFontSize -= 0.5;
            doc.setFontSize(titleFontSize);
            titleLines = doc.splitTextToSize(p.name.toUpperCase(), printableWidth);
        }

        centrarLineas(titleLines, titleStartY, titleFontSize, 1.15, offsetNameX, offsetNameY);

        const titleHeight = titleLines.length * (titleFontSize * 0.3527 * 1.15);
        const titleEndY = titleStartY + titleHeight + offsetNameY;

        // --- 2. ESPACIO VERTICAL DISPONIBLE ---
        const footerStartY = offsetY + labelH - marginY - 1.0;
        const freeSpace = Math.max(15, footerStartY - (titleEndY + 2.0));

        // --- 3. MEDIDA Y CÁLCULO DE BLOQUE DE PRECIOS GIGANTE ---
        const { mainText, secondaryText, promoTagText, mainTagText, showSecondary } = computeLabelPriceTexts(
            p, effectiveRate, copEnabled, tasaCop, bcvMarginPct, labelCurrencyMode
        );

        let finalPriceFontSize = (isMixto ? 34 : 42) + offsetFontPrice;
        if (finalPriceFontSize < 8) finalPriceFontSize = 8;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(finalPriceFontSize);
        while (doc.getTextWidth(mainText) > printableWidth && finalPriceFontSize > 12) {
            finalPriceFontSize -= 0.5;
            doc.setFontSize(finalPriceFontSize);
        }

        let finalSecondaryFontSize = (isMixto ? 24 : 16) + offsetFontSecPrice;
        if (finalSecondaryFontSize < 6) finalSecondaryFontSize = 6;

        if (showSecondary) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(finalSecondaryFontSize);
            while (doc.getTextWidth(secondaryText) > printableWidth && finalSecondaryFontSize > 8) {
                finalSecondaryFontSize -= 0.5;
                doc.setFontSize(finalSecondaryFontSize);
            }
        }

        let mainTagFontSize = mainTagText ? Math.max(5, 9.5 + offsetFontSecPrice * 0.2) : 0;
        let promoTagFontSize = promoTagText ? Math.max(5, 8.5 + offsetFontSecPrice * 0.2) : 0;

        // Auto-shrink para el badge si supera el ancho de impresión
        if (promoTagText && showSecondary) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(promoTagFontSize);
            while ((doc.getTextWidth(promoTagText) + 5.0) > printableWidth && promoTagFontSize > 5) {
                promoTagFontSize -= 0.5;
                doc.setFontSize(promoTagFontSize);
            }
        }
        if (mainTagText) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(mainTagFontSize);
            while ((doc.getTextWidth(mainTagText) + 5.0) > printableWidth && mainTagFontSize > 5) {
                mainTagFontSize -= 0.5;
                doc.setFontSize(mainTagFontSize);
            }
        }

        let mainTagH = mainTagText ? mainTagFontSize * 0.3527 * 0.85 : 0;
        let mainTagBoxH = mainTagText ? mainTagH + 1.6 : 0;
        let promoTagH = promoTagText ? promoTagFontSize * 0.3527 * 0.85 : 0;
        let promoTagBoxH = promoTagText ? promoTagH + 1.6 : 0;

        let priceHeight = finalPriceFontSize * 0.3527 * 0.85;
        let secondaryHeight = showSecondary ? finalSecondaryFontSize * 0.3527 * 0.85 : 0;

        let priceBlockHeight = 0;
        if (mainTagText) priceBlockHeight += mainTagBoxH + 1.5;
        priceBlockHeight += priceHeight;
        if (promoTagText && showSecondary) priceBlockHeight += 2.5 + promoTagBoxH + 1.5;
        if (showSecondary) priceBlockHeight += secondaryHeight;

        // Escalado proporcional dinámico si se excede el espacio libre disponible
        const maxAllowed = freeSpace * 0.92;
        if (priceBlockHeight > maxAllowed && maxAllowed > 6) {
            const sf = maxAllowed / priceBlockHeight;
            finalPriceFontSize = Math.max(8, finalPriceFontSize * sf);
            finalSecondaryFontSize = Math.max(6, finalSecondaryFontSize * sf);
            if (mainTagFontSize) mainTagFontSize = Math.max(5, mainTagFontSize * sf);
            if (promoTagFontSize) promoTagFontSize = Math.max(5, promoTagFontSize * sf);

            mainTagH = mainTagText ? mainTagFontSize * 0.3527 * 0.85 : 0;
            mainTagBoxH = mainTagText ? mainTagH + 1.6 : 0;
            promoTagH = promoTagText ? promoTagFontSize * 0.3527 * 0.85 : 0;
            promoTagBoxH = promoTagText ? promoTagH + 1.6 : 0;
            priceHeight = finalPriceFontSize * 0.3527 * 0.85;
            secondaryHeight = showSecondary ? finalSecondaryFontSize * 0.3527 * 0.85 : 0;

            priceBlockHeight = 0;
            if (mainTagText) priceBlockHeight += mainTagBoxH + 1.5;
            priceBlockHeight += priceHeight;
            if (promoTagText && showSecondary) priceBlockHeight += 2.5 + promoTagBoxH + 1.5;
            if (showSecondary) priceBlockHeight += secondaryHeight;
        }

        const startBlockY = (titleEndY + 2.0) + Math.max(0, (freeSpace - priceBlockHeight) / 2);

        // --- RENDERIZADO SECUENCIAL CONTINUO Y VISUALMENTE IMPACTANTE ---
        let currentY = startBlockY;

        // 0. Badge PRECIO
        if (mainTagText) {
            currentY += mainTagH + 0.8;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(mainTagFontSize);
            const mtw = doc.getTextWidth(mainTagText);
            const mbW = mtw + 5.0;
            const mbH = mainTagBoxH;
            let mbX = (centerX - mbW / 2) + offsetPriceX;
            mbX = Math.max(marginX, Math.min(width - marginX - mbW, mbX));
            const mbY = currentY - mainTagH + offsetPriceY - 1.0;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.35);
            doc.roundedRect(mbX, mbY, mbW, mbH, 1.2, 1.2, 'S');
            centrarTexto(mainTagText, currentY, mainTagFontSize, 'bold', [0, 0, 0], offsetPriceX, offsetPriceY - 0.6);
            currentY += 1.5;
        }

        // 1. Precio Principal (BCV) - GIGANTE
        currentY += priceHeight;
        centrarTexto(mainText, currentY, finalPriceFontSize, 'bold', [0, 0, 0], offsetPriceX, offsetPriceY);

        // 2. Badge PROMO $ EFECTIVO
        if (promoTagText && showSecondary) {
            currentY += 2.5;
            currentY += promoTagH + 0.8;
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(promoTagFontSize);
            const tw = doc.getTextWidth(promoTagText);
            const badgeW = tw + 5.0;
            const badgeH = promoTagBoxH;
            let badgeX = (centerX - badgeW / 2) + offsetSecPriceX;
            badgeX = Math.max(marginX, Math.min(width - marginX - badgeW, badgeX));
            const badgeY = currentY - promoTagH + offsetSecPriceY - 1.0;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.35);
            doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.2, 1.2, 'S');
            centrarTexto(promoTagText, currentY, promoTagFontSize, 'italic', [0, 0, 0], offsetSecPriceX, offsetSecPriceY - 0.6);
            currentY += 1.5;
        }

        // 3. Precio Secundario (Efectivo) - PROMINENTE
        if (showSecondary) {
            currentY += secondaryHeight;
            centrarTexto(secondaryText, currentY, finalSecondaryFontSize, 'bold', [0, 0, 0], offsetSecPriceX, offsetSecPriceY);
        }
    });

    doc.autoPrint();
    const blobUrl = doc.output('bloburl');
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    iframe.src = blobUrl;
    document.body.appendChild(iframe);

    iframe.onload = () => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (e) {
            console.error('Error printing from iframe:', e);
            window.open(blobUrl, '_blank');
        }
        setTimeout(() => {
            try { document.body.removeChild(iframe); }
            catch (_e) {}
        }, 5000);
    };
};

export const generarPreviewLabel = async (effectiveRate = 36.5, copEnabled = false, tasaCop = 0) => {
    const paperWidthSetting = localStorage.getItem('printer_paper_width') || '58';
    if (paperWidthSetting === '80') {
        return generarPreviewLabel80(effectiveRate, copEnabled, tasaCop);
    }

    const { default: jsPDF } = await import('jspdf');

    const labelCurrencyMode = localStorage.getItem('label_currency_mode') || 'mixto';
    const isMixto = labelCurrencyMode === 'mixto';
    const hasSecondaryPrice = copEnabled && tasaCop > 0;

    let labelH = 60;
    if (labelCurrencyMode === 'bs' || labelCurrencyMode === 'usd') {
        labelH = hasSecondaryPrice ? 50 : 44;
    }

    const marginX = 4.0;
    const marginY = 3.0;
    const LABEL_W_L = 58;
    const centerX = (LABEL_W_L / 2) + 4.0;
    const printableWidth = LABEL_W_L - (marginX * 2);
    const modeSuffix = isMixto ? '_mixto' : '_unico';

    const defNameX = '0';
    const defNameY = '0';
    const defPriceX = '0';
    const defPriceY = '0';
    const defSecPriceX = '0';
    const defSecPriceY = '0';

    const defFontName = '0';
    const defFontPrice = '0';
    const defFontSecPrice = '0';

    const offsetNameX       = parseFloat(localStorage.getItem(`label_offset_name_x${modeSuffix}`)       || defNameX);
    const offsetNameY       = parseFloat(localStorage.getItem(`label_offset_name_y${modeSuffix}`)       || defNameY);
    const offsetPriceX      = parseFloat(localStorage.getItem(`label_offset_price_x${modeSuffix}`)      || defPriceX);
    const offsetPriceY      = parseFloat(localStorage.getItem(`label_offset_price_y${modeSuffix}`)      || defPriceY);
    const offsetSecPriceX   = parseFloat(localStorage.getItem(`label_offset_sec_price_x${modeSuffix}`)  || defSecPriceX);
    const offsetSecPriceY   = parseFloat(localStorage.getItem(`label_offset_sec_price_y${modeSuffix}`)  || defSecPriceY);
    const offsetFontName     = parseFloat(localStorage.getItem(`label_offset_font_name${modeSuffix}`)      || defFontName);
    const offsetFontPrice    = parseFloat(localStorage.getItem(`label_offset_font_price${modeSuffix}`)     || defFontPrice);
    const offsetFontSecPrice = parseFloat(localStorage.getItem(`label_offset_font_sec_price${modeSuffix}`) || defFontSecPrice);

    const doc = new jsPDF('p', 'mm', [LABEL_W_L, labelH]);

    const centrarTexto = (texto, y, fontSize, fontStyle = 'normal', color = [0, 0, 0], ox = 0, oy = 0) => {
        doc.setFont('helvetica', fontStyle);
        doc.setFontSize(fontSize);
        doc.setTextColor(...color);
        const tw = doc.getTextWidth(texto);
        doc.text(texto, centerX - tw / 2 + ox, y + oy);
    };

    const centrarLineas = (lineas, y, fontSize, lineHeight = 1.15, ox = 0, oy = 0) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontSize);
        doc.setTextColor(0, 0, 0);
        lineas.forEach((line, i) => {
            const tw = doc.getTextWidth(line);
            doc.text(line, centerX - tw / 2 + ox, y + oy + i * (fontSize * 0.3527 * lineHeight));
        });
    };

    const priceUsdRaw = 1.26;
    const priceBsRaw  = mulR(priceUsdRaw, effectiveRate);
    const textUsd = `$${round2(priceUsdRaw)}`;
    const textBs  = `Bs ${ceilR(priceBsRaw).toLocaleString('es-VE')}`;

    let mainText = '';
    let secondaryText = '';
    let promoTagText = '';
    let showSecondary = false;

    if (labelCurrencyMode === 'bs') {
        mainText = textBs;
    } else if (labelCurrencyMode === 'usd') {
        mainText = textUsd;
    } else {
        const bcvUsdSample = round2(priceUsdRaw * 1.25);
        mainText = `$${Math.round(bcvUsdSample)}`;
        promoTagText = 'PROMO $ EFECTIVO';
        secondaryText = textUsd;
        showSecondary = true;
    }

    const sampleName = 'TRIMMER KEMEI 2299';
    const titleStartY = marginY + 2.5;

    let titleFontSize = isMixto ? 13 : 14.5;
    titleFontSize += offsetFontName;
    if (titleFontSize < 6) titleFontSize = 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(titleFontSize);
    let titleLines = doc.splitTextToSize(sampleName, printableWidth);
    while (titleLines.length > 2 && titleFontSize > 7) {
        titleFontSize -= 0.5;
        doc.setFontSize(titleFontSize);
        titleLines = doc.splitTextToSize(sampleName, printableWidth);
    }

    centrarLineas(titleLines, titleStartY, titleFontSize, 1.15, offsetNameX, offsetNameY);

    const titleHeight = titleLines.length * (titleFontSize * 0.3527 * 1.15);
    const titleEndY   = titleStartY + titleHeight + offsetNameY;

    const footerStartY = labelH - marginY - 1.0;
    const freeSpace    = Math.max(15, footerStartY - (titleEndY + 2.0));

    let priceFontSize = (isMixto ? 34 : 42) + offsetFontPrice;
    if (priceFontSize < 8) priceFontSize = 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(priceFontSize);
    while (doc.getTextWidth(mainText) > printableWidth && priceFontSize > 12) {
        priceFontSize -= 0.5;
        doc.setFontSize(priceFontSize);
    }

    let secPriceFontSize = (isMixto ? 24 : 16) + offsetFontSecPrice;
    if (secPriceFontSize < 6) secPriceFontSize = 6;

    if (showSecondary) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(secPriceFontSize);
        while (doc.getTextWidth(secondaryText) > printableWidth && secPriceFontSize > 8) {
            secPriceFontSize -= 0.5;
            doc.setFontSize(secPriceFontSize);
        }
    }

    const previewMainTagText = isMixto ? 'PRECIO' : '';
    let previewMainTagFontSize = previewMainTagText ? Math.max(5, 9.5 + offsetFontSecPrice * 0.2) : 0;
    let promoTagFontSize = promoTagText ? Math.max(5, 8.5 + offsetFontSecPrice * 0.2) : 0;

    if (promoTagText && showSecondary) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(promoTagFontSize);
        while ((doc.getTextWidth(promoTagText) + 5.0) > printableWidth && promoTagFontSize > 5) {
            promoTagFontSize -= 0.5;
            doc.setFontSize(promoTagFontSize);
        }
    }
    if (previewMainTagText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(previewMainTagFontSize);
        while ((doc.getTextWidth(previewMainTagText) + 5.0) > printableWidth && previewMainTagFontSize > 5) {
            previewMainTagFontSize -= 0.5;
            doc.setFontSize(previewMainTagFontSize);
        }
    }

    let mainTagH = previewMainTagText ? previewMainTagFontSize * 0.3527 * 0.85 : 0;
    let mainTagBoxH = previewMainTagText ? mainTagH + 1.6 : 0;
    let promoTagH = promoTagText ? promoTagFontSize * 0.3527 * 0.85 : 0;
    let promoTagBoxH = promoTagText ? promoTagH + 1.6 : 0;

    let priceHeight = priceFontSize * 0.3527 * 0.85;
    let secondaryHeight = showSecondary ? secPriceFontSize * 0.3527 * 0.85 : 0;

    let priceBlockHeight = 0;
    if (previewMainTagText) priceBlockHeight += mainTagBoxH + 1.5;
    priceBlockHeight += priceHeight;
    if (promoTagText && showSecondary) priceBlockHeight += 2.5 + promoTagBoxH + 1.5;
    if (showSecondary) priceBlockHeight += secondaryHeight;

    const maxAllowed = freeSpace * 0.92;
    if (priceBlockHeight > maxAllowed && maxAllowed > 6) {
        const sf = maxAllowed / priceBlockHeight;
        priceFontSize = Math.max(8, priceFontSize * sf);
        secPriceFontSize = Math.max(6, secPriceFontSize * sf);
        if (previewMainTagFontSize) previewMainTagFontSize = Math.max(5, previewMainTagFontSize * sf);
        if (promoTagFontSize) promoTagFontSize = Math.max(5, promoTagFontSize * sf);

        mainTagH = previewMainTagText ? previewMainTagFontSize * 0.3527 * 0.85 : 0;
        mainTagBoxH = previewMainTagText ? mainTagH + 1.6 : 0;
        promoTagH = promoTagText ? promoTagFontSize * 0.3527 * 0.85 : 0;
        promoTagBoxH = promoTagText ? promoTagH + 1.6 : 0;
        priceHeight = priceFontSize * 0.3527 * 0.85;
        secondaryHeight = showSecondary ? secPriceFontSize * 0.3527 * 0.85 : 0;

        priceBlockHeight = 0;
        if (previewMainTagText) priceBlockHeight += mainTagBoxH + 1.5;
        priceBlockHeight += priceHeight;
        if (promoTagText && showSecondary) priceBlockHeight += 2.5 + promoTagBoxH + 1.5;
        if (showSecondary) priceBlockHeight += secondaryHeight;
    }

    let currentY = (titleEndY + 2.0) + Math.max(0, (freeSpace - priceBlockHeight) / 2);

    if (previewMainTagText) {
        currentY += mainTagH + 0.8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(previewMainTagFontSize);
        const mtw = doc.getTextWidth(previewMainTagText);
        const mbW = mtw + 5.0;
        const mbH = mainTagBoxH;
        let mbX = (centerX - mbW / 2) + offsetPriceX;
        mbX = Math.max(marginX, Math.min(LABEL_W_L - marginX - mbW, mbX));
        const mbY = currentY - mainTagH + offsetPriceY - 1.0;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.35);
        doc.roundedRect(mbX, mbY, mbW, mbH, 1.2, 1.2, 'S');
        centrarTexto(previewMainTagText, currentY, previewMainTagFontSize, 'bold', [0, 0, 0], offsetPriceX, offsetPriceY - 0.6);
        currentY += 1.5;
    }

    currentY += priceHeight;
    centrarTexto(mainText, currentY, priceFontSize, 'bold', [0, 0, 0], offsetPriceX, offsetPriceY);

    if (promoTagText && showSecondary) {
        currentY += 2.5;
        currentY += promoTagH + 0.8;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(promoTagFontSize);
        const tw = doc.getTextWidth(promoTagText);
        const badgeW = tw + 5.0;
        const badgeH = promoTagBoxH;
        let badgeX = (centerX - badgeW / 2) + offsetSecPriceX;
        badgeX = Math.max(marginX, Math.min(LABEL_W_L - marginX - badgeW, badgeX));
        const badgeY = currentY - promoTagH + offsetSecPriceY - 1.0;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.35);
        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.2, 1.2, 'S');
        centrarTexto(promoTagText, currentY, promoTagFontSize, 'italic', [0, 0, 0], offsetSecPriceX, offsetSecPriceY - 0.6);
        currentY += 1.5;
    }

    if (showSecondary) {
        currentY += secondaryHeight;
        centrarTexto(secondaryText, currentY, secPriceFontSize, 'bold', [0, 0, 0], offsetSecPriceX, offsetSecPriceY);
    }

    return doc.output('bloburl');
};

export const generarEtiquetas80 = async (productos, effectiveRate, copEnabled, tasaCop, bcvMarginPct = 25) => {
    const { default: jsPDF } = await import('jspdf');

    if (!productos || productos.length === 0) return;

    const labelCurrencyMode = localStorage.getItem('label_currency_mode') || 'mixto';
    const isMixto = labelCurrencyMode === 'mixto';
    const hasSecondaryPrice = copEnabled && tasaCop > 0;

    const LABEL_W = 80;
    const labelH = isMixto ? 80 : (hasSecondaryPrice ? 68 : 60);

    const marginX = 5.0; 
    const marginY = 4.0; 
    const totalHeight = labelH * productos.length;

    const doc = new jsPDF('p', 'mm', [LABEL_W, totalHeight]);
    const width = doc.internal.pageSize.getWidth();
    const centerX = (width / 2) + 4.0;
    const printableWidth = width - (marginX * 2);

    const modeSuffix = isMixto ? '_80_mixto' : '_80_unico';

    const defNameX = '0';
    const defNameY = '0';
    const defPriceX = '0';
    const defPriceY = '0';
    const defSecPriceX = '0';
    const defSecPriceY = '0';

    const defFontName = '0';
    const defFontPrice = '0';
    const defFontSecPrice = '0';

    const offsetNameX       = parseFloat(localStorage.getItem(`label_offset_name_x${modeSuffix}`)       || defNameX);
    const offsetNameY       = parseFloat(localStorage.getItem(`label_offset_name_y${modeSuffix}`)       || defNameY);
    const offsetPriceX      = parseFloat(localStorage.getItem(`label_offset_price_x${modeSuffix}`)      || defPriceX);
    const offsetPriceY      = parseFloat(localStorage.getItem(`label_offset_price_y${modeSuffix}`)      || defPriceY);
    const offsetSecPriceX   = parseFloat(localStorage.getItem(`label_offset_sec_price_x${modeSuffix}`)  || defSecPriceX);
    const offsetSecPriceY   = parseFloat(localStorage.getItem(`label_offset_sec_price_y${modeSuffix}`)  || defSecPriceY);
    const offsetFontName     = parseFloat(localStorage.getItem(`label_offset_font_name${modeSuffix}`)      || defFontName);
    const offsetFontPrice    = parseFloat(localStorage.getItem(`label_offset_font_price${modeSuffix}`)     || defFontPrice);
    const offsetFontSecPrice = parseFloat(localStorage.getItem(`label_offset_font_sec_price${modeSuffix}`) || defFontSecPrice);

    const centrarTexto = (texto, y, fontSize, fontStyle = 'normal', color = [0, 0, 0], offsetX = 0, offsetY = 0) => {
        doc.setFont('helvetica', fontStyle);
        doc.setFontSize(fontSize);
        doc.setTextColor(...color);
        const textWidth = doc.getTextWidth(texto);
        doc.text(texto, centerX - textWidth / 2 + offsetX, y + offsetY);
    };

    const centrarLineas = (lineas, y, fontSize, lineHeight = 1.15, offsetX = 0, offsetY = 0) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontSize);
        doc.setTextColor(0, 0, 0);
        lineas.forEach((line, i) => {
            const textWidth = doc.getTextWidth(line);
            doc.text(line, centerX - textWidth / 2 + offsetX, y + offsetY + i * (fontSize * 0.3527 * lineHeight));
        });
    };

    productos.forEach((p, index) => {
        const offsetY = index * labelH;

        if (index > 0) {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.35);
            doc.setLineDashPattern([2, 2], 0);
            doc.line(marginX, offsetY, width - marginX, offsetY);
            doc.setLineDashPattern([], 0);
        }

        const titleStartY = offsetY + marginY + 2.5;

        let baseTitleFontSize = isMixto ? 16 : 18;
        let titleFontSize = baseTitleFontSize + offsetFontName;
        if (titleFontSize < 6) titleFontSize = 6;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(titleFontSize);
        let titleLines = doc.splitTextToSize(p.name.toUpperCase(), printableWidth);

        while (titleLines.length > 2 && titleFontSize > 7) {
            titleFontSize -= 0.5;
            doc.setFontSize(titleFontSize);
            titleLines = doc.splitTextToSize(p.name.toUpperCase(), printableWidth);
        }

        centrarLineas(titleLines, titleStartY, titleFontSize, 1.15, offsetNameX, offsetNameY);

        const titleHeight = titleLines.length * (titleFontSize * 0.3527 * 1.15);
        const titleEndY = titleStartY + titleHeight + offsetNameY;

        const footerStartY = offsetY + labelH - marginY - 1.0;
        const freeSpace = Math.max(15, footerStartY - (titleEndY + 2.0));

        const { mainText, secondaryText, promoTagText, mainTagText, showSecondary } = computeLabelPriceTexts(
            p, effectiveRate, copEnabled, tasaCop, bcvMarginPct, labelCurrencyMode
        );

        let finalPriceFontSize = (isMixto ? 44 : 54) + offsetFontPrice;
        if (finalPriceFontSize < 10) finalPriceFontSize = 10;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(finalPriceFontSize);
        while (doc.getTextWidth(mainText) > printableWidth && finalPriceFontSize > 12) {
            finalPriceFontSize -= 0.5;
            doc.setFontSize(finalPriceFontSize);
        }

        let finalSecondaryFontSize = (isMixto ? 30 : 20) + offsetFontSecPrice;
        if (finalSecondaryFontSize < 8) finalSecondaryFontSize = 8;

        if (showSecondary) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(finalSecondaryFontSize);
            while (doc.getTextWidth(secondaryText) > printableWidth && finalSecondaryFontSize > 8) {
                finalSecondaryFontSize -= 0.5;
                doc.setFontSize(finalSecondaryFontSize);
            }
        }

        let mainTagFontSize80 = mainTagText ? Math.max(6, 12.0 + offsetFontSecPrice * 0.2) : 0;
        let promoTagFontSize80 = promoTagText ? Math.max(6, 11.0 + offsetFontSecPrice * 0.2) : 0;

        if (promoTagText && showSecondary) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(promoTagFontSize80);
            while ((doc.getTextWidth(promoTagText) + 6.0) > printableWidth && promoTagFontSize80 > 6) {
                promoTagFontSize80 -= 0.5;
                doc.setFontSize(promoTagFontSize80);
            }
        }
        if (mainTagText) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(mainTagFontSize80);
            while ((doc.getTextWidth(mainTagText) + 6.0) > printableWidth && mainTagFontSize80 > 6) {
                mainTagFontSize80 -= 0.5;
                doc.setFontSize(mainTagFontSize80);
            }
        }

        let mainTagH80 = mainTagText ? mainTagFontSize80 * 0.3527 * 0.85 : 0;
        let mainTagBoxH80 = mainTagText ? mainTagH80 + 2.0 : 0;
        let promoTagH80 = promoTagText ? promoTagFontSize80 * 0.3527 * 0.85 : 0;
        let promoTagBoxH80 = promoTagText ? promoTagH80 + 2.0 : 0;

        let priceHeight = finalPriceFontSize * 0.3527 * 0.85;
        let secondaryHeight = showSecondary ? finalSecondaryFontSize * 0.3527 * 0.85 : 0;

        let priceBlockHeight = 0;
        if (mainTagText) priceBlockHeight += mainTagBoxH80 + 2.0;
        priceBlockHeight += priceHeight;
        if (promoTagText && showSecondary) priceBlockHeight += 3.0 + promoTagBoxH80 + 2.0;
        if (showSecondary) priceBlockHeight += secondaryHeight;

        const maxAllowed = freeSpace * 0.92;
        if (priceBlockHeight > maxAllowed && maxAllowed > 6) {
            const sf = maxAllowed / priceBlockHeight;
            finalPriceFontSize = Math.max(10, finalPriceFontSize * sf);
            finalSecondaryFontSize = Math.max(8, finalSecondaryFontSize * sf);
            if (mainTagFontSize80) mainTagFontSize80 = Math.max(6, mainTagFontSize80 * sf);
            if (promoTagFontSize80) promoTagFontSize80 = Math.max(6, promoTagFontSize80 * sf);

            mainTagH80 = mainTagText ? mainTagFontSize80 * 0.3527 * 0.85 : 0;
            mainTagBoxH80 = mainTagText ? mainTagH80 + 2.0 : 0;
            promoTagH80 = promoTagText ? promoTagFontSize80 * 0.3527 * 0.85 : 0;
            promoTagBoxH80 = promoTagText ? promoTagH80 + 2.0 : 0;
            priceHeight = finalPriceFontSize * 0.3527 * 0.85;
            secondaryHeight = showSecondary ? finalSecondaryFontSize * 0.3527 * 0.85 : 0;

            priceBlockHeight = 0;
            if (mainTagText) priceBlockHeight += mainTagBoxH80 + 2.0;
            priceBlockHeight += priceHeight;
            if (promoTagText && showSecondary) priceBlockHeight += 3.0 + promoTagBoxH80 + 2.0;
            if (showSecondary) priceBlockHeight += secondaryHeight;
        }

        const startBlockY = (titleEndY + 2.5) + Math.max(0, (freeSpace - priceBlockHeight) / 2);

        let currentY = startBlockY;

        // 0. Badge PRECIO
        if (mainTagText) {
            currentY += mainTagH80 + 1.0;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(mainTagFontSize80);
            const mtw = doc.getTextWidth(mainTagText);
            const mbW = mtw + 6.0;
            const mbH = mainTagBoxH80;
            let mbX = (centerX - mbW / 2) + offsetPriceX;
            mbX = Math.max(marginX, Math.min(width - marginX - mbW, mbX));
            const mbY = currentY - mainTagH80 + offsetPriceY - 1.2;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.4);
            doc.roundedRect(mbX, mbY, mbW, mbH, 1.5, 1.5, 'S');
            centrarTexto(mainTagText, currentY, mainTagFontSize80, 'bold', [0, 0, 0], offsetPriceX, offsetPriceY - 0.8);
            currentY += 2.0;
        }

        // 1. Precio Principal - GIGANTE
        currentY += priceHeight;
        centrarTexto(mainText, currentY, finalPriceFontSize, 'bold', [0, 0, 0], offsetPriceX, offsetPriceY);

        // 2. Badge PROMO $ EFECTIVO
        if (promoTagText && showSecondary) {
            currentY += 3.0;
            currentY += promoTagH80 + 1.0;
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(promoTagFontSize80);
            const tw = doc.getTextWidth(promoTagText);
            const badgeW = tw + 6.0;
            const badgeH = promoTagBoxH80;
            let badgeX = (centerX - badgeW / 2) + offsetSecPriceX;
            badgeX = Math.max(marginX, Math.min(width - marginX - badgeW, badgeX));
            const badgeY = currentY - promoTagH80 + offsetSecPriceY - 1.2;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.4);
            doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'S');
            centrarTexto(promoTagText, currentY, promoTagFontSize80, 'italic', [0, 0, 0], offsetSecPriceX, offsetSecPriceY - 0.8);
            currentY += 2.0;
        }

        // 3. Precio Secundario
        if (showSecondary) {
            currentY += secondaryHeight;
            centrarTexto(secondaryText, currentY, finalSecondaryFontSize, 'bold', [0, 0, 0], offsetSecPriceX, offsetSecPriceY);
        }
    });

    doc.autoPrint();
    const blobUrl = doc.output('bloburl');
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    iframe.src = blobUrl;
    document.body.appendChild(iframe);

    iframe.onload = () => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (e) {
            console.error('Error printing from iframe:', e);
            window.open(blobUrl, '_blank');
        }
        setTimeout(() => {
            try { document.body.removeChild(iframe); } catch (_e) {}
        }, 5000);
    };
};

export const generarPreviewLabel80 = async (effectiveRate = 36.5, copEnabled = false, tasaCop = 0) => {
    const { default: jsPDF } = await import('jspdf');

    const labelCurrencyMode = localStorage.getItem('label_currency_mode') || 'mixto';
    const isMixto = labelCurrencyMode === 'mixto';
    const hasSecondaryPrice = copEnabled && tasaCop > 0;

    const LABEL_W = 80;
    const labelH = isMixto ? 80 : (hasSecondaryPrice ? 68 : 60);

    const marginX = 5.0;
    const marginY = 4.0;

    const doc = new jsPDF('p', 'mm', [LABEL_W, labelH]);
    const width = doc.internal.pageSize.getWidth();
    const centerX = (width / 2) + 4.0;
    const printableWidth = width - (marginX * 2);

    const modeSuffix = isMixto ? '_80_mixto' : '_80_unico';

    const defNameX = '0';
    const defNameY = '0';
    const defPriceX = '0';
    const defPriceY = '0';
    const defSecPriceX = '0';
    const defSecPriceY = '0';

    const defFontName = '0';
    const defFontPrice = '0';
    const defFontSecPrice = '0';

    const offsetNameX       = parseFloat(localStorage.getItem(`label_offset_name_x${modeSuffix}`)       || defNameX);
    const offsetNameY       = parseFloat(localStorage.getItem(`label_offset_name_y${modeSuffix}`)       || defNameY);
    const offsetPriceX      = parseFloat(localStorage.getItem(`label_offset_price_x${modeSuffix}`)      || defPriceX);
    const offsetPriceY      = parseFloat(localStorage.getItem(`label_offset_price_y${modeSuffix}`)      || defPriceY);
    const offsetSecPriceX   = parseFloat(localStorage.getItem(`label_offset_sec_price_x${modeSuffix}`)  || defSecPriceX);
    const offsetSecPriceY   = parseFloat(localStorage.getItem(`label_offset_sec_price_y${modeSuffix}`)  || defSecPriceY);
    const offsetFontName     = parseFloat(localStorage.getItem(`label_offset_font_name${modeSuffix}`)      || defFontName);
    const offsetFontPrice    = parseFloat(localStorage.getItem(`label_offset_font_price${modeSuffix}`)     || defFontPrice);
    const offsetFontSecPrice = parseFloat(localStorage.getItem(`label_offset_font_sec_price${modeSuffix}`) || defFontSecPrice);

    const centrarTexto = (texto, y, fontSize, fontStyle = 'normal', color = [0, 0, 0], ox = 0, oy = 0) => {
        doc.setFont('helvetica', fontStyle);
        doc.setFontSize(fontSize);
        doc.setTextColor(...color);
        const tw = doc.getTextWidth(texto);
        doc.text(texto, centerX - tw / 2 + ox, y + oy);
    };

    const centrarLineas = (lineas, y, fontSize, lineHeight = 1.15, ox = 0, oy = 0) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontSize);
        doc.setTextColor(0, 0, 0);
        lineas.forEach((line, i) => {
            const tw = doc.getTextWidth(line);
            doc.text(line, centerX - tw / 2 + ox, y + oy + i * (fontSize * 0.3527 * lineHeight));
        });
    };

    const sampleName = 'TRIMMER KEMEI 2299';
    const priceUsdRaw = 1.26;
    const priceBsRaw  = mulR(priceUsdRaw, effectiveRate);
    const textUsd     = `$${round2(priceUsdRaw)}`;
    const textBs      = `Bs ${ceilR(priceBsRaw).toLocaleString('es-VE')}`;

    let mainText = '', secondaryText = '', promoTagText = '', showSecondary = false;
    if (labelCurrencyMode === 'bs') {
        mainText = textBs;
    } else if (labelCurrencyMode === 'usd') {
        mainText = textUsd;
    } else {
        const bcvUsdSample = Math.round(priceUsdRaw * 1.25);
        mainText = `$${bcvUsdSample}`;
        promoTagText = 'PROMO $ EFECTIVO';
        secondaryText = textUsd;
        showSecondary = true;
    }

    let baseTitleFontSize = isMixto ? 16 : 18;
    let titleFontSize = baseTitleFontSize + offsetFontName;
    if (titleFontSize < 6) titleFontSize = 6;

    const titleStartY = marginY + 2.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(titleFontSize);
    let titleLines = doc.splitTextToSize(sampleName, printableWidth);
    while (titleLines.length > 2 && titleFontSize > 7) {
        titleFontSize -= 0.5;
        doc.setFontSize(titleFontSize);
        titleLines = doc.splitTextToSize(sampleName, printableWidth);
    }
    centrarLineas(titleLines, titleStartY, titleFontSize, 1.15, offsetNameX, offsetNameY);

    const titleHeight = titleLines.length * (titleFontSize * 0.3527 * 1.15);
    const titleEndY   = titleStartY + titleHeight + offsetNameY;

    const footerStartY = labelH - marginY - 1.0;
    const freeSpace    = Math.max(15, footerStartY - (titleEndY + 2.0));

    let finalPriceFontSize = (isMixto ? 44 : 54) + offsetFontPrice;
    if (finalPriceFontSize < 10) finalPriceFontSize = 10;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(finalPriceFontSize);
    while (doc.getTextWidth(mainText) > printableWidth && finalPriceFontSize > 12) {
        finalPriceFontSize -= 0.5;
        doc.setFontSize(finalPriceFontSize);
    }

    let finalSecondaryFontSize = (isMixto ? 30 : 20) + offsetFontSecPrice;
    if (finalSecondaryFontSize < 8) finalSecondaryFontSize = 8;

    if (showSecondary) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(finalSecondaryFontSize);
        while (doc.getTextWidth(secondaryText) > printableWidth && finalSecondaryFontSize > 8) {
            finalSecondaryFontSize -= 0.5;
            doc.setFontSize(finalSecondaryFontSize);
        }
    }

    const prev80MainTagText = isMixto ? 'PRECIO' : '';
    let prev80MainTagFontSize = prev80MainTagText ? Math.max(6, 12.0 + offsetFontSecPrice * 0.2) : 0;
    let promoTagFontSize80 = promoTagText ? Math.max(6, 11.0 + offsetFontSecPrice * 0.2) : 0;

    if (promoTagText && showSecondary) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(promoTagFontSize80);
        while ((doc.getTextWidth(promoTagText) + 6.0) > printableWidth && promoTagFontSize80 > 6) {
            promoTagFontSize80 -= 0.5;
            doc.setFontSize(promoTagFontSize80);
        }
    }
    if (prev80MainTagText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(prev80MainTagFontSize);
        while ((doc.getTextWidth(prev80MainTagText) + 6.0) > printableWidth && prev80MainTagFontSize > 6) {
            prev80MainTagFontSize -= 0.5;
            doc.setFontSize(prev80MainTagFontSize);
        }
    }

    let mainTagH80 = prev80MainTagText ? prev80MainTagFontSize * 0.3527 * 0.85 : 0;
    let mainTagBoxH80 = prev80MainTagText ? mainTagH80 + 2.0 : 0;
    let promoTagH80 = promoTagText ? promoTagFontSize80 * 0.3527 * 0.85 : 0;
    let promoTagBoxH80 = promoTagText ? promoTagH80 + 2.0 : 0;

    let priceHeight = finalPriceFontSize * 0.3527 * 0.85;
    let secondaryHeight = showSecondary ? finalSecondaryFontSize * 0.3527 * 0.85 : 0;

    let priceBlockHeight = 0;
    if (prev80MainTagText) priceBlockHeight += mainTagBoxH80 + 2.0;
    priceBlockHeight += priceHeight;
    if (promoTagText && showSecondary) priceBlockHeight += 3.0 + promoTagBoxH80 + 2.0;
    if (showSecondary) priceBlockHeight += secondaryHeight;

    const maxAllowed = freeSpace * 0.92;
    if (priceBlockHeight > maxAllowed && maxAllowed > 6) {
        const sf = maxAllowed / priceBlockHeight;
        finalPriceFontSize = Math.max(10, finalPriceFontSize * sf);
        finalSecondaryFontSize = Math.max(8, finalSecondaryFontSize * sf);
        if (prev80MainTagFontSize) prev80MainTagFontSize = Math.max(6, prev80MainTagFontSize * sf);
        if (promoTagFontSize80) promoTagFontSize80 = Math.max(6, promoTagFontSize80 * sf);

        mainTagH80 = prev80MainTagText ? prev80MainTagFontSize * 0.3527 * 0.85 : 0;
        mainTagBoxH80 = prev80MainTagText ? mainTagH80 + 2.0 : 0;
        promoTagH80 = promoTagText ? promoTagFontSize80 * 0.3527 * 0.85 : 0;
        promoTagBoxH80 = promoTagText ? promoTagH80 + 2.0 : 0;
        priceHeight = finalPriceFontSize * 0.3527 * 0.85;
        secondaryHeight = showSecondary ? finalSecondaryFontSize * 0.3527 * 0.85 : 0;

        priceBlockHeight = 0;
        if (prev80MainTagText) priceBlockHeight += mainTagBoxH80 + 2.0;
        priceBlockHeight += priceHeight;
        if (promoTagText && showSecondary) priceBlockHeight += 3.0 + promoTagBoxH80 + 2.0;
        if (showSecondary) priceBlockHeight += secondaryHeight;
    }

    let currentY = (titleEndY + 2.5) + Math.max(0, (freeSpace - priceBlockHeight) / 2);

    if (prev80MainTagText) {
        currentY += mainTagH80 + 1.0;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(prev80MainTagFontSize);
        const mtw = doc.getTextWidth(prev80MainTagText);
        const mbW = mtw + 6.0;
        const mbH = mainTagBoxH80;
        let mbX = (centerX - mbW / 2) + offsetPriceX;
        mbX = Math.max(marginX, Math.min(width - marginX - mbW, mbX));
        const mbY = currentY - mainTagH80 + offsetPriceY - 1.2;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.4);
        doc.roundedRect(mbX, mbY, mbW, mbH, 1.5, 1.5, 'S');
        centrarTexto(prev80MainTagText, currentY, prev80MainTagFontSize, 'bold', [0, 0, 0], offsetPriceX, offsetPriceY - 0.8);
        currentY += 2.0;
    }

    currentY += priceHeight;
    centrarTexto(mainText, currentY, finalPriceFontSize, 'bold', [0, 0, 0], offsetPriceX, offsetPriceY);

    if (promoTagText && showSecondary) {
        currentY += 3.0;
        currentY += promoTagH80 + 1.0;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(promoTagFontSize80);
        const tw = doc.getTextWidth(promoTagText);
        const badgeW = tw + 6.0;
        const badgeH = promoTagBoxH80;
        let badgeX = (centerX - badgeW / 2) + offsetSecPriceX;
        badgeX = Math.max(marginX, Math.min(width - marginX - badgeW, badgeX));
        const badgeY = currentY - promoTagH80 + offsetSecPriceY - 1.2;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.4);
        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'S');
        centrarTexto(promoTagText, currentY, promoTagFontSize80, 'italic', [0, 0, 0], offsetSecPriceX, offsetSecPriceY - 0.8);
        currentY += 2.0;
    }

    if (showSecondary) {
        currentY += secondaryHeight;
        centrarTexto(secondaryText, currentY, finalSecondaryFontSize, 'bold', [0, 0, 0], offsetSecPriceX, offsetSecPriceY);
    }

    return doc.output('bloburl');
};



