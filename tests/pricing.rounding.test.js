import { describe, it, expect } from 'vitest';
import { round0, round2, mulR, ceilR } from '../src/utils/dinero';
import { buildProductPayload } from '../src/utils/productProcessor';
import { computeLabelPriceTexts } from '../src/utils/labelGenerator';

describe('Financial Guardrails: Integer Rounding Policy', () => {
    describe('round0 (Standard Half-Away-From-Zero Integer Rounding)', () => {
        it('rounds fractions < 0.5 DOWN to integer', () => {
            expect(round0(111.49)).toBe(111);
            expect(round0(100.20)).toBe(100);
            expect(round0(25.40)).toBe(25);
            expect(round0(0.49)).toBe(0);
        });

        it('rounds fractions >= 0.5 UP to integer', () => {
            expect(round0(111.50)).toBe(112);
            expect(round0(111.75)).toBe(112);
            expect(round0(24.50)).toBe(25);
            expect(round0(0.50)).toBe(1);
        });

        it('prevents IEEE-754 floating point drift on rounding', () => {
            // Test 80 * 1.397 = 111.76 -> 112
            expect(round0(80 * 1.397)).toBe(112);
            // Test 80 * 1.25 = 100.00 -> 100
            expect(round0(80 * 1.25)).toBe(100);
        });
    });

    describe('Bolívares Integer Rounding (ceilR & mulR)', () => {
        it('calculates exact integer Bolívares from integer BCV USD and rate', () => {
            const bcvRate = 755.9001;
            const bcvUsd = 112; // $112 BCV
            const priceBs = ceilR(mulR(bcvUsd, bcvRate));
            
            // 112 * 755.9001 = 84660.8112 -> ceilR = 84661
            expect(Number.isInteger(priceBs)).toBe(true);
            expect(priceBs).toBe(84661);
        });
    });

    describe('productProcessor Payload Integer Rounding', () => {
        it('rounds finalPrice2Usd to integer when building product payload', () => {
            const formData = {
                name: 'Mini UPS Roccia',
                priceUsd: '80',
                price2Usd: '111.75', // User entered 111.75
            };
            const payload = buildProductPayload(formData, 755.9001, 25);
            expect(payload.price2Usd).toBe(112); // Must be rounded to 112
        });

        it('auto-computes store margin +25% as integer price2Usd', () => {
            const formData = {
                name: 'Mini UPS Roccia',
                priceUsd: '80', // $80 base
            };
            const payload = buildProductPayload(formData, 755.9001, 25);
            // $80 * 1.25 = $100
            expect(payload.price2Usd).toBe(100);
        });
    });

    describe('computeLabelPriceTexts (Label Generation)', () => {
        it('formats label prices without decimals for BCV USD and Bolívares', () => {
            const product = {
                name: 'Mini UPS Roccia',
                priceUsd: 80,
                price2Usd: 111.75, // Will round to 112
            };
            const result = computeLabelPriceTexts(product, 755.9001, false, 0, 25, 'mixto');
            
            expect(result.mainText).toBe('$112');
            expect(result.secondaryText).toBe('$80');
            expect(result.tertiaryText).toBe('');
        });
    });
});
