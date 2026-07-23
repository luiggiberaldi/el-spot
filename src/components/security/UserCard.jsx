import React from 'react';
import { Crown } from 'lucide-react';
import LoginAvatar from './LoginAvatar';
import { CardBody, CardContainer, CardItem } from '../ui/3d-card';

const toTitleCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

export default function UserCard({ user, onClick }) {
  const isAdmin = user.rol === 'ADMIN';

  return (
    <div onClick={onClick} className="cursor-pointer outline-none focus:outline-none active:scale-95 transition-transform duration-200">
      <CardContainer className="inter-var py-0">
        <CardBody className="relative group/card w-auto h-auto rounded-xl p-0 border-transparent bg-transparent">

          <CardItem translateZ="100" rotateX={10} rotateZ={-5} className="w-full flex justify-center">
            <div className="relative">
              <style>{`
                @keyframes rotBGimg {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
              `}</style>

              {/* 3D Depth Shadow */}
              <div className="absolute inset-0 bg-black/30 rounded-3xl translate-y-4 translate-x-4 blur-xl" />
              <div className={`absolute inset-0 rounded-3xl translate-y-2 translate-x-1 ${isAdmin ? 'bg-amber-500/20' : 'bg-slate-700/20'}`} />

              {/* Admin Crown */}
              {isAdmin && (
                <div className="absolute -top-3 -left-3 z-50 animate-bounce duration-1000">
                  <div className="bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 p-1.5 rounded-full shadow-[0_0_15px_rgba(217,119,6,0.6)] border border-amber-200">
                    <Crown size={20} className="text-amber-950 fill-amber-100" strokeWidth={2.5} />
                  </div>
                </div>
              )}

              {isAdmin ? (
                <div className="relative z-10 p-[3px] rounded-2xl overflow-hidden flex justify-center items-center shadow-[0_0_20px_rgba(217,119,6,0.35)]">
                  {/* Amber Gold animated aura border */}
                  <div style={{
                    position: 'absolute',
                    width: '200%',
                    height: '200%',
                    backgroundImage: 'linear-gradient(180deg, #f59e0b, #d97706, #78350f)',
                    animation: 'rotBGimg 4s linear infinite',
                  }} />
                  <div className="relative z-20 bg-black rounded-2xl p-0.5">
                    <LoginAvatar user={user} className="relative z-10 transition-all duration-300 shadow-none ring-0" />
                  </div>
                </div>
              ) : (
                <div className="relative z-10 p-[3px] rounded-2xl overflow-hidden flex justify-center items-center bg-gradient-to-br from-slate-700 to-zinc-800 shadow-lg shadow-slate-900/15 transition-all duration-300">
                  <div className="relative z-20 bg-slate-900 rounded-2xl p-0.5">
                    <LoginAvatar user={user} className="relative z-10 transition-all duration-300 shadow-none ring-0" />
                  </div>
                </div>
              )}
            </div>
          </CardItem>

          {/* Text floating below */}
          <CardItem translateZ="60" className="text-center w-full mt-8 group-hover/card:text-primary transition-colors space-y-1">
            <h3 className="text-lg font-bold text-slate-800 drop-shadow-sm">
              {toTitleCase(user.nombre)}
            </h3>
            <span className={`block text-[10px] font-black uppercase tracking-[0.2em] ${isAdmin ? 'text-amber-600' : 'text-slate-500'}`}>
              {user.rol === 'ADMIN' ? 'Administrador' : 'Cajero'}
            </span>
          </CardItem>

        </CardBody>
      </CardContainer>
    </div>
  );
}
