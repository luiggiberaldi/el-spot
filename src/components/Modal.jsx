import React from 'react';
import { X } from 'lucide-react';

export const Modal = ({ isOpen, onClose, title, children, className = '', size = 'max-w-sm' }) => {
  if (!isOpen) return null;

  return (
    // ✅ z-[100] asegura que esté por encima de la barra de navegación (z-30)
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      
      {/* Backdrop optimizado con aceleración por GPU */}
      <div 
        className="absolute inset-0 bg-slate-950/70 transform-gpu transition-opacity" 
        onClick={onClose}
      />
      
      {/* Contenido del Modal — capa aislada en GPU */}
      <div className={`relative bg-white dark:bg-slate-900 w-full ${size} rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200 transition-all transform-gpu ${className}`}>
        
        {/* Cabecera */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <h3 className="font-black text-slate-800 dark:text-white text-base sm:text-lg tracking-tight">{title}</h3>
          <button 
            onClick={onClose}
            className="p-1.5 bg-slate-200 dark:bg-slate-700 rounded-full text-slate-500 hover:text-red-500 transition-colors"
          >
            <X size={16} strokeWidth={3} />
          </button>
        </div>

        {/* Body con Scroll Ultra-Fluido a 60 FPS */}
        <div className="p-4 sm:p-6 max-h-[85vh] overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar pb-8 transform-gpu">
          {children}
        </div>
      </div>
    </div>
  );
};
