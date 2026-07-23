import React from 'react';

const AVATAR_COLORS = {
  ADMIN: { bg: 'from-slate-950 via-zinc-900 to-black border border-amber-500/40', text: 'text-amber-400' },
  CAJERO: { bg: 'from-slate-850 via-zinc-800 to-slate-900 border border-slate-700', text: 'text-slate-100' },
};

export default function LoginAvatar({ user, size = 'lg' }) {
  const initial = (user?.nombre || 'U').charAt(0).toUpperCase();
  const colors = AVATAR_COLORS[user?.rol] || AVATAR_COLORS.CAJERO;
  const sizeClasses = size === 'lg' ? 'w-28 h-28 text-4xl' : 'w-10 h-10 text-base';

  return (
    <div className={`${sizeClasses} rounded-2xl bg-gradient-to-br ${colors.bg} flex items-center justify-center font-black ${colors.text} select-none shadow-xl`}>
      {initial}
    </div>
  );
}
