# Auditoría E2E Modo Supervisor — El Spot POS

> **Fecha:** 2026-08-05
> **Alcance:** Modo Supervisor (`OwnerMonitorView` + componentes `Supervisor*` + hooks `useMonitorSync` / `useSupervisorCommands` / `useCloudSync` + `remoteInventoryProcessor` + schema `supervisor_commands`).
> **Ejes:** Sincronización, UI, UX.
> **Método:** Lectura exhaustiva del código + subagentes `explore` (UI/UX y sincronización) en paralelo. Solo lectura — no se modificó el repositorio.

---

## Tabla resumen

| Eje     | 🔴 CRÍT | 🟠 ALTO | 🟡 MED | 🟢 BAJ | Total |
|---------|--------:|--------:|-------:|-------:|------:|
| SYNC-*  | 1       | 7       | 8      | 1      | 17    |
| UX-*    | 5       | 11      | 18     | 8      | 41 únicos (76 incidencias) |
| **Total** | **6**   | **18**  | **26** | **9**  | **58 issues únicos** |

---

## Arquitectura (resumen)

```
┌──── Monitor (Supervisor) ────┐               ┌──── Caja (POS) ────┐
│ OwnerMonitorView              │               | App.jsx             |
│  ├ useMonitorSync(pairedId)   │ sync_documents │  useCloudSync(devId)│
│  │   - Pull Supabase          │  ◀──────────────│  pushCloudSync       │
│  │   - Realtime channel        │               |  supervisor_commands │
│  └ OwnerMonitorView           │               |  ◀──── INSERT pending |
│      (pendingChanges → upload)│────── insert ──▶│                      │
│                               │               |  useSupervisorCommands│
│                               │  ack   ◀─── update status applied ────│
│                               │ app_storage_update (event global)       │
└───────────────────────────────┘               └──────────────────────┘
                       supervisor_commands         (DB Supabase Realtime)
```

**Flujo comando de inventario:**
1. Monitor edita → `pendingChanges[]` (localStorage)
2. Monitor "Subir a Caja" → `INSERT INTO supervisor_commands (status='pending')`
3. Caja Realtime `postgres_changes INSERT` → `processCommand`
4. `applyInventoryCommand` → `withLock('pos_write_lock', …)` → `storageService.setItem`
5. `updateCommandStatus(id, 'applied')`
6. Caja dispara `app_storage_update` + `supervisor_inventory_applied`
7. `pushCloudSync` sube `bodega_products_v1` a `sync_documents` (debounced 3s)
8. Monitor `useMonitorSync` Realtime → aplica `sync_documents` → `app_storage_update`

---

# 🔴 ISSUES CRÍTICOS

## SYNC-001 — Doble procesamiento Realtime ↔ catchUpPending (race condition)
- **Ubicación:** `src/hooks/useSupervisorCommands.js:78-113, 132-142`
- **Síntoma:** El canal Realtime dispara un INSERT y casi simultáneamente `catchUpPending()` (corre al recibir `SUBSCRIBED`) hace `SELECT WHERE status='pending'` que incluye el mismo row. Ambas invocaciones pasan el guard `if (appliedIds.has(command.id)) return;` **antes** de que cualquiera haga `appliedIds.add(id)` (el `.add` es síncrono pero ocurre después de `await applyInventoryCommand`). Las dos promesas se ejecutan en paralelo.
- **Impacto:** Para `adjust_stock` el delta se aplica **dos veces** → stock +10 cuando el supervisor esperaba +5. `withLock('pos_write_lock')` serializa pero no dedupe. Para `rate_change` es idempotente por accidente. Para `add` el segundo intento falla amablemente (`'Ya existe'`) pero el `status` queda `'failed'` aunque el primero lo dejó `'applied'`.
- **Raíz:** El guard de idempotencia se evalúa **antes** del `.add`, y `.add` ocurre después del await.

## UX-001 — Header `bg-black` permanente rompe modo claro
- **Ubicación:** `src/views/OwnerMonitorView.jsx:645`
- **Síntoma:** El header `bg-black backdrop-blur-md border-b border-zinc-800` **no tiene variante `dark:`**. El resto de la app sí respeta el theme (`bg-slate-50 dark:bg-slate-950`). En modo claro aparece un bloque negro flotante en la parte superior, rompiendo el design system.
- **Impacto:** Ruptura visual abrupta en modo claro. El supervisor ve dos aplicaciones distintas (header dark + main light).

## UX-009 — `text-slate-850`, `text-slate-650`, `text-slate-450`, `text-slate-350`, `text-slate-150`, `text-slate-250`, `bg-slate-850`, `border-slate-150`, `text-blue-650`, `border-amber-955` (tonos inexistentes en `tailwind.config.js`)
- **Ubicaciones (22 incidencias):** `OwnerMonitorView.jsx:743, 744, 754, 755, 765, 766, 961, 969, 1086, 1136, 1140, 1144, 1148, 1175, 1243, 1275, 1280, 1308, 1347, 1360, 1381, 1387, 1425, 1155, 1549-1552, 1586, 1606`
- **Raíz:** `tailwind.config.js` rebindea `slate` a tonos {50,100,200,300,400,500,600,700,800,900,950} y `amber` a {50,100,400,500,600,900}. Los tonos 150/250/350/450/550/650/850/955 no existen. Tailwind los ignora silenciosamente → el elemento hereda el color del padre.
- **Impacto:** KPIs críticos ("Total Acumulado" UX-009), hover de pestañas inactivas (no funcionan UX-010), labels a 8px sin contraste planificado, "Diferencia" del arqueo sin fondo ámbar. El design system está roto a nivel de cascade.

## UX-023 — Tabla de arqueo se desborda sin indicador visible (móvil <360px)
- **Ubicación:** `src/views/OwnerMonitorView.jsx:1173-1230`
- **Síntoma:** `min-w-[320px]` interior + `overflow-x-auto custom-scrollbar`. En iPhone SE/360 el scroll horizontal es invisible (scrollbar thin). No hay chevrons ni sombra de overflow.
- **Impacto:** El supervisor en móvil no descubre la columna "Diferencia" (la métrica más crítica del cuadre). Reportes de cierre leídos incompletos.

## UX-031 — Ausencia de `aria-label` en botones sólo-icono críticos
- **Ubicaciones:** refresh/logout header (702-721), clear búsqueda (1358-1364), editar/borrar inventario (1480-1497), stock +/- (1539-1566), flechas paginación (1585, 1604), descartar borrador (1687), X en `SupervisorRateModal` (90-94), notificaciones supervisor (41/52 Supervisor*Notification)
- **Síntoma:** Ninguno declara `aria-label`. Las notificaciones usan `<div onPointerDown>` sin `role="button"` ni `tabIndex`.
- **Impacto:** VoiceOver/TalkBack no anuncia el propósito de los botones. Acciones destructivas (borrar producto, desvincular) inaccesibles para usuarios de lector de pantalla.

## UX-068 — Modales z-350 < Notificaciones z-400 → notificación tapa modal de confirmación
- **Ubicación:** `OwnerMonitorView.jsx:1710` (confirm z-350), `SupervisorRateNotification.jsx:50` (z-400), `SupervisorInventoryNotification.jsx:39` (z-400)
- **Síntoma:** Al abrir "¿Descartar cambios en borrador?" (z-350) al mismo tiempo que un comando remoto es aplicado en la caja, la notificación z-400 flota por encima. Sin coordinación.
- **Impacto:** El supervisor intenta confirmar una acción mientras la notificación tapa el botón "Sí, Descartar Todo". Acciones erróneas.

---

# 🟠 ISSUES ALTOS

## SYNC-002 — Status `pending` reprocesado indefinidamente cuando `updateCommandStatus` falla
- **Ubicación:** `src/hooks/useSupervisorCommands.js:25-37, 87, 106`
- **Síntoma:** `updateCommandStatus` usa `try { ... } catch (e) { console.error(...) }` que traga el error. Si `UPDATE … SET status='applied'` falla (red caída, timeout), el comando queda `pending` en DB. La próxima `catchUpPending()` lo reprocesará silenciosamente.
- **Impacto:** Inventario aplicado dos, tres o más veces en reconexiones sucesivas. Stock acumulado incorrectamente sin diagnóstico. El supervisor cree que la caja no aplicó y reenvía.

## SYNC-003 — `appliedIds` con tope 200 → colisión rotativa pierde idempotencia
- **Ubicación:** `src/hooks/useSupervisorCommands.js:5-6, 16-23`
- **Síntoma:** Cola FIFO de 200 UUIDs en `localStorage[pda_applied_supervisor_cmds_v1]`. Con >200 comandos aplicados, los más viejos se descartan. Si un comando viejo tiene `status='pending'` en DB (por SYNC-002), `appliedIds.has(oldId)` retorna `false` → reproceso.
- **Impacto:** Operadores de alto volumen (>200 ajustes/día) pierden idempotencia. Aparece como "stock extraño" días después.

## SYNC-004 — `monitorSubscription` global → leak en StrictMode / HMR
- **Ubicación:** `src/hooks/useMonitorSync.js:9, 68-128`
- **Síntoma:** `let monitorSubscription = null` vive en scope de módulo. El guard `if (!monitorSubscription)` evita doble suscripción, pero en StrictMode (mount→unmount→mount) el cleanup nullifica la global mientras la callback asíncrona de la suscripción previa aún puede disparar `setIsConnected(true)` sobre un componente desmontado.
- **Impacto:** Warnings "Can't perform a React state update on an unmounted component". En HMR, suscripciones huérfanas live que aplican datos dos veces a IndexedDB.

## SYNC-005 — `applyInventoryCommand → edit` pierde barcode del producto original
- **Ubicación:** `src/utils/remoteInventoryProcessor.js:37-46, 94-110`
- **Síntoma:** `normalizeProduct` fuerza `barcode = (data.barcode ?? '').toString().trim() || null`. Si el supervisor edita nombre/precio sin enviar `barcode`, el spread `{ ...existing, ...normalized }` sobreescribe el barcode original a `null`. Solo `image` está preservado explícitamente (línea 99).
- **Impacto:** El supervisor edita el nombre, y al subir el comando la caja pierde el código de barras. Ya no se puede escanear. Sin feedback al supervisor.

## SYNC-006 — `applyRateChange` no propaga a `sync_documents` si el dynamic import falla
- **Ubicación:** `src/hooks/useSupervisorCommands.js:42-62`
- **Síntoma:** `try { const syncModule = await import('./useCloudSync'); pushLocalSync = syncModule.pushLocalSync; } catch (e) {}` — catch vacío. Si falla, se ejecuta `localStorage.setItem` directo (no `storageService.setItem`) → no dispara `queueCloudSync` → otros monitores no reciben el cambio de tasa en tiempo real.
- **Impacto:** Cambio de tasa aplicado en la CAJA sin reflejo en monitores secundarios hasta `triggerRefresh` manual. Error silencioso.

## SYNC-007 — `upload pending changes` inserta sin `id` → duplicados en reintento
- **Ubicación:** `src/views/OwnerMonitorView.jsx:227-256`
- **Síntoma:** `rows = pendingChanges.map(c => ({ primary_device_id, monitor_device_id, command_type, payload, status: 'pending' }))` **no setea `id`**. El `c.id` del borrador se descarta. El schema autogenera UUID nuevo en cada INSERT. Si el request timeoutea tras haber insertado, reintento genera duplicados.
- **Impacto:** En reintentos (timeout cliente, response perdido): el mismo comando se inserta con UUIDs distintos. `applyInventoryCommand` con `adjust_stock` aplica delta dos veces → stock incorrecto.

## SYNC-008 — Sin `expectedStock` (optimistic locking) en `adjust_stock` → race vs checkout
- **Ubicación:** `src/utils/remoteInventoryProcessor.js:117-124`, `OwnerMonitorView.jsx:106-114, 171-199`
- **Síntoma:** El supervisor ve stock=10, hace `+5`, mientras tanto la caja vende 8 (stock real=2). El comando `adjust_stock delta=+5` se aplica sobre `current=2` → stock=7. El supervisor creía ajustar a 15. No hay `expectedStock` en el payload.
- **Impacto:** Descuadre invisible entre la "visión" del supervisor y la realidad de la caja.

## SYNC-009 — `catchUpPending` secuencial bloquea el thread
- **Ubicación:** `src/hooks/useSupervisorCommands.js:115-130`
- **Síntoma:** `for (const command of data) { await processCommand(command); }` procesa N comandos secuencialmente, cada uno toma `withLock + IDB read/write + API UPDATE`. 50 comandos = ~30s con `pos_write_lock` tomado → checkout bloqueado.
- **Impacto:** Tras desconexión prolongada, la CAJA parece congelada. Posibles ventas perdidas.

## UX-002 — Logotipo con fallback `onError` distinto en dark/light
- **Ubicación:** `OwnerMonitorView.jsx:647-657`
- **Síntoma:** `src="/logo-header-negro.png"` con fallback a `/logo.png`. En modo claro provoca bajo contraste o pérdida de marca.

## UX-024 — Touch targets < 44px en acciones críticas
- **Ubicaciones:** header refresh/logout (~31px), clear búsqueda (~24px), editar/borrar inventario (~26px), stock +/- (32px), flechas paginación (~32px), descartar borrador (~32px)
- **Impacto:** Taps erróneos (editar vs borrar están a 4px de gap). En móvil con dedos grandes, acciones involuntarias.

## UX-025 — Header móvil con 4 controles + status pill puede desbordar
- **Ubicación:** `OwnerMonitorView.jsx:668-722`
- **Síntoma:** En pantallas <400px el header contiene badge + pill + Cambiar Tasa + refresh + logout, todos con `shrink-0`. Sin `overflow` definido en el contenedor.

## UX-032 — Contraste insuficiente `text-slate-400` a 8px/9px sobre `bg-white`
- **Ubicaciones:** KPI cards (781, 796, 814, 829, 1303, 1314, 1324, 1333), sub-labels inventario (1507, 1512, 1517, 1527)
- **Síntoma:** `slate-400` sobre `white` da ratio ~3.0:1 (WCAG AA exige 4.5:1). Textos a 7-8px ilegibles para supervisores con presbicia (común en gerencia).

## UX-033 — Botón "Aplicar en Caja" en `SupervisorRateModal` sin estado disabled accesible
- **Ubicación:** `SupervisorRateModal.jsx:196-212`
- **Síntoma:** Falta `disabled:opacity-50 disabled:cursor-not-allowed` y `aria-busy="true"`. Double-tap probable.

## UX-034 — Focus states ausentes/invisibles con `focus:outline-none`
- **Ubicaciones:** input búsqueda inventario (1355), input manual `SupervisorRateModal` (179 — usa `outline-none` literal), botones header
- **Síntoma:** Sin `focus-visible:ring`, usuarios de teclado no ven dónde está el foco. WCAG 2.4.7.

## UX-035 — Modales sin tecla Escape
- **Ubicaciones:** `OwnerMonitorView.jsx:1617-1648` (disconnect), `1710` (confirm), `SupervisorRateModal.jsx:77`
- **Impacto:** Usuario de teclado atrapado en modal de desconexión (acción irreversible).

## UX-040 — Inconsistencia de spinners: `RefreshCw animate-spin` vs `Loader2 animate-spin` vs vacío
- **Ubicaciones:** header refresh, cargando transacciones, "Subir a Caja", `SupervisorRateModal` "Aplicando"
- **Síntoma:** Tres patrones distintos para estados de carga. La pestaña Inventario no muestra spinner mientras carga productos (aparece el empty state directamente).

## UX-046 — `SupervisorRateModal` SIEMPRE oscuro sin `dark:` variants
- **Ubicación:** `SupervisorRateModal.jsx:78-215`
- **Síntoma:** `bg-slate-900 ... text-white ... border-slate-800` en TODA condición. En modo light abre un modal completamente dark sobre la app clara — ruptura visual.

## UX-047 — `SupervisorRateNotification` y `SupervisorInventoryNotification` SIEMPRE oscuros
- **Ubicaciones:** `SupervisorRateNotification.jsx:53`, `SupervisorInventoryNotification.jsx:42`
- **Síntoma:** Mismo problema que UX-046.

## UX-052 — Colisión Toasts (z-9999) + Notificaciones (z-400) + Banner Offline
- **Ubicaciones:** `Toast.jsx:91`, `SupervisorRateNotification.jsx:50`, `SupervisorInventoryNotification.jsx:39`, `OwnerMonitorView.jsx:727`
- **Síntoma:** Tres sistemas superpuestos desde el top. Toast tapa la notificación enriquecida del supervisor.

## UX-053 — Notificaciones supervisor sin auto-close timeout
- **Ubicaciones:** `SupervisorRateNotification.jsx:11-28`, `SupervisorInventoryNotification.jsx:15-32`
- **Síntoma:** Solo cierran con tap. Sin `setTimeout(() => setVisible(false), 5000)` quedan flotando horas.

## UX-062 — Textos `text-[7px]` y `text-[8px]` ilegibles
- **Ubicaciones:** `OwnerMonitorView.jsx:1452, 1507, 1512, 1517, 1527, 1531, 1554`
- **Impacto:** Sublabels críticos ("Stock", "Costo", "Ganancia Real USDT") a 7-8px no cumplen WCAG 1.4.4 (Resize text 200%).

---

# 🟡 ISSUES MEDIOS (selección)

## SYNC-010 — `channel filter` no sanitiza `deviceId`
- **Ubicación:** `useSupervisorCommands.js:138`, `useMonitorSync.js:75`
- **Síntoma:** `filter: primary_device_id=eq.${deviceId}` interpolado directo. Si un atacante setea `pda_device_id` desde DevTools con caracteres PostgREST especiales, la suscripción falla silenciosamente.

## SYNC-011 — `upload pending changes` borra TODO en éxito, sin ACK individual
- **Ubicación:** `OwnerMonitorView.jsx:240-255`
- **Síntoma:** `persistPending([])` no distingue "INSERT ok" de "caja aplicó". El supervisor ve "Cambios enviados con éxito" cuando la caja puede tardar horas en aplicar.

## SYNC-012 — Sin versionado de `payload`
- **Ubicación:** `supabase_pairing_setup.sql:153-163`
- **Síntoma:** JSONB libre. Si monitor y caja tienen versiones mismatched, los comandos se aplican incorrectamente sin error visible.

## SYNC-013 — `edit` sobreescribe stock absoluto si el formulario envía `data.stock` explícito
- **Ubicación:** `remoteInventoryProcessor.js:94-110`
- **Síntoma:** `RemoteProductFormModal` muestra un input con el stock sincronizado (p.ej. 10). Si el supervisor edita solo el nombre, el comando `edit` envía `data.stock=10` pisando el stock real actual (p.ej. 2). Descuadre silencioso.

## SYNC-015 — Sin heartbeat de CAJA → comandos "fantasmas"
- **Ubicación:** schema `supabase_pairing_setup.sql`
- **Síntoma:** No existe `last_seen_at` en `device_pairings` ni tabla `device_heartbeats`. El supervisor no sabe si la CAJA está online.

## SYNC-016 — `applyRateChange` usa `localStorage.setItem` directo, no `storageService`
- **Ubicación:** `useSupervisorCommands.js:48-62`
- **Síntoma:** Bypass de `queueCloudSync`. Combinado con SYNC-006, el cambio no se propaga a otros monitores.

## SYNC-017 — `persistPending([])` all-or-nothing no maneja timeouts
- **Ubicación:** `OwnerMonitorView.jsx:242-255`
- **Síntoma:** En timeout cliente (response perdido) el monitor cree que falló, DB ya tiene los INSERTs, reintento → duplicados.

## UX-003 — Tipografía pestaña "Inventario" no responde al breakpoint sm
- **Ubicación:** `OwnerMonitorView.jsx:769`

## UX-004 — `min-h` diferente entre pestañas (Turno 105/125px vs Inventario 90/110px)
- **Ubicaciones:** `OwnerMonitorView.jsx:779, 794, 812, 827, 1302, 1313, 1323, 1333`

## UX-005 — `rounded-2xl` en Cierres vs `rounded-3xl` en Turno/Inventario
- **Ubicaciones:** `OwnerMonitorView.jsx:1136-1148` vs `779, 1302`

## UX-006 — Border opacities inconsistentes (`slate-200/60`, `/80`, `0.6/full`, `0.8/full`)
- **Ubicaciones:** `OwnerMonitorView.jsx:779, 1302, 1136`

## UX-012 — `text-slate-350` y `dark:hover:text-slate-350` inexistentes
- **Ubicaciones:** `OwnerMonitorView.jsx:993, 1360, 1387, 1632`

## UX-013 — `bg-slate-850`, `dark:border-slate-850` inexistentes
- **Ubicaciones:** `OwnerMonitorView.jsx:1175, 1381, 1552`

## UX-026 — Pestañas en móvil asimétricas sin `whitespace-nowrap`
- **Ubicación:** `OwnerMonitorView.jsx:738-771`

## UX-027 — Filtro de stock en móvil con conteos grandes desborda
- **Ubicación:** `OwnerMonitorView.jsx:1381-1412`

## UX-028 — Sub-grid `grid-cols-2 sm:grid-cols-4` en móvil estrecho satura
- **Ubicación:** `OwnerMonitorView.jsx:1499-1568`

## UX-029 — Header no respeta `safe-area-inset-top` en iPhone con notch
- **Ubicación:** `OwnerMonitorView.jsx:645`

## UX-036 — Falta `role="dialog"` y `aria-modal` en todos los modales
- **Ubicaciones:** `OwnerMonitorView.jsx:1618, 1710`, `SupervisorRateModal.jsx:77`

## UX-037 — Botones de selección de tasa sin `aria-pressed`/`role="radio"`
- **Ubicación:** `SupervisorRateModal.jsx:105-150`
- **Síntoma:** La opción "Manual" es un `<div>` con `onClick` (no focusable).

## UX-038 — Iconos decorativos sin `aria-hidden="true"`
- **Síntoma:** Lucide React no aplica `aria-hidden` por defecto. Decenas de instancias.

## UX-041 — Estado intermedio: KPIs en 0.00 mientras "Cargando transacciones" gira
- **Ubicación:** `OwnerMonitorView.jsx:986-996`

## UX-042 — Empty states inconsistentes (spacings `py-12/py-16/py-8/py-6`, tonos variados)
- **Ubicaciones:** `OwnerMonitorView.jsx:852, 994, 913, 1077, 1042, 1424`

## UX-044 — Cierre seleccionado sin loading state dedicado
- **Ubicación:** `OwnerMonitorView.jsx:1118-1290`

## UX-048 — Barra flotante de cambios pendientes SIEMPRE dark sin `dark:` variants
- **Ubicación:** `OwnerMonitorView.jsx:1671`

## UX-050 — "Fondo de Apertura" casi imperceptible en light (`bg-slate-50` sobre `bg-white`)
- **Ubicación:** `OwnerMonitorView.jsx:876`

## UX-055 — Notificaciones supervisor no soportan stacks (mismas coords `top-4 left-1/2 z-[400]`)
- **Ubicaciones:** `SupervisorRateNotification.jsx:50`, `SupervisorInventoryNotification.jsx:39`

## UX-057 — Haptic feedback inconsistente en `SupervisorRateModal` (opción Manual parcial)
- **Ubicación:** `SupervisorRateModal.jsx:159`

## UX-058 — Cards inventario sin `active:scale` (hover queda "pegado" en touch)
- **Ubicación:** `OwnerMonitorView.jsx:1446`

## UX-059 — `active:scale` variantes inconsistentes (`95`, `[0.98]`, `[0.99]`, `90`)
- **Ubicaciones:** 7+ líneas entre `OwnerMonitorView` y `SupervisorRateModal`

## UX-064 — Truncado de nombre de producto sin `title` tooltip
- **Ubicación:** `OwnerMonitorView.jsx:1011-1013, 1275-1277`

## UX-065 — Cards inventario en móvil ocultan imagen y movimientos
- **Ubicación:** `OwnerMonitorView.jsx:1446-1570`

## UX-066 — Sub-grid de 4 columnas financieras satura en móvil (374px)
- **Ubicación:** `OwnerMonitorView.jsx:1504-1535`

## UX-069 — Barra pendiente (z-250) se solapa con modales `ProductFormModal` (z-100)
- **Ubicación:** `OwnerMonitorView.jsx:1670` vs `Modal.jsx`

## UX-070 — `confirmModalConfig` (z-350) + `showDisconnectConfirm` (z-999) simultáneos (backdrops stacked)
- **Ubicación:** `OwnerMonitorView.jsx:1618, 1710`

## UX-073 — Notificaciones z-400 cubren header sticky z-50 (5+ segundos)
- **Ubicaciones:** `OwnerMonitorView.jsx:645` vs `SupervisorRateNotification.jsx:50`

## UX-075 — Sin focus trap en modales (Tab/shift-tab atraviesa el backdrop)
- **Ubicaciones:** todos los modales

---

# 🟢 ISSUES BAJOS (selección)

## SYNC-014 — Flags paralelos no coordinados (`syncFlags._isSyncingFromCloud` vs `useCloudSync.isSyncingFromCloud`)
- **Ubicación:** `useCloudSync.js:49`, `syncFlags.js:27`
- **Síntoma:** Verifyed reading `syncFlags.js` confirms que `useCloudSync` NO usa `registerCloudSyncSetter`. Los dos flags son paralelos. Hoy funciona por `_currentDeviceId === ''` en monitor (corta el egress), pero es frágil a regresiones futuras.

## UX-007 — Padding p-5 vs p-6 entre tarjetas de Cierres y Turno/Inventario
## UX-008 — Pestañas asimétricas en móvil (longitudes desiguales)
## UX-039 — Logo sin alt específico por contexto
## UX-045 — `triggerRefresh` sin esqueleto en otros paneles
## UX-049 — Modal confirm con `text-slate-500` justo en el límite AA
## UX-051 — `dark:bg-amber-955/30` (clase inválida) en estado "Diferencia"
## UX-054 — Toasts `w-[90vw]` angostos en desktop
## UX-056 — Notificaciones supervisor sin `aria-live="polite"`
## UX-060 — `transition-colors` vs `transition-all` sin consistencia
## UX-061 — `animate-pulse` en dos contextos distintos ("Desconectado" y "Diferencia")
## UX-067 — Paginación 15 items sin opción "Ver todo"
## UX-072 — Toast z-9999 sobre disconnect z-999 (manejado por cierre anticipado)
## UX-076 — `animate-fade-in` custom vs `tailwindcss-animate animate-in` coexistiendo

---

# 🗺️ Plan de Fixeo (roadmap)

> Esfuerzo (story points): `XS`=1pt ≈ ½ día · `S`=2pt · `M`=3pt · `L`=5pt · `XL`=8pt+

## Fase 0 — Contención (24-48 h, ~4 pt)

Prioridad máxima: corruption de inventario + design system roto.

| Issue | Fix | Esfuerzo |
|-------|-----|----------|
| **SYNC-001** | Mover `appliedIds.add(command.id); markApplied();` a operación **atómica síncrona** ANTES del primer `await` dentro de `processCommand`. Mejor: introducir `inFlight Map<id, Promise>` para de-duplicar la Promise en vuelo. | S |
| **SYNC-007** | Setear `id: c.id` en cada row de `handleUploadPendingChanges` y usar `onConflict: 'id'` para reintento idempotente. | XS |
| **SYNC-013** | Quitar `data.stock` del payload de `edit` en `RemoteProductFormModal` y/o añadir checkbox "Editar stock" en el formulario del monitor. | S |
| **SYNC-005** | Preservar barcode/boxBarcode/halfBoxBarcode en `applyInventoryCommand → edit` con `if (data[f] === undefined) normalized[f] = existing[f];` | XS |
| **UX-009/010/011/012/013/017** | Find/replace de tonos inexistentes: `slate-850→slate-800`, `slate-650→slate-600`, `slate-450→slate-500`, `slate-350→slate-300`, `slate-150→slate-100`, `slate-250→slate-200`, `blue-650→blue-600`, `emerald-450→emerald-400`, `amber-955→amber-900`. | S |
| **UX-001** | Reemplazar `bg-black` por `bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800` (o restringir el "Obsidian look" solo a dark). | XS |
| **UX-031** | Añadir `aria-label` descriptivo a los 8+ botones sólo-icono. Convertir `<div onPointerDown>` de notificaciones en `<button>`. | S |

## Fase 1 — Robustez de sincronización (1 semana, ~8 pt)

| Issue | Fix | Esfuerzo |
|-------|-----|----------|
| **SYNC-002** | RPC `claim_command(p_id, p_device_id)` que atómicamente `UPDATE ... SET status='processing', claimed_by, claimed_at WHERE id=$1 AND status='pending'  RETURNING id`. Sólo el claimer procede. | M |
| **SYNC-003** | Migrar `pda_applied_supervisor_cmds_v1` a IndexedDB con TTL 60 días (sin tope 200). O cambiar `catchUpPending` a `SELECT ... WHERE created_at > MAX(applied_at)` para no reprocesar viejos. | S |
| **SYNC-004** | Mover `monitorSubscription` a `useRef` per-instance. Añadir flag `disposed` (closure) que cada callback asíncrona chequee antes de `setState`. | S |
| **SYNC-006 + SYNC-016** | Import estático de `pushLocalSync` (no dinámico). Reemplazar `localStorage.setItem` por `storageService.setItem` para `bodega_rate_mode/use_auto_rate/custom_rate`. | S |
| **SYNC-008** | Añadir `expectedStock` al payload de `adjust_stock`. En `applyInventoryCommand`, rechazar si `existing.stock !== expectedStock` con error descriptivo. | S |
| **SYNC-009** | Coalesce de `adjust_stock` consecutivos por producto en `catchUpPending` (sumar deltas). Ejecutar N comandos en un solo `withLock` (1 read + 1 write). | M |
| **SYNC-014** | `useCloudSync` debe llamar `registerCloudSyncSetter` para sincronizar el flag local con `syncFlags.isSyncingFromCloud()`. | XS |
| **SYNC-015** | Tabla `device_heartbeats(device_id PK, last_seen, version)`. La CAJA upsert cada 30s. El monitor muestra "Caja vista hace X" antes de INSERTar comandos. | M |
| **SYNC-017** | Marcar cada `pendingChanges[i].uploaded=true` con el `command_id` emitido, borrar solo al recibir ACK `applied` (suscripción bidireccional del monitor). | M |

## Fase 2 — UX/UI Accesibilidad y Design System (1-2 semanas, ~10 pt)

| Issue | Fix | Esfuerzo |
|-------|-----|----------|
| **UX-034/036/037/075** | Implementar focus trap + Escape close en todos los modales (`react-focus-lock` o custom `useFocusTrap`). Añadir `role="dialog" aria-modal="true" aria-labelledby`. `SupervisorRateModal`: `role="radiogroup"` + `aria-pressed`. | M |
| **UX-052/053/055/056/068/073** | Sistema unificado de notificaciones: stack vertical compartido (z-400) con auto-close 5s, `aria-live="polite"`. Suprimir Toasts del supervisor cuando hay modal activo. Bajar notificaciones a `top-20` para no cubrir header. | M |
| **UX-046/047/048** | Convertir `SupervisorRateModal` + `SupervisorRateNotification` + `SupervisorInventoryNotification` + barra pending a `dark:` variants. | S |
| **UX-023/028/066** | Reemplazar tabla de arqueo por layout apilado `flex flex-col` en móvil. Sub-grid de inventario: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`. | M |
| **UX-024** | Touch targets mín 44x44px: `min-w-[44px] min-h-[44px]` con padding transparente overlay o `p-2.5` en botones críticos. Separar editar/borrar con `gap-2`. | S |
| **UX-025/026/027** | En móvil colapsar refresh+logout en menú "..." o agregar `overflow-hidden` + `min-w-0` al header. Añadir `whitespace-nowrap overflow-hidden text-ellipsis` a pestañas. | S |
| **UX-029/030** | `pt-[env(safe-area-inset-top)]` en header. Padding horizontal con `max(1rem, env(safe-area-inset-*))` en `main`. | XS |
| **UX-040/041/042/044/062** | Componentizar `<Spinner>`, `<EmptyState variant="info\|positive\|warning">`, `<KpiCard>`, `<SkeletonCard>`. Subir todos los `text-[7px]/[8px]` a `text-[10px]` mínimo. | L |
| **UX-004/005/006/007** | Unificar sistema de tarjetas: `rounded-3xl p-5 sm:p-6 border-slate-200/60 dark:border-slate-800 min-h-[105px] sm:min-h-[125px] shadow-sm`. | S |
| **UX-038** | Pasar `aria-hidden="true"` a todos los iconos decorativos via wrapper. | XS |
| **UX-033** | Añadir `disabled:opacity-50 disabled:cursor-not-allowed aria-busy="true"` en botones con estado loading. | XS |

## Fase 3 — Optimización y DX (continuo, ~5 pt)

| Issue | Fix | Esfuerzo |
|-------|-----|----------|
| **SYNC-010** | Validar `deviceId` con regex `/^PDA-V2-[A-F0-9]{32}$/` antes de construir el filtro Realtime. | XS |
| **SYNC-012** | Añadir `payload_version INTEGER DEFAULT 1` al schema. Migradores en `applyRateChange`/`applyInventoryCommand`. | S |
| **SYNC-011** | Cambiar toast a "Comandos encolados. La caja los aplicará al reconectar" cuando `last_seen > 5min`. | XS |
| **UX-002** | Cargar logo según `theme` (no `onError`). | XS |
| **UX-032** | Subir `text-slate-400` a `text-slate-500 dark:text-slate-400` + `text-[10px] sm:text-[11px]` mínimo. | S |
| **UX-058/059/060/061/076** | Tokenizar `--press-scale: 0.95`. Estandarizar `transition-colors duration-200`. Migrar `animate-fade-in` a `tailwindcss-animate`. Eliminar `animate-pulse` en "Diferencia". | M |
| **UX-064/065/067** | Añadir `title` tooltips en truncados. Mostrar thumbnail en cards móviles. Opción "Ver todo" en paginación. | S |

## Tests E2E propuestos (cobertura nueva)

| Test | Valida |
|------|--------|
| `sync.dedupe-realtime-catchup.test.js` | INSERT simulado + `catchUpPending` simultáneo → única aplicación |
| `sync.rate-change-ack.test.js` | `pushLocalSync` failure → fallback y reintentos |
| `sync.upload-retry-idempotency.test.js` | Timeout simulado + reintento → no duplicados |
| `sync.adjust-stock-optimistic-lock.test.js` | `expectedStock` mismatch → error + rollback |
| `sync.heartbeat-offline.test.js` | CAJA offline > 5 min → monitor advierte antes de upload |
| `sync.edit-preserves-barcode.test.js` | Edit sin `data.barcode` → barcode original preservado |
| `ui.modals-escape-focus-trap.test.js` | Tab/shift-tab confinados, Escape cierra |
| `ui.notifications-stack.test.js` | 2 notificaciones no se solapan, auto-close 5s |
| `ui.dark-mode-modal.test.js` | Modal en light no muestra tema dark |
| `ui.touch-targets.test.js` | Botones críticos ≥ 44px |

---

# Patrones de fix recomendados (transversales)

1. **Idempotencia end-to-end:** `c.id` del borrador → `supervisor_commands.id` → ACK applied con el mismo `c.id` → monitor escucha ACKs para descartar granularmente. Resuelve SYNC-007, SYNC-011, SYNC-017.
2. **Atomic claim con RPC:** `claim_command` que cambia `pending→processing` atómicamente. Resuelve SYNC-001, SYNC-002.
3. **Persistencia duradera de appliedIds:** Migrar a IndexedDB con TTL. Elimina el top-200. Resuelve SYNC-003.
4. **Coalesce de comandos:** Pre-procesar pending, agrupar `adjust_stock` por producto y `rate_change` last-wins, ejecutar en un solo `withLock`. Resuelve SYNC-009.
5. **Migración con `payloadVersion`:** Campo `v` dentro del JSONB. Resuelve SYNC-012.
6. **Heartbeat bidireccional:** Tabla `device_heartbeats`, monitor muestra "visto hace X". Resuelve SYNC-015.
7. **Preservación selectiva en `edit`:** Guards para barcode/boxBarcode/halfBoxBarcode/stock cuando no se modifican. Resuelve SYNC-005, SYNC-013.
8. **Unificación de flags de sync:** `useCloudSync` debe usar `isSyncingFromCloud()` de `syncFlags.js` vía `registerCloudSyncSetter`. Resuelve SYNC-014, refuerza SYNC-006.
9. **Componentización UI:** `Spinner`, `EmptyState`, `KpiCard`, `SkeletonCard` para consolidar el design system. Resuelve UX-004/005/006/040/042.
10. **Sistema jerárquico de z-index:** `header z-50`, `backdrop z-100`, `modales z-200`, `notificaciones z-300`, `toasts z-9999`, `disconnect z-1000`, `confirm z-1100`. Resuelve UX-068 a UX-075.

---

# Métricas de éxito (post-fix)

- **Integridad:** 0 comandos reprocesados en tests de red inestable (mock timeout + reintento).
- **Latencia:** Catch-up de 50 comandos en <5s (vs ~30s actuales).
- **Accesibilidad:** Axe-core 0 violations en OwnerMonitorView y SupervisorRateModal.
- **Consistencia:** 0 clases Tailwind inexistentes en el componente (lint custom).
- **Contraste:** 100% textos ≥ 4.5:1 sobre fondo (verificación Lighthouse Accessibility ≥ 95).
- **Touch targets:** 100% botones críticos ≥ 44x44px.

---

## Apéndice — Archivos auditados

| Archivo | Líneas | Hallazgos |
|---------|-------|-----------|
| `src/views/OwnerMonitorView.jsx` | 1744 | UX-001 a UX-076 (mayoría) |
| `src/components/SupervisorRateModal.jsx` | 217 | UX-033/046/057/075 |
| `src/components/SupervisorRateNotification.jsx` | 86 | UX-047/052/053/055/056 |
| `src/components/SupervisorInventoryNotification.jsx` | 71 | UX-047/052/053/055/056 |
| `src/components/Monitor/RemoteProductFormModal.jsx` | 289 | SYNC-013 (envía `data.stock`) |
| `src/hooks/useSupervisorCommands.js` | 149 | SYNC-001/002/003/006/016 |
| `src/hooks/useMonitorSync.js` | 132 | SYNC-004/010/014 |
| `src/hooks/useCloudSync.js` | 350 | SYNC-014 |
| `src/utils/remoteInventoryProcessor.js` | 128 | SYNC-005/008/013 |
| `src/utils/syncFlags.js` | 114 | SYNC-014 verificación |
| `src/utils/withLock.js` | 122 | (OK — feature detection correcta) |
| `src/App.jsx` | 509 | Enganche de hooks (líneas 74, 114, 218-236) |
| `supabase_pairing_setup.sql` | 213 | SYNC-010/012/015 (schema) |
| `tailwind.config.js` | — | UX-009 raíz (paleta limitada) |

## Apéndice — Patrones sistémicos detectados

1. **Doble noop en `edit`:** el comando edit reincluye campos como barcode/stock que el formulario cree ver pero que estaban sincronizados desde una versión vieja → descuadre silencioso.
2. **Idempotencia frágil:** basada en un Set en memoria + localStorage top-200, sin ACK end-to-end. Cualquier reconexión puede romperla.
3. **Design system débil:** 22+ clases Tailwind inexistentes concentradas en un solo componente. La paleta rebindeada limita los tonos disponibles pero el código usa tonos fuera de la lista.
4. **Modales no accesibles:** ningún `<dialog>` semántico, sin Escape, sin focus trap, sin `aria-modal`. Patron sistémico.
5. **Notificaciones ad-hoc:** 3 sistemas paralelos (Toast, SupervisorRateNotification, SupervisorInventoryNotification) sin coordinación de z-index ni de stack.
6. **`localStorage.setItem` directo:** bypass de `storageService` en puntos críticos (rate_change), rompiendo la pipeline de `queueCloudSync`.
7. **Import dinámico en cadena crítica:** `applyRateChange` dynamically importa `pushLocalSync` con catch vacío → fallos silenciosos.

---

*Auditoría realizada por 3 vías en paralelo: análisis directo de archivos + subagente `explore` (UI/UX, very thorough) + subagente `explore` (sincronización, very thorough). Verificación cruzada de `syncFlags.js` para confirmar SYNC-014.*
