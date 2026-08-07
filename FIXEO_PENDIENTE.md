# Plan de Fixeo — El Spot POS
> Generado: 2026-08-06 | Auditoría post-modificaciones  
> Ejecutar en orden. Cada paso es un `Edit` exacto (old_string → new_string).  
> Severidades: 🔴 Crítico · 🟡 Medio · 🟢 Bajo/Display

---

## Estado general

| Área | Estado |
|------|--------|
| SYNC-014 flag anti-eco | ✅ Corregido |
| markApplied-before-await | ✅ Corregido |
| appliedCommandsStore IDB + TTL | ✅ Nuevo |
| useMonitorSync singleton → useRef | ✅ Corregido |
| Monkeypatch localStorage eliminado | ✅ Corregido |
| catchUpPending batch + coalesce | ✅ Corregido |
| dinero.js NaN notación científica | ❌ **Pendiente** |
| OwnerMonitorView prod.price field | ❌ **Pendiente** |
| CheckoutModalPOS float ops | ❌ **Pendiente** |
| CurrencyService float ops | ❌ **Pendiente** |
| OwnerMonitorView acumulación float | ❌ **Pendiente** |
| USDT en SupervisorRateModal | ⚠️ Decisión requerida |
| RLS sync_documents allow_all | ⚠️ Fix en Supabase Dashboard |

---

## PASO 1 — `src/utils/dinero.js` 🔴 CRÍTICO

**Bug:** `${5e-7}e2` produce el string `"5e-7e2"` → `NaN`.  
El guard `abs < 1e-12` no protege valores como `5e-7` o `2e-8`.

**old_string** (líneas 33-36):
```
    // Si es extremadamente pequeño, redondea a 0 de forma segura
    if (abs < 1e-12) return 0;
    const shifted = Number(`${abs}e${decimals}`);
    return sign * Number(`${Math.round(shifted)}e-${decimals}`);
```

**new_string:**
```
    // Si es extremadamente pequeño, redondea a 0 de forma segura
    if (abs < 1e-12) return 0;
    // BUG-FIX: `${abs}e${decimals}` produce "5e-7e2" → NaN cuando abs está en
    // notación científica. toExponential() siempre genera "XeY" parseable.
    const [mantissa, exp] = abs.toExponential().split('e');
    const shifted = Number(`${mantissa}e${parseInt(exp) + decimals}`);
    return sign * Number(`${Math.round(shifted)}e-${decimals}`);
```

---

## PASO 2 — `src/views/OwnerMonitorView.jsx` 🟡 DISPLAY

**Bug:** `prod.price` no existe en el schema; el campo correcto es `prod.priceUsd`. Con optional chaining no crashea pero muestra en blanco.

**old_string** (línea 1122):
```
                                                                <span className="font-outfit text-[10px] text-slate-400">Precio: ${prod.price?.toFixed(2)}</span>
```

**new_string:**
```
                                                                <span className="font-outfit text-[10px] text-slate-400">Precio: ${prod.priceUsd?.toFixed(2)}</span>
```

---

## PASO 3 — `src/views/OwnerMonitorView.jsx`: agregar import

> **Prerequisito de los pasos 4 y 5.** Ejecutar antes de ellos.

**old_string** (línea 1):
```
import React, { useState, useEffect, useMemo } from 'react';
```

**new_string:**
```
import React, { useState, useEffect, useMemo } from 'react';
import { sumR, mulR, subR } from '../utils/dinero';
```

---

## PASO 4 — `src/views/OwnerMonitorView.jsx`: acumulación en `inventoryMetrics` 🟢 BAJO

**old_string** (líneas 335-336):
```
            totalCost += cost * stock;
            totalRetail += retail * stock;
```

**new_string:**
```
            totalCost = sumR([totalCost, mulR(cost, stock)]);
            totalRetail = sumR([totalRetail, mulR(retail, stock)]);
```

---

**old_string** (línea 346):
```
        const expectedProfit = Math.max(0, totalRetail - totalCost);
```

**new_string:**
```
        const expectedProfit = Math.max(0, subR(totalRetail, totalCost));
```

---

## PASO 5 — `src/views/OwnerMonitorView.jsx`: acumulación en `activeShiftMetrics` 🟢 BAJO

**old_string** (líneas 428-433):
```
        let usd = 0;
        let bs = 0;
        activeShiftSales.forEach(s => {
            usd += s.totalUsd || 0;
            bs += s.totalBs || 0;
        });
```

**new_string:**
```
        const usd = sumR(activeShiftSales.map(s => s.totalUsd || 0));
        const bs = sumR(activeShiftSales.map(s => s.totalBs || 0));
```

---

**old_string** (líneas 442-444):
```
                if (costVal > 0) {
                    costSum += costVal * item.qty;
                }
```

**new_string:**
```
                if (costVal > 0) {
                    costSum = sumR([costSum, mulR(costVal, item.qty)]);
                }
```

---

**old_string** (línea 448):
```
        const profitUsd = Math.max(0, usd - costSum);
```

**new_string:**
```
        const profitUsd = Math.max(0, subR(usd, costSum));
```

---

## PASO 6 — `src/components/Sales/CheckoutModalPOS/index.jsx` 🟡 MEDIO

> `divR` y `mulR` **ya están importados** en línea 4. No agregar import.

**old_string** (líneas 288-293):
```
                        amountUsd: currency === 'USD' ? amount
                            : currency === 'COP' ? (tasaCop > 0 ? amount / tasaCop : 0)
                            : (cartRate > 0 ? round2(amount / cartRate) : 0),
                        amountBs: currency === 'BS' ? amount
                            : currency === 'COP' ? (tasaCop > 0 && cartRate > 0 ? round2((amount / tasaCop) * cartRate) : 0)
                            : (cartRate > 0 ? round2(amount * cartRate) : 0),
```

**new_string:**
```
                        amountUsd: currency === 'USD' ? amount
                            : currency === 'COP' ? (tasaCop > 0 ? divR(amount, tasaCop) : 0)
                            : (cartRate > 0 ? divR(amount, cartRate) : 0),
                        amountBs: currency === 'BS' ? amount
                            : currency === 'COP' ? (tasaCop > 0 && cartRate > 0 ? mulR(divR(amount, tasaCop), cartRate) : 0)
                            : (cartRate > 0 ? mulR(amount, cartRate) : 0),
```

---

**old_string** (línea 308):
```
                    amountBs: casheaAmountUsd * tasaSegura,
```

**new_string:**
```
                    amountBs: mulR(casheaAmountUsd, tasaSegura),
```

---

## PASO 7 — `src/services/CurrencyService.js` 🟡 MEDIO

**7a — Agregar import al inicio del archivo:**

**old_string:**
```
/**
 * Service responsible for monetary calculations and formatting rules.
 * Follows SRP: Only handles number crunching and string formatting related to currency.
 */
```

**new_string:**
```
import { round2, ceilR, divR, mulR } from '../utils/dinero';

/**
 * Service responsible for monetary calculations and formatting rules.
 * Follows SRP: Only handles number crunching and string formatting related to currency.
 */
```

---

**7b — Fix `applyRoundingRule`:**

**old_string** (líneas 83-87):
```
    applyRoundingRule: (value, currencyId) => {
        if (currencyId === 'VES') return Math.ceil(value).toString();
        // Ensure we handle cases where toFixed might be needed even for small numbers
        return value.toFixed(2);
    },
```

**new_string:**
```
    applyRoundingRule: (value, currencyId) => {
        if (currencyId === 'VES') return ceilR(value).toString();
        return round2(value).toFixed(2);
    },
```

---

**7c — Fix `calculateExchange`:**

**old_string** (líneas 96-99):
```
    calculateExchange: (amount, rateFrom, rateTo) => {
        if (!rateTo || rateTo === 0 || !rateFrom) return 0;
        return (amount * rateFrom) / rateTo;
    }
```

**new_string:**
```
    calculateExchange: (amount, rateFrom, rateTo) => {
        if (!rateTo || rateTo === 0 || !rateFrom) return 0;
        return divR(mulR(amount, rateFrom), rateTo);
    }
```

---

## Verificación post-fix (Paso 1)

Pegar en la consola del navegador (DevTools) después de hot-reload:

```js
// Requiere que el build exponga dinero.js en window o importarlo vía módulo
const { round2 } = await import('/src/utils/dinero.js');
console.assert(round2(5e-7)      === 0,        'FAIL 5e-7');
console.assert(round2(2e-8)      === 0,        'FAIL 2e-8');
console.assert(round2(1e-11)     === 0,        'FAIL 1e-11');
console.assert(round2(0.005)     === 0.01,     'FAIL 0.005');
console.assert(round2(2.005)     === 2.01,     'FAIL 2.005');
console.assert(round2(99999.005) === 99999.01, 'FAIL 99999.005');
console.log('✅ dinero.js _shiftRound OK');
```

---

## Acciones fuera del codebase JS (requieren decisión manual)

### A — USDT en `src/components/SupervisorRateModal.jsx` (líneas 162-179)

Si `rateMode: 'usdt'` **no está soportado** en la caja principal (RateService lo removió), eliminar el bloque del botón USDT:

```jsx
{/* ELIMINAR si USDT no está soportado en la caja: */}
{/* Opción USDT */}
<button
    ...
    onClick={() => { triggerHaptic?.(); setRateMode('usdt'); }}
    ...
>
    <span className="text-xs font-bold">Binance / Paralelo</span>
    ...
</button>
```

También eliminar `const usdtPrice = rates?.usdt?.price || 0;` (línea 23) y quitar `'usdt'` del `useState` inicial si no va a ser opción válida.

Si USDT **sí está soportado** end-to-end, ignorar este punto.

---

### B — RLS Supabase `sync_documents` (requiere Supabase Dashboard)

> ⚠️ **CORRECCIÓN:** El FIXEO anterior estaba invertido. El problema es que
> `supabase_rls_hardening.sql` ejecutó `REVOKE` sobre el rol `anon`, eliminando
> el acceso a nivel de tabla antes de llegar a RLS. La política `allow_all` debe
> **existir y mantenerse**; `device_isolation` es irrelevante para esta app porque
> usa device_ids propios, no `auth.uid()` de Supabase Auth.

Ejecutar en el SQL Editor de Supabase:

```sql
-- 1. Re-otorgar privilegios de tabla al rol anon
--    (revocados por supabase_rls_hardening.sql líneas REVOKE)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_documents TO anon;

-- 2. Garantizar que la política abierta exista
DROP POLICY IF EXISTS "sync_documents_allow_all" ON public.sync_documents;
CREATE POLICY "sync_documents_allow_all" ON public.sync_documents
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 3. Verificar resultado
SELECT policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'sync_documents'
ORDER BY policyname;
```

Confirmar que el SELECT muestre `sync_documents_allow_all` con `roles = {anon,authenticated}`.
