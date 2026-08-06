import React, { useState, useEffect, useCallback } from 'react';
import { 
    X, RefreshCw, Activity, CheckCircle2, Clock, 
    AlertTriangle, XCircle, TrendingUp, Package, ShieldCheck 
} from 'lucide-react';
import { supabaseCloud } from '../../config/supabaseCloud';

export default function CommandAuditModal({ isOpen, onClose, pairedDeviceId }) {
    const [commands, setCommands] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('all'); // 'all' | 'applied' | 'pending' | 'failed'

    const fetchAuditLogs = useCallback(async () => {
        if (!pairedDeviceId || !supabaseCloud) return;
        setLoading(true);
        try {
            const { data, error } = await supabaseCloud
                .from('supervisor_commands')
                .select('*')
                .eq('primary_device_id', pairedDeviceId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            setCommands(data || []);
        } catch (err) {
            console.error('[CommandAuditModal] Error cargando auditoría:', err);
        } finally {
            setLoading(false);
        }
    }, [pairedDeviceId]);

    useEffect(() => {
        if (isOpen) {
            fetchAuditLogs();
        }
    }, [isOpen, fetchAuditLogs]);

    // Listener para la tecla Escape (UX-035)
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const filteredCommands = commands.filter(cmd => {
        if (filter === 'applied') return cmd.status === 'applied';
        if (filter === 'pending') return cmd.status === 'pending' || cmd.status === 'processing';
        if (filter === 'failed') return cmd.status === 'failed';
        return true;
    });

    const formatTimestamp = (isoStr) => {
        if (!isoStr) return '—';
        try {
            const date = new Date(isoStr);
            return date.toLocaleString('es-VE', { 
                day: '2-digit', 
                month: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            });
        } catch {
            return isoStr;
        }
    };

    const calcLatency = (createdAt, appliedAt) => {
        if (!createdAt || !appliedAt) return null;
        try {
            const created = new Date(createdAt).getTime();
            const applied = new Date(appliedAt).getTime();
            const diffSec = Math.max(0, Math.round((applied - created) / 1000));
            if (diffSec < 60) return `${diffSec}s`;
            return `${Math.floor(diffSec / 60)}m ${diffSec % 60}s`;
        } catch {
            return null;
        }
    };

    const renderPayloadSummary = (cmd) => {
        const payload = cmd.payload || {};
        if (cmd.command_type === 'rate_change') {
            return (
                <span className="font-semibold text-emerald-400">
                    Tasa: {payload.rateMode === 'manual' ? `Manual (${payload.customRate} Bs/$)` : `Auto (${payload.rateMode})`}
                </span>
            );
        }
        if (cmd.command_type === 'inventory_update') {
            const actionLabels = {
                create: 'Crear producto',
                edit: 'Editar producto',
                delete: 'Eliminar producto',
                stock: 'Ajuste de stock'
            };
            const label = actionLabels[payload.action] || payload.action || 'Modificación';
            const prodName = payload.data?.name || payload.productId || '';
            return (
                <span className="font-medium text-slate-300">
                    {label} {prodName ? `• ${prodName}` : ''}
                </span>
            );
        }
        return <span className="text-slate-400">Comando del supervisor</span>;
    };

    return (
        <div 
            className="fixed inset-0 z-[1100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-modal-title"
        >
            <div 
                className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-slate-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Modal */}
                <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                            <Activity size={20} aria-hidden="true" />
                        </div>
                        <div>
                            <h2 id="audit-modal-title" className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                                Historial de Comandos de Supervisor
                            </h2>
                            <p className="text-xs text-slate-400 font-medium">
                                Auditoría de acciones remotas enviadas a la caja registradora
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchAuditLogs}
                            disabled={loading}
                            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-95"
                            title="Actualizar Auditoría"
                            aria-label="Actualizar Auditoría"
                        >
                            <RefreshCw size={16} className={loading ? "animate-spin text-purple-400" : ""} aria-hidden="true" />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-95"
                            title="Cerrar Modal"
                            aria-label="Cerrar Modal"
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {/* Filtros rápidos */}
                <div className="px-4 py-3 bg-slate-950/30 border-b border-slate-800 flex items-center gap-2 overflow-x-auto scrollbar-none">
                    <span className="text-xs font-semibold text-slate-400 shrink-0 mr-1">Filtrar:</span>
                    {[
                        { id: 'all', label: `Todos (${commands.length})` },
                        { id: 'applied', label: `Aplicados (${commands.filter(c => c.status === 'applied').length})` },
                        { id: 'pending', label: `Pendientes (${commands.filter(c => c.status === 'pending' || c.status === 'processing').length})` },
                        { id: 'failed', label: `Fallidos (${commands.filter(c => c.status === 'failed').length})` }
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                                filter === f.id
                                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Cuerpo / Lista de Comandos */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loading && commands.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-3">
                            <RefreshCw size={24} className="animate-spin text-purple-400" aria-hidden="true" />
                            <p className="text-xs font-medium">Cargando registros de auditoría...</p>
                        </div>
                    ) : filteredCommands.length === 0 ? (
                        <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
                            <Activity size={32} className="text-slate-600" aria-hidden="true" />
                            <p className="text-sm font-bold text-slate-300">Sin registros de comandos</p>
                            <p className="text-xs text-slate-500">
                                {filter === 'all' 
                                    ? 'No se han enviado comandos desde este monitor aún.'
                                    : `No hay comandos con el filtro "${filter}".`}
                            </p>
                        </div>
                    ) : (
                        filteredCommands.map((cmd) => {
                            const latency = calcLatency(cmd.created_at, cmd.applied_at);
                            return (
                                <div 
                                    key={cmd.id}
                                    className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col gap-2"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {/* Badge Tipo */}
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                                cmd.command_type === 'rate_change'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                    : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                            }`}>
                                                {cmd.command_type === 'rate_change' ? (
                                                    <><TrendingUp size={11} aria-hidden="true" /> Tasa Remota</>
                                                ) : (
                                                    <><Package size={11} aria-hidden="true" /> Inventario</>
                                                )}
                                            </span>

                                            {/* Badge Estado */}
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                                cmd.status === 'applied'
                                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                                    : cmd.status === 'pending'
                                                        ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                                                        : cmd.status === 'processing'
                                                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse'
                                                            : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                            }`}>
                                                {cmd.status === 'applied' && <CheckCircle2 size={11} aria-hidden="true" />}
                                                {cmd.status === 'pending' && <Clock size={11} aria-hidden="true" />}
                                                {cmd.status === 'processing' && <RefreshCw size={11} className="animate-spin" aria-hidden="true" />}
                                                {cmd.status === 'failed' && <XCircle size={11} aria-hidden="true" />}
                                                <span>{cmd.status}</span>
                                            </span>
                                        </div>

                                        {/* Timestamp */}
                                        <span className="text-[10px] font-medium text-slate-400 shrink-0">
                                            {formatTimestamp(cmd.created_at)}
                                        </span>
                                    </div>

                                    {/* Resumen del payload */}
                                    <div className="text-xs pt-0.5">
                                        {renderPayloadSummary(cmd)}
                                    </div>

                                    {/* Footer card: latencia o motivo de error */}
                                    <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 border-t border-slate-800/80 pt-2 mt-0.5">
                                        <span className="font-mono text-[9px] text-slate-400 truncate max-w-[200px]" title={cmd.id}>
                                            ID: {cmd.id.substring(0, 18)}...
                                        </span>

                                        {cmd.status === 'applied' && latency && (
                                            <span className="font-semibold text-emerald-400 flex items-center gap-1">
                                                <Clock size={10} aria-hidden="true" /> Aplicado en {latency}
                                            </span>
                                        )}

                                        {cmd.status === 'failed' && cmd.error_reason && (
                                            <span className="font-semibold text-rose-400 flex items-center gap-1 truncate max-w-[250px]" title={cmd.error_reason}>
                                                <AlertTriangle size={10} className="shrink-0" aria-hidden="true" /> {cmd.error_reason}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Modal */}
                <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-purple-400" aria-hidden="true" />
                        Mostrando últimos 50 registros
                    </span>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl active:scale-95 transition-all text-xs border border-slate-700"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
