import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  ArrowRightLeft,
  Truck,
  Save,
  Send,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { useFirebase } from '../../context/FirebaseContext';
import { Product, StockTransfer, StockTransferItem } from '../../types/pos';
import { formatKg, formatQuantity, formatCurrency } from '../../utils/stockHelper';

interface NewTransferModalProps {
  onClose: () => void;
  defaultProduct?: Product | null;
}

export const NewTransferModal: React.FC<NewTransferModalProps> = ({ onClose, defaultProduct }) => {
  const { products, branchStock, saveStockTransfer, dispatchStockTransfer, localUser, user } = useFirebase();

  const [originBranch, setOriginBranch] = useState<'NECO 1' | 'NECO 2'>('NECO 1');
  const [destinationBranch, setDestinationBranch] = useState<'NECO 1' | 'NECO 2'>('NECO 2');
  const [driverName, setDriverName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [notes, setNotes] = useState('');
  const [inlineNotification, setInlineNotification] = useState<{ type: 'info' | 'warning' | 'error' | 'success'; message: string } | null>(null);

  // Items en preparación para transferir (inicia vacío para respetar disponibilidad de origen)
  const [transferItems, setTransferItems] = useState<StockTransferItem[]>(() => {
    if (defaultProduct) {
      const doc = branchStock.find((s) => s.branchId === 'NECO 1' && s.productCode === defaultProduct.code);
      const stock = doc ? Number(doc.currentStock) || 0 : 0;
      if (stock > 0) {
        const initialQty = Math.min(10, stock);
        return [
          {
            productCode: defaultProduct.code,
            description: defaultProduct.description,
            category: defaultProduct.category || 'Carnes Vacunas',
            unitType: defaultProduct.unitType,
            quantity: initialQty,
            price: defaultProduct.price,
            totalValue: Number((initialQty * defaultProduct.price).toFixed(2)),
          },
        ];
      }
    }
    return [];
  });

  // Selector de nuevo corte
  const [selectedProductCode, setSelectedProductCode] = useState<string>(() => {
    return defaultProduct?.code || '';
  });
  const [addQuantity, setAddQuantity] = useState<string>(() => {
    if (defaultProduct) {
      const doc = branchStock.find((s) => s.branchId === 'NECO 1' && s.productCode === defaultProduct.code);
      const stock = doc ? Number(doc.currentStock) || 0 : 0;
      return stock > 0 ? Math.min(10, stock).toString() : '0';
    }
    return '10';
  });
  const [searchFilter, setSearchFilter] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const operatorName = localUser?.fullName || user?.displayName || localUser?.username || 'Encargado de Cámara';

  // Cambiar origen/destino mutuamente
  const handleOriginChange = (newOrigin: 'NECO 1' | 'NECO 2') => {
    setOriginBranch(newOrigin);
    setDestinationBranch(newOrigin === 'NECO 1' ? 'NECO 2' : 'NECO 1');
    setInlineNotification({
      type: 'info',
      message: `Cámara de origen cambiada a ${newOrigin}. Por favor verificá la disponibilidad de stock en el origen seleccionado.`,
    });
  };

  // Stock disponible en origen
  const getOriginStock = (code: string) => {
    const doc = branchStock.find((s) => s.branchId === originBranch && s.productCode === code);
    return doc ? Number(doc.currentStock) || 0 : 0;
  };

  // Stock restante disponible considerando lo ya agregado al remito
  const getRemainingStock = (code: string) => {
    const totalStock = getOriginStock(code);
    const inRemito = transferItems.find((it) => it.productCode === code)?.quantity || 0;
    return Number(Math.max(0, totalStock - inRemito).toFixed(3));
  };

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.code === selectedProductCode) || null;
  }, [products, selectedProductCode]);

  const selectedProductStock = useMemo(() => {
    if (!selectedProductCode) return 0;
    return getOriginStock(selectedProductCode);
  }, [selectedProductCode, branchStock, originBranch]);

  const selectedProductRemaining = useMemo(() => {
    if (!selectedProductCode) return 0;
    return getRemainingStock(selectedProductCode);
  }, [selectedProductCode, branchStock, originBranch, transferItems]);

  // Productos disponibles
  const availableProducts = useMemo(() => {
    if (!searchFilter.trim()) return products.slice(0, 100);
    const q = searchFilter.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
    );
  }, [products, searchFilter]);

  const handleAddItem = () => {
    const product = products.find((p) => p.code === selectedProductCode);
    if (!product) return;

    const available = getOriginStock(product.code);

    // Validación estricta: No permitir mover si el stock es 0 o negativo
    if (available <= 0) {
      setInlineNotification({
        type: 'error',
        message: `⛔ No se puede transferir: "${product.description}" tiene 0 stock disponible en la cámara de origen ${originBranch}.`,
      });
      return;
    }

    const qty = Number(addQuantity) || 0;
    if (qty <= 0) {
      setInlineNotification({ type: 'warning', message: 'La cantidad a transferir debe ser mayor a cero.' });
      return;
    }

    const existingIndex = transferItems.findIndex((it) => it.productCode === product.code);
    const currentInRemito = existingIndex >= 0 ? transferItems[existingIndex].quantity : 0;
    const totalRequested = Number((currentInRemito + qty).toFixed(3));

    // Validación estricta: No permitir transferir más de lo disponible
    if (totalRequested > available) {
      const maxAllowed = Number((available - currentInRemito).toFixed(3));
      setInlineNotification({
        type: 'error',
        message: `⛔ Stock insuficiente: En ${originBranch} hay ${formatQuantity(available, product.unitType)} de "${product.description}". ${
          currentInRemito > 0 ? `(Ya agregaste ${formatQuantity(currentInRemito, product.unitType)} al remito. Solo podés agregar ${formatQuantity(Math.max(0, maxAllowed), product.unitType)} más).` : `No se pueden transferir ${formatQuantity(qty, product.unitType)}.`
        }`,
      });
      return;
    }

    setInlineNotification({
      type: 'success',
      message: `✓ Se agregaron ${formatQuantity(qty, product.unitType)} de ${product.description} al remito de traslado.`,
    });

    if (existingIndex >= 0) {
      // Actualizar cantidad
      const updated = [...transferItems];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: totalRequested,
        totalValue: Number((totalRequested * product.price).toFixed(2)),
      };
      setTransferItems(updated);
    } else {
      // Agregar nuevo ítem
      setTransferItems([
        ...transferItems,
        {
          productCode: product.code,
          description: product.description,
          category: product.category || 'Carnes Vacunas',
          unitType: product.unitType,
          quantity: qty,
          price: product.price,
          totalValue: Number((qty * product.price).toFixed(2)),
        },
      ]);
    }

    setSelectedProductCode('');
    setAddQuantity('10');
  };

  const handleRemoveItem = (index: number) => {
    setTransferItems(transferItems.filter((_, i) => i !== index));
  };

  const handleUpdateItemQty = (index: number, newQtyVal: number) => {
    const updated = [...transferItems];
    const it = updated[index];
    const avail = getOriginStock(it.productCode);
    const requested = Number(Math.max(0.001, newQtyVal).toFixed(3));

    if (requested > avail) {
      setInlineNotification({
        type: 'error',
        message: `⛔ Cantidad ajustada: "${it.description}" solo dispone de ${formatQuantity(avail, it.unitType)} en ${originBranch}.`,
      });
      const clamped = Math.max(0.001, avail);
      updated[index] = {
        ...it,
        quantity: clamped,
        totalValue: Number((clamped * it.price).toFixed(2)),
      };
    } else {
      setInlineNotification(null);
      updated[index] = {
        ...it,
        quantity: requested,
        totalValue: Number((requested * it.price).toFixed(2)),
      };
    }

    setTransferItems(updated);
  };

  // Totales
  const totals = useMemo(() => {
    let kilos = 0;
    let value = 0;
    transferItems.forEach((it) => {
      kilos += it.quantity;
      value += it.totalValue;
    });
    return {
      kilos: Number(kilos.toFixed(3)),
      value: Number(value.toFixed(2)),
      itemsCount: transferItems.length,
    };
  }, [transferItems]);

  const handleSave = async (andDispatch: boolean) => {
    if (transferItems.length === 0) {
      setInlineNotification({ type: 'warning', message: 'Por favor agregá al menos un corte para transferir.' });
      return;
    }

    // Validación final de stock de cada corte
    for (const it of transferItems) {
      const avail = getOriginStock(it.productCode);
      if (it.quantity > avail) {
        setInlineNotification({
          type: 'error',
          message: `⛔ No se puede procesar el traslado: "${it.description}" requiere ${formatQuantity(it.quantity, it.unitType)} pero el stock en ${originBranch} es de ${formatQuantity(avail, it.unitType)}.`,
        });
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const year = now.getFullYear();
      const randomId = Date.now().toString().slice(-4);
      const transferNumber = `TR-${year}-${randomId}`;

      const transferDoc: StockTransfer = {
        id: `TR-${Date.now()}`,
        transferNumber,
        originBranch,
        destinationBranch,
        status: 'BORRADOR',
        createdAt: `${dateStr} ${timeStr}`,
        createdByUser: operatorName,
        totalKilos: totals.kilos,
        totalUnits: totals.itemsCount,
        totalCommercialValue: totals.value,
        driverName: driverName.trim() || undefined,
        vehiclePlate: vehiclePlate.trim() || undefined,
        notes: notes.trim() || undefined,
        items: transferItems,
      };

      if (andDispatch) {
        // Despachar inmediatamente
        await dispatchStockTransfer(transferDoc, operatorName);
      } else {
        // Guardar como borrador
        await saveStockTransfer(transferDoc);
      }

      onClose();
    } catch (err: any) {
      console.error('Error al generar traslado:', err);
      setInlineNotification({ type: 'error', message: `Error al generar el traslado: ${err.message || 'Error desconocido'}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="win-panel bg-[#d4d0c8] max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border-2 border-white">
        {/* TITLE BAR */}
        <div className="win-titlebar flex items-center justify-between p-1 select-none">
          <div className="flex items-center space-x-2 text-white font-bold text-xs pl-1">
            <Truck className="w-4 h-4" />
            <span>Emisión de Remito de Traslado Inter-Sucursal de Cámaras</span>
          </div>
          <button onClick={onClose} className="win-button p-0.5 w-5 h-5 flex items-center justify-center text-xs">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* CONTENIDO */}
        <div className="p-4 overflow-auto flex-1 space-y-3 text-xs">
          {inlineNotification && (
            <div
              className={`p-2.5 rounded border flex items-center justify-between text-xs ${
                inlineNotification.type === 'error'
                  ? 'bg-red-50 border-red-300 text-red-800'
                  : inlineNotification.type === 'warning'
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : inlineNotification.type === 'success'
                  ? 'bg-green-50 border-green-300 text-green-800'
                  : 'bg-blue-50 border-blue-300 text-blue-800'
              }`}
            >
              <span>{inlineNotification.message}</span>
              <button
                type="button"
                onClick={() => setInlineNotification(null)}
                className="text-gray-500 hover:text-gray-800 ml-2 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* CABECERA DE ORIGEN Y DESTINO */}
          <div className="p-3 bg-white border border-gray-400 rounded grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <div>
              <label className="block font-bold text-blue-900 mb-1">CÁMARA DE ORIGEN (Despacho):</label>
              <select
                className="win-select w-full p-1.5 font-bold text-blue-900 text-xs"
                value={originBranch}
                onChange={(e) => handleOriginChange(e.target.value as any)}
              >
                <option value="NECO 1">NECO 1 (Casa Central)</option>
                <option value="NECO 2">NECO 2 (Sucursal)</option>
              </select>
            </div>

            <div className="text-center font-bold text-gray-500 hidden md:block">
              <ArrowRightLeft className="w-6 h-6 mx-auto text-blue-800" />
              <div className="text-[10px] text-gray-600 mt-1">Traslado Frigorífico</div>
            </div>

            <div>
              <label className="block font-bold text-purple-900 mb-1">CÁMARA DE DESTINO (Recepción):</label>
              <div className="p-1.5 bg-gray-100 border border-gray-300 rounded font-bold text-purple-900">
                {destinationBranch} {destinationBranch === 'NECO 1' ? '(Casa Central)' : '(Sucursal)'}
              </div>
            </div>
          </div>

          {/* DATOS DE TRANSPORTE */}
          <div className="p-3 bg-white border border-gray-400 rounded grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-gray-700 mb-1">Chofer / Transportista:</label>
              <input
                type="text"
                className="win-input w-full p-1.5 text-xs"
                placeholder="Nombre del transportista..."
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
              />
            </div>
            <div>
              <label className="block font-bold text-gray-700 mb-1">Vehículo / Patente:</label>
              <input
                type="text"
                className="win-input w-full p-1.5 text-xs font-mono uppercase"
                placeholder="Ej: AB123CD"
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
              />
            </div>
            <div>
              <label className="block font-bold text-gray-700 mb-1">Observaciones / Precintos:</label>
              <input
                type="text"
                className="win-input w-full p-1.5 text-xs"
                placeholder="Ej: Precinto Nº 45892, control térmico -2ºC"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* AGREGAR CORTES */}
          <div className="p-3 bg-white border border-gray-400 rounded space-y-2">
            <div className="font-bold text-gray-800 flex items-center space-x-1.5 border-b pb-1.5">
              <Plus className="w-4 h-4 text-blue-800" />
              <span>Incorporar Cortes al Remito de Traslado</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <div className="md:col-span-3">
                <label className="block font-bold text-gray-600 mb-1 text-[11px]">Filtrar cortes:</label>
                <div className="relative">
                  <input
                    type="text"
                    className="win-input w-full pl-6 pr-2 py-1 text-xs"
                    placeholder="Buscar..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                  />
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-1.5 top-1.5" />
                </div>
              </div>

              <div className="md:col-span-5">
                <label className="block font-bold text-gray-700 mb-1 text-[11px]">Corte de Carne:</label>
                <select
                  className="win-select w-full p-1 text-xs font-mono"
                  value={selectedProductCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setSelectedProductCode(code);
                    if (code) {
                      const rem = getRemainingStock(code);
                      if (rem > 0 && (Number(addQuantity) > rem || Number(addQuantity) <= 0)) {
                        setAddQuantity(Math.min(10, rem).toString());
                      }
                    }
                  }}
                >
                  <option value="">-- Seleccionar corte --</option>
                  {availableProducts.map((p) => {
                    const st = getOriginStock(p.code);
                    const isZero = st <= 0;
                    return (
                      <option
                        key={p.code}
                        value={p.code}
                        className={isZero ? 'text-gray-400 bg-gray-50' : 'text-gray-900 font-semibold'}
                      >
                        {p.code} - {p.description} {isZero ? '⛔ [SIN STOCK]' : `[Disp: ${formatQuantity(st, p.unitType)}]`}
                      </option>
                    );
                  })}
                </select>

                {selectedProduct && (
                  <div className="mt-1 text-[10px]">
                    {selectedProductStock <= 0 ? (
                      <span className="text-red-700 font-bold flex items-center space-x-1">
                        <span>⛔ Sin stock en {originBranch} (0,000 {selectedProduct.unitType}) — Movimiento bloqueado</span>
                      </span>
                    ) : selectedProductRemaining <= 0 ? (
                      <span className="text-amber-700 font-bold">
                        ⚠️ Ya se asignó todo el stock disponible ({formatQuantity(selectedProductStock, selectedProduct.unitType)}) al remito.
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-bold">
                        ✓ Stock disponible para transferir: {formatQuantity(selectedProductRemaining, selectedProduct.unitType)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-gray-700 mb-1 text-[11px]">Cantidad (Kg/Unid):</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  max={selectedProductRemaining > 0 ? selectedProductRemaining : undefined}
                  disabled={!selectedProductCode || selectedProductRemaining <= 0}
                  className="win-input w-full p-1 text-xs font-mono font-bold disabled:bg-gray-100 disabled:text-gray-400"
                  value={addQuantity}
                  onChange={(e) => setAddQuantity(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddItem();
                    }
                  }}
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={
                    !selectedProductCode ||
                    selectedProductRemaining <= 0 ||
                    (Number(addQuantity) || 0) <= 0 ||
                    (Number(addQuantity) || 0) > selectedProductRemaining
                  }
                  className="win-button w-full py-1.5 font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center space-x-1 shadow-sm"
                  title={
                    selectedProductRemaining <= 0
                      ? 'No hay stock disponible para transferir'
                      : 'Agregar corte al remito'
                  }
                >
                  <Plus className="w-3.5 h-3.5 text-blue-700" />
                  <span>Agregar</span>
                </button>
              </div>
            </div>
          </div>

          {/* TABLA DE ÍTEMS EN EL TRASLADO */}
          <div className="border border-gray-400 rounded bg-white overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="p-2 border-b border-gray-300 w-16 text-center">CÓDIGO</th>
                  <th className="p-2 border-b border-gray-300">DESCRIPCIÓN DEL CORTE</th>
                  <th className="p-2 border-b border-gray-300 w-28">CATEGORÍA</th>
                  <th className="p-2 border-b border-gray-300 w-14 text-center">UNIDAD</th>
                  <th className="p-2 border-b border-gray-300 w-28 text-right">PRECIO VIG.</th>
                  <th className="p-2 border-b border-gray-300 w-28 text-center bg-blue-50/50">CANTIDAD</th>
                  <th className="p-2 border-b border-gray-300 w-32 text-right">SUBTOTAL ($)</th>
                  <th className="p-2 border-b border-gray-300 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-sans">
                {transferItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-gray-500 italic">
                      No hay cortes agregados al remito. Seleccioná un corte arriba para añadirlo.
                    </td>
                  </tr>
                ) : (
                  transferItems.map((item, index) => (
                    <tr key={item.productCode} className="hover:bg-gray-50">
                      <td className="p-2 text-center font-mono text-gray-700">{item.productCode}</td>
                      <td className="p-2 font-bold text-gray-900">{item.description}</td>
                      <td className="p-2 text-gray-600">{item.category}</td>
                      <td className="p-2 text-center font-bold text-gray-700">{item.unitType}</td>
                      <td className="p-2 text-right font-mono text-gray-700">{formatCurrency(item.price)}</td>
                      <td className="p-2 text-center bg-blue-50/30">
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          className="win-input w-24 p-1 text-xs font-mono font-bold text-center"
                          value={item.quantity}
                          onChange={(e) => handleUpdateItemQty(index, Number(e.target.value))}
                        />
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-gray-900">
                        {formatCurrency(item.totalValue)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="text-red-700 hover:text-red-900 p-1"
                          title="Eliminar corte del remito"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {transferItems.length > 0 && (
                <tfoot className="bg-gray-100 font-bold border-t border-gray-300">
                  <tr>
                    <td colSpan={5} className="p-2 text-right">TOTALES DESPACHADOS:</td>
                    <td className="p-2 text-center font-mono text-blue-900">{formatKg(totals.kilos)}</td>
                    <td className="p-2 text-right font-mono text-green-900">{formatCurrency(totals.value)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* FOOTER ACCIONES */}
        <div className="p-3 bg-[#d4d0c8] border-t border-gray-400 flex items-center justify-between">
          <div className="text-xs text-gray-700">
            Total ítems: <strong>{totals.itemsCount}</strong> | Kilos netos:{' '}
            <strong className="text-blue-900 font-mono">{formatKg(totals.kilos)}</strong>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="win-button py-1.5 px-3 text-xs text-gray-800"
            >
              Cancelar
            </button>

            <button
              disabled={isSubmitting || transferItems.length === 0}
              onClick={() => handleSave(false)}
              className="win-button py-1.5 px-3 text-xs font-bold text-gray-800 disabled:opacity-50 flex items-center space-x-1"
            >
              <Save className="w-3.5 h-3.5 text-gray-600" />
              <span>Guardar Borrador</span>
            </button>

            <button
              disabled={isSubmitting || transferItems.length === 0}
              onClick={() => handleSave(true)}
              className="win-button py-1.5 px-4 text-xs font-bold text-white bg-[#002046] hover:bg-[#002c61] disabled:opacity-50 flex items-center space-x-1.5"
            >
              <Send className="w-4 h-4 text-white" />
              <span>{isSubmitting ? 'Procesando...' : 'Despachar Inmediatamente'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
