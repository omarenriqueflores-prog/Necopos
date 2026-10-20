import { carcassLabel } from '../../utils/receptionHelper';
import React from 'react';
import {
  X,
  Printer,
  Beef,
  Scale,
  Calendar,
  Building2,
  CheckCircle2,
  Truck,
  FileText,
  Trash2,
} from 'lucide-react';
import { MeatReception } from '../../types/pos';
import { formatKg, formatCurrency } from '../../utils/stockHelper';
import { generateReceptionVoucherHtml } from '../../utils/receptionHelper';
import { useFirebase } from '../../context/FirebaseContext';
import { useDialog } from '../../context/DialogContext';

interface ReceptionDetailModalProps {
  reception: MeatReception;
  onClose: () => void;
  onConfirmDraft?: (reception: MeatReception) => void;
}

export const ReceptionDetailModal: React.FC<ReceptionDetailModalProps> = ({
  reception,
  onClose,
  onConfirmDraft,
}) => {
  const { branchConfigs, deleteOrCancelMeatReception, localUser, user } = useFirebase();
  const { showAlert, showAdminAuth } = useDialog();

  const handlePrint = () => {
    const branchConfig = branchConfigs ? branchConfigs[reception.branchId] : null;
    const html = generateReceptionVoucherHtml(reception, branchConfig);

    const win = window.open('', '_blank', 'width=900,height=750');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        win.print();
      }, 350);
    }
  };

  const handleDelete = async () => {
    try {
      const authorized = await showAdminAuth(
        `¿Desea eliminar la recepción ${reception.code} (Tropa SENASA ${reception.tropaNumber}, ${formatKg(reception.totalWeightKg)})?\n\nEsta operación revertirá el stock de medias reses en cámara y eliminará el registro de recepción. Ingrese la clave de administrador para confirmar.`,
        'AUTORIZACIÓN DE ADMINISTRADOR - ELIMINAR RECEPCIÓN'
      );
      if (!authorized) return;

      const operator = localUser?.fullName || user?.displayName || localUser?.username || 'Administrador';
      await deleteOrCancelMeatReception(reception.id, operator, 'Eliminación autorizada con clave de Administrador', true);
      await showAlert(
        `La recepción ${reception.code} (Tropa ${reception.tropaNumber}) fue eliminada exitosamente y el stock ha sido revertido.`,
        'RECEPCIÓN ELIMINADA'
      );
      onClose();
    } catch (err: any) {
      console.error('Error al eliminar recepción:', err);
      await showAlert(
        `No se pudo eliminar la recepción: ${err.message || 'Error desconocido'}`,
        'ERROR AL ELIMINAR'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 select-none overflow-y-auto">
      <div className="win-panel bg-[#d4d0c8] max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border-2 border-white">
        {/* TÍTULO */}
        <div className="win-titlebar flex items-center justify-between p-1 bg-[#002046] text-white">
          <div className="flex items-center space-x-2 text-white font-bold text-xs pl-1">
            <Beef className="w-4 h-4 text-amber-300" />
            <span>
              REMISIÓN & ACTA DE RECEPCIÓN — {reception.code} (TROPA: {reception.tropaNumber})
            </span>
          </div>
          <button
            onClick={onClose}
            className="win-btn-close px-1.5 py-0.5 bg-[#c0c0c0] hover:bg-red-600 hover:text-white text-black text-xs font-bold border border-gray-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* CONTENIDO */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs text-black">
          {/* ENCABEZADO */}
          <div className="bg-[#ebeef2] border border-gray-400 p-2.5 rounded-sm">
            <div className="flex justify-between items-start border-b border-gray-300 pb-2 mb-2">
              <div>
                <span className="text-base font-bold text-[#002046]">{reception.code}</span>
                <span className="ml-2 font-mono text-xs text-gray-600">
                  {reception.date} {reception.time}
                </span>
                <span
                  className={`ml-3 px-2 py-0.5 rounded text-[10px] font-bold ${
                    reception.status === 'CONFIRMADO'
                      ? 'bg-green-100 text-green-800 border border-green-300'
                      : reception.status === 'PENDIENTE'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-red-100 text-red-800 border border-red-300'
                  }`}
                >
                  {reception.status}
                </span>
              </div>

              <button
                type="button"
                onClick={handlePrint}
                className="px-3 py-1 bg-white hover:bg-gray-100 border border-gray-400 font-bold flex items-center space-x-1.5 text-xs shadow-sm"
              >
                <Printer className="w-3.5 h-3.5 text-blue-700" />
                <span>Imprimir Remito Oficial</span>
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-gray-500 block text-[10px]">Sucursal & Cámara:</span>
                <span className="font-bold text-gray-900">
                  {reception.branchId} — {reception.chamber}
                </span>
              </div>

              <div>
                <span className="text-gray-500 block text-[10px]">Proveedor / Frigorífico:</span>
                <span className="font-bold text-gray-900">{reception.supplier}</span>
              </div>

              <div>
                <span className="text-gray-500 block text-[10px]">N° Tropa SENASA:</span>
                <span className="font-bold text-blue-900 font-mono text-sm">{reception.tropaNumber}</span>
              </div>

              <div>
                <span className="text-gray-500 block text-[10px]">Especie & Categoría:</span>
                <span className="font-bold text-gray-900">
                  {reception.species} ({reception.category})
                </span>
              </div>

              <div>
                <span className="text-gray-500 block text-[10px]">N° Factura:</span>
                <span className="font-semibold text-gray-800">{reception.invoiceNumber || 'Sin factura'}</span>
              </div>

              <div>
                <span className="text-gray-500 block text-[10px]">N° Remito / DTE:</span>
                <span className="font-semibold text-gray-800">
                  {reception.deliveryNoteNumber || reception.dteGuideNumber || 'Sin remito'}
                </span>
              </div>

              <div>
                <span className="text-gray-500 block text-[10px]">Precio Compra $/Kg:</span>
                <span className="font-bold text-green-800">{formatCurrency(reception.pricePerKg)}</span>
              </div>

              <div>
                <span className="text-gray-500 block text-[10px]">Receptor / Operador:</span>
                <span className="font-semibold text-gray-800">{reception.operator}</span>
              </div>
            </div>
          </div>

          {/* TABLA DE MEDIAS RESES */}
          <div className="bg-white border border-gray-400">
            <div className="bg-[#002046] text-white p-1.5 flex items-center justify-between text-xs font-bold">
              <span>DETALLE DE MEDIAS RESES INGRESADAS ({reception.totalQuantity} UNIDADES)</span>
              <span>TOTAL AL GANCHO: {formatKg(reception.totalWeightKg)}</span>
            </div>

            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-[#e4e7ec] border-b border-gray-400 text-[10px] text-gray-700">
                <tr>
                  <th className="p-1.5 text-center w-10 border-r border-gray-300">N°</th>
                  <th className="p-1.5 w-28 border-r border-gray-300">Identificador</th>
                  <th className="p-1.5 border-r border-gray-300">Garfa / Precinto SENASA</th>
                  <th className="p-1.5 text-right w-28 border-r border-gray-300 bg-yellow-50">Peso Real</th>
                  <th className="p-1.5 text-right w-28 border-r border-gray-300">Precio $/Kg</th>
                  <th className="p-1.5 text-right w-32 border-r border-gray-300 bg-green-50">Costo Subtotal</th>
                  <th className="p-1.5">Observaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reception.carcasses.map((c, idx) => (
                  <tr key={c.id} className="hover:bg-blue-50">
                    <td className="p-1.5 text-center font-bold text-gray-600 border-r border-gray-200">
                      {idx + 1}
                    </td>
                    <td className="p-1.5 font-mono font-bold text-blue-900 border-r border-gray-200">
                      {carcassLabel(c, idx)}
                    </td>
                    <td className="p-1.5 border-r border-gray-200">{c.tagNumber || '-'}</td>
                    <td className="p-1.5 text-right font-bold text-red-700 border-r border-gray-200 bg-yellow-50/50">
                      {formatKg(c.weightKg)}
                    </td>
                    <td className="p-1.5 text-right border-r border-gray-200 text-gray-700">
                      {formatCurrency(reception.pricePerKg)}
                    </td>
                    <td className="p-1.5 text-right font-bold text-green-900 border-r border-gray-200 bg-green-50/50">
                      {formatCurrency(c.cost)}
                    </td>
                    <td className="p-1.5 text-gray-600 text-[11px]">{c.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="p-2 bg-[#f0f4f8] border-t-2 border-[#002046] flex justify-between items-center text-xs">
              <div>
                <strong>Total Medias Reses:</strong> {reception.totalQuantity} unidades
              </div>
              <div>
                <strong>Peso Bruto Total:</strong> <span className="font-bold text-red-700">{formatKg(reception.totalWeightKg)}</span>
              </div>
              <div>
                <strong>Costo Total Compra:</strong> <span className="font-bold text-green-900 text-sm">{formatCurrency(reception.totalCost)}</span>
              </div>
            </div>
          </div>

          {reception.notes && (
            <div className="bg-yellow-50 border border-yellow-300 p-2 rounded-sm text-xs text-gray-800">
              <strong>Observaciones Sanitarias / Auditoría:</strong> {reception.notes}
            </div>
          )}
        </div>

        {/* PIE */}
        <div className="bg-[#c0c0c0] border-t border-gray-400 p-2 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1 bg-white hover:bg-gray-100 border border-gray-400 text-black font-bold flex items-center space-x-1.5 shadow-sm"
            >
              <Printer className="w-3.5 h-3.5 text-gray-700" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              onClick={handleDelete}
              className="px-3 py-1 bg-[#ba1a1a] hover:bg-red-800 text-white font-bold flex items-center space-x-1.5 shadow-sm"
              title="Eliminar esta recepción (Requiere clave de Administrador)"
            >
              <Trash2 className="w-3.5 h-3.5 text-white" />
              <span>Eliminar Recepción (Clave Admin)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1 bg-white hover:bg-gray-100 border border-gray-400 font-bold"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
