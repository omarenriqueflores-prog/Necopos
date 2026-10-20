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
  const { products, branchStock, saveStockTransfer, dispatchStockTransfer, localUser, user, meatReceptions, meatDebonings } = useFirebase();

  const [originBranch, setOriginBranch] = useState<'NECO 1' | 'NECO 2'>('NECO 1');
  const [destinationBranch, setDestinationBranch] = useState<'NECO 1' | 'NECO 2'>('NECO 2');
  const [driverName, setDriverName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [notes, setNotes] = useState('');
  const [inlineNotification, setInlineNotification] = useState<{ type: 'info' | 'warning' | 'error' | 'success'; message: string } | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Recepciones disponibles (medias reses en gancho en cámara)
  const availableReceptions = useMemo(() => {
    if (!meatReceptions) return [];
    const debonedTropas = new Set(meatDebonings?.map((d) => d.tropaNumber?.trim().toLowerCase()).filter(Boolean) || []);
    const debonedCodes = new Set(meatDebonings?.map((d) => d.sourceProductCode?.trim()).filter(Boolean) || []);

    return meatReceptions.filter((r) => {
      if (r.status !== 'CONFIRMADO') return false;
      if (r.branchId && r.branchId !== originBranch) return false;
      const tropaLower = r.tropaNumber?.trim().toLowerCase();
      if (tropaLower && debonedTropas.has(tropaLower)) return false;
      if (r.productCode && debonedCodes.has(r.productCode.trim())) return false;
      return true;
    });
  }, [meatReceptions, meatDebonings, originBranch]);

  const filteredReceptions = useMemo(() => {
    if (!searchFilter.trim()) return availableReceptions;
    const q = searchFilter.toLowerCase().trim();
    return availableReceptions.filter(
      (r) =>
        r.tropaNumber.toLowerCase().includes(q) ||
        r.supplier.toLowerCase().includes(q) ||
        r.species.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }, [availableReceptions, searchFilter]);

  const filteredProducts = useMemo(() => {
    if (!searchFilter.trim()) return products.slice(0, 100);
    const q = searchFilter.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
    );
  }, [products, searchFilter]);

  // Items en preparación para transferir
  const [transferItems, setTransferItems] = useState<StockTransferItem[]>([]);

  // Selector de nuevo corte o media res
  const [selectedTargetCode, setSelectedTargetCode] = useState<string>(() => {
    return defaultProduct?.code || '';
  });
  const [addQuantity, setAddQuantity] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const operatorName = localUser?.fullName || user?.displayName || localUser?.username || 'Encargado de Cámara';

  // Cambiar origen/destino mutuamente
  const handleOriginChange = (newOrigin: 'NECO 1' | 'NECO 2') => {
    setOriginBranch(newOrigin);
    setDestinationBranch(newOrigin === 'NECO 1' ? 'NECO 2' : 'NECO 1');
    setSelectedTargetCode('');
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

  // Identidad de un ítem del remito: las medias reses se distinguen por recepción (tropa),
  // aunque todas compartan el mismo código de producto (MEDIA_RES).
  const itemKey = (it: { productCode: string; receptionId?: string }) => it.receptionId || it.productCode;

  // Cantidad ya cargada en el remito para un código de producto (suma de todos los ítems con ese código)
  const getQtyInRemitoByCode = (code: string, excludeIndex?: number) =>
    Number(
      transferItems
        .reduce((acc, it, i) => (i !== excludeIndex && it.productCode === code ? acc + it.quantity : acc), 0)
        .toFixed(3)
    );

  const getRemainingStock = (code: string) => {
    const totalStock = getOriginStock(code);
    return Number(Math.max(0, totalStock - getQtyInRemitoByCode(code)).toFixed(3));
  };

  const selectedReception = useMemo(() => {
    if (!selectedTargetCode.startsWith('REC:')) return null;
    const recId = selectedTargetCode.replace('REC:', '');
    return availableReceptions.find((r) => r.id === recId) || null;
  }, [availableReceptions, selectedTargetCode]);

  const selectedProduct = useMemo(() => {
    if (selectedTargetCode.startsWith('REC:')) return null;
    return products.find((p) => p.code === selectedTargetCode) || null;
  }, [products, selectedTargetCode]);

  const currentItemStockOrWeight = useMemo(() => {
    if (selectedReception) return Number(selectedReception.totalWeightKg) || 0;
    if (selectedTargetCode && !selectedTargetCode.startsWith('REC:')) {
      return getOriginStock(selectedTargetCode);
    }
    return 0;
  }, [selectedReception, selectedTargetCode, branchStock, originBranch]);

  const currentItemRemaining = useMemo(() => {
    if (selectedReception) {
      const prodCode = selectedReception.productCode || 'MEDIA_RES';
      const inRemitoThisReception = transferItems.find((it) => it.receptionId === selectedReception.id)?.quantity || 0;
      const byReception = selectedReception.totalWeightKg - inRemitoThisReception;
      const byStock = getOriginStock(prodCode) - getQtyInRemitoByCode(prodCode);
      return Number(Math.max(0, Math.min(byReception, byStock)).toFixed(3));
    }
    if (selectedTargetCode && !selectedTargetCode.startsWith('REC:')) {
      return getRemainingStock(selectedTargetCode);
    }
    return 0;
  }, [selectedReception, selectedTargetCode, branchStock, originBranch, transferItems]);

  const handleAddItem = () => {
    if (selectedReception) {
      const prodCode = selectedReception.productCode || 'MEDIA_RES';
      const desc = `MEDIA RES - Tropa #${selectedReception.tropaNumber} (${selectedReception.species} ${selectedReception.category} - ${selectedReception.supplier})`;
      const cat = selectedReception.category;
      const unitType = 'Kg';
      const price = selectedReception.pricePerKg;
      const available = selectedReception.totalWeightKg;

      const qty = Number(addQuantity) || 0;
      if (qty <= 0) {
        setInlineNotification({ type: 'warning', message: 'La cantidad a transferir debe ser mayor a cero.' });
        return;
      }

      // Cada tropa/recepción es un ítem propio del remito (se pueden agregar varias)
      const existingIndex = transferItems.findIndex((it) => it.receptionId === selectedReception.id);
      const currentInRemito = existingIndex >= 0 ? transferItems[existingIndex].quantity : 0;
      const totalRequested = Number((currentInRemito + qty).toFixed(3));

      if (totalRequested > available) {
        setInlineNotification({
          type: 'error',
          message: `⛔ Stock insuficiente para la media res Tropa #${selectedReception.tropaNumber}. Peso disponible: ${formatQuantity(available, unitType)}.`,
        });
        return;
      }

      const stockForCode = getOriginStock(prodCode);
      if (getQtyInRemitoByCode(prodCode) + qty > stockForCode + 0.001) {
        setInlineNotification({
          type: 'error',
          message: `⛔ Stock insuficiente en ${originBranch}: hay ${formatQuantity(stockForCode, unitType)} de media res en cámara y el remito ya lleva ${formatQuantity(getQtyInRemitoByCode(prodCode), unitType)}.`,
        });
        return;
      }

      setInlineNotification({
        type: 'success',
        message: `✓ Se agregó Tropa #${selectedReception.tropaNumber} (${formatQuantity(qty, unitType)}) al remito de traslado.`,
      });

      if (existingIndex >= 0) {
        const updated = [...transferItems];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: totalRequested,
          totalValue: Number((totalRequested * price).toFixed(2)),
        };
        setTransferItems(updated);
      } else {
        setTransferItems([
          ...transferItems,
          {
            productCode: prodCode,
            description: desc,
            category: cat,
            unitType,
            quantity: qty,
            price,
            totalValue: Number((qty * price).toFixed(2)),
            receptionId: selectedReception.id,
          },
        ]);
      }

      setSelectedTargetCode('');
      setAddQuantity('');
      return;
    }

    const product = products.find((p) => p.code === selectedTargetCode);
    if (!product) return;

    const available = getOriginStock(product.code);

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

    const existingIndex = transferItems.findIndex((it) => it.productCode === product.code && !it.receptionId);
    const currentInRemito = existingIndex >= 0 ? transferItems[existingIndex].quantity : 0;
    const totalRequested = Number((currentInRemito + qty).toFixed(3));

    // El stock se valida contra TODO lo que ya lleva el remito con ese código (incluye tropas de media res)
    if (getQtyInRemitoByCode(product.code) + qty > available + 0.001) {
      const maxAllowed = Number((available - getQtyInRemitoByCode(product.code)).toFixed(3));
      setInlineNotification({
        type: 'error',
        message: `⛔ Stock insuficiente: En ${originBranch} hay ${formatQuantity(available, product.unitType)} de "${product.description}".`,
      });
      return;
    }

    setInlineNotification({
      type: 'success',
      message: `✓ Se agregaron ${formatQuantity(qty, product.unitType)} de ${product.description} al remito de traslado.`,
    });

    if (existingIndex >= 0) {
      const updated = [...transferItems];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: totalRequested,
        totalValue: Number((totalRequested * product.price).toFixed(2)),
      };
      setTransferItems(updated);
    } else {
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

    setSelectedTargetCode('');
    setAddQuantity('');
  };

  const handleRemoveItem = (index: number) => {
    setTransferItems(transferItems.filter((_, i) => i !== index));
  };

  const handleUpdateItemQty = (index: number, newQtyVal: number) => {
    const updated = [...transferItems];
    const it = updated[index];
    const stockAvail = getOriginStock(it.productCode) - getQtyInRemitoByCode(it.productCode, index);
    const receptionWeight = it.receptionId
      ? Number(meatReceptions?.find((r) => r.id === it.receptionId)?.totalWeightKg) || Infinity
      : Infinity;
    const avail = Math.max(0, Math.min(stockAvail, receptionWeight));
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
    const totalsByCode = new Map<string, { qty: number; description: string; unitType: any }>();
    for (const it of transferItems) {
      const acc = totalsByCode.get(it.productCode) || { qty: 0, description: it.description, unitType: it.unitType };
      acc.qty = Number((acc.qty + it.quantity).toFixed(3));
      totalsByCode.set(it.productCode, acc);
    }
    for (const [code, acc] of totalsByCode.entries()) {
      const avail = getOriginStock(code);
      if (acc.qty > avail + 0.001) {
        setInlineNotification({
          type: 'error',
          message: `⛔ No se puede procesar el traslado: "${acc.description}" requiere ${formatQuantity(acc.qty, acc.unitType)} pero el stock en ${originBranch} es de ${formatQuantity(avail, acc.unitType)}.`,
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

          {/* AGREGAR CORTES O MEDIAS RESES */}
          <div className="p-3 bg-white border border-gray-400 rounded space-y-2">
            <div className="font-bold text-gray-800 flex items-center space-x-1.5 border-b pb-1.5">
              <Plus className="w-4 h-4 text-blue-800" />
              <span>Incorporar Cortes o Medias Reses en Cámara al Remito de Traslado</span>
            </div>

            <div className="space-y-2">
              <div>
                <label className="block font-bold text-gray-700 mb-1 text-[11px]">
                  Buscar artículo, corte de carne o media res en cámara ({originBranch}):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    className="win-input w-full pl-6 pr-2 py-1.5 text-xs text-black font-medium border border-gray-400"
                    placeholder="Buscar por descripción, tropa o proveedor..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                  />
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-1.5 top-2" />
                </div>
              </div>

              <div className="max-h-[200px] overflow-y-auto border-2 border-gray-400 bg-white rounded shadow-inner divide-y divide-gray-200 text-xs font-mono">
                {filteredReceptions.length > 0 && (
                  <div>
                    <div className="bg-amber-100 text-amber-900 font-bold px-2 py-1 text-[11px] sticky top-0 border-b border-amber-300 flex items-center justify-between">
                      <span>🥩 MEDIAS RESES / CANALES EN GANCHO (CÁMARA)</span>
                      <span className="text-[10px] bg-amber-200 px-1.5 py-0.5 rounded text-amber-900">Traslado Frigorífico</span>
                    </div>
                    {filteredReceptions.map((r) => {
                      const targetCode = `REC:${r.id}`;
                      const isSel = selectedTargetCode === targetCode;
                      const addedQty = transferItems.find((it) => it.receptionId === r.id)?.quantity || 0;
                      return (
                        <div
                          key={r.id}
                          onClick={() => {
                            setSelectedTargetCode(targetCode);
                            setAddQuantity(r.totalWeightKg.toString());
                          }}
                          className={`p-2 cursor-pointer flex items-center justify-between transition-colors ${
                            isSel ? 'bg-[#002046] text-white font-bold' : 'hover:bg-gray-100 text-black'
                          }`}
                        >
                          <div>
                            <div className="font-bold">Tropa #{r.tropaNumber} - {r.species} ({r.category})</div>
                            <div className={`text-[10px] ${isSel ? 'text-gray-200' : 'text-gray-600'}`}>
                              Proveedor: {r.supplier} | Fecha: {r.date}
                            </div>
                          </div>
                          <div className="text-right font-bold text-amber-800 font-mono">
                            <span className={isSel ? 'text-white' : ''}>{formatKg(r.totalWeightKg)}</span>
                            {addedQty > 0 && (
                              <div className={`text-[10px] ${isSel ? 'text-green-200' : 'text-green-700'}`}>✓ En remito: {formatKg(addedQty)}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {filteredProducts.length > 0 && (
                  <div>
                    <div className="bg-blue-100 text-blue-900 font-bold px-2 py-1 text-[11px] sticky top-0 border-b border-blue-300">
                      📦 CORTES Y ARTÍCULOS DE STOCK
                    </div>
                    {filteredProducts.map((p) => {
                      const isSel = selectedTargetCode === p.code;
                      const st = getOriginStock(p.code);
                      const isZero = st <= 0;
                      return (
                        <div
                          key={p.code}
                          onClick={() => {
                            setSelectedTargetCode(p.code);
                            setAddQuantity('');
                          }}
                          className={`p-2 cursor-pointer flex items-center justify-between transition-colors ${
                            isSel ? 'bg-[#002046] text-white font-bold' : isZero ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-100 text-black'
                          }`}
                        >
                          <div>
                            <div className="font-bold">{p.code} - {p.description}</div>
                            <div className={`text-[10px] ${isSel ? 'text-gray-200' : 'text-gray-500'}`}>
                              Categoría: {p.category || 'Carnes Vacunas'} | Unidad: {p.unitType}
                            </div>
                          </div>
                          <div className="text-right font-mono font-bold">
                            {isZero ? <span className="text-red-600">SIN STOCK</span> : <span>Disp: {formatQuantity(st, p.unitType)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end pt-1">
                <div className="md:col-span-8">
                  {selectedReception ? (
                    <div className="text-[11px] text-emerald-700 font-bold">
                      ✓ Media res seleccionada: Tropa #{selectedReception.tropaNumber} ({selectedReception.species} {selectedReception.category}) — Peso: {formatKg(selectedReception.totalWeightKg)}
                    </div>
                  ) : selectedProduct ? (
                    <div className="text-[11px]">
                      {currentItemStockOrWeight <= 0 ? (
                        <span className="text-red-700 font-bold">
                          ⛔ Sin stock en {originBranch} (0,000 {selectedProduct.unitType}) — Movimiento bloqueado
                        </span>
                      ) : currentItemRemaining <= 0 ? (
                        <span className="text-amber-700 font-bold">
                          ⚠️ Ya se asignó todo el stock disponible ({formatQuantity(currentItemStockOrWeight, selectedProduct.unitType)}) al remito.
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-bold">
                          ✓ Stock disponible para transferir: {formatQuantity(currentItemRemaining, selectedProduct.unitType)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-500 italic">
                      Seleccioná una media res de cámara o un corte de stock de la lista superior.
                    </div>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block font-bold text-gray-700 mb-1 text-[11px]">Cantidad:</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    max={currentItemRemaining > 0 ? currentItemRemaining : undefined}
                    disabled={!selectedTargetCode || currentItemRemaining <= 0}
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
                      !selectedTargetCode ||
                      currentItemRemaining <= 0 ||
                      (Number(addQuantity) || 0) <= 0 ||
                      (Number(addQuantity) || 0) > currentItemRemaining
                    }
                    className="win-button w-full py-1.5 font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center space-x-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-700" />
                    <span>Agregar</span>
                  </button>
                </div>
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
                    <tr key={itemKey(item)} className="hover:bg-gray-50">
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
