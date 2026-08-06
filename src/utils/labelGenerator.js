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

    // Importación dinámica de jsPDF para optimizar carga inicial
    const { default: jsPDF } = await import('jspdf');

    if (!productos || productos.length === 0) return;

    // Calcular la altura dinámica por etiqueta individual
    const labelCurrencyMode = localStorage.getItem('label_currency_mode') || 'mixto';
    const hasSecondaryPrice = copEnabled && tasaCop > 0;
    
    let labelH = 60; // Por defecto mixto
    if (labelCurrencyMode === 'bs' || labelCurrencyMode === 'usd') {
        labelH = hasSecondaryPrice ? 50 : 44; // Reducción a 44mm de alto para moneda única
    }

    const marginX = 4.5; // Margen de seguridad horizontal en mm
    const marginY = 3.5; // Margen vertical en mm

    // Altura total de la hoja dinámica según la cantidad de productos
    const totalHeight = labelH * productos.length;

    // Crear un único documento Portrait de 58mm de ancho por totalHeight de alto
    const doc = new jsPDF('p', 'mm', [LABEL_W, totalHeight]);

    const width = doc.internal.pageSize.getWidth();   // 58 mm
    const height = doc.internal.pageSize.getHeight(); // totalHeight mm
    
    // El modo mixto en esta impresora térmica requiere una compensación a la izquierda para centrar las líneas dobles,
    // mientras que el modo de moneda única (Bs o USD gigante) requiere estar físicamente más centrado para no cortarse a la izquierda.
    let centerX = width / 2;
    if (labelCurrencyMode === 'mixto') {
        centerX = (width / 2) - 3; // Desplazado 3mm a la izquierda en modo mixto
    } else {
        centerX = (width / 2) + 0.5; // Desplazado 0.5mm a la derecha en moneda única
    }

    // Ancho imprimible dinámico para evitar desbordes al estar desplazado el eje central
    const maxHalfWidth = Math.min(centerX, width - centerX);
    const printableWidth = (maxHalfWidth - marginX) * 2;

    // Determinar sufijo y defaults según el modo de moneda
    const isMixto = labelCurrencyMode === 'mixto';
    const modeSuffix = isMixto ? '_mixto' : '_unico';

    const defNameX = isMixto ? '-1.5' : '1';
    const defNameY = isMixto ? '2' : '0';
    const defPriceX = isMixto ? '-1.5' : '1';
    const defPriceY = isMixto ? '-7.5' : '-3';
    const defSecPriceX = isMixto ? '-1.5' : '1';
    const defSecPriceY = isMixto ? '-3' : '2';
    const defFooterX = isMixto ? '-1.5' : '1';
    const defFooterY = isMixto ? '-1' : '1';

    const defFontName = isMixto ? '5' : '5';
    const defFontPrice = isMixto ? '10' : '10';
    const defFontSecPrice = isMixto ? '12.5' : '0';
    const defFontFooter = isMixto ? '4' : '4';

    // Cargar offsets personalizados de calibración desde localStorage
    const offsetNameX = parseFloat(localStorage.getItem(`label_offset_name_x${modeSuffix}`) || defNameX);
    const offsetNameY = parseFloat(localStorage.getItem(`label_offset_name_y${modeSuffix}`) || defNameY);
    const offsetPriceX = parseFloat(localStorage.getItem(`label_offset_price_x${modeSuffix}`) || defPriceX);
    const offsetPriceY = parseFloat(localStorage.getItem(`label_offset_price_y${modeSuffix}`) || defPriceY);
    const offsetSecPriceX = parseFloat(localStorage.getItem(`label_offset_sec_price_x${modeSuffix}`) || defSecPriceX);
    const offsetSecPriceY = parseFloat(localStorage.getItem(`label_offset_sec_price_y${modeSuffix}`) || defSecPriceY);
    const offsetFooterX = parseFloat(localStorage.getItem(`label_offset_footer_x${modeSuffix}`) || defFooterX);
    const offsetFooterY = parseFloat(localStorage.getItem(`label_offset_footer_y${modeSuffix}`) || defFooterY);

    // Cargar offsets de tamaño de fuente (tipografía)
    const offsetFontName = parseFloat(localStorage.getItem(`label_offset_font_name${modeSuffix}`) || defFontName);
    const offsetFontPrice = parseFloat(localStorage.getItem(`label_offset_font_price${modeSuffix}`) || defFontPrice);
    const offsetFontSecPrice = parseFloat(localStorage.getItem(`label_offset_font_sec_price${modeSuffix}`) || defFontSecPrice);
    const offsetFontFooter = parseFloat(localStorage.getItem(`label_offset_font_footer${modeSuffix}`) || defFontFooter);

    // Helper ergonómico para centrar texto de forma manual (evita bugs de alineación de jsPDF)
    const centrarTexto = (texto, y, fontSize, fontStyle = 'normal', color = [0, 0, 0], offsetX = 0, offsetY = 0) => {
        doc.setFont('helvetica', fontStyle);
        doc.setFontSize(fontSize);
        doc.setTextColor(...color);
        const textWidth = doc.getTextWidth(texto);
        doc.text(texto, centerX - textWidth / 2 + offsetX, y + offsetY);
    };

    // Helper ergonómico para centrar arrays de líneas del título
    const centrarLineas = (lineas, y, fontSize, lineHeight = 1.3, offsetX = 0, offsetY = 0) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontSize);
        doc.setTextColor(0, 0, 0);

        lineas.forEach((line, i) => {
            const textWidth = doc.getTextWidth(line);
            doc.text(line, centerX - textWidth / 2 + offsetX, y + offsetY + i * (fontSize * 0.3527 * lineHeight));
        });
    };

    productos.forEach((p, index) => {
        // Offset vertical base para esta etiqueta individual en la tira continua
        const offsetY = index * labelH;

        // Dibujar línea divisoria punteada entre etiquetas consecutivas para facilitar el corte manual

        if (index > 0) {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.35);
            doc.setLineDashPattern([2, 2], 0);
            doc.line(marginX, offsetY, width - marginX, offsetY);
            doc.setLineDashPattern([], 0);
        }

        const titleStartY = offsetY + marginY + 2.5;
        const labelCurrencyMode = localStorage.getItem('label_currency_mode') || 'mixto';

        // --- 1. TITULO DEL PRODUCTO CON ESCALADO DINÁMICO ---
        let baseTitleFontSize = (labelCurrencyMode === 'bs' || labelCurrencyMode === 'usd') ? 11.5 : 10;
        let titleFontSize = baseTitleFontSize + offsetFontName;
        if (titleFontSize < 5) titleFontSize = 5;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(titleFontSize);
        let titleLines = doc.splitTextToSize(p.name.toUpperCase(), printableWidth);

        // Si el título es muy largo con el tamaño de letra calibrado final, lo reducimos progresivamente
        // para que quepa en máximo 2 líneas sin desbordar los márgenes de la etiqueta de 58mm.
        while (titleLines.length > 2 && titleFontSize > 6.5) {
            titleFontSize -= 0.5;
            doc.setFontSize(titleFontSize);
            titleLines = doc.splitTextToSize(p.name.toUpperCase(), printableWidth);
        }

        // Renderizar las líneas del título
        centrarLineas(titleLines, titleStartY, titleFontSize, 1.25, offsetNameX, offsetNameY);

        // Calcular el final del bloque de título (convertir pt a mm con factor 0.3527)
        const titleHeight = titleLines.length * (titleFontSize * 0.3527 * 1.25);
        const titleEndY = titleStartY + titleHeight;

        // --- 2. CONFIGURAR PIE DE PÁGINA (PUNTO DE CORTE INFERIOR) ---
        const footerY = offsetY + labelH - marginY - 2;
        const hasSecondaryPrice = copEnabled && tasaCop > 0;
        const footerStartY = hasSecondaryPrice ? footerY - 5.5 : footerY - 1.5;

        // Espacio libre central para diagramar el bloque de precios
        const freeSpace = footerStartY - (titleEndY + 2.0);

        // --- 3. CÁLCULO DE PRECIOS CON CENTRADO VERTICAL RESPONSIVO ---
        const { mainText, secondaryText, tertiaryText, promoTagText, mainTagText, showSecondary } = computeLabelPriceTexts(
            p, effectiveRate, copEnabled, tasaCop, bcvMarginPct, labelCurrencyMode
        );

        // Sumar offset de tamaño de fuente al precio principal antes de medir
        let finalPriceFontSize = ((labelCurrencyMode === 'bs' || labelCurrencyMode === 'usd') ? 28 : 24) + offsetFontPrice;
        if (finalPriceFontSize < 5) finalPriceFontSize = 5;

        // Configurar la fuente activa para medir el precio principal
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(finalPriceFontSize);
        let textWidth = doc.getTextWidth(mainText);

        // Ajuste horizontal continuo: reducir si el precio principal final calibrado no cabe
        while (textWidth > printableWidth && finalPriceFontSize > 10) {
            finalPriceFontSize -= 0.5;
            doc.setFontSize(finalPriceFontSize);
            textWidth = doc.getTextWidth(mainText);
        }

        // Altura y tamaño de letra del precio secundario con offset sumado
        let finalSecondaryFontSize = 11 + offsetFontSecPrice;
        if (finalSecondaryFontSize < 5) finalSecondaryFontSize = 5;

        let promoTagFontSize = promoTagText ? Math.max(3, 3.5 + offsetFontSecPrice) : 0;
        let promoTagHeight = promoTagText ? promoTagFontSize * 0.3527 * 0.75 : 0;
        // Badge PRECIO encima del precio principal (mismo tamaño que promoTag)
        let mainTagFontSize = mainTagText ? Math.max(3, 3.5 + offsetFontSecPrice) : 0;
        let mainTagHeight = mainTagText ? mainTagFontSize * 0.3527 * 0.75 : 0;

        // Ajuste horizontal continuo para el precio secundario final calibrado
        if (showSecondary) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(finalSecondaryFontSize);
            let secWidth = doc.getTextWidth(secondaryText);
            while (secWidth > printableWidth && finalSecondaryFontSize > 6) {
                finalSecondaryFontSize -= 0.5;
                doc.setFontSize(finalSecondaryFontSize);
                secWidth = doc.getTextWidth(secondaryText);
            }
        }

        // Alturas físicas de las tipografías en mm (factor baseline de jsPDF ~0.75)
        let priceHeight = finalPriceFontSize * 0.3527 * 0.75;
        let secondaryHeight = finalSecondaryFontSize * 0.3527 * 0.75;
        let tertiaryHeight = tertiaryText ? (finalSecondaryFontSize * 0.70) * 0.3527 * 0.75 : 0;

        let priceBlockHeight = priceHeight;
        if (mainTagText) priceBlockHeight += mainTagHeight + 1.5;
        if (promoTagText) priceBlockHeight += promoTagHeight + 2.2;
        if (showSecondary) priceBlockHeight += secondaryHeight + 2.5;
        if (tertiaryText) priceBlockHeight += tertiaryHeight + 1.8;

        // Ajuste vertical proporcional continuo si el bloque excede el 84% del espacio libre
        const maxAllowedBlockHeight = freeSpace * 0.84;
        if (priceBlockHeight > maxAllowedBlockHeight && maxAllowedBlockHeight > 4) {
            const scaleFactor = maxAllowedBlockHeight / priceBlockHeight;
            finalPriceFontSize = Math.max(5, finalPriceFontSize * scaleFactor);
            finalSecondaryFontSize = Math.max(5, finalSecondaryFontSize * scaleFactor);
            promoTagFontSize = Math.max(4, promoTagFontSize * scaleFactor);
            mainTagFontSize = Math.max(4, mainTagFontSize * scaleFactor);
            
            // Recalcular alturas físicas
            priceHeight = finalPriceFontSize * 0.3527 * 0.75;
            secondaryHeight = finalSecondaryFontSize * 0.3527 * 0.75;
            promoTagHeight = promoTagText ? promoTagFontSize * 0.3527 * 0.75 : 0;
            mainTagHeight = mainTagText ? mainTagFontSize * 0.3527 * 0.75 : 0;
            tertiaryHeight = tertiaryText ? (finalSecondaryFontSize * 0.70) * 0.3527 * 0.75 : 0;
            
            priceBlockHeight = priceHeight;
            if (mainTagText) priceBlockHeight += mainTagHeight + 1.5;
            if (promoTagText) priceBlockHeight += promoTagHeight + 2.2;
            if (showSecondary) priceBlockHeight += secondaryHeight + 2.5;
            if (tertiaryText) priceBlockHeight += tertiaryHeight + 1.8;
        }

        const startBlockY = (titleEndY + 2.0) + ((freeSpace - priceBlockHeight) / 2);

        // Render 58mm: badge PRECIO → mainText (BCV) → badge PROMO → secondaryText (efectivo)
        let currentY = startBlockY;

        // 0. Badge PRECIO encima del precio normal
        if (mainTagText) {
            currentY += mainTagHeight;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(mainTagFontSize);
            const mtw = doc.getTextWidth(mainTagText);
            const mbW = mtw + 4;
            const mbH = mainTagHeight + 1.2;
            const mbX = (centerX - mbW / 2) + offsetPriceX;
            const mbY = currentY - mainTagHeight + offsetPriceY - 1.2;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.3);
            doc.roundedRect(mbX, mbY, mbW, mbH, 1, 1, 'S');
            centrarTexto(mainTagText, currentY, mainTagFontSize, 'normal', [0, 0, 0], offsetPriceX, offsetPriceY - 1);
            currentY += 1.5;
        }

        // 1. Precio normal (BCV) arriba, grande
        currentY += priceHeight;
        centrarTexto(mainText, currentY, finalPriceFontSize, 'bold', [0, 0, 0], offsetPriceX, offsetPriceY);

        // 2. Badge PROMO $ EFECTIVO (debajo del precio normal)
        if (promoTagText && showSecondary) {
            currentY += 2.5;
            currentY += promoTagHeight;
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(promoTagFontSize);
            const tw = doc.getTextWidth(promoTagText);
            const badgeW = tw + 4;
            const badgeH = promoTagHeight + 1.2;
            const badgeX = (centerX - badgeW / 2) + offsetSecPriceX;
            const badgeY = currentY - promoTagHeight + offsetSecPriceY - 1.2;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.3);
            doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, 'S');
            centrarTexto(promoTagText, currentY, promoTagFontSize, 'italic', [0, 0, 0], offsetSecPriceX, offsetSecPriceY - 1);
            currentY += 2.2;
        }

        // 3. Precio efectivo (cash), grande
        if (showSecondary) {
            currentY += secondaryHeight;
            centrarTexto(secondaryText, currentY, finalSecondaryFontSize, 'bold', [0, 0, 0], offsetSecPriceX, offsetSecPriceY);
        }

        // --- 4. FOOTER FIJO EN LA BASE (REMOVIDO SEGÚN SOLICITUD) ---
    });

    // Disparar auto-impresión a través de iframe para flujo directo continuo y limpio
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
            catch (_e) { /* iframe ya removido — no-op */ }
        }, 5000);
    };
};

/**
 * GENERADOR DE PREVIEW FIEL (100% pixel-perfect)
 * Usa exactamente el mismo pipeline de jsPDF que generarEtiquetas pero con un
 * producto de muestra y devuelve un blobURL para embeber en un <iframe>.
 * De esta forma el preview ES el ticket real — sin simulación.
 *
 * @param {number} effectiveRate - Tasa Bs/USD activa
 * @param {boolean} copEnabled   - Si el modo COP está habilitado
 * @param {number} tasaCop       - Tasa COP/USD activa
 * @returns {Promise<string>}    - Blob URL del PDF generado
 */
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

    const marginX = 4.5;
    const marginY = 3.5;
    const LABEL_W_L = 58;

    let centerX = LABEL_W_L / 2;
    if (isMixto) {
        centerX = (LABEL_W_L / 2) - 3;
    } else {
        centerX = (LABEL_W_L / 2) + 0.5;
    }

    const maxHalfWidth = Math.min(centerX, LABEL_W_L - centerX);
    const printableWidth = (maxHalfWidth - marginX) * 2;
    const modeSuffix = isMixto ? '_mixto' : '_unico';

    const defNameX = isMixto ? '3' : '3';
    const defNameY = isMixto ? '-3' : '0';
    const defPriceX = isMixto ? '2.5' : '3';
    const defPriceY = isMixto ? '-5.5' : '-3';
    const defSecPriceX = isMixto ? '2.5' : '0';
    const defSecPriceY = isMixto ? '-3' : '2';
    const defFooterX = isMixto ? '2.5' : '3';
    const defFooterY = isMixto ? '-1' : '1';
    const defFontName = isMixto ? '3' : '1';
    const defFontPrice = isMixto ? '10' : '6';
    const defFontSecPrice = isMixto ? '14.5' : '0';
    const defFontFooter = isMixto ? '4' : '2';

    const offsetNameX       = parseFloat(localStorage.getItem(`label_offset_name_x${modeSuffix}`)       || defNameX);
    const offsetNameY       = parseFloat(localStorage.getItem(`label_offset_name_y${modeSuffix}`)       || defNameY);
    const offsetPriceX      = parseFloat(localStorage.getItem(`label_offset_price_x${modeSuffix}`)      || defPriceX);
    const offsetPriceY      = parseFloat(localStorage.getItem(`label_offset_price_y${modeSuffix}`)      || defPriceY);
    const offsetSecPriceX   = parseFloat(localStorage.getItem(`label_offset_sec_price_x${modeSuffix}`)  || defSecPriceX);
    const offsetSecPriceY   = parseFloat(localStorage.getItem(`label_offset_sec_price_y${modeSuffix}`)  || defSecPriceY);
    const offsetFooterX     = parseFloat(localStorage.getItem(`label_offset_footer_x${modeSuffix}`)     || defFooterX);
    const offsetFooterY     = parseFloat(localStorage.getItem(`label_offset_footer_y${modeSuffix}`)     || defFooterY);
    const offsetFontName     = parseFloat(localStorage.getItem(`label_offset_font_name${modeSuffix}`)      || defFontName);
    const offsetFontPrice    = parseFloat(localStorage.getItem(`label_offset_font_price${modeSuffix}`)     || defFontPrice);
    const offsetFontSecPrice = parseFloat(localStorage.getItem(`label_offset_font_sec_price${modeSuffix}`) || defFontSecPrice);
    const offsetFontFooter   = parseFloat(localStorage.getItem(`label_offset_font_footer${modeSuffix}`)    || defFontFooter);

    const doc = new jsPDF('p', 'mm', [LABEL_W_L, labelH]);

    const centrarTexto = (texto, y, fontSize, fontStyle = 'normal', color = [0, 0, 0], ox = 0, oy = 0) => {
        doc.setFont('helvetica', fontStyle);
        doc.setFontSize(fontSize);
        doc.setTextColor(...color);
        const tw = doc.getTextWidth(texto);
        doc.text(texto, centerX - tw / 2 + ox, y + oy);
    };

    const centrarLineas = (lineas, y, fontSize, lineHeight = 1.3, ox = 0, oy = 0) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontSize);
        doc.setTextColor(0, 0, 0);
        lineas.forEach((line, i) => {
            const tw = doc.getTextWidth(line);
            doc.text(line, centerX - tw / 2 + ox, y + oy + i * (fontSize * 0.3527 * lineHeight));
        });
    };

    // Producto de muestra representativo
    const priceUsdRaw = 1.26;
    const priceBsRaw  = mulR(priceUsdRaw, effectiveRate);

    const textUsd = `$${round2(priceUsdRaw)}`;
    const textBs  = `Bs ${ceilR(priceBsRaw).toLocaleString('es-VE')}`;

    let mainText = '';
    let secondaryText = '';
    let promoTagText = '';
    let showSecondary = false;

    // Producto de muestra representativo: precio BCV arriba, efectivo abajo
    // (margen ~25% sobre el precio efectivo)
    const cashMarginMult = 1.25; // 25% de recargo sobre efectivo = precio BCV

    if (labelCurrencyMode === 'bs') {
        mainText = textBs;
    } else if (labelCurrencyMode === 'usd') {
        mainText = textUsd;
    } else {
        const bcvUsdSample = round2(priceUsdRaw * cashMarginMult);
        mainText = `$${Math.round(bcvUsdSample)}`; // Precio BCV arriba, sin sufijo
        promoTagText = 'PROMO $ EFECTIVO';
        secondaryText = textUsd; // Precio efectivo abajo
        showSecondary = true;
    }

    const sampleName = 'SALSA DE TOMATE PAMPERO 397G';
    const titleStartY = marginY + 2.5;

    let titleFontSize = (labelCurrencyMode === 'bs' || labelCurrencyMode === 'usd') ? 11.5 : 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(titleFontSize);
    let titleLines = doc.splitTextToSize(sampleName, printableWidth);
    while (titleLines.length > 2 && titleFontSize > 6.5) {
        titleFontSize -= 0.5;
        doc.setFontSize(titleFontSize);
        titleLines = doc.splitTextToSize(sampleName, printableWidth);
    }
    titleFontSize += offsetFontName;
    if (titleFontSize < 5) titleFontSize = 5;

    centrarLineas(titleLines, titleStartY, titleFontSize, 1.25, offsetNameX, offsetNameY);

    const titleHeight = titleLines.length * (titleFontSize * 0.3527 * 1.25);
    const titleEndY   = titleStartY + titleHeight;

    const footerY      = labelH - marginY - 2;
    const footerStartY = hasSecondaryPrice ? footerY - 5.5 : footerY - 1.5;
    const freeSpace    = footerStartY - (titleEndY + 2.0);

    let priceFontSize = ((labelCurrencyMode === 'bs' || labelCurrencyMode === 'usd') ? 28 : 24) + offsetFontPrice;
    if (priceFontSize < 5) priceFontSize = 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(priceFontSize);
    while (doc.getTextWidth(mainText) > printableWidth && priceFontSize > 10) {
        priceFontSize -= 0.5;
        doc.setFontSize(priceFontSize);
    }

    let secPriceFontSize = 11 + offsetFontSecPrice;
    if (secPriceFontSize < 5) secPriceFontSize = 5;

    let promoTagFontSize = promoTagText ? Math.max(3, 3.5 + offsetFontSecPrice) : 0;
    let promoTagHeight = promoTagText ? promoTagFontSize * 0.3527 * 0.75 : 0;

    if (showSecondary) {
        doc.setFontSize(secPriceFontSize);
        while (doc.getTextWidth(secondaryText) > printableWidth && secPriceFontSize > 6) {
            secPriceFontSize -= 0.5;
            doc.setFontSize(secPriceFontSize);
        }
    }

    let priceH_mm    = priceFontSize    * 0.3527 * 0.75;
    let secPriceH_mm = secPriceFontSize * 0.3527 * 0.75;
    // Badge PRECIO preview
    const previewMainTagText = isMixto ? 'PRECIO' : '';
    let previewMainTagFontSize = previewMainTagText ? Math.max(3, 3.5 + offsetFontSecPrice) : 0;
    let previewMainTagH = previewMainTagText ? previewMainTagFontSize * 0.3527 * 0.75 : 0;
    let blockH_mm    = priceH_mm;
    if (previewMainTagText) blockH_mm += previewMainTagH + 1.5;
    if (promoTagText) blockH_mm += promoTagHeight + 2.2;
    if (showSecondary) blockH_mm += secPriceH_mm + 2.5;

    const maxAllowed = freeSpace * 0.82;
    if (blockH_mm > maxAllowed && maxAllowed > 4) {
        const sf = maxAllowed / blockH_mm;
        priceFontSize    = Math.max(5, priceFontSize    * sf);
        secPriceFontSize = Math.max(5, secPriceFontSize * sf);
        promoTagFontSize = Math.max(4, promoTagFontSize * sf);
        previewMainTagFontSize = Math.max(4, previewMainTagFontSize * sf);
        priceH_mm    = priceFontSize    * 0.3527 * 0.75;
        secPriceH_mm = secPriceFontSize * 0.3527 * 0.75;
        promoTagHeight = promoTagText ? promoTagFontSize * 0.3527 * 0.75 : 0;
        previewMainTagH = previewMainTagText ? previewMainTagFontSize * 0.3527 * 0.75 : 0;
        blockH_mm    = priceH_mm;
        if (previewMainTagText) blockH_mm += previewMainTagH + 1.5;
        if (promoTagText) blockH_mm += promoTagHeight + 2.2;
        if (showSecondary) blockH_mm += secPriceH_mm + 2.5;
    }

    // Render 58mm preview: badge PRECIO → mainText (BCV) → badge PROMO → secondaryText (efectivo)
    let currentY = (titleEndY + 2.0) + (freeSpace - blockH_mm) / 2;

    // 0. Badge PRECIO encima del precio normal
    if (previewMainTagText) {
        currentY += previewMainTagH;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(previewMainTagFontSize);
        const mtw = doc.getTextWidth(previewMainTagText);
        const mbW = mtw + 4;
        const mbH = previewMainTagH + 1.2;
        const mbX = (centerX - mbW / 2) + offsetPriceX;
        const mbY = currentY - previewMainTagH + offsetPriceY - 1.2;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);
        doc.roundedRect(mbX, mbY, mbW, mbH, 1, 1, 'S');
        centrarTexto(previewMainTagText, currentY, previewMainTagFontSize, 'normal', [0, 0, 0], offsetPriceX, offsetPriceY - 1);
        currentY += 1.5;
    }

    // 1. Precio normal (BCV) arriba, grande
    currentY += priceH_mm;
    centrarTexto(mainText, currentY, priceFontSize, 'bold', [0, 0, 0], offsetPriceX, offsetPriceY);

    // 2. Badge PROMO $ EFECTIVO
    if (promoTagText && showSecondary) {
        currentY += 2.5;
        currentY += promoTagHeight;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(promoTagFontSize);
        const tw = doc.getTextWidth(promoTagText);
        const badgeW = tw + 4;
        const badgeH = promoTagHeight + 1.2;
        const badgeX = (centerX - badgeW / 2) + offsetSecPriceX;
        const badgeY = currentY - promoTagHeight + offsetSecPriceY - 1.2;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);
        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, 'S');
        centrarTexto(promoTagText, currentY, promoTagFontSize, 'italic', [0, 0, 0], offsetSecPriceX, offsetSecPriceY - 1);
        currentY += 2.2;
    }

    // 3. Precio efectivo (cash), grande
    if (showSecondary) {
        currentY += secPriceH_mm;
        centrarTexto(secondaryText, currentY, secPriceFontSize, 'bold', [0, 0, 0], offsetSecPriceX, offsetSecPriceY);
    }

    return doc.output('bloburl');
};

// ─────────────────────────────────────────────────────────────────────────────
//  80mm IMPLEMENTATION (COMPLETELY ISOLATED FROM 58mm)
//  🛡️ CONFIGURACIÓN FÍSICA BLINDADA POR DEFECTO (80mm):
//  - Ancho de etiqueta: 80.0 mm
//  - Alto de etiqueta: Mixto = 80.0 mm | Único (sin COP) = 60.0 mm | Único (con COP) = 68.0 mm
//  - Centro Mixto (compensado): 37.00 mm (Calculado: width/2 - 3)
//  - Centro Único/Individual (compensado): 45.50 mm (Calculado: width/2 + 5.5)
// ─────────────────────────────────────────────────────────────────────────────

export const generarEtiquetas80 = async (productos, effectiveRate, copEnabled, tasaCop, bcvMarginPct = 25) => {
    const { default: jsPDF } = await import('jspdf');

    if (!productos || productos.length === 0) return;

    const labelCurrencyMode = localStorage.getItem('label_currency_mode') || 'mixto';
    const isMixto = labelCurrencyMode === 'mixto';
    const hasSecondaryPrice = copEnabled && tasaCop > 0;

    // Configuración física para 80mm
    const LABEL_W = 80;
    const labelH = isMixto ? 80 : (hasSecondaryPrice ? 68 : 60);

    const marginX = 6; 
    const marginY = 4.5; 
    const totalHeight = labelH * productos.length;

    const doc = new jsPDF('p', 'mm', [LABEL_W, totalHeight]);
    const width = doc.internal.pageSize.getWidth();
    // Mixto: -3mm izq | Individual: +5.5mm der (8.5mm diferencia)
    const centerX = isMixto ? (width / 2) - 3 : (width / 2) + 5.5;
    const maxHalfWidth = Math.min(centerX, width - centerX);
    const printableWidth = (maxHalfWidth - marginX) * 2;

    const modeSuffix = isMixto ? '_80_mixto' : '_80_unico';

    // Defaults de fábrica para 80mm
    const defNameX = '0';
    const defNameY = '0';
    const defPriceX = '0';
    const defPriceY = isMixto ? '-6' : '-2';
    const defSecPriceX = '0';
    const defSecPriceY = isMixto ? '-3' : '2';
    const defFooterX = '0';
    const defFooterY = '0';

    const defFontName = '4';
    const defFontPrice = '14';
    const defFontSecPrice = isMixto ? '12' : '0';
    const defFontFooter = '3';

    // Cargar offsets de localStorage
    const offsetNameX       = parseFloat(localStorage.getItem(`label_offset_name_x${modeSuffix}`)       || defNameX);
    const offsetNameY       = parseFloat(localStorage.getItem(`label_offset_name_y${modeSuffix}`)       || defNameY);
    const offsetPriceX      = parseFloat(localStorage.getItem(`label_offset_price_x${modeSuffix}`)      || defPriceX);
    const offsetPriceY      = parseFloat(localStorage.getItem(`label_offset_price_y${modeSuffix}`)      || defPriceY);
    const offsetSecPriceX   = parseFloat(localStorage.getItem(`label_offset_sec_price_x${modeSuffix}`)  || defSecPriceX);
    const offsetSecPriceY   = parseFloat(localStorage.getItem(`label_offset_sec_price_y${modeSuffix}`)  || defSecPriceY);
    const offsetFooterX     = parseFloat(localStorage.getItem(`label_offset_footer_x${modeSuffix}`)     || defFooterX);
    const offsetFooterY     = parseFloat(localStorage.getItem(`label_offset_footer_y${modeSuffix}`)     || defFooterY);
    const offsetFontName     = parseFloat(localStorage.getItem(`label_offset_font_name${modeSuffix}`)      || defFontName);
    const offsetFontPrice    = parseFloat(localStorage.getItem(`label_offset_font_price${modeSuffix}`)     || defFontPrice);
    const offsetFontSecPrice = parseFloat(localStorage.getItem(`label_offset_font_sec_price${modeSuffix}`) || defFontSecPrice);
    const offsetFontFooter   = parseFloat(localStorage.getItem(`label_offset_font_footer${modeSuffix}`)    || defFontFooter);

    const centrarTexto = (texto, y, fontSize, fontStyle = 'normal', color = [0, 0, 0], offsetX = 0, offsetY = 0) => {
        doc.setFont('helvetica', fontStyle);
        doc.setFontSize(fontSize);
        doc.setTextColor(...color);
        const textWidth = doc.getTextWidth(texto);
        doc.text(texto, centerX - textWidth / 2 + offsetX, y + offsetY);
    };

    const centrarLineas = (lineas, y, fontSize, lineHeight = 1.3, offsetX = 0, offsetY = 0) => {
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

        // Título del producto
        let baseTitleFontSize = isMixto ? 14 : 17;
        let titleFontSize = baseTitleFontSize + offsetFontName;
        if (titleFontSize < 5) titleFontSize = 5;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(titleFontSize);
        let titleLines = doc.splitTextToSize(p.name.toUpperCase(), printableWidth);

        while (titleLines.length > 2 && titleFontSize > 6.5) {
            titleFontSize -= 0.5;
            doc.setFontSize(titleFontSize);
            titleLines = doc.splitTextToSize(p.name.toUpperCase(), printableWidth);
        }

        centrarLineas(titleLines, titleStartY, titleFontSize, 1.25, offsetNameX, offsetNameY);

        const titleHeight = titleLines.length * (titleFontSize * 0.3527 * 1.25);
        const titleEndY = titleStartY + titleHeight;

        // Footer Y
        const footerY = offsetY + labelH - marginY - 2;
        const footerStartY = hasSecondaryPrice ? footerY - 5.5 : footerY - 1.5;
        const freeSpace = footerStartY - (titleEndY + 2.5);

        // Precios
        const { mainText, secondaryText, tertiaryText, promoTagText, mainTagText, showSecondary } = computeLabelPriceTexts(
            p, effectiveRate, copEnabled, tasaCop, bcvMarginPct, labelCurrencyMode
        );

        // Precio principal
        let basePriceFontSize = isMixto ? 32 : 42;
        let finalPriceFontSize = basePriceFontSize + offsetFontPrice;
        if (finalPriceFontSize < 5) finalPriceFontSize = 5;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(finalPriceFontSize);
        let textWidth = doc.getTextWidth(mainText);

        while (textWidth > printableWidth && finalPriceFontSize > 10) {
            finalPriceFontSize -= 0.5;
            doc.setFontSize(finalPriceFontSize);
            textWidth = doc.getTextWidth(mainText);
        }

        // Precio secundario
        let baseSecPriceFontSize = isMixto ? 18 : 11;
        let finalSecondaryFontSize = baseSecPriceFontSize + offsetFontSecPrice;
        if (finalSecondaryFontSize < 5) finalSecondaryFontSize = 5;

        let promoTagFontSize = promoTagText ? Math.max(3, 4.5 + offsetFontSecPrice) : 0;
        let promoTagHeight = promoTagText ? promoTagFontSize * 0.3527 * 0.75 : 0;
        // Badge PRECIO encima del precio principal (80mm)
        let mainTagFontSize80 = mainTagText ? Math.max(3, 4.5 + offsetFontSecPrice) : 0;
        let mainTagHeight80 = mainTagText ? mainTagFontSize80 * 0.3527 * 0.75 : 0;

        if (showSecondary) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(finalSecondaryFontSize);
            let secWidth = doc.getTextWidth(secondaryText);
            while (secWidth > printableWidth && finalSecondaryFontSize > 6) {
                finalSecondaryFontSize -= 0.5;
                doc.setFontSize(finalSecondaryFontSize);
                secWidth = doc.getTextWidth(secondaryText);
            }
        }

        let priceHeight = finalPriceFontSize * 0.3527 * 0.75;
        let secondaryHeight = finalSecondaryFontSize * 0.3527 * 0.75;
        let tertiaryHeight = tertiaryText ? (finalSecondaryFontSize * 0.70) * 0.3527 * 0.75 : 0;

        let priceBlockHeight = priceHeight;
        if (mainTagText) priceBlockHeight += mainTagHeight80 + 2.0;
        if (promoTagText) priceBlockHeight += promoTagHeight + 2.5;
        if (showSecondary) priceBlockHeight += secondaryHeight + 3.0;
        if (tertiaryText) priceBlockHeight += tertiaryHeight + 2.0;

        // Ajuste vertical
        const maxAllowedBlockHeight = freeSpace * 0.84;
        if (priceBlockHeight > maxAllowedBlockHeight && maxAllowedBlockHeight > 4) {
            const scaleFactor = maxAllowedBlockHeight / priceBlockHeight;
            finalPriceFontSize = Math.max(5, finalPriceFontSize * scaleFactor);
            finalSecondaryFontSize = Math.max(5, finalSecondaryFontSize * scaleFactor);
            promoTagFontSize = Math.max(4, promoTagFontSize * scaleFactor);
            mainTagFontSize80 = Math.max(4, mainTagFontSize80 * scaleFactor);
            
            priceHeight = finalPriceFontSize * 0.3527 * 0.75;
            secondaryHeight = finalSecondaryFontSize * 0.3527 * 0.75;
            promoTagHeight = promoTagText ? promoTagFontSize * 0.3527 * 0.75 : 0;
            mainTagHeight80 = mainTagText ? mainTagFontSize80 * 0.3527 * 0.75 : 0;
            tertiaryHeight = tertiaryText ? (finalSecondaryFontSize * 0.70) * 0.3527 * 0.75 : 0;
            
            priceBlockHeight = priceHeight;
            if (mainTagText) priceBlockHeight += mainTagHeight80 + 2.0;
            if (promoTagText) priceBlockHeight += promoTagHeight + 2.5;
            if (showSecondary) priceBlockHeight += secondaryHeight + 3.0;
            if (tertiaryText) priceBlockHeight += tertiaryHeight + 2.0;
        }

        const startBlockY = (titleEndY + 2.5) + ((freeSpace - priceBlockHeight) / 2);

        // Render 80mm: badge PRECIO → mainText (BCV) → badge PROMO → secondaryText (efectivo)
        let currentY = startBlockY;

        // 0. Badge PRECIO encima del precio normal
        if (mainTagText) {
            currentY += mainTagHeight80;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(mainTagFontSize80);
            const mtw = doc.getTextWidth(mainTagText);
            const mbW = mtw + 5;
            const mbH = mainTagHeight80 + 1.4;
            const mbX = (centerX - mbW / 2) + offsetPriceX;
            const mbY = currentY - mainTagHeight80 + offsetPriceY - 1.4;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.35);
            doc.roundedRect(mbX, mbY, mbW, mbH, 1.2, 1.2, 'S');
            centrarTexto(mainTagText, currentY, mainTagFontSize80, 'normal', [0, 0, 0], offsetPriceX, offsetPriceY - 1);
            currentY += 2.0;
        }

        // 1. Precio normal (BCV) arriba, grande
        currentY += priceHeight;
        centrarTexto(mainText, currentY, finalPriceFontSize, 'bold', [0, 0, 0], offsetPriceX, offsetPriceY);

        // 2. Badge PROMO $ EFECTIVO
        if (promoTagText && showSecondary) {
            currentY += 3.0;
            currentY += promoTagHeight;
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(promoTagFontSize);
            const tw = doc.getTextWidth(promoTagText);
            const badgeW = tw + 5;
            const badgeH = promoTagHeight + 1.4;
            const badgeX = (centerX - badgeW / 2) + offsetSecPriceX;
            const badgeY = currentY - promoTagHeight + offsetSecPriceY - 1.4;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.35);
            doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.2, 1.2, 'S');
            centrarTexto(promoTagText, currentY, promoTagFontSize, 'italic', [0, 0, 0], offsetSecPriceX, offsetSecPriceY - 1);
            currentY += 2.5;
        }

        // 3. Precio efectivo (cash), grande
        if (showSecondary) {
            currentY += secondaryHeight;
            centrarTexto(secondaryText, currentY, finalSecondaryFontSize, 'bold', [0, 0, 0], offsetSecPriceX, offsetSecPriceY);
        }

        // Footer (Removido según solicitud)
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

    const marginX = 6;
    const marginY = 4.5;

    const doc = new jsPDF('p', 'mm', [LABEL_W, labelH]);
    const width = doc.internal.pageSize.getWidth();
    // Mixto: -3mm izq | Individual: +5.5mm der (8.5mm diferencia)
    const centerX = isMixto ? (width / 2) - 3 : (width / 2) + 5.5;
    const maxHalfWidth = Math.min(centerX, width - centerX);
    const printableWidth = (maxHalfWidth - marginX) * 2;

    const modeSuffix = isMixto ? '_80_mixto' : '_80_unico';

    const defNameX = '0';
    const defNameY = '0';
    const defPriceX = '0';
    const defPriceY = isMixto ? '-6' : '-2';
    const defSecPriceX = '0';
    const defSecPriceY = isMixto ? '-3' : '2';
    const defFooterX = '0';
    const defFooterY = '0';

    const defFontName = '4';
    const defFontPrice = '14';
    const defFontSecPrice = isMixto ? '12' : '0';
    const defFontFooter = '3';

    const offsetNameX       = parseFloat(localStorage.getItem(`label_offset_name_x${modeSuffix}`)       || defNameX);
    const offsetNameY       = parseFloat(localStorage.getItem(`label_offset_name_y${modeSuffix}`)       || defNameY);
    const offsetPriceX      = parseFloat(localStorage.getItem(`label_offset_price_x${modeSuffix}`)      || defPriceX);
    const offsetPriceY      = parseFloat(localStorage.getItem(`label_offset_price_y${modeSuffix}`)      || defPriceY);
    const offsetSecPriceX   = parseFloat(localStorage.getItem(`label_offset_sec_price_x${modeSuffix}`)  || defSecPriceX);
    const offsetSecPriceY   = parseFloat(localStorage.getItem(`label_offset_sec_price_y${modeSuffix}`)  || defSecPriceY);
    const offsetFooterX     = parseFloat(localStorage.getItem(`label_offset_footer_x${modeSuffix}`)     || defFooterX);
    const offsetFooterY     = parseFloat(localStorage.getItem(`label_offset_footer_y${modeSuffix}`)     || defFooterY);
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

    const centrarLineas = (lineas, y, fontSize, lineHeight = 1.3, ox = 0, oy = 0) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontSize);
        doc.setTextColor(0, 0, 0);
        lineas.forEach((line, i) => {
            const tw = doc.getTextWidth(line);
            doc.text(line, centerX - tw / 2 + ox, y + oy + i * (fontSize * 0.3527 * lineHeight));
        });
    };

    const sampleName = 'SALSA DE TOMATE PAMPERO 397G';
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
        // Precio BCV arriba (precio de lista), efectivo abajo (precio promo)
        const bcvUsdSample = Math.round(priceUsdRaw * 1.25);
        mainText = `$${bcvUsdSample}`; // Precio BCV arriba, sin sufijo
        promoTagText = 'PROMO $ EFECTIVO';
        secondaryText = textUsd; // Precio efectivo abajo
        showSecondary = true;
    }

    // Título
    let baseTitleFontSize = isMixto ? 14 : 17;
    let titleFontSize = baseTitleFontSize + offsetFontName;
    if (titleFontSize < 5) titleFontSize = 5;

    const titleStartY = marginY + 2.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(titleFontSize);
    let titleLines = doc.splitTextToSize(sampleName, printableWidth);
    while (titleLines.length > 2 && titleFontSize > 6.5) {
        titleFontSize -= 0.5;
        doc.setFontSize(titleFontSize);
        titleLines = doc.splitTextToSize(sampleName, printableWidth);
    }
    centrarLineas(titleLines, titleStartY, titleFontSize, 1.25, offsetNameX, offsetNameY);

    const titleHeight = titleLines.length * (titleFontSize * 0.3527 * 1.25);
    const titleEndY   = titleStartY + titleHeight;

    const footerY      = labelH - marginY - 2;
    const footerStartY = hasSecondaryPrice ? footerY - 5.5 : footerY - 1.5;
    const freeSpace    = footerStartY - (titleEndY + 2.5);

    // Precio principal
    let basePriceFontSize = isMixto ? 32 : 42;
    let priceFontSize = basePriceFontSize + offsetFontPrice;
    if (priceFontSize < 5) priceFontSize = 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(priceFontSize);
    while (doc.getTextWidth(mainText) > printableWidth && priceFontSize > 10) {
        priceFontSize -= 0.5;
        doc.setFontSize(priceFontSize);
    }

    // Precio secundario
    let baseSecPriceFontSize = isMixto ? 18 : 11;
    let secFontSize = baseSecPriceFontSize + offsetFontSecPrice;
    if (secFontSize < 5) secFontSize = 5;

    let promoTagFontSize = promoTagText ? Math.max(3, 4.5 + offsetFontSecPrice) : 0;
    let promoTagHeight = promoTagText ? promoTagFontSize * 0.3527 * 0.75 : 0;

    if (showSecondary) {
        doc.setFontSize(secFontSize);
        while (doc.getTextWidth(secondaryText) > printableWidth && secFontSize > 6) {
            secFontSize -= 0.5;
            doc.setFontSize(secFontSize);
        }
    }

    let priceH_mm    = priceFontSize * 0.3527 * 0.75;
    let secPriceH_mm = secFontSize   * 0.3527 * 0.75;
    // Badge PRECIO encima del precio principal (80mm preview)
    const prev80MainTagText = isMixto ? 'PRECIO' : '';
    let prev80MainTagFontSize = prev80MainTagText ? Math.max(3, 4.5 + offsetFontSecPrice) : 0;
    let prev80MainTagH = prev80MainTagText ? prev80MainTagFontSize * 0.3527 * 0.75 : 0;
    let blockH_mm    = priceH_mm;
    if (prev80MainTagText) blockH_mm += prev80MainTagH + 2.0;
    if (promoTagText) blockH_mm += promoTagHeight + 2.5;
    if (showSecondary) blockH_mm += secPriceH_mm + 3.5;

    const maxAllowed = freeSpace * 0.82;
    if (blockH_mm > maxAllowed && maxAllowed > 4) {
        const sf = maxAllowed / blockH_mm;
        priceFontSize = Math.max(5, priceFontSize * sf);
        secFontSize   = Math.max(5, secFontSize   * sf);
        promoTagFontSize = Math.max(4, promoTagFontSize * sf);
        prev80MainTagFontSize = Math.max(4, prev80MainTagFontSize * sf);
        priceH_mm    = priceFontSize * 0.3527 * 0.75;
        secPriceH_mm = secFontSize   * 0.3527 * 0.75;
        promoTagHeight = promoTagText ? promoTagFontSize * 0.3527 * 0.75 : 0;
        prev80MainTagH = prev80MainTagText ? prev80MainTagFontSize * 0.3527 * 0.75 : 0;
        blockH_mm    = priceH_mm;
        if (prev80MainTagText) blockH_mm += prev80MainTagH + 2.0;
        if (promoTagText) blockH_mm += promoTagHeight + 2.5;
        if (showSecondary) blockH_mm += secPriceH_mm + 3.5;
    }

    // Render 80mm preview: badge PRECIO → mainText (BCV) → badge PROMO → secondaryText (efectivo)
    let currentY = (titleEndY + 2.5) + (freeSpace - blockH_mm) / 2;

    // 0. Badge PRECIO encima del precio normal
    if (prev80MainTagText) {
        currentY += prev80MainTagH;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(prev80MainTagFontSize);
        const mtw = doc.getTextWidth(prev80MainTagText);
        const mbW = mtw + 5;
        const mbH = prev80MainTagH + 1.4;
        const mbX = (centerX - mbW / 2) + offsetPriceX;
        const mbY = currentY - prev80MainTagH + offsetPriceY - 1.4;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.35);
        doc.roundedRect(mbX, mbY, mbW, mbH, 1.2, 1.2, 'S');
        centrarTexto(prev80MainTagText, currentY, prev80MainTagFontSize, 'normal', [0, 0, 0], offsetPriceX, offsetPriceY - 1);
        currentY += 2.0;
    }

    // 1. Precio normal (BCV) arriba, grande
    currentY += priceH_mm;
    centrarTexto(mainText, currentY, priceFontSize, 'bold', [0, 0, 0], offsetPriceX, offsetPriceY);

    // 2. Badge PROMO $ EFECTIVO
    if (promoTagText && showSecondary) {
        currentY += 3.0;
        currentY += promoTagHeight;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(promoTagFontSize);
        const tw = doc.getTextWidth(promoTagText);
        const badgeW = tw + 5;
        const badgeH = promoTagHeight + 1.4;
        const badgeX = (centerX - badgeW / 2) + offsetSecPriceX;
        const badgeY = currentY - promoTagHeight + offsetSecPriceY - 1.4;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.35);
        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.2, 1.2, 'S');
        centrarTexto(promoTagText, currentY, promoTagFontSize, 'italic', [0, 0, 0], offsetSecPriceX, offsetSecPriceY - 1);
        currentY += 2.5;
    }

    // 3. Precio efectivo (cash), grande
    if (showSecondary) {
        currentY += secPriceH_mm;
        centrarTexto(secondaryText, currentY, secFontSize, 'bold', [0, 0, 0], offsetSecPriceX, offsetSecPriceY);
    }

    return doc.output('bloburl');
};


