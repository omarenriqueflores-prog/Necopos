import React, { useState, useEffect } from 'react';
import { Cloud, Wifi, Database, Clock } from 'lucide-react';
import { BranchConfig, UserAccount } from '../../types/pos';
import { useFirebase } from '../../context/FirebaseContext';
import { getCurrentShiftStatus } from '../../utils/scheduleHelper';

interface WindowsStatusBarProps {
  currentBranch: BranchConfig;
  currentUser: UserAccount;
  cashOpen: boolean;
}

export const WindowsStatusBar: React.FC<WindowsStatusBarProps> = ({
  currentBranch,
  currentUser,
  cashOpen,
}) => {
  const { user } = useFirebase();
  const [currentDateTime, setCurrentDateTime] = useState<string>('');
  const [shiftStatus, setShiftStatus] = useState(() => getCurrentShiftStatus());

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const d = String(now.getDate()).padStart(2, '0');
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const y = now.getFullYear();
      const h = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      setCurrentDateTime(`${d}/${m}/${y} ${h}:${min}:${s}`);
      setShiftStatus(getCurrentShiftStatus(now));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="h-[22px] bg-[#e5e8ec] border-t border-[#74777f] flex items-center px-2 text-[11px] text-[#181c1f] select-none z-40 fixed bottom-0 left-0 right-0 font-sans divide-x divide-[#c4c6cf]">
      {/* Operator */}
      <div className="pr-3 flex items-center gap-1 truncate">
        <span className="text-[#44474e]">Operador:</span>
        <span className="font-bold text-[#002046]">{currentUser.fullName}</span>
      </div>

      {/* Role */}
      <div className="px-3 flex items-center gap-1 truncate">
        <span className="text-[#44474e]">Rol:</span>
        <span className="font-semibold text-[#181c1f]">{currentUser.role}</span>
      </div>

      {/* Branch */}
      <div className="px-3 flex items-center gap-1 truncate">
        <span className="text-[#44474e]">Sucursal:</span>
        <span className="font-bold text-[#002046]">
          {currentBranch.id === 'NECO 1' ? 'NECO 1 - Central' : 'NECO 2 - Villa Saavedra'}
        </span>
      </div>

      {/* Register */}
      <div className="px-3 flex items-center gap-1 truncate">
        <span className="text-[#44474e]">Caja:</span>
        <span className="font-semibold text-[#181c1f]">{currentBranch.pointOfSale} (POS Principal)</span>
      </div>

      {/* Cash Status */}
      <div className="px-3 flex items-center gap-1.5 whitespace-nowrap">
        <span
          className={`w-2 h-2 rounded-full ${
            cashOpen ? 'bg-[#1b365d] animate-pulse' : 'bg-[#aa3531]'
          }`}
        />
        <span className={`font-bold ${cashOpen ? 'text-[#002046]' : 'text-[#aa3531]'}`}>
          {cashOpen ? 'CAJA ABIERTA' : 'CAJA CERRADA'}
        </span>
      </div>

      {/* Horario Comercial & Turno Activo */}
      <div className="px-3 flex items-center gap-1.5 whitespace-nowrap hidden md:flex" title={`Horario comercial: Lun-Sáb 08:00-13:30 / 18:00-22:00 | Dom 08:00-13:30. ${shiftStatus.nextShiftText}`}>
        <Clock className="w-3 h-3 text-[#002046]" />
        <span className={`font-bold px-1.5 py-0.2 text-[10px] ${
          shiftStatus.isOpenNow
            ? 'bg-[#d6e3ff] text-[#002046] border border-[#74777f]/40'
            : 'bg-[#ffdad6] text-[#aa3531] border border-[#ffb4ab]'
        }`}>
          {shiftStatus.shiftLabel}: {shiftStatus.scheduleText}
        </span>
      </div>

      {/* Firebase Firestore Status */}
      <div className="px-3 flex items-center gap-1 text-[#002046] font-semibold hidden xl:flex">
        <Database className="w-3 h-3 text-[#1565c0]" />
        <span className="text-[10px] text-[#1565c0] font-mono font-bold uppercase">
          FIRESTORE: {user ? user.email || 'CONECTADO' : 'ONLINE (NECOPOS)'}
        </span>
      </div>

      {/* ARCA Online */}
      <div className="px-3 flex items-center gap-1 text-[#002046] font-semibold hidden lg:flex">
        <Wifi className="w-3 h-3 text-[#1b365d]" />
        <span>ARCA: EN LÍNEA</span>
      </div>

      {/* Live Date / Time Clock */}
      <div className="pl-3 ml-auto font-mono text-[11px] font-semibold text-[#44474e] whitespace-nowrap">
        {currentDateTime}
      </div>
    </footer>
  );
};
