import React, { useState, useMemo } from 'react';
import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  PlusCircle,
  Save,
  Trash2,
  CheckCircle2,
  Search,
} from 'lucide-react';
import { useFirebase } from '../../context/FirebaseContext';
import { Product, StockMovement, StockMovementType } from '../../types/pos';
import { isMeatCategory, formatKg, formatQuantity, formatCurrency } from '../../utils/stockHelper';

interface StockAdjustmentsTabProps {
  initialProduct?: Product | null;
  initialBranch?: 'NECO 1' | 'NECO 2';
}

export const StockAdjustmentsTab: React.FC<StockAdjustmentsTabProps> = ({
  initialProduct,
  initialBranch = 'NECO 1',
}) => {
  const { products, branchStock, recordStockMovement, stockMovements, localUser, user } = useFirebase();

  const [branchId, setBranchId] = useState<'NECO 1' | 'NECO 2'>(initialBranch);
  const [selectedProductCode, setSelectedProductCode] = useState<string>(initialProduct?.code || '');
  const [type, setType] = useState<StockMovementType>('MERMA');
  const [quantity, setQuantity] = useState<string>('');
  const [reason, setReason] = useState<string>('Desposte / Deshuese');
  const [customReason, setCustomReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [productSearch, setProductSearch] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const operatorName = localUser?.fullName || user?.displayName || localUser?.username || 'Encargado de Cámara';

  // Buscar producto seleccionado
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.code === selectedProductCode) || null;
  }, [products, selectedProductCode]);

  // Stock actual del producto en la sucursal seleccionada
  const currentBranchStock = useMemo(() => {
    if (!selectedProductCode) return 0;
    const found = branchStock.find((s) => s.branchId === branchId && s.productCode === selectedProductCode);
    return found ? Number(found.currentStock) || 0 : 0;
  }, [branchStock, branchId, selectedProductCode]);

  // Cálculo de stock resultante
  const qtyNumber = Number(quantity) || 0;
  const isPositive = type === 'AJUSTE_POSITIVO' || type === 'ENTRADA';
  const newStockCalculated = Number((isPositive ? currentBranchStock + qtyNumber : currentBranchStock - qtyNumber).toFixed(3));

  // Opciones de motivo predeterminadas
  const reasonOptions = [
    'Desposte / Deshuese',
    'Exceso de grasa / Hueso no aprovechable',
    'Evaporación natural en cámara de frío',
    'Rotura de frío / Deterioro',
    'Vencimiento de mercadería',
    'Diferencia de pesaje en balanza',
    'Ingreso directo de proveedor / Reses',
    'Otro motivo (especificar)',
  ];

  // Productos filtrados para el selector
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 100);
    const q = productSearch.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.scalePlu?.toString().includes(q)
    );
  }, [products, productSearch]);

  // Movimientos recientes de ajuste/merma
  const recentAdjustments = useMemo(() => {
    return stockMovements
      .filter((m) => ['MERMA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'ENTRADA'].includes(m.type))
      .slice(0, 30);
  }, [stockMovements]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      return;
    }
    if (qtyNumber <= 0) {
      return;
    }

    try {
      setIsSubmitting(true);
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const finalReason = reason === 'Otro motivo (especificar)' ? customReason : reason;

      const movement: StockMovement = {
        id: `SM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        date: dateStr,
        time: timeStr,
        timestamp: Date.now(),
        branchId,
        chamber: branchId === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2',
        productCode: selectedProduct.code,
        productDescription: selectedProduct.description,
        category: selectedProduct.category,
        unitType: selectedProduct.unitType,
        type,
        quantity: qtyNumber,
        factor: isPositive ? 1 : -1,
        previousStock: currentBranchStock,
        newStock: newStockCalculated,
        unitPrice: selectedProduct.price,
        totalValue: Number((qtyNumber * selectedProduct.price).toFixed(2)),
        referenceDoc: `AJUSTE-${Date.now().toString().slice(-6)}`,
        operator: operatorName,
        reason: finalReason,
        notes: notes.trim() || undefined,
      };

      await recordStockMovement(movement);

      setSuccessMessage(
        `¡${type} registrado exitosamente! Stock de ${selectedProduct.description} actualizado a ${formatQuantity(newStockCalculated, selectedProduct.unitType)}.`
      );
      setErrorMessage(null);
      setQuantity('');
      setNotes('');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('Error al registrar ajuste:', err);
      setErrorMessage(`Error al registrar el ajuste: ${err.message || 'Error inesperado'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full min-h-0 overflow-hidden">
      {/* FORMULARIO DE REGISTRO CON SCROLL VERTICAL */}
      <div className="lg:col-span-5 flex flex-col win-panel bg-white p-4 overflow-y-auto max-h-full">
        <div className="flex items-center space-x-2 border-b border-gray-300 pb-2 mb-3 shrink-0">
          <TrendingDown className="w-5 h-5 text-amber-700" />
          <h3 className="font-bold text-sm text-black">
            Registro de Mermas y Ajustes de Cámara
          </h3>
        </div>

        {errorMessage && (
          <div className="mb-3 p-2.5 bg-red-50 border border-red-300 rounded text-xs text-red-800 flex items-center justify-between shrink-0">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="font-bold text-gray-500 hover:text-gray-800 ml-2">✕</button>
          </div>
        )}

        {successMessage && (
          <div className="mb-3 p-2.5 bg-green-50 border border-green-300 rounded text-xs text-green-800 flex items-center space-x-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-green-700 flex-shrink-0" />
            <span className="font-bold">{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 flex-1 flex flex-col text-xs pb-4">
          {/* Sucursal */}
          <div>
            <label className="block font-bold text-black mb-1">Sucursal / Cámara:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBranchId('NECO 1')}
                className={`py-2 px-3 rounded font-bold text-xs cursor-pointer border transition-all ${
                  branchId === 'NECO 1'
                    ? 'bg-[#002046] text-white border-[#002046] shadow-sm ring-1 ring-[#002046]'
                    : 'bg-white text-black border-gray-400 hover:bg-gray-100'
                }`}
              >
                NECO 1 (Central)
              </button>
              <button
                type="button"
                onClick={() => setBranchId('NECO 2')}
                className={`py-2 px-3 rounded font-bold text-xs cursor-pointer border transition-all ${
                  branchId === 'NECO 2'
                    ? 'bg-[#002046] text-white border-[#002046] shadow-sm ring-1 ring-[#002046]'
                    : 'bg-white text-black border-gray-400 hover:bg-gray-100'
                }`}
              >
                NECO 2 (Sucursal)
              </button>
            </div>
          </div>

          {/* Tipo de Operación */}
          <div>
            <label className="block font-bold text-black mb-1">Tipo de Operación:</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setType('MERMA')}
                className={`p-2 rounded border text-left flex items-center space-x-2 ${
                  type === 'MERMA'
                    ? 'bg-red-50 border-red-600 text-red-900 font-bold ring-1 ring-red-600'
                    : 'bg-gray-50 border-gray-300 text-black'
                }`}
              >
                <TrendingDown className="w-4 h-4 text-red-600" />
                <div>
                  <div className="text-black font-bold">Merma de Cámara</div>
                  <div className="text-[10px] font-medium text-gray-700">Desposte, grasa, caducidad</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setType('AJUSTE_NEGATIVO')}
                className={`p-2 rounded border text-left flex items-center space-x-2 ${
                  type === 'AJUSTE_NEGATIVO'
                    ? 'bg-amber-50 border-amber-600 text-amber-900 font-bold ring-1 ring-amber-600'
                    : 'bg-gray-50 border-gray-300 text-black'
                }`}
              >
                <TrendingDown className="w-4 h-4 text-amber-600" />
                <div>
                  <div className="text-black font-bold">Ajuste Negativo (-)</div>
                  <div className="text-[10px] font-medium text-gray-700">Corrección en contra</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setType('AJUSTE_POSITIVO')}
                className={`p-2 rounded border text-left flex items-center space-x-2 ${
                  type === 'AJUSTE_POSITIVO'
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-900 font-bold ring-1 ring-emerald-600'
                    : 'bg-gray-50 border-gray-300 text-black'
                }`}
              >
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <div>
                  <div className="text-black font-bold">Ajuste Positivo (+)</div>
                  <div className="text-[10px] font-medium text-gray-700">Sobrante o corrección</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setType('ENTRADA')}
                className={`p-2 rounded border text-left flex items-center space-x-2 ${
                  type === 'ENTRADA'
                    ? 'bg-green-50 border-green-600 text-green-900 font-bold ring-1 ring-green-600'
                    : 'bg-gray-50 border-gray-300 text-black'
                }`}
              >
                <TrendingUp className="w-4 h-4 text-green-600" />
                <div>
                  <div className="text-black font-bold">Entrada Directa</div>
                  <div className="text-[10px] font-medium text-gray-700">Proveedor / Reses</div>
                </div>
              </button>
            </div>
          </div>

          {/* Selector de Producto */}
          <div>
            <label className="block font-bold text-black mb-1">Artículo / Corte de Carne:</label>
            <div className="mb-1">
              <input
                type="text"
                className="win-input w-full p-1.5 text-xs text-black font-medium border border-gray-400 placeholder:text-gray-500"
                placeholder="Filtrar cortes..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            <select
              className="win-select w-full p-1.5 text-xs font-mono text-black font-bold border border-gray-400 bg-white"
              value={selectedProductCode}
              onChange={(e) => setSelectedProductCode(e.target.value)}
              size={3}
            >
              <option value="" disabled className="text-gray-600">
                -- Seleccioná un corte --
              </option>
              {filteredProducts.map((p) => (
                <option key={p.code} value={p.code} className="text-black py-0.5">
                  {p.code} - {p.description} ({p.category}) [${p.price}/{p.unitType}]
                </option>
              ))}
            </select>
          </div>

          {/* Visualizador de Stocks */}
          {selectedProduct && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded grid grid-cols-3 gap-2 text-center font-mono">
              <div>
                <div className="text-[10px] font-bold text-gray-700">Stock Actual</div>
                <div className="text-sm font-bold text-black">
                  {formatQuantity(currentBranchStock, selectedProduct.unitType)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-700">Variación</div>
                <div
                  className={`text-sm font-bold ${
                    isPositive ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {isPositive ? '+' : '-'}
                  {formatQuantity(qtyNumber, selectedProduct.unitType)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-700">Stock Resultante</div>
                <div
                  className={`text-sm font-bold ${
                    newStockCalculated < 0 ? 'text-red-700' : 'text-blue-900'
                  }`}
                >
                  {formatQuantity(newStockCalculated, selectedProduct.unitType)}
                </div>
              </div>
            </div>
          )}

          {/* Cantidad */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-black mb-1">
                Cantidad a {isPositive ? 'Sumar' : 'Descontar'}{' '}
                {selectedProduct ? `(${selectedProduct.unitType})` : ''}:
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                className="win-input w-full p-2 text-sm font-mono font-bold text-black border border-gray-400"
                placeholder={selectedProduct?.unitType === 'Kg' ? 'Ej: 12.500' : 'Ej: 10'}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block font-bold text-black mb-1">Valorización Comercial:</label>
              <div className="p-2 bg-gray-100 border border-gray-400 rounded font-mono font-bold text-sm text-black">
                {formatCurrency(qtyNumber * (selectedProduct?.price || 0))}
              </div>
            </div>
          </div>

          {/* Motivo */}
          <div className="bg-gray-50 p-2.5 rounded border border-gray-300">
            <label className="block font-bold text-black text-[12px] mb-1.5 flex items-center justify-between">
              <span>Motivo / Causa:</span>
              <span className="text-[10px] font-normal text-gray-600">[Requerido para Kardex]</span>
            </label>
            <select
              className="win-select w-full p-2 text-xs font-bold text-black border-2 border-black bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {reasonOptions.map((r) => (
                <option key={r} value={r} className="text-black font-semibold py-1">
                  {r}
                </option>
              ))}
            </select>

            {reason === 'Otro motivo (especificar)' && (
              <input
                type="text"
                className="win-input w-full p-2 text-xs text-black font-bold mt-2 border-2 border-black bg-white"
                placeholder="Escribí el motivo detallado..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                required
              />
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="block font-bold text-black mb-1">Observaciones adicionales:</label>
            <input
              type="text"
              className="win-input w-full p-2 text-xs text-black font-medium border border-gray-400"
              placeholder="Detalles sobre el lote, balanza o condición..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !selectedProduct || qtyNumber <= 0}
              className="win-button w-full py-2.5 font-bold text-white bg-[#002046] hover:bg-[#002c61] disabled:opacity-50 flex items-center justify-center space-x-2 shadow cursor-pointer"
            >
              <Save className="w-4 h-4 text-white" />
              <span>{isSubmitting ? 'Registrando en Cámara...' : 'Registrar Operación en Cámara'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* HISTORIAL RECIENTE DE AJUSTES Y MERMAS */}
      <div className="lg:col-span-7 flex flex-col win-panel bg-white p-4 min-h-0 max-h-full">
        <div className="flex items-center justify-between border-b border-gray-300 pb-2 mb-3">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-sm text-gray-900">
              Últimas Mermas y Ajustes Registrados
            </h3>
          </div>
          <span className="text-xs text-gray-500">Últimos {recentAdjustments.length} registros</span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-gray-100 text-gray-700 sticky top-0 select-none">
              <tr>
                <th className="p-2 border border-gray-300">FECHA</th>
                <th className="p-2 border border-gray-300 text-center">SUC.</th>
                <th className="p-2 border border-gray-300">TIPO</th>
                <th className="p-2 border border-gray-300">CORTE</th>
                <th className="p-2 border border-gray-300 text-right">CANTIDAD</th>
                <th className="p-2 border border-gray-300 text-right">VALOR ($)</th>
                <th className="p-2 border border-gray-300">MOTIVO</th>
                <th className="p-2 border border-gray-300">OPERADOR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recentAdjustments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500 italic">
                    No se han registrado mermas o ajustes manuales todavía.
                  </td>
                </tr>
              ) : (
                recentAdjustments.map((m) => {
                  const isPos = m.factor > 0;
                  return (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="p-2 border border-gray-200 font-mono text-[11px] whitespace-nowrap">
                        {m.date} {m.time}
                      </td>
                      <td className="p-2 border border-gray-200 text-center font-bold">
                        <span
                          className={`px-1 py-0.5 rounded text-[10px] ${
                            m.branchId === 'NECO 1' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {m.branchId}
                        </span>
                      </td>
                      <td className="p-2 border border-gray-200">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            m.type === 'MERMA'
                              ? 'bg-red-100 text-red-800'
                              : isPos
                              ? 'bg-green-100 text-green-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {m.type}
                        </span>
                      </td>
                      <td className="p-2 border border-gray-200 font-bold text-gray-900 truncate max-w-[140px]">
                        {m.productDescription}
                      </td>
                      <td
                        className={`p-2 border border-gray-200 text-right font-mono font-bold whitespace-nowrap ${
                          isPos ? 'text-green-700' : 'text-red-700'
                        }`}
                      >
                        {isPos ? '+' : '-'}
                        {formatQuantity(m.quantity, m.unitType)}
                      </td>
                      <td className="p-2 border border-gray-200 text-right font-mono font-bold text-gray-800">
                        {formatCurrency(m.totalValue)}
                      </td>
                      <td className="p-2 border border-gray-200 text-gray-600 truncate max-w-[150px]">
                        {m.reason || m.notes || '-'}
                      </td>
                      <td className="p-2 border border-gray-200 text-gray-700 truncate max-w-[90px]">
                        {m.operator}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
