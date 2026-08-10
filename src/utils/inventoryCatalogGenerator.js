/**
 * inventoryCatalogGenerator.js
 * Genera y descarga un PDF tipo catalogo A4 con todos los productos del inventario:
 * miniatura, codigo/barcode, nombre, precio USD y precio BCV.
 */

import { ceilR, mulR, round0 } from './dinero';
import { getUsd } from './calculatorUtils';

const PAGE_W   = 210;
const PAGE_H   = 297;
const MARGIN   = 12;
const COL      = 3;
const THUMB_W  = 38;
const THUMB_H  = 28;
const CELL_W   = (PAGE_W - MARGIN * 2) / COL;
const CELL_H   = THUMB_H + 24;
const HEADER_H = 22;

async function loadImgData(src) {
    if (!src) return null;
    try {
        if (src.startsWith('data:')) {
            return { data: src, format: 'JPEG' };
        }
        const resp = await fetch(src, { mode: 'cors', cache: 'force-cache' });
        if (!resp.ok) return null;
        const blob = await resp.blob();
        const fmt  = blob.type.includes('png') ? 'PNG' : 'JPEG';
        const b64  = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload  = () => res(reader.result);
            reader.onerror = () => rej();
            reader.readAsDataURL(blob);
        });
        return { data: b64, format: fmt };
    } catch {
        return null;
    }
}

function drawPlaceholder(doc, p, x, y, w, h) {
    doc.setFillColor(245, 245, 247);
    doc.roundedRect(x, y, w, h, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(200, 200, 200);
    const initials = (p.name || '?')
        .split(' ')
        .slice(0, 2)
        .map(w => w[0]?.toUpperCase() ?? '')
        .join('');
    doc.text(initials, x + w / 2, y + h / 2 + 2, { align: 'center' });
}

export async function generarCatalogoPDF({ products, bcvRate, categories = [] }) {
    const { jsPDF } = await import('jspdf');
    if (!products || products.length === 0) return;

    // Precargar logo de la tienda
    let imgLogo = null;
    for (const src of ['./logo.png', '/logo.png', 'logo.png', 'public/logo.png']) {
        try {
            const img = new Image();
            img.src = src;
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
            imgLogo = img;
            break;
        } catch (_) {}
    }

    const imgCache = await Promise.all(products.map(p => loadImgData(p.image)));

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

    let currentPage = 1;

    const drawHeader = () => {
        // Fondo blanco limpio (optimizaciones de tinta para B/N)
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, PAGE_W, HEADER_H, 'F');

        // Logo de la tienda a la izquierda
        if (imgLogo) {
            try {
                const rawW = imgLogo.naturalWidth || imgLogo.width || 120;
                const rawH = imgLogo.naturalHeight || imgLogo.height || 60;
                const aspectRatio = rawW / rawH;
                const maxW = 35;
                const maxH = 14;
                let logoW = maxW;
                let logoH = logoW / aspectRatio;
                if (logoH > maxH) {
                    logoH = maxH;
                    logoW = logoH * aspectRatio;
                }
                doc.addImage(imgLogo, 'PNG', MARGIN, 4, logoW, logoH);
            } catch (_) {}
        }

        // Título central "CATÁLOGO DE INVENTARIO" en el medio
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(20, 20, 20);
        doc.text('CATÁLOGO DE INVENTARIO', PAGE_W / 2, 13, { align: 'center' });

        // Fecha, hora y total de artículos a la derecha
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 100, 100);
        doc.text(dateStr + '  ' + timeStr + '  ·  ' + products.length + ' artículos', PAGE_W - MARGIN, 13, { align: 'right' });

        // Línea divisoria sutil para separación estética
        doc.setDrawColor(210, 210, 210);
        doc.setLineWidth(0.3);
        doc.line(MARGIN, HEADER_H - 2, PAGE_W - MARGIN, HEADER_H - 2);
    };

    const drawFooter = (pgNum) => {
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.3);
        doc.line(MARGIN, PAGE_H - 10, PAGE_W - MARGIN, PAGE_H - 10);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(170, 170, 170);
        doc.text('El Spot Concept Store - Catálogo de Inventario - Sin valor fiscal', MARGIN, PAGE_H - 5.5);
        doc.text('Pág. ' + pgNum, PAGE_W - MARGIN, PAGE_H - 5.5, { align: 'right' });
    };

    drawHeader();

    let cursorX = MARGIN;
    let cursorY = HEADER_H + 5;
    let colIdx  = 0;

    const startNewPage = () => {
        drawFooter(currentPage);
        doc.addPage();
        currentPage++;
        drawHeader();
        cursorX = MARGIN;
        cursorY = HEADER_H + 5;
        colIdx  = 0;
    };

    for (let i = 0; i < products.length; i++) {
        const p       = products[i];
        const imgData = imgCache[i];

        const cashUsd = getUsd(p, 0);
        const bcvUsd  = (p.price2Usd && parseFloat(p.price2Usd) > 0) ? round0(parseFloat(p.price2Usd)) : 0;
        const hasTwoPrices = bcvUsd > 0 && Math.abs(bcvUsd - cashUsd) > 0.01;

        const catInfo  = categories.find(c => c.id === p.category);
        const catLabel = catInfo?.name ?? '';

        if (cursorY + CELL_H > PAGE_H - 14) startNewPage();

        const cx = cursorX;
        const cy = cursorY;

        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.25);
        doc.roundedRect(cx, cy, CELL_W - 1.5, CELL_H - 1.5, 2, 2, 'S');

        const imgX = cx + (CELL_W - 1.5 - THUMB_W) / 2;
        const imgY = cy + 2;

        if (imgData) {
            try {
                doc.addImage(imgData.data, imgData.format, imgX, imgY, THUMB_W, THUMB_H, undefined, 'FAST');
            } catch {
                drawPlaceholder(doc, p, imgX, imgY, THUMB_W, THUMB_H);
            }
        } else {
            drawPlaceholder(doc, p, imgX, imgY, THUMB_W, THUMB_H);
        }

        doc.setDrawColor(235, 235, 235);
        doc.line(cx + 2, cy + THUMB_H + 3, cx + CELL_W - 3.5, cy + THUMB_H + 3);

        const textStartY = cy + THUMB_H + 7;

        if (p.barcode) {
            doc.setFont('courier', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(110, 110, 110);
            const code = p.barcode.length > 18 ? p.barcode.slice(0, 18) + '...' : p.barcode;
            doc.text(code, cx + (CELL_W - 1.5) / 2, textStartY, { align: 'center' });
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(20, 20, 20);
        const nameLines = doc.splitTextToSize(p.name.toUpperCase(), CELL_W - 5);
        const nameTrunc = nameLines.slice(0, 2);
        const nameY = p.barcode ? textStartY + 4 : textStartY;
        doc.text(nameTrunc, cx + (CELL_W - 1.5) / 2, nameY, { align: 'center' });

        if (catLabel) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6);
            doc.setTextColor(140, 140, 140);
            doc.text(catLabel.toUpperCase(), cx + (CELL_W - 1.5) / 2, nameY + nameTrunc.length * 3.5 + 0.5, { align: 'center' });
        }

        const priceY = cy + CELL_H - 9;
        
        // Precio Principal (Efectivo / Cash $)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(5, 150, 70);
        doc.text(cashUsd > 0 ? '$' + cashUsd.toFixed(2) : '-', cx + (CELL_W - 1.5) / 2, priceY, { align: 'center' });

        // Segundo Precio en $ (Precio BCV USD)
        if (hasTwoPrices) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 100);
            doc.text('$' + bcvUsd + ' BCV', cx + (CELL_W - 1.5) / 2, priceY + 4.5, { align: 'center' });
        }

        colIdx++;
        if (colIdx >= COL) {
            colIdx  = 0;
            cursorX = MARGIN;
            cursorY += CELL_H;
        } else {
            cursorX += CELL_W;
        }
    }

    drawFooter(currentPage);
    const fileName = 'catalogo_inventario_' + now.toISOString().slice(0, 10) + '.pdf';
    doc.save(fileName);
}
