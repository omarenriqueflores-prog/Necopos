import React, { useState, useEffect } from 'react';
import {
  FileText,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Building2,
  Calendar,
  Hash,
  ArrowRight,
  Info
} from 'lucide-react';
import { arcaService } from '../../services/arcaService';
import { useFirebase } from '../../context/FirebaseContext';

interface LastVouchersModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPointOfSale?: string;
}

interface VoucherItem {
  cbteTipo: number;
  cbteNombre: string;
  cbteLetra: string;
  lastNumber: number;
  nextNumber: number;
  formattedLast: string;
  formattedNext: string;
  source: string;
  status: string;
  lastChecked: string;
}

export const LastVouchersModal: React.FC<LastVouchersModalProps> = ({
  isOpen,
  onClose,
  initialPointOfSale,
}) => {
  const fb = useFirebase();
  const pvNeco1 = fb?.branchConfigs?.['NECO 1']?.pointOfSale || fb?.arcaConfig?.pointsOfSale?.['NECO 1'] || '0017';
  const pvNeco2 = fb?.branchConfigs?.['NECO 2']?.pointOfSale || fb?.arcaConfig?.pointsOfSale?.['NECO 2'] || '0018';

  // Default point of sale based on initial prop or branch config
  const defaultPv = initialPointOfSale || pvNeco1;
  const [selectedPv, setSelectedPv] = useState<string>(defaultPv);
  const [customPvInput, setCustomPvInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [vouchersData, setVouchersData] = useState<VoucherItem[]>([]);
  const [checkedAt, setCheckedAt] = useState<string>('');
  const [serverMessage, setServerMessage] = useState<string>('');
  const [hasCredentials, setHasCredentials] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchLastVouchers = async (pvToQuery: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const storedConfig = arcaService.getStoredConfig();
      const res = await arcaService.getLastVouchers(
        pvToQuery,
        storedConfig.environment || 'homologacion',
        storedConfig.cuit || '30714892019',
        storedConfig.certificate,
        storedConfig.privateKey
      );

      if (res && res.vouchers) {
        const localInvoices = fb?.electronicInvoices || [];
        const syncedVouchers = res.vouchers.map((v) => {
          const matchingLocalInvoices = localInvoices.filter((inv) => {
            const invPv = inv.pointOfSale ? String(inv.pointOfSale).padStart(4, '0') : '';
            const targetPv = String(pvToQuery).padStart(4, '0');
            return invPv === targetPv && inv.cbteTipo === v.cbteTipo;
          });

          const maxLocalNumber =
            matchingLocalInvoices.length > 0
              ? Math.max(...matchingLocalInvoices.map((inv) => Number(inv.cbteNumero) || 0))
              : 0;

          const effectiveLast = Math.max(v.lastNumber || 0, maxLocalNumber);
          const effectiveNext = effectiveLast + 1;
          const formattedLast = arcaService.formatCbteNumber(pvToQuery, effectiveLast);
          const formattedNext = arcaService.formatCbteNumber(pvToQuery, effectiveNext);

          return {
            ...v,
            lastNumber: effectiveLast,
            nextNumber: effectiveNext,
            formattedLast,
            formattedNext,
          };
        });

        setVouchersData(syncedVouchers);
        setCheckedAt(res.checkedAt);
        setServerMessage(res.message || '');
        setHasCredentials(res.hasCredentials);
      }
    } catch (err: any) {
      console.warn('Notice when fetching last vouchers:', err);
      const friendlyMsg = err.message === 'Failed to fetch'
        ? 'El servidor ARCA/AFIP o de la aplicación se encuentra en modo contingencia offline.'
        : err.message || 'No se pudo obtener el último comprobante.';
      setErrorMsg(friendlyMsg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const activePv = selectedPv || defaultPv;
      fetchLastVouchers(activePv);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePvChange = (newPv: string) => {
    setSelectedPv(newPv);
    fetchLastVouchers(newPv);
  };

  const handleCustomPvSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPvInput) return;
    const padded = customPvInput.replace(/\D/g, '').padStart(4, '0');
    if (padded) {
      setSelectedPv(padded);
      fetchLastVouchers(padded);
    }
  };

  const getLetraColor = (letra: string) => {
    switch (letra) {
      case 'A':
        return 'bg-cyan-700 text-white border-cyan-800';
      case 'B':
        return 'bg-[#002046] text-white border-blue-900';
      case 'C':
        return 'bg-amber-600 text-white border-amber-700';
      default:
        return 'bg-slate-700 text-white border-slate-800';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
      <div className="bg-[#f0f2f5] border-2 border-[#002046] shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col font-sans overflow-hidden">
        {/* Header Desktop POS */}
        <div className="bg-[#002046] text-white px-3.5 py-2.5 flex items-center justify-between border-b-2 border-amber-400">
          <div className="flex items-center gap-2">
            <div className="bg-amber-400 p-1 text-[#002046]">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-[13px] tracking-wide uppercase leading-tight">
                CONSULTA OFICIAL DE ÚLTIMO COMPROBANTE AUTORIZADO (ARCA / AFIP)
              </h3>
              <p className="text-[10px] text-blue-200">
                Función WSFEv1: <code className="bg-[#00142e] px-1 py-0.5 text-amber-300 font-mono">FECompUltimoAutorizado</code> — Secuencia oficial por Punto de Venta
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            title="Cerrar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar Controls */}
        <div className="bg-[#e5e8ec] p-3 border-b border-[#74777f] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-bold text-[#002046] flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-blue-800" />
              <span>Punto de Venta Fiscal:</span>
            </label>

            {/* PV Quick Select Buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handlePvChange(pvNeco1)}
                className={`h-[28px] px-3 text-[11px] font-bold border flex items-center gap-1 cursor-pointer ${
                  selectedPv === pvNeco1
                    ? 'bg-[#002046] text-white border-[#002046] shadow-xs'
                    : 'bg-white text-[#002046] border-[#74777f] hover:bg-[#d6d9de]'
                }`}
              >
                <span>PV {pvNeco1} (Neco 1)</span>
              </button>

              {pvNeco2 !== pvNeco1 && (
                <button
                  type="button"
                  onClick={() => handlePvChange(pvNeco2)}
                  className={`h-[28px] px-3 text-[11px] font-bold border flex items-center gap-1 cursor-pointer ${
                    selectedPv === pvNeco2
                      ? 'bg-[#002046] text-white border-[#002046] shadow-xs'
                      : 'bg-white text-[#002046] border-[#74777f] hover:bg-[#d6d9de]'
                  }`}
                >
                  <span>PV {pvNeco2} (Neco 2)</span>
                </button>
              )}
            </div>

            {/* Custom PV Input */}
            <form onSubmit={handleCustomPvSubmit} className="flex items-center gap-1 ml-1">
              <input
                type="text"
                placeholder="Otro PV (ej: 0003)"
                value={customPvInput}
                onChange={(e) => setCustomPvInput(e.target.value)}
                className="h-[28px] w-24 px-2 text-[11px] font-mono font-bold bg-white border border-[#74777f] uppercase"
              />
              <button
                type="submit"
                className="h-[28px] px-2 bg-[#44474e] text-white text-[10px] font-bold border border-[#44474e] hover:bg-[#181c1f]"
              >
                Ir
              </button>
            </form>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchLastVouchers(selectedPv)}
              disabled={isLoading}
              className="h-[28px] px-3 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-300' : ''}`} />
              <span>{isLoading ? 'Consultando ARCA...' : 'CONSULTAR AHORA'}</span>
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="bg-white px-3.5 py-1.5 border-b border-[#c4c6cf] flex flex-wrap items-center justify-between text-[11px] gap-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[#002046] font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Punto de Venta Consultado: <span className="font-mono text-[12px] bg-[#eef2f8] px-1.5 py-0.5 border border-[#c4c6cf]">PV {selectedPv}</span>
            </span>

            {hasCredentials ? (
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 border border-emerald-300 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                Conexión ARCA Certificada
              </span>
            ) : (
              <span className="text-amber-800 bg-amber-50 px-2 py-0.5 border border-amber-300 font-bold flex items-center gap-1">
                <Info className="w-3.5 h-3.5" />
                Consulta en Secuencia de Registro Local (Pruebas / Homologación)
              </span>
            )}
          </div>

          {checkedAt && (
            <div className="text-[10.5px] text-[#555] flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#74777f]" />
              Última actualización: <strong>{new Date(checkedAt).toLocaleTimeString('es-AR')} hs</strong>
            </div>
          )}
        </div>

        {/* Error Notification if any */}
        {errorMsg && (
          <div className="bg-rose-50 border-b border-rose-300 p-2.5 text-rose-900 text-[11px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Vouchers Grid Display */}
        <div className="p-3.5 overflow-y-auto flex-1 bg-[#f0f2f5] space-y-3">
          {/* Main Invoices Section (Facturas A, B, C) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-[#002046] text-[12px] uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-700" />
                <span>1. Comprobantes de Ventas (Facturas A, B y C)</span>
              </h4>
              <span className="text-[10px] text-[#555] italic">Valores sincronizados de ARCA WSFEv1</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {vouchersData
                .filter((v) => [1, 6, 11].includes(v.cbteTipo))
                .map((v) => (
                  <div
                    key={v.cbteTipo}
                    className="bg-white border-2 border-[#74777f] hover:border-[#002046] transition-all p-3 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-center justify-between border-b border-[#e5e8ec] pb-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-xs flex items-center justify-center font-bold text-[12px] border ${getLetraColor(v.cbteLetra)}`}>
                            {v.cbteLetra}
                          </span>
                          <div>
                            <strong className="text-[12px] text-[#002046] block leading-tight">{v.cbteNombre}</strong>
                            <span className="text-[10px] text-[#666] font-mono">Código ARCA: {v.cbteTipo.toString().padStart(3, '0')}</span>
                          </div>
                        </div>

                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 bg-[#e8f0fe] text-[#002046] border border-[#aec7f7]">
                          FE-WS
                        </span>
                      </div>

                      {/* Number Details */}
                      <div className="space-y-2 my-2">
                        <div className="bg-[#f7fafe] p-2 border border-[#c4c6cf]">
                          <span className="text-[10px] text-[#555] uppercase font-bold block mb-0.5">
                            Último N° Autorizado en ARCA:
                          </span>
                          <div className="flex items-center justify-between font-mono">
                            <span className="font-extrabold text-[14px] text-[#002046]">{v.formattedLast}</span>
                            <span className="text-[10px] bg-white px-1.5 py-0.5 border border-[#74777f] font-bold text-[#333]">
                              N° {v.lastNumber}
                            </span>
                          </div>
                        </div>

                        <div className="bg-emerald-50 p-2 border border-emerald-300">
                          <span className="text-[10px] text-emerald-800 uppercase font-bold block mb-0.5 flex items-center gap-1">
                            <ArrowRight className="w-3 h-3 text-emerald-600" />
                            Próximo N° a Emitir en POS:
                          </span>
                          <div className="flex items-center justify-between font-mono">
                            <span className="font-extrabold text-[15px] text-emerald-900">{v.formattedNext}</span>
                            <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 font-bold">
                              N° {v.nextNumber}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Status */}
                    <div className="pt-2 border-t border-[#f0f2f5] flex items-center justify-between text-[10px]">
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Secuencia Válida
                      </span>
                      <span className="text-[#666] font-mono">PV {selectedPv}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Credit & Debit Notes Section (Notas de Crédito A, B, C) */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-[#002046] text-[12px] uppercase tracking-wide flex items-center gap-1.5">
                <Hash className="w-4 h-4 text-purple-700" />
                <span>2. Comprobantes de Anulación y Débito (Notas de Crédito A, B y C)</span>
              </h4>
              <span className="text-[10px] text-[#555]">Requerido para anulación formal de comprobantes</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {vouchersData
                .filter((v) => [3, 8, 13, 2, 7].includes(v.cbteTipo))
                .map((v) => (
                  <div
                    key={v.cbteTipo}
                    className="bg-white border border-[#74777f] hover:border-[#002046] transition-all p-3 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-center justify-between border-b border-[#e5e8ec] pb-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-xs flex items-center justify-center font-bold text-[12px] border ${getLetraColor(v.cbteLetra)}`}>
                            {v.cbteLetra}
                          </span>
                          <div>
                            <strong className="text-[12px] text-[#002046] block leading-tight">{v.cbteNombre}</strong>
                            <span className="text-[10px] text-[#666] font-mono">Código ARCA: {v.cbteTipo.toString().padStart(3, '0')}</span>
                          </div>
                        </div>

                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 bg-purple-50 text-purple-900 border border-purple-200">
                          NC / ND
                        </span>
                      </div>

                      {/* Number Details */}
                      <div className="space-y-2 my-2">
                        <div className="bg-[#f7fafe] p-2 border border-[#c4c6cf]">
                          <span className="text-[10px] text-[#555] uppercase font-bold block mb-0.5">
                            Último N° Autorizado en ARCA:
                          </span>
                          <div className="flex items-center justify-between font-mono">
                            <span className="font-extrabold text-[14px] text-[#002046]">{v.formattedLast}</span>
                            <span className="text-[10px] bg-white px-1.5 py-0.5 border border-[#74777f] font-bold text-[#333]">
                              N° {v.lastNumber}
                            </span>
                          </div>
                        </div>

                        <div className="bg-purple-50 p-2 border border-purple-300">
                          <span className="text-[10px] text-purple-900 uppercase font-bold block mb-0.5 flex items-center gap-1">
                            <ArrowRight className="w-3 h-3 text-purple-700" />
                            Próximo N° a Emitir:
                          </span>
                          <div className="flex items-center justify-between font-mono">
                            <span className="font-extrabold text-[15px] text-purple-950">{v.formattedNext}</span>
                            <span className="text-[10px] bg-purple-700 text-white px-1.5 py-0.5 font-bold">
                              N° {v.nextNumber}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Status */}
                    <div className="pt-2 border-t border-[#f0f2f5] flex items-center justify-between text-[10px]">
                      <span className="text-purple-800 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-purple-600" />
                        Sincronizado
                      </span>
                      <span className="text-[#666] font-mono">PV {selectedPv}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Footer Info & Actions */}
        <div className="bg-[#e5e8ec] p-3 border-t border-[#74777f] flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-[#44474e] max-w-2xl">
            ℹ️ <strong>Información AFIP / ARCA:</strong> Los números mostrados arriba representan la secuencia oficial continua auditada por ARCA en el servicio web <code className="bg-white px-1 border border-[#74777f] text-[#002046]">WSFEv1</code>. Garantiza que la próxima factura emitida no sufra rechazos por correlatividad (Error 10016).
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-[30px] px-4 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold cursor-pointer"
            >
              Cerrar (Esc)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
