import React, { useState } from 'react';
import {
  ArrowRightLeft,
  Truck,
  PlusCircle,
  Printer,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Send,
  AlertCircle,
} from 'lucide-react';
import { useFirebase } from '../../context/FirebaseContext';
import { StockTransfer } from '../../types/pos';
import { formatKg, formatCurrency, printTransferRemito } from '../../utils/stockHelper';

interface StockTransfersTabProps {
  onOpenNewTransfer: () => void;
  onViewTransferDetail: (transfer: StockTransfer) => void;
}

export const StockTransfersTab: React.FC<StockTransfersTabProps> = ({
  onOpenNewTransfer,
  onViewTransferDetail,
}) => {
  const { stockTransfers, dispatchStockTransfer, receiveStockTransfer, cancelStockTransfer, branchConfigs, localUser, user } = useFirebase();

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [cancelModalTransfer, setCancelModalTransfer] = useState<StockTransfer | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{
    type: 'DISPATCH' | 'RECEIVE';
    transfer: StockTransfer;
  } | null>(null);

  const operatorName = localUser?.fullName || user?.displayName || localUser?.username || 'Encargado de Cámara';

  const handleConfirmAction = async () => {
    if (!actionModal) return;
    const { type, transfer } = actionModal;
    try {
      setProcessingId(transfer.id);
      setErrorMessage(null);
      if (type === 'DISPATCH') {
        await dispatchStockTransfer(transfer, operatorName);
      } else {
        await receiveStockTransfer(transfer, operatorName);
      }
      setActionModal(null);
    } catch (err: any) {
      console.error(`Error en traslado (${type}):`, err);
      setErrorMessage(`Error al procesar traslado: ${err.message || 'Error inesperado'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelModalTransfer) return;
    try {
      setProcessingId(cancelModalTransfer.id);
      setErrorMessage(null);
      await cancelStockTransfer(cancelModalTransfer, operatorName, cancelReason);
      setCancelModalTransfer(null);
      setCancelReason('');
    } catch (err: any) {
      console.error('Error al cancelar traslado:', err);
      setErrorMessage(`Error al cancelar traslado: ${err.message || 'Error inesperado'}`);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* TOOLBAR */}
      <div className="win-toolbar p-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Truck className="w-5 h-5 text-blue-800" />
          <div>
            <div className="font-bold text-xs text-gray-900">Traslado y Despacho de Cámaras Frigoríficas</div>
            <div className="text-[10px] text-gray-500">
              Control de flujo de cortes de carne entre NECO 1 y NECO 2 con emisión de remitos oficiales
            </div>
          </div>
        </div>

        <button
          onClick={onOpenNewTransfer}
          className="win-button py-1.5 px-3 flex items-center space-x-1.5 text-xs font-bold text-blue-900 bg-white cursor-pointer"
        >
          <PlusCircle className="w-4 h-4 text-blue-700" />
          <span>Nuevo Traslado Inter-Sucursal</span>
        </button>
      </div>

      {errorMessage && (
        <div className="p-2.5 bg-red-50 border border-red-300 rounded text-xs text-red-800 flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="font-bold text-gray-500 hover:text-gray-800 ml-2">✕</button>
        </div>
      )}

      {/* TABLA DE TRASLADOS */}
      <div className="win-panel flex-1 overflow-auto bg-white">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-[#002046] text-white sticky top-0 z-10 select-none">
            <tr>
              <th className="p-2 border border-[#00152e] w-32">REMITO Nº</th>
              <th className="p-2 border border-[#00152e] w-28">FECHA</th>
              <th className="p-2 border border-[#00152e] w-48 text-center">TRAYECTO (ORIGEN ➔ DESTINO)</th>
              <th className="p-2 border border-[#00152e] w-28 text-center">ESTADO</th>
              <th className="p-2 border border-[#00152e] w-28 text-right">TOTAL KILOS</th>
              <th className="p-2 border border-[#00152e] w-32 text-right">VALOR COMERCIAL</th>
              <th className="p-2 border border-[#00152e]">TRANSPORTE / CHOFER</th>
              <th className="p-2 border border-[#00152e] w-32">RESPONSABLE</th>
              <th className="p-2 border border-[#00152e] w-56 text-center">ACCIONES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 font-sans">
            {stockTransfers.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-gray-500 italic">
                  No hay traslados de mercadería registrados. Hacé clic en "Nuevo Traslado Inter-Sucursal" para iniciar un remito de cámara.
                </td>
              </tr>
            ) : (
              stockTransfers.map((t, index) => {
                const isProcessing = processingId === t.id;
                return (
                  <tr
                    key={t.id}
                    className={`hover:bg-blue-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }`}
                  >
                    <td className="p-2 border border-gray-200 font-mono font-bold text-blue-900">
                      {t.transferNumber}
                    </td>
                    <td className="p-2 border border-gray-200 text-gray-700 whitespace-nowrap">
                      {t.createdAt}
                    </td>
                    <td className="p-2 border border-gray-200 text-center font-bold">
                      <span className="text-blue-700">{t.originBranch}</span>
                      <span className="mx-1.5 text-gray-400">➔</span>
                      <span className="text-purple-700">{t.destinationBranch}</span>
                    </td>

                    {/* Estado */}
                    <td className="p-2 border border-gray-200 text-center">
                      {t.status === 'BORRADOR' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          BORRADOR
                        </span>
                      )}
                      {t.status === 'EN_TRANSITO' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 animate-pulse">
                          EN TRÁNSITO
                        </span>
                      )}
                      {t.status === 'RECIBIDA' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800 border border-green-300">
                          RECIBIDA
                        </span>
                      )}
                      {t.status === 'CANCELADA' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-300 line-through">
                          CANCELADA
                        </span>
                      )}
                    </td>

                    <td className="p-2 border border-gray-200 text-right font-mono font-bold text-gray-900">
                      {formatKg(t.totalKilos)}
                    </td>
                    <td className="p-2 border border-gray-200 text-right font-mono font-bold text-green-900">
                      {formatCurrency(t.totalCommercialValue)}
                    </td>
                    <td className="p-2 border border-gray-200 text-gray-700 text-xs truncate max-w-[150px]">
                      {t.driverName ? `${t.driverName} (${t.vehiclePlate || '-'})` : '-'}
                    </td>
                    <td className="p-2 border border-gray-200 text-gray-700 text-xs">
                      <div>{t.createdByUser}</div>
                      {t.receivedByUser && (
                        <div className="text-[10px] text-green-700">Rec: {t.receivedByUser}</div>
                      )}
                    </td>

                    {/* Botones de acción según el estado */}
                    <td className="p-2 border border-gray-200 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        {/* Ver Detalle */}
                        <button
                          onClick={() => onViewTransferDetail(t)}
                          className="win-button p-1 text-xs text-gray-800"
                          title="Ver detalle del remito de traslado"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-700" />
                        </button>

                        {/* Imprimir Remito */}
                        <button
                          onClick={() => printTransferRemito(t, branchConfigs)}
                          className="win-button p-1 text-xs text-gray-800"
                          title="Imprimir remito de cámara oficial"
                        >
                          <Printer className="w-3.5 h-3.5 text-gray-700" />
                        </button>

                        {/* Despachar (si es borrador) */}
                        {t.status === 'BORRADOR' && (
                          <button
                            disabled={isProcessing}
                            onClick={() => setActionModal({ type: 'DISPATCH', transfer: t })}
                            className="win-button px-2 py-0.5 text-[11px] font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 flex items-center space-x-1 cursor-pointer"
                            title="Despachar cortes desde la cámara de origen"
                          >
                            <Send className="w-3 h-3 text-blue-700" />
                            <span>Despachar</span>
                          </button>
                        )}

                        {/* Confirmar Recepción (si está en tránsito) */}
                        {t.status === 'EN_TRANSITO' && (
                          <button
                            disabled={isProcessing}
                            onClick={() => setActionModal({ type: 'RECEIVE', transfer: t })}
                            className="win-button px-2 py-0.5 text-[11px] font-bold text-green-900 bg-green-50 hover:bg-green-100 flex items-center space-x-1 cursor-pointer"
                            title="Ingresar mercadería a cámara de destino"
                          >
                            <CheckCircle className="w-3 h-3 text-green-700" />
                            <span>Recibir en Cámara</span>
                          </button>
                        )}

                        {/* Cancelar (si está en borrador o tránsito) */}
                        {(t.status === 'BORRADOR' || t.status === 'EN_TRANSITO') && (
                          <button
                            disabled={isProcessing}
                            onClick={() => setCancelModalTransfer(t)}
                            className="p-1 rounded hover:bg-red-100 text-red-700"
                            title="Cancelar traslado"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL DE CANCELACIÓN */}
      {cancelModalTransfer && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="win-panel bg-[#d4d0c8] p-4 max-w-md w-full shadow-2xl border-2 border-white">
            <div className="flex items-center space-x-2 text-red-700 font-bold mb-3">
              <AlertCircle className="w-5 h-5" />
              <span>Cancelar Traslado {cancelModalTransfer.transferNumber}</span>
            </div>

            <p className="text-xs text-gray-700 mb-3">
              {cancelModalTransfer.status === 'EN_TRANSITO'
                ? 'El traslado se encuentra EN TRÁNSITO. Al cancelarlo, se reintegrarán automáticamente los kilos a la cámara de origen.'
                : '¿Estás seguro de que deseas anular este borrador de remito?'}
            </p>

            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Motivo de la cancelación:
              </label>
              <textarea
                className="win-input w-full p-2 text-xs"
                rows={3}
                placeholder="Ej: Error en pesaje, mercadería no despachada, corte incorrecto..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setCancelModalTransfer(null)}
                className="win-button py-1 px-3 text-xs"
              >
                Volver
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={!cancelReason.trim()}
                className="win-button py-1 px-3 text-xs font-bold text-red-700 disabled:opacity-50"
              >
                Confirmar Anulación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE DESPACHO / RECEPCIÓN */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="win-panel bg-[#d4d0c8] p-4 max-w-md w-full shadow-2xl border-2 border-white">
            <div className="flex items-center space-x-2 text-blue-900 font-bold mb-3">
              {actionModal.type === 'DISPATCH' ? (
                <Send className="w-5 h-5 text-blue-700" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-700" />
              )}
              <span>
                {actionModal.type === 'DISPATCH'
                  ? `Despachar Traslado ${actionModal.transfer.transferNumber}`
                  : `Recibir en Cámara ${actionModal.transfer.transferNumber}`}
              </span>
            </div>

            <p className="text-xs text-gray-800 mb-3 leading-relaxed">
              {actionModal.type === 'DISPATCH' ? (
                <>
                  ¿Confirmar el <strong>DESPACHO</strong> de <strong>{formatKg(actionModal.transfer.totalKilos)}</strong> de carne desde <strong>{actionModal.transfer.originBranch}</strong> hacia <strong>{actionModal.transfer.destinationBranch}</strong>?<br /><br />
                  Se descontarán automáticamente las existencias de la cámara de origen.
                </>
              ) : (
                <>
                  ¿Confirmar la <strong>RECEPCIÓN</strong> e ingreso a cámara en <strong>{actionModal.transfer.destinationBranch}</strong>?<br /><br />
                  Se incorporarán <strong>{formatKg(actionModal.transfer.totalKilos)}</strong> a las existencias de la sucursal de destino.
                </>
              )}
            </p>

            <div className="flex justify-end space-x-2 pt-2 border-t border-gray-300">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                disabled={processingId !== null}
                className="win-button py-1 px-3 text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={processingId !== null}
                className={`win-button py-1 px-4 text-xs font-bold text-white cursor-pointer shadow ${
                  actionModal.type === 'DISPATCH'
                    ? 'bg-blue-700 hover:bg-blue-800'
                    : 'bg-green-700 hover:bg-green-800'
                }`}
              >
                {processingId !== null
                  ? 'Procesando...'
                  : actionModal.type === 'DISPATCH'
                  ? 'Confirmar Despacho'
                  : 'Confirmar Ingreso a Cámara'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
