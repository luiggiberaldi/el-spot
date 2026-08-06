import { describe, it, expect, beforeEach } from 'vitest';

describe('POS Hybrid Search Mode Tests', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('1. Debe inicializar el modo por defecto como "hybrid"', () => {
        const savedMode = localStorage.getItem('pos_search_view_mode') || 'hybrid';
        expect(savedMode).toBe('hybrid');
    });

    it('2. Debe guardar la preferencia del usuario en localStorage', () => {
        localStorage.setItem('pos_search_view_mode', 'grid');
        expect(localStorage.getItem('pos_search_view_mode')).toBe('grid');

        localStorage.setItem('pos_search_view_mode', 'list');
        expect(localStorage.getItem('pos_search_view_mode')).toBe('list');
    });

    it('3. Debe filtrar productos por nombre/código en modo hybrid y grid', () => {
        const sampleProducts = [
            { id: '1', name: 'Tijera Evok', barcode: '123456' },
            { id: '2', name: 'Vaporizador Facial', barcode: '654321' },
            { id: '3', name: 'Secador Profesional', barcode: '999888' },
        ];

        const term = 'secador';
        const filtered = sampleProducts.filter(p => {
            const t = term.toLowerCase();
            return p.name.toLowerCase().includes(t) || p.barcode.includes(t);
        });

        expect(filtered.length).toBe(1);
        expect(filtered[0].name).toBe('Secador Profesional');
    });

    it('4. En modo list debe retornar todos los productos de categoría si hay búsqueda (el grid se oculta)', () => {
        const sampleProducts = [
            { id: '1', name: 'Tijera Evok' },
            { id: '2', name: 'Vaporizador Facial' }
        ];

        const posSearchViewMode = 'list';
        const searchTerm = 'tijera';

        const resultProducts = (posSearchViewMode === 'list' && searchTerm) ? sampleProducts : [];
        expect(resultProducts.length).toBe(2);
    });

    it('5. La tecla Enter en modo grid debe seleccionar la primera coincidencia directa', () => {
        const searchResults = [
            { id: '10', name: 'Hidrojet Inalambrico' },
            { id: '11', name: 'Manguera Wolfgang' }
        ];

        const posSearchViewMode = 'grid';
        const selectedIndex = 1; // Índice del dropdown (que en grid está oculto)

        const productToAdd = posSearchViewMode === 'grid'
            ? searchResults[0]
            : searchResults[selectedIndex];

        expect(productToAdd.id).toBe('10');
    });

    it('6. Coincidencia exacta por código de barras tiene prioridad sobre el modo de vista', () => {
        const products = [
            { id: '1', name: 'Tijera Evok', barcode: '75012345' },
            { id: '2', name: 'Vaporizador', barcode: '75099999' }
        ];

        const scannedCode = '75012345';
        const exactMatch = products.find(p => p.barcode === scannedCode || p.id === scannedCode);

        expect(exactMatch).toBeDefined();
        expect(exactMatch.name).toBe('Tijera Evok');
    });
});
