import React from 'react';

export default function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  actionLabel, 
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  compact = false,
  variant = 'default',
  className = ''
}) {
  const containerClasses = compact
    ? "p-6 min-h-[140px] rounded-3xl"
    : "p-8 min-h-[260px] rounded-3xl";

  const iconBoxClasses = compact
    ? "w-12 h-12 mb-3"
    : "w-16 h-16 mb-4";

  const iconClasses = compact
    ? "w-6 h-6"
    : "w-8 h-8";

  const titleClasses = compact
    ? "text-xs font-black text-slate-800 dark:text-white mb-1"
    : "text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 mb-1.5";

  const descClasses = compact
    ? "text-[10px] text-slate-500 dark:text-slate-400 max-w-xs"
    : "text-xs text-slate-500 dark:text-slate-400 max-w-sm";

  return (
    <div className={`flex flex-col items-center justify-center text-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm ${containerClasses} ${className}`}>
      <div className={`bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center text-slate-400 ${iconBoxClasses}`}>
        {Icon ? <Icon className={`${iconClasses} text-slate-400`} aria-hidden="true" /> : <div className={`${iconClasses} bg-slate-300 dark:bg-slate-600 rounded-full`} />}
      </div>
      {title && (
        <h3 className={titleClasses}>
          {title}
        </h3>
      )}
      {description && (
        <p className={descClasses}>
          {description}
        </p>
      )}
      
      {(actionLabel || secondaryActionLabel) && (
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {actionLabel}
            </button>
          )}
          
          {secondaryActionLabel && onSecondaryAction && (
            <button
              onClick={onSecondaryAction}
              className="px-5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl border border-slate-200 dark:border-slate-700 active:scale-95 transition-all outline-none focus:ring-2 focus:ring-slate-500"
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
