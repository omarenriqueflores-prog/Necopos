import React from 'react';
import { Minus, Square, X, Store, LogOut } from 'lucide-react';
import { BranchConfig, UserAccount } from '../../types/pos';
import { useDialog } from '../../context/DialogContext';

interface WindowsTitleBarProps {
  currentBranch: BranchConfig;
  currentUser: UserAccount;
  onLockApp?: () => void;
  isLocked?: boolean;
  onLogout?: () => void;
  onSwitchBranch?: (branchId: 'NECO 1' | 'NECO 2') => void;
}

export const WindowsTitleBar: React.FC<WindowsTitleBarProps> = ({
  currentBranch,
  currentUser,
  onLogout,
  onSwitchBranch,
}) => {
  const { showConfirm } = useDialog();
  const isAdminOrSuperadmin = currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN';

  return (
    <div className="h-[26px] bg-[#002046] text-white flex items-center justify-between px-2 select-none border-b border-[#1b365d] text-[12px] font-semibold tracking-wide">
      {/* Left: Window Icon & Title */}
      <div className="flex items-center gap-2 truncate">
        <div className="w-4 h-4 rounded-sm bg-[#aa3531] flex items-center justify-center text-[10px] font-black shadow-inner">
          N
        </div>
        <span className="font-bold text-white tracking-tight">
          NECO POS v4.8 Enterprise - {currentBranch.name}
        </span>
        <span className="text-[#87a0cd] font-normal text-[11px] hidden md:inline">
          [{currentBranch.id} | Terminal POS-{currentBranch.pointOfSale}]
        </span>
      </div>

      {/* Right: Actions & Window Controls */}
      <div className="flex items-center gap-1">
        {/* User Branch Badge or Interactive Selector for Admins */}
        {isAdminOrSuperadmin && onSwitchBranch ? (
          <div
            title="Cambiar sucursal activa en la sesión (Permiso Administrador / Superadmin)"
            className="h-[22px] px-1.5 text-[10px] bg-[#1b365d] text-[#d6e3ff] border border-[#87a0cd]/60 flex items-center gap-1 font-mono select-none"
          >
            <Store className="w-3 h-3 text-[#53a1ff]" />
            <span className="text-[#aec7f7]">Sucursal:</span>
            <select
              value={currentBranch.id}
              onChange={(e) => onSwitchBranch(e.target.value as 'NECO 1' | 'NECO 2')}
              className="bg-[#002046] text-white font-bold text-[10px] border border-[#87a0cd]/50 px-1 py-0 outline-none cursor-pointer"
            >
              <option value="NECO 1">NECO 1 (Central - PV 0017)</option>
              <option value="NECO 2">NECO 2 (Villa Saavedra - PV 0018)</option>
            </select>
          </div>
        ) : (
          <div
            title={`Sucursal configurada en el perfil de usuario: ${currentBranch.id}`}
            className="h-[20px] px-2 text-[10px] bg-[#1b365d] text-[#d6e3ff] border border-[#87a0cd]/40 flex items-center gap-1 font-mono select-none"
          >
            <Store className="w-3 h-3 text-[#53a1ff]" />
            <span>
              Sucursal: <strong className="text-white font-bold">{currentBranch.id}</strong>
            </span>
          </div>
        )}

        {/* Cerrar Sesión button removed as per user request */}

        {/* Windows Standard Buttons */}
        <div className="flex items-center ml-1">
          <button
            onClick={() => {}}
            className="w-[28px] h-[22px] flex items-center justify-center hover:bg-[#1b365d] text-white"
            title="Minimizar"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            onClick={() => {}}
            className="w-[28px] h-[22px] flex items-center justify-center hover:bg-[#1b365d] text-white"
            title="Maximizar"
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={async () => {
              if (onLogout) {
                onLogout();
              } else {
                const confirmed = await showConfirm('¿Desea cerrar la sesión de NECO POS?');
                if (confirmed) {
                  window.location.reload();
                }
              }
            }}
            className="w-[32px] h-[22px] flex items-center justify-center hover:bg-[#aa3531] text-white"
            title="Cerrar sesión"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
