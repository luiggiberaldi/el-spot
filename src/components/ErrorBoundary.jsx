import React from 'react';
import localforage from 'localforage';

/**
 * HOOK-026: ErrorBoundary con recuperación efectiva.
 *
 * Antes: el botón "Reintentar" solo reseteaba `hasError=false` sin recargar la
 * app, lo que dejaba estado inconsistente (el error podía venir de un módulo
 * ya cargado corrupto). El botón "Limpiar y Recargar" borraba `calc_history`
 * —raramente la causa del crash— sin ofrecer borrar datos críticos sospechosos.
 *
 * Ahora:
 *  - "Reintentar" → `window.location.reload()` (estado limpio desde cero).
 *  - "Limpiar datos críticos" → ofrece borrar específicamente `bodega_products_v1`
 *    y `bodega_sales_v1` (los dos grandes sospechosos de OOM/parse errors).
 *    Pide confirmación porque es destructivo.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, clearing: false, clearMsg: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('🔴 App Error:', error, errorInfo);
  }

  _handleRetry = () => {
    // HOOK-026: reload garantiza estado limpio. Antes solo reseteabamos el flag
    // y el error reaparecía en el siguiente render.
    window.location.reload();
  };

  _handleClearCriticalData = async () => {
    // HOOK-026: borrar solo las claves que típicamente causan crashes de parseo
    // o OOM. NO tocar auth, ni flags de migración, ni settings.
    const confirm = typeof window !== 'undefined' && window.confirm
      ? window.confirm(
          'Esto borrará SOLO los productos (bodega_products_v1) y el historial de ventas (bodega_sales_v1) ' +
          'para intentar recuperar la app. NO se tocará la sesión, configuración ni otros datos. ¿Continuar?'
        )
      : true;
    if (!confirm) return;

    this.setState({ clearing: true, clearMsg: 'Borrando datos críticos...' });
    try {
      // Usar localforage estático
      localforage.config({ name: 'ElSpotPOSApp', storeName: 'el_spot_app_data' });
      await localforage.removeItem('bodega_products_v1');
      await localforage.removeItem('bodega_sales_v1');
      // También purgar de localStorage por si estaban ahí como fallback.
      localStorage.removeItem('bodega_products_v1');
      localStorage.removeItem('bodega_sales_v1');
      this.setState({ clearMsg: 'Datos borrados. Recargando...' });
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      console.error('[ErrorBoundary] Fallo limpiando datos críticos:', e);
      this.setState({
        clearing: false,
        clearMsg: 'No se pudo limpiar automáticamente. Usa la consola: localforage.removeItem("bodega_products_v1")',
      });
    }
  };

  render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message || 'Error desconocido';
      const isChunkError = errMsg.includes('dynamically imported module') || errMsg.includes('Loading chunk') || this.state.error?.name === 'ChunkLoadError';

      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-950 p-4 sm:p-6 font-outfit select-none">
          <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl shadow-black/80 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Ícono destacado */}
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-3xl shadow-inner">
              ⚠️
            </div>

            {/* Título y Mensaje */}
            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {isChunkError ? 'Nueva Versión Disponible' : 'Error de Carga'}
              </h2>
              <p className="text-sm font-medium text-slate-300 leading-relaxed">
                {isChunkError 
                  ? 'Se ha desplegado una actualización de la aplicación. Por favor recarga para cargar los últimos archivos.'
                  : 'La aplicación encontró un inconveniente al cargar componentes. Puedes reintentar la recarga inmediatamente.'}
              </p>
            </div>

            {/* Snippet del Error con alto contraste */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Detalle del error:</p>
              <p className="text-xs font-mono text-rose-400 break-all leading-snug">
                {errMsg}
              </p>
            </div>

            {/* Botones de Acción de Alto Contraste */}
            <div className="space-y-2.5 pt-1">
              <button
                onClick={this._handleRetry}
                disabled={this.state.clearing}
                className="w-full py-3.5 px-6 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                Reintentar (Recargar App)
              </button>

              {!isChunkError && (
                <button
                  onClick={this._handleClearCriticalData}
                  disabled={this.state.clearing}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
                >
                  Limpiar datos en caché y recargar
                </button>
              )}
            </div>

            {this.state.clearMsg && (
              <p className="text-xs font-bold text-amber-400 animate-pulse">{this.state.clearMsg}</p>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
