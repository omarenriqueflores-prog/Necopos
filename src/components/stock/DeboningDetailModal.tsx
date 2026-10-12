import React from 'react';
import {
  X,
  Printer,
  Beef,
  Scale,
  Calendar,
  Building2,
  CheckCircle2,
  FileText,
  DollarSign,
  AlertCircle,
  Truck,
} from 'lucide-react';
import { MeatDeboning } from '../../types/pos';
import { formatKg, formatCurrency } from '../../utils/stockHelper';
import { generateDeboningVoucherHtml } from '../../utils/deboningHelper';
import { useFirebase } from '../../context/FirebaseContext';

interface DeboningDetailModalProps {
  deboning: MeatDeboning;
  onClose: () => void;
  onFinalizeDraft?: (deboning: MeatDeboning) => void;
}

export const DeboningDetailModal: React.FC<DeboningDetailModalProps> = ({
  deboning,
  onClose,
  onFinalizeDraft,
}) => {
  const { branchConfigs } = useFirebase();

  const handlePrint = () => {
    const branchConfig = branchConfigs ? branchConfigs[deboning.branchId] : null;
    const html = generateDeboningVoucherHtml(deboning, branchConfig);

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

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 select-none overflow-y-auto">
      <div className="win-panel bg-[#d4d0c8] max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border-2 border-white">
        {/* TÍTULO */}
        <div className="win-titlebar flex items-center justify-between p-1 bg-[#002046] text-white">
          <div className="flex items-center space-x-2 text-white font-bold text-xs pl-1">
            <Beef className="w-4 h-4 text-amber-300" />
            <span>FICHA TÉCNICA DE DESPOSTE — {deboning.code} (TROPA: {deboning.tropaNumber})</span>
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
          {/* ENCABEZADO DE RESUMEN */}
          <div className="bg-[#ebeef2] border border-gray-400 p-2.5 rounded-sm">
            <div className="flex justify-between items-start border-b border-gray-300 pb-2 mb-2">
              <div>
                <span className="text-base font-bold text-[#002046]">{deboning.code}</span>
                <span className="ml-2 font-mono text-xs text-gray-600">
                  {deboning.date} {deboning.time}
                </span>
                <span
                  className={`ml-3 px-2 py-0.5 rounded text-[10px] font-bold ${
                    deboning.status === 'FINALIZADO'
                      ? 'bg-green-100 text-green-800 border border-green-300'
                      : deboning.status === 'BORRADOR'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-red-100 text-red-800 border border-red-300'
                  }`}
                >
                  {deboning.status}
                </span>
              </div>

              <button
                type="button"
                onClick={handlePrint}
                className="px-3 py-1 bg-white hover:bg-gray-100 border border-gray-400 font-bold flex items-center space-x-1.5 text-xs shadow-sm"
              >
                <Printer className="w-3.5 h-3.5 text-blue-700" />
                <span>Imprimir Acta Oficial</span>
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-gray-500 block text-[10px]">Sucursal & Cámara:</span>
                <strong>{deboning.branchId}</strong> — {deboning.chamber}
              </div>
              <div>
                <span className="text-gray-500 block text-[10px]">Tropa SENASA & DTE:</span>
                <strong className="text-blue-900">{deboning.tropaNumber}</strong>
                {deboning.dteGuideNumber ? ` (Guía: ${deboning.dteGuideNumber})` : ''}
              </div>
              <div>
                <span className="text-gray-500 block text-[10px]">Proveedor:</span>
                <strong>{deboning.supplier}</strong>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px]">Categoría Animal:</span>
                <strong>{deboning.animalCategory}</strong> ({deboning.carcassType.replace('_', ' ')})
              </div>
            </div>
          </div>

          {/* TARJETAS DE KPIS ECONÓMICOS Y RENDIMIENTO */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="bg-white border border-gray-300 p-2 text-center rounded">
              <div className="text-[10px] text-gray-500 uppercase font-semibold">Peso al Gancho</div>
              <div className="text-base font-bold text-red-700">{formatKg(deboning.initialWeightKg)}</div>
              <div className="text-[10px] text-gray-600 font-semibold">{formatCurrency(deboning.costPerKgInitial)}/kg</div>
            </div>

            <div className="bg-white border border-gray-300 p-2 text-center rounded">
              <div className="text-[10px] text-gray-500 uppercase font-semibold">Costo Total Res</div>
              <div className="text-base font-bold text-black">{formatCurrency(deboning.totalInitialCost)}</div>
              <div className="text-[10px] text-gray-500">Materia Prima</div>
            </div>

            <div className="bg-white border border-gray-300 p-2 text-center rounded">
              <div className="text-[10px] text-gray-500 uppercase font-semibold">Valor Venta Mostrador</div>
              <div className="text-base font-bold text-blue-900">{formatCurrency(deboning.totalCommercialValue)}</div>
              <div className="text-[10px] text-blue-700 font-bold">{deboning.multiplicationFactor}x Factor</div>
            </div>

            <div className="bg-white border border-gray-300 p-2 text-center rounded">
              <div className="text-[10px] text-gray-500 uppercase font-semibold">Margen Bruto</div>
              <div className="text-base font-bold text-green-800">{formatCurrency(deboning.grossMarginTotal)}</div>
              <div className="text-[10px] text-green-700 font-bold">+{deboning.grossMarginPercent}%</div>
            </div>

            <div className="bg-white border border-gray-300 p-2 text-center rounded">
              <div className="text-[10px] text-gray-500 uppercase font-semibold">Carne Limpia / Merma</div>
              <div className="text-base font-bold text-indigo-900">{deboning.netMeatYieldPercent}%</div>
              <div className="text-[10px] text-red-700 font-semibold">Merma: {deboning.shrinkagePercent}%</div>
            </div>
          </div>

          {/* TABLA DE CORTES DETALLADA */}
          <div className="bg-white border border-gray-400 overflow-hidden shadow-sm">
            <div className="bg-[#e4e7ec] p-1.5 font-bold text-xs text-gray-800 border-b border-gray-300 flex justify-between">
              <span>Desglose de Cortes y Subproductos ({deboning.cuts.length} ítems)</span>
              <span>Kilos Obtenidos: {formatKg(deboning.totalOutputWeightKg)} ({deboning.totalYieldPercent}%)</span>
            </div>

            <div className="overflow-x-auto max-h-[340px]">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-[#f0f2f5] text-gray-700 sticky top-0 text-[10px] border-b border-gray-300">
                  <tr>
                    <th className="p-1.5 text-left border-r border-gray-200">Cód</th>
                    <th className="p-1.5 text-left border-r border-gray-200">Descripción del Corte</th>
                    <th className="p-1.5 text-left border-r border-gray-200">Categoría</th>
                    <th className="p-1.5 text-right border-r border-gray-200">Kilos (Kg)</th>
                    <th className="p-1.5 text-right border-r border-gray-200">Rend %</th>
                    <th className="p-1.5 text-right border-r border-gray-200">Costo $/Kg</th>
                    <th className="p-1.5 text-right border-r border-gray-200">Venta $/Kg</th>
                    <th className="p-1.5 text-right border-r border-gray-200">Total Venta ($)</th>
                    <th className="p-1.5 text-right">Margen %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-[11px]">
                  {deboning.cuts.map((cut, idx) => (
                    <tr key={idx} className="hover:bg-blue-50">
                      <td className="p-1.5 font-mono font-bold text-gray-700 border-r border-gray-200">
                        {cut.productCode}
                      </td>
                      <td className="p-1.5 font-bold text-black border-r border-gray-200">
                        {cut.description}
                      </td>
                      <td className="p-1.5 border-r border-gray-200 text-gray-600 text-[10px]">
                        {cut.category}
                      </td>
                      <td className="p-1.5 text-right border-r border-gray-200 font-bold text-blue-900 bg-yellow-50/50">
                        {formatKg(cut.weightKg)}
                      </td>
                      <td className="p-1.5 text-right border-r border-gray-200 font-semibold text-blue-800">
                        {cut.yieldPercent?.toFixed(2)}%
                      </td>
                      <td className="p-1.5 text-right border-r border-gray-200 text-green-900 font-semibold">
                        {formatCurrency(cut.allocatedCostPerKg)}
                      </td>
                      <td className="p-1.5 text-right border-r border-gray-200 font-semibold">
                        {formatCurrency(cut.currentSalePrice)}
                      </td>
                      <td className="p-1.5 text-right border-r border-gray-200 font-bold text-black">
                        {formatCurrency(cut.totalSaleValue)}
                      </td>
                      <td
                        className={`p-1.5 text-right font-bold ${
                          (cut.projectedMarginPercent || 0) >= 0 ? 'text-green-700' : 'text-red-600'
                        }`}
                      >
                        {cut.projectedMarginPercent?.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* OBSERVACIONES Y AUDITORÍA */}
          <div className="bg-[#f8f9fa] border border-gray-300 p-2 text-[11px] text-gray-700 flex justify-between items-center rounded">
            <div>
              <strong>Responsables:</strong> Operador: {deboning.operator} | Maestro Despostador: {deboning.butcherMaster || 'N/A'}<br/>
              {deboning.appliedAt && <span className="text-[10px] text-gray-500">Impactado en stock: {new Date(deboning.appliedAt).toLocaleString('es-AR')}</span>}
            </div>
            {deboning.notes && (
              <div className="italic text-gray-600 max-w-md text-right">
                "{deboning.notes}"
              </div>
            )}
          </div>
        </div>

        {/* PIE */}
        <div className="bg-[#c0c0c0] border-t border-gray-400 p-2 flex justify-between items-center">
          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-1 bg-white hover:bg-gray-100 border border-gray-400 font-bold flex items-center space-x-1 shadow-sm text-xs"
          >
            <Printer className="w-3.5 h-3.5 text-blue-800" />
            <span>Imprimir Comprobante</span>
          </button>

          <div className="flex space-x-2">
            {deboning.status === 'BORRADOR' && onFinalizeDraft && (
              <button
                type="button"
                onClick={() => onFinalizeDraft(deboning)}
                className="px-3 py-1 bg-[#002046] hover:bg-blue-900 text-white font-bold flex items-center space-x-1 shadow text-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-green-300" />
                <span>Finalizar e Ingresar a Stock</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1 bg-[#d4d0c8] hover:bg-gray-300 border border-gray-400 font-bold text-xs shadow-sm"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
