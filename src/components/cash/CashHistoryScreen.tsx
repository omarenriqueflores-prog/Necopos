import React, { useState, useEffect } from 'react';
import { History, Printer, Search, Download, Eye, Lock, Trash2 } from 'lucide-react';
import { CashClosure, UserAccount, BranchConfig } from '../../types/pos';
import { formatCurrency } from '../../utils/scaleParser';
import { WindowsModal } from '../common/WindowsModal';
import { useDialog } from '../../context/DialogContext';
import { useFirebase } from '../../context/FirebaseContext';
import { printClosureTicket, formatCleanOperatorName } from '../../utils/closureTicketGenerator';
import { formatSafeClosureDate } from '../../utils/scheduleHelper';

interface CashHistoryScreenProps {
  closures: CashClosure[];
  currentUser?: UserAccount;
  currentBranch?: BranchConfig;
}

export const CashHistoryScreen: React.FC<CashHistoryScreenProps> = ({
  closures,
  currentUser,
  currentBranch,
}) => {
  const { showAlert, showConfirm } = useDialog();
  const { purgeAutoClosures } = useFirebase();
  const isAdmin = currentUser?.role === 'SUPERADMIN' || currentUser?.role === 'ADMIN';
  const userBranch = currentUser?.branch || currentBranch?.id || 'NECO 1';

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>(() => (isAdmin ? 'TODAS' : userBranch));
  const [selectedClosure, setSelectedClosure] = useState<CashClosure | null>(closures[0] || null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  // Asegurar que si el usuario no es admin, el filtro permanezca estrictamente en su sucursal
  useEffect(() => {
    if (!isAdmin) {
      setBranchFilter(userBranch);
    }
  }, [isAdmin, userBranch]);

  const effectiveBranch = isAdmin ? branchFilter : userBranch;

  // Filtrar estrictamente excluyendo cualquier tipo de cierre automático del sistema
  const filteredClosures = closures.filter((c) => {
    const isAuto =
      c.id.startsWith('Z-AUTO') ||
      c.operator.includes('AUTOMÁTICO') ||
      c.notes?.includes('[AUTO-SISTEMA]') ||
      c.shift?.includes('AUTOMÁTICO');

    // Descartar cierres automáticos completamente
    if (isAuto) return false;

    if (effectiveBranch !== 'TODAS' && c.branch !== effectiveBranch) return false;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.operator.toLowerCase().includes(term) ||
      c.register.toLowerCase().includes(term) ||
      c.id.toLowerCase().includes(term) ||
      c.date.includes(term)
    );
  });

  const handlePurgeAutoClosures = async () => {
    const confirmed = await showConfirm(
      '¿Está seguro de eliminar de la base de datos todos los cierres automáticos registrados por el sistema?'
    );
    if (confirmed) {
      await purgeAutoClosures();
      await showAlert('Se han eliminado todos los cierres automáticos de la base de datos.');
    }
  };

  const handlePrintClosure = (closure: CashClosure) => {
    printClosureTicket(closure, currentBranch);
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-80px)] select-none bg-[#ebeef2] text-[#181c1f] font-sans p-1">
      {/* Top Bar */}
      <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <label className="text-[11px] font-bold text-[#002046] uppercase whitespace-nowrap">
            Buscar cierre:
          </label>
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Operador, ID de cierre Z o fecha..."
              className="w-full h-[26px] px-2 bg-[#f7fafe] border border-[#74777f] text-[12px] font-semibold text-[#002046] focus:bg-white focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-[#74777f] absolute right-2 top-1.5" />
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={handlePurgeAutoClosures}
            className="h-[26px] px-2.5 bg-[#ba1a1a] hover:bg-[#93000a] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
            title="Limpiar base de datos de todos los cierres automáticos generados previamente"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpiar Cierres Auto BD</span>
          </button>
        )}

        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-[#44474e] uppercase">Sucursal:</label>
          {isAdmin ? (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-[26px] px-2 bg-white border border-[#74777f] text-[12px] font-semibold cursor-pointer"
            >
              <option value="TODAS">Todas las Sucursales</option>
              <option value="NECO 1">NECO 1 (Central)</option>
              <option value="NECO 2">NECO 2 (Villa Saavedra)</option>
            </select>
          ) : (
            <div
              className="h-[26px] px-2.5 bg-[#ebeef2] border border-[#74777f] text-[12px] font-bold text-[#002046] flex items-center gap-1.5 select-none"
              title="Vista restringida a su sucursal asignada"
            >
              <Lock className="w-3 h-3 text-[#74777f]" />
              <span>{userBranch === 'NECO 1' ? 'NECO 1 (Central)' : 'NECO 2 (Villa Saavedra)'}</span>
              <span className="text-[10px] text-[#74777f] font-normal">(Asignada)</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            disabled={!selectedClosure}
            onClick={() => selectedClosure && handlePrintClosure(selectedClosure)}
            className="h-[26px] px-3 bg-[#2e7d32] hover:bg-[#1b5e20] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40 shadow-sm"
            title="Imprimir el cierre seleccionado en la impresora térmica de 80mm"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir 80mm</span>
          </button>
          <button
            disabled={!selectedClosure}
            onClick={() => setIsDetailModalOpen(true)}
            className="h-[26px] px-3 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Ver Comprobante Z</span>
          </button>
          <button
            onClick={async () => await showAlert('Listado de cierres exportado a Excel.')}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#44474e]" />
            <span>Exportar</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-[#74777f] shadow-sm flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
          <div className="flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-[#aec7f7]" />
            <span>HISTORIAL DE CIERRES FISCALES Z Y ARQUEOS CONSOLIDADOS</span>
          </div>
          <div className="font-mono text-[11px] text-[#d4e3ff]">
            {filteredClosures.length} CIERRES HISTÓRICOS REGISTRADOS {!isAdmin && `[${userBranch}]`}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-max text-left border-collapse select-none text-[12px] whitespace-nowrap">
            <thead className="sticky top-0 bg-[#e5e8ec] text-[#181c1f] font-bold text-[11px] border-b border-[#74777f]">
              <tr className="h-[28px] whitespace-nowrap">
                <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">FECHA / HORA</th>
                <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">SUCURSAL</th>
                <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">CAJA</th>
                <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">CAJERO / OPERADOR</th>
                <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">TURNO</th>
                <th className="px-3 text-right border-r border-[#c4c6cf] whitespace-nowrap">TOTAL VENTAS</th>
                <th className="px-3 text-right border-r border-[#c4c6cf] whitespace-nowrap">EFECTIVO ESP.</th>
                <th className="px-3 text-right border-r border-[#c4c6cf] whitespace-nowrap">EFECTIVO REAL</th>
                <th className="px-3 text-right border-r border-[#c4c6cf] whitespace-nowrap">DIFERENCIA</th>
                <th className="px-3 text-center border-r border-[#c4c6cf] whitespace-nowrap">ESTADO</th>
                <th className="px-2 text-center whitespace-nowrap">ACCIONES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ebeef2]">
              {filteredClosures.map((c, idx) => {
                const isSelected = selectedClosure?.id === c.id;
                const isAuto = c.id.startsWith('Z-AUTO') || c.operator.includes('AUTOMÁTICO') || c.notes?.includes('[AUTO-SISTEMA]');
                const displayDate = formatSafeClosureDate(c.date);

                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedClosure(c)}
                    onDoubleClick={() => setIsDetailModalOpen(true)}
                    className={`h-[28px] cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? 'bg-[#002046] text-white font-bold'
                        : idx % 2 === 0
                        ? 'bg-white hover:bg-[#e5e8ec]'
                        : 'bg-[#f1f4f8] hover:bg-[#e5e8ec]'
                    }`}
                  >
                    <td className="px-3 font-mono text-[11px] border-r border-[#c4c6cf] whitespace-nowrap">
                      {displayDate}
                    </td>
                    <td className="px-3 font-bold text-[11px] border-r border-[#c4c6cf] whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] whitespace-nowrap ${
                          isSelected
                            ? 'bg-[#1b365d]'
                            : c.branch === 'NECO 1'
                            ? 'bg-[#d6e3ff] text-[#002046]'
                            : 'bg-[#ebeef2] text-[#44474e]'
                        }`}
                      >
                        {c.branch}
                      </span>
                    </td>
                    <td className="px-3 font-mono text-[11px] border-r border-[#c4c6cf] whitespace-nowrap">
                      {c.register}
                    </td>
                    <td className="px-3 border-r border-[#c4c6cf] font-semibold whitespace-nowrap">
                      <span className="font-bold">{formatCleanOperatorName(c.operator)}</span>
                    </td>
                    <td className="px-3 text-[11px] border-r border-[#c4c6cf] whitespace-nowrap">{c.shift}</td>
                    <td className="px-3 text-right font-mono font-bold text-[12px] border-r border-[#c4c6cf] whitespace-nowrap">
                      {formatCurrency(c.totalSales)}
                    </td>
                    <td className="px-3 text-right font-mono text-[11px] border-r border-[#c4c6cf] whitespace-nowrap">
                      <span className={isSelected ? 'text-white' : 'text-[#44474e]'}>
                        {formatCurrency(c.expectedCash)}
                      </span>
                    </td>
                    <td className="px-3 text-right font-mono font-bold text-[12px] border-r border-[#c4c6cf] whitespace-nowrap">
                      {formatCurrency(c.actualCash)}
                    </td>
                    <td
                      className={`px-3 text-right font-mono font-bold text-[12px] border-r border-[#c4c6cf] whitespace-nowrap ${
                        c.difference === 0
                          ? isSelected
                            ? 'text-white'
                            : 'text-[#002046]'
                          : isSelected
                          ? 'text-[#ffdad6]'
                          : 'text-[#aa3531]'
                      }`}
                    >
                      {formatCurrency(c.difference)}
                    </td>
                    <td className="text-center px-1 border-r border-[#c4c6cf]">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 font-bold ${
                          c.status === 'CONCILIADO'
                            ? isSelected
                              ? 'bg-[#1b365d] text-white'
                              : 'bg-[#d6e3ff] text-[#002046]'
                            : 'bg-[#ffdad6] text-[#aa3531]'
                        }`}
                      >
                        {c.status === 'CONCILIADO' ? 'CONCILIADO' : 'CON DIFERENCIA'}
                      </span>
                    </td>
                    <td className="text-center px-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrintClosure(c);
                        }}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer mx-auto transition-colors ${
                          isSelected
                            ? 'bg-[#2e7d32] hover:bg-[#1b5e20] text-white'
                            : 'bg-[#ebeef2] hover:bg-[#d6e3ff] text-[#002046] border border-[#74777f]'
                        }`}
                        title="Imprimir ticket térmico de 80mm"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Imprimir</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: View Z Closure Document */}
      <WindowsModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`DETALLE DE CIERRE FISCAL Z - ${selectedClosure?.id}`}
        maxWidth="max-w-md"
      >
        {selectedClosure && (
          <div className="flex flex-col gap-2 p-1 text-[12px]">
            <div className="bg-[#fffdfa] p-3 border border-[#74777f] font-mono text-[11px] flex flex-col gap-1 leading-tight">
              <div className="text-center font-bold text-[13px]">CARNICERÍAS NECO</div>
              <div className="text-center">CIERRE FISCAL DIARIO / Z</div>
              <div className="text-center">COMPROBANTE N°: {selectedClosure.id}</div>
              {(selectedClosure.id.startsWith('Z-AUTO') || selectedClosure.operator.includes('AUTOMÁTICO') || selectedClosure.notes?.includes('[AUTO-SISTEMA]')) && (
                <div className="bg-[#d6e3ff] text-[#002046] px-2 py-0.5 text-center font-bold my-1 border border-[#aec7f7]">
                  CIERRE Z AUTOMÁTICO (FIN DE JORNADA)
                </div>
              )}
              <div className="border-b border-dashed border-[#181c1f] my-1" />

              <div className="flex justify-between">
                <span>FECHA Y HORA:</span>
                <span>{selectedClosure.date}</span>
              </div>
              <div className="flex justify-between">
                <span>SUCURSAL:</span>
                <span>{selectedClosure.branch}</span>
              </div>
              <div className="flex justify-between">
                <span>CAJA:</span>
                <span>{selectedClosure.register}</span>
              </div>
              <div className="flex justify-between font-bold bg-[#f0f4f8] p-1 border border-[#c4c6cf]">
                <span className="text-[#002046]">OPERADOR / CAJERO:</span>
                <span className="text-[#002046]">{formatCleanOperatorName(selectedClosure.operator)}</span>
              </div>
              <div className="border-b border-dashed border-[#181c1f] my-1" />

              {/* COMPROBANTES FISCALES */}
              <div className="flex justify-between">
                <span>FACTURAS A:</span>
                <span>{formatCurrency(selectedClosure.invoicesA || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>FACTURAS B:</span>
                <span>{formatCurrency(selectedClosure.invoicesB || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>RECIBOS COMUNES:</span>
                <span>{formatCurrency(selectedClosure.commonReceipts || 0)}</span>
              </div>
              <div className="flex justify-between font-bold text-[13px] py-0.5 border-y border-dashed border-[#181c1f]">
                <span>TOTAL FACTURADO:</span>
                <span>{formatCurrency(selectedClosure.totalSales || 0)}</span>
              </div>

              {/* MEDIOS DE PAGO */}
              <div className="border-b border-dashed border-[#181c1f] my-1" />
              <div className="font-bold text-[#002046]">DESGLOSE POR MEDIO DE PAGO:</div>
              <div className="flex justify-between">
                <span>• EFECTIVO:</span>
                <span className="font-bold">{formatCurrency(selectedClosure.cashAmount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>• QR (BILLETERAS):</span>
                <span className="font-bold">{formatCurrency(selectedClosure.qrAmount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>• TRANSFERENCIAS:</span>
                <span className="font-bold">{formatCurrency(selectedClosure.transferAmount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>• TARJETAS (DÉB./CRÉD.):</span>
                <span className="font-bold">{formatCurrency(selectedClosure.cardAmount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>• CTA. CTE. (FIADOS):</span>
                <span className="font-bold text-[#aa3531]">{formatCurrency(selectedClosure.currentAccountAmount || 0)}</span>
              </div>
              {selectedClosure.combinedSalesTotal !== undefined && selectedClosure.combinedSalesTotal > 0 && (
                <div className="flex justify-between text-[#44474e]">
                  <span>• PAGOS COMBINADOS:</span>
                  <span>{formatCurrency(selectedClosure.combinedSalesTotal)}</span>
                </div>
              )}

              {/* EFECTIVO */}
              <div className="border-b border-dashed border-[#181c1f] my-1" />
              <div className="font-bold text-[#002046]">ARQUEO EFECTIVO EN GAVETA:</div>
              <div className="flex justify-between">
                <span>EFECTIVO ESPERADO:</span>
                <span>{formatCurrency(selectedClosure.expectedCash || 0)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>EFECTIVO REAL CONTADO:</span>
                <span>{formatCurrency(selectedClosure.actualCash || 0)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>DIFERENCIA EFECTIVO:</span>
                <span className={selectedClosure.difference === 0 ? 'text-[#00522c]' : 'text-[#aa3531]'}>
                  {formatCurrency(selectedClosure.difference || 0)}
                </span>
              </div>

              {/* POSNET (TARJETAS + QR) */}
              <div className="border-b border-dashed border-[#181c1f] my-1" />
              <div className="font-bold text-[#002046]">CIERRE DE LOTE POSNET (TARJETAS + QR):</div>
              <div className="flex justify-between">
                <span>POSNET ESPERADO (TARJ+QR):</span>
                <span>
                  {formatCurrency(
                    selectedClosure.expectedPosnet ??
                      (selectedClosure.expectedCard ?? selectedClosure.cardAmount ?? 0) +
                        (selectedClosure.qrAmount ?? 0)
                  )}
                </span>
              </div>
              <div className="flex justify-between font-bold">
                <span>CIERRE REAL / TICKET POSNET:</span>
                <span>
                  {formatCurrency(
                    selectedClosure.actualPosnet ??
                      selectedClosure.actualCard ??
                      selectedClosure.cardAmount ??
                      0
                  )}
                </span>
              </div>
              <div className="flex justify-between font-bold">
                <span>DIFERENCIA POSNET:</span>
                <span className={(selectedClosure.posnetDifference ?? selectedClosure.cardDifference ?? 0) === 0 ? 'text-[#00522c]' : 'text-[#aa3531]'}>
                  {formatCurrency(selectedClosure.posnetDifference ?? selectedClosure.cardDifference ?? 0)}
                </span>
              </div>

              {/* TRANSFERENCIAS BANCARIAS */}
              <div className="border-b border-dashed border-[#181c1f] my-1" />
              <div className="font-bold text-[#002046]">TRANSFERENCIAS BANCARIAS (APP/BANCO):</div>
              <div className="flex justify-between">
                <span>TRANSF. ESPERADAS:</span>
                <span>{formatCurrency(selectedClosure.expectedTransfer ?? selectedClosure.transferAmount ?? 0)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>REAL VERIFICADO EN BANCO:</span>
                <span>{formatCurrency(selectedClosure.actualTransfer ?? selectedClosure.transferAmount ?? 0)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>DIFERENCIA BANCO:</span>
                <span className={(selectedClosure.transferDifference ?? 0) === 0 ? 'text-[#00522c]' : 'text-[#aa3531]'}>
                  {formatCurrency(selectedClosure.transferDifference ?? 0)}
                </span>
              </div>

              {/* CUENTAS CORRIENTES */}
              <div className="border-b border-dashed border-[#181c1f] my-1" />
              <div className="font-bold text-[#002046]">SALIDAS CUENTA CORRIENTE (FIADOS):</div>
              <div className="flex justify-between font-bold">
                <span>TOTAL A COBRAR EN CTA. CTE.:</span>
                <span>{formatCurrency(selectedClosure.currentAccountAmount ?? 0)}</span>
              </div>
              {selectedClosure.currentAccountDetails && selectedClosure.currentAccountDetails.length > 0 && (
                <div className="mt-1 bg-white p-1 border border-[#c4c6cf] text-[10px]">
                  <div className="font-bold mb-0.5 text-[#44474e]">Detalle de Clientes ({selectedClosure.currentAccountDetails.length}):</div>
                  {selectedClosure.currentAccountDetails.map((cad, idx) => (
                    <div key={idx} className="flex justify-between border-b border-[#f1f4f8] py-0.5">
                      <span className="truncate max-w-[170px]">{cad.customerName}</span>
                      <span className="font-bold">{formatCurrency(cad.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {selectedClosure.notes && (
                <>
                  <div className="border-b border-dashed border-[#181c1f] my-1" />
                  <div className="text-[10px] text-[#44474e] italic">
                    <strong>OBSERVACIONES:</strong> {selectedClosure.notes}
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#c4c6cf]">
              <button
                type="button"
                onClick={() => handlePrintClosure(selectedClosure)}
                className="h-[28px] px-3 bg-[#2e7d32] hover:bg-[#1b5e20] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir Ticket Térmico (80mm)</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                className="h-[28px] px-4 bg-[#002046] hover:bg-[#1b365d] text-white font-bold text-[11px] cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </WindowsModal>
    </div>
  );
};
