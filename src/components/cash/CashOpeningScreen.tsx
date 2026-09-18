import React, { useState } from 'react';
import { Landmark, Check, X, ShieldAlert, ArrowLeft, Clock, Calendar } from 'lucide-react';
import { BranchConfig, UserAccount } from '../../types/pos';
import { formatCurrency } from '../../utils/scaleParser';
import { useDialog } from '../../context/DialogContext';
import { getCurrentShiftStatus } from '../../utils/scheduleHelper';

interface CashOpeningScreenProps {
  currentBranch: BranchConfig;
  currentUser: UserAccount;
  cashOpen: boolean;
  onConfirmOpening: (initialFund: number, notes: string, shift?: string) => void;
  onCancel: () => void;
}

export const CashOpeningScreen: React.FC<CashOpeningScreenProps> = ({
  currentBranch,
  currentUser,
  cashOpen,
  onConfirmOpening,
  onCancel,
}) => {
  const { showAlert } = useDialog();
  const shiftStatus = getCurrentShiftStatus();
  const [initialFund, setInitialFund] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>(
    shiftStatus.isSunday ? 'TURNO MAÑANA' : shiftStatus.recommendedShift === 'TARDE' ? 'TURNO TARDE' : 'TURNO MAÑANA'
  );
  const [notes, setNotes] = useState<string>('');

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const fund = parseFloat(initialFund) || 0;
    if (fund < 0) {
      await showAlert('El fondo inicial no puede ser negativo.');
      return;
    }
    const fullNotes = `[${selectedShift}] ${notes}`.trim();
    onConfirmOpening(fund, fullNotes, selectedShift);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-[calc(100vh-80px)] select-none bg-[#ebeef2] text-[#181c1f] font-sans p-4">
      <div className="w-full max-w-xl bg-white border-2 border-[#002046] shadow-md flex flex-col overflow-hidden">
        {/* Title bar */}
        <div className="h-[28px] bg-[#002046] text-white flex items-center justify-between px-3 text-[12px] font-bold">
          <div className="flex items-center gap-2">
            <Landmark className="w-3.5 h-3.5 text-[#aec7f7]" />
            <span>APERTURA DE CAJA REGISTRADORA — INICIO DE JORNADA</span>
          </div>
          <span className="text-[10px] text-[#aec7f7] font-mono">
            {shiftStatus.dayName.toUpperCase()}
          </span>
        </div>

        {/* Commercial Schedule Badge */}
        <div className="bg-[#f0f4f8] border-b border-[#c4c6cf] px-3 py-1.5 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-[#002046]">
            <Clock className="w-3.5 h-3.5 text-[#002046]" />
            <span className="font-bold">Horarios Comerciales:</span>
            <span className="text-[#44474e]">
              Lun-Sáb 08:00-13:30 / 18:00-22:00 | Dom 08:00-13:30
            </span>
          </div>
          <span className={`px-2 py-0.5 font-bold text-[10px] ${
            shiftStatus.isOpenNow ? 'bg-[#d6e3ff] text-[#002046]' : 'bg-[#fff0eb] text-[#a03000]'
          }`}>
            {shiftStatus.shiftLabel}
          </span>
        </div>

        {/* Form fields */}
        {cashOpen ? (
          <div className="p-8 flex flex-col items-center justify-center gap-4 text-center">
            <ShieldAlert className="w-16 h-16 text-[#a03000]" />
            <div className="text-[16px] font-bold text-[#181c1f]">La caja ya se encuentra ABIERTA en esta terminal.</div>
            <button
              onClick={onCancel}
              className="h-[32px] px-6 bg-[#002046] hover:bg-[#1b365d] text-white text-[12px] font-bold flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Aceptar</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleConfirm} className="p-4 flex flex-col gap-3 text-[12px]">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-[#44474e] block mb-0.5">Fecha Operativa:</label>
                <input
                  type="text"
                  disabled
                  value={new Date().toLocaleDateString('es-AR')}
                  className="w-full h-[26px] px-2 bg-[#ebeef2] border border-[#c4c6cf] font-mono font-bold text-[#181c1f]"
                />
              </div>
              <div>
                <label className="font-bold text-[#44474e] block mb-0.5">Turno a Abrir:</label>
                <select
                  value={selectedShift}
                  onChange={(e) => setSelectedShift(e.target.value)}
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold text-[#002046] focus:outline-none cursor-pointer"
                >
                  <option value="TURNO MAÑANA">Turno Mañana (08:00 a 13:30)</option>
                  {!shiftStatus.isSunday && (
                    <option value="TURNO TARDE">Turno Tarde / Noche (18:00 a 22:00)</option>
                  )}
                  <option value="JORNADA COMPLETA">Jornada Completa</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-[#44474e] block mb-0.5">Sucursal:</label>
                <input
                  type="text"
                  disabled
                  value={`${currentBranch.id} - ${currentBranch.name}`}
                  className="w-full h-[26px] px-2 bg-[#ebeef2] border border-[#c4c6cf] font-bold text-[#002046] truncate"
                />
              </div>
              <div>
                <label className="font-bold text-[#44474e] block mb-0.5">Punto de Venta / Caja:</label>
                <input
                  type="text"
                  disabled
                  value={`Pto. Venta ${currentBranch.pointOfSale} (Terminal Principal)`}
                  className="w-full h-[26px] px-2 bg-[#ebeef2] border border-[#c4c6cf] font-bold text-[#181c1f]"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-[#44474e] block mb-0.5">Cajero / Operador Responsable:</label>
              <input
                type="text"
                disabled
                value={`${currentUser.fullName} (${currentUser.role})`}
                className="w-full h-[26px] px-2 bg-[#ebeef2] border border-[#c4c6cf] font-bold text-[#002046]"
              />
            </div>

            {/* Initial Fund input */}
            <div className="bg-[#f7fafe] p-3 border-2 border-[#002046] flex flex-col gap-1">
              <label className="font-extrabold text-[#002046] text-[13px] block">
                FONDO INICIAL DE CAMBIO ($):
              </label>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[18px] font-black text-[#002046]">$</span>
                <input
                  type="number"
                  value={initialFund}
                  onChange={(e) => setInitialFund(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-[34px] px-2 bg-white border border-[#74777f] font-mono text-[20px] font-black text-[#002046] focus:outline-none"
                  autoFocus
                />
              </div>
              <span className="text-[10px] text-[#44474e]">
                Dinero en efectivo presente en gaveta para entrega de cambio inicial.
              </span>
            </div>

            <div>
              <label className="font-bold text-[#181c1f] block mb-0.5">Observaciones de Apertura:</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas opcionales sobre el estado de la caja o entrega de turno..."
                className="w-full p-2 bg-white border border-[#74777f] text-[12px] focus:outline-none"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-[#c4c6cf] mt-2">
              <button
                type="button"
                onClick={onCancel}
                className="h-[30px] px-4 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver</span>
              </button>
              <button
                type="submit"
                className="h-[32px] px-6 bg-[#002046] hover:bg-[#1b365d] text-white text-[12px] font-bold flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <Check className="w-4 h-4" />
                <span>Confirmar Apertura de Caja [Enter]</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
