import React, { useState, useMemo, useEffect } from 'react';
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
import {
  isMeatProduct,
  getStorageLocationName,
  getStoreRubroLabel,
  formatKg,
  formatQuantity,
  formatCurrency,
} from '../../utils/stockHelper';

interface StockAdjustmentsTabProps {
  initialProduct?: Product | null;
  initialBranch?: 'NECO 1' | 'NECO 2';
}

export const StockAdjustmentsTab: React.FC<StockAdjustmentsTabProps> = ({
  initialProduct,
  initialBranch = 'NECO 1',
}) => {
  const { products, branchStock, recordStockMovement, stockMovements, localUser, user, meatReceptions, meatDebonings, saveMeatReception } = useFirebase();

  const [branchId, setBranchId] = useState<'NECO 1' | 'NECO 2'>(initialBranch);
  const [selectedTargetCode, setSelectedTargetCode] = useState<string>(initialProduct?.code || '');
  const [type, setType] = useState<StockMovementType>('MERMA');
  const [quantity, setQuantity] = useState<string>('');
  const [reason, setReason] = useState<string>('Evaporación natural en cámara de frío');
  const [customReason, setCustomReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [productSearch, setProductSearch] = useState<string>('');
  const [selectedCarcassId, setSelectedCarcassId] = useState<string | null>(null);
  const [newUnitWeight, setNewUnitWeight] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialProduct) {
      setSelectedTargetCode(initialProduct.code);
      if (!isMeatProduct(initialProduct)) {
        setType('ENTRADA');
        setReason('Ingreso directo de proveedor / Mercadería');
      }
    }
    if (initialBranch) {
      setBranchId(initialBranch);
    }
  }, [initialProduct, initialBranch]);

  const operatorName = localUser?.fullName || user?.displayName || localUser?.username || 'Encargado de Stock';

  // Recepciones disponibles (medias reses en gancho en cámara)
  const availableReceptions = useMemo(() => {
    if (!meatReceptions) return [];
    const debonedTropas = new Set(meatDebonings?.map((d) => d.tropaNumber?.trim().toLowerCase()).filter(Boolean) || []);
    const debonedCodes = new Set(meatDebonings?.map((d) => d.sourceProductCode?.trim()).filter(Boolean) || []);

    return meatReceptions.filter((r) => {
      if (r.status !== 'CONFIRMADO') return false;
      if (r.branchId && r.branchId !== branchId) return false;
      const tropaLower = r.tropaNumber?.trim().toLowerCase();
      if (tropaLower && debonedTropas.has(tropaLower)) return false;
      if (r.productCode && debonedCodes.has(r.productCode.trim())) return false;
      return true;
    });
  }, [meatReceptions, meatDebonings, branchId]);

  const filteredReceptions = useMemo(() => {
    if (!productSearch.trim()) return availableReceptions;
    const q = productSearch.toLowerCase().trim();
    return availableReceptions.filter(
      (r) =>
        r.tropaNumber.toLowerCase().includes(q) ||
        r.supplier.toLowerCase().includes(q) ||
        r.species.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }, [availableReceptions, productSearch]);

  // Productos filtrados para el selector (también busca por código de barras)
  const filteredProducts = useMemo(() => {
    const validProducts = (products || []).filter(Boolean);
    if (!productSearch.trim()) return validProducts.slice(0, 120);
    const q = productSearch.toLowerCase().trim();
    return validProducts.filter(
      (p) =>
        (p?.code && p.code.toLowerCase().includes(q)) ||
        (p?.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p?.description && p.description.toLowerCase().includes(q)) ||
        (p?.scalePlu && p.scalePlu.toString().includes(q))
    );
  }, [products, productSearch]);

  const filteredMeatProducts = useMemo(
    () => filteredProducts.filter((p) => isMeatProduct(p)),
    [filteredProducts]
  );

  const filteredStoreProducts = useMemo(
    () => filteredProducts.filter((p) => !isMeatProduct(p)),
    [filteredProducts]
  );

  // Buscar elemento seleccionado (reception o product)
  const selectedReception = useMemo(() => {
    if (!selectedTargetCode.startsWith('REC:')) return null;
    const recId = selectedTargetCode.replace('REC:', '');
    return availableReceptions.find((r) => r.id === recId) || null;
  }, [availableReceptions, selectedTargetCode]);

  const selectedProduct = useMemo(() => {
    if (selectedTargetCode.startsWith('REC:')) return null;
    return products.find((p) => p.code === selectedTargetCode) || null;
  }, [products, selectedTargetCode]);

  // Unidades individuales (medias reses) de la recepción seleccionada
  const selectedCarcasses = useMemo(() => {
    return selectedReception?.carcasses || [];
  }, [selectedReception]);

  const selectedCarcass = useMemo(() => {
    return selectedCarcasses.find((c) => c.id === selectedCarcassId) || null;
  }, [selectedCarcasses, selectedCarcassId]);

  // Resetea la unidad elegida cuando cambia la recepción seleccionada
  useEffect(() => {
    setSelectedCarcassId(null);
    setNewUnitWeight('');
  }, [selectedTargetCode]);

  useEffect(() => {
    setNewUnitWeight('');
  }, [selectedCarcassId]);

  const isSelectedMeat = useMemo(() => {
    if (selectedReception) return true;
    return isMeatProduct(selectedProduct);
  }, [selectedReception, selectedProduct]);

  // Stock actual o peso actual de la media res (unidad individual o total de la recepción)
  const currentStockOrWeight = useMemo(() => {
    if (selectedReception && selectedCarcass) return Number(selectedCarcass.weightKg) || 0;
    if (selectedReception) return Number(selectedReception.totalWeightKg) || 0;
    if (selectedTargetCode && !selectedTargetCode.startsWith('REC:')) {
      const found = branchStock.find((s) => s.branchId === branchId && s.productCode === selectedTargetCode);
      return found ? Number(found.currentStock) || 0 : 0;
    }
    return 0;
  }, [selectedReception, selectedCarcass, selectedTargetCode, branchStock, branchId]);

  // Cálculo de stock resultante
  const qtyNumber = Number(quantity) || 0;
  const isPositive = type === 'AJUSTE_POSITIVO' || type === 'ENTRADA';
  // Modo repesaje: el usuario ingresa el peso nuevo de la unidad y el sistema calcula la diferencia
  const isNewWeightMode = !!selectedCarcass && newUnitWeight.trim() !== '' && Number(newUnitWeight) >= 0;
  const newWeightNumber = isNewWeightMode ? Number(Number(newUnitWeight).toFixed(3)) : 0;
  const effectiveQty = isNewWeightMode ? Number(Math.abs(newWeightNumber - (Number(selectedCarcass!.weightKg) || 0)).toFixed(3)) : qtyNumber;
  const effectiveIsPositive = isNewWeightMode ? newWeightNumber >= (Number(selectedCarcass!.weightKg) || 0) : isPositive;
  const newStockCalculated = isNewWeightMode
    ? newWeightNumber
    : Number((isPositive ? currentStockOrWeight + qtyNumber : currentStockOrWeight - qtyNumber).toFixed(3));

  const selectedItemName = selectedCarcass
    ? `MEDIA RES ${selectedCarcass.label || ''} - Tropa #${selectedReception?.tropaNumber}${selectedCarcass.tagNumber ? ` (Caravana ${selectedCarcass.tagNumber})` : ''}`
    : selectedReception
    ? `MEDIA RES - Tropa #${selectedReception.tropaNumber} (${selectedReception.species} ${selectedReception.category} - ${selectedReception.supplier})`
    : selectedProduct?.description || '';

  const selectedItemCategory = selectedReception
    ? selectedReception.category
    : selectedProduct
    ? isSelectedMeat
      ? selectedProduct.category || 'Carnes Vacunas'
      : getStoreRubroLabel(selectedProduct)
    : 'Carnes Vacunas';
  const selectedItemPrice = selectedReception ? selectedReception.pricePerKg : selectedProduct?.price || 0;
  const selectedItemUnit = selectedReception ? 'Kg' : selectedProduct?.unitType || 'Kg';

  // Opciones de motivo predeterminadas
  const reasonOptions = [
    'Ingreso directo de proveedor / Mercadería',
    'Evaporación natural en cámara de frío',
    'Desposte / Deshuese',
    'Exceso de grasa / Hueso no aprovechable',
    'Rotura de frío / Deterioro / Envase dañado',
    'Vencimiento de mercadería',
    'Diferencia de pesaje o conteo físico',
    'Otro motivo (especificar)',
  ];

  // Movimientos recientes de ajuste/merma
  const recentAdjustments = useMemo(() => {
    return stockMovements
      .filter((m) => ['MERMA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'ENTRADA'].includes(m.type))
      .slice(0, 30);
  }, [stockMovements]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReception && !selectedProduct) {
      setErrorMessage('Seleccione un artículo o media res en cámara.');
      return;
    }
    if (effectiveQty <= 0) {
      setErrorMessage(isNewWeightMode ? 'El peso nuevo es igual al peso actual, no hay diferencia que ajustar.' : 'Ingrese una cantidad válida mayor a 0.');
      return;
    }

    try {
      setIsSubmitting(true);
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const finalReason = reason === 'Otro motivo (especificar)' ? customReason : reason;
      // En modo repesaje se usa el peso nuevo de la unidad; en modo manual, la cantidad ingresada
      const effQty = isNewWeightMode ? effectiveQty : qtyNumber;
      const effPositive = isNewWeightMode ? effectiveIsPositive : isPositive;
      const movementQty = effQty;
      const movementFactor = effPositive ? 1 : -1;
      const movementType = isNewWeightMode ? (effPositive ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO') : type;

      const movement: StockMovement = {
        id: `SM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        date: dateStr,
        time: timeStr,
        timestamp: Date.now(),
        branchId,
        chamber: getStorageLocationName(branchId, isSelectedMeat),
        productCode: selectedReception ? (selectedReception.productCode?.trim() || 'MEDIA_RES') : selectedProduct!.code,
        productDescription: selectedItemName,
        category: selectedItemCategory,
        unitType: selectedItemUnit,
        type: movementType,
        quantity: movementQty,
        factor: movementFactor,
        previousStock: currentStockOrWeight,
        newStock: newStockCalculated,
        unitPrice: selectedItemPrice,
        totalValue: Number((movementQty * selectedItemPrice).toFixed(2)),
        referenceDoc: selectedReception ? selectedReception.code : `AJUSTE-${Date.now().toString().slice(-6)}`,
        idempotencyKey: `ADJ_${Date.now()}_${selectedReception ? selectedReception.code + (selectedCarcass ? '_' + selectedCarcass.id : '') : selectedProduct!.code}`,
        operator: operatorName,
        reason: finalReason,
        notes:
          notes.trim() ||
          (selectedCarcass
            ? `Ajuste de Media Res ${selectedCarcass.label || selectedCarcass.id} (Tropa ${selectedReception?.tropaNumber}) en cámara${isNewWeightMode ? ` — Repesaje: ${formatKg(Number(selectedCarcass.weightKg) || 0)} → ${formatKg(newWeightNumber)}` : ''}`
            : selectedReception
            ? `Ajuste de Media Res Tropa ${selectedReception.tropaNumber} en cámara`
            : undefined),
      };

      await recordStockMovement(movement);

      if (selectedReception) {
        if (selectedReception.status === 'DESPOSTADO' || selectedReception.carcasses?.some((c) => c.status === 'DESPOSTADO')) {
          setErrorMessage('No se permite ajustar una recepción que ya ha sido despostada.');
          setIsSubmitting(false);
          return;
        }

        const diff = (isNewWeightMode ? (effectiveIsPositive ? effectiveQty : -effectiveQty) : (isPositive ? qtyNumber : -qtyNumber));

        // Ajuste por UNIDAD individual: se modifica solo la media res pesada en cámara
        let updatedCarcasses = selectedReception.carcasses;
        let newTotalWeight: number;

        if (selectedCarcass && updatedCarcasses && updatedCarcasses.length > 0) {
          const newUnitWeight = isNewWeightMode
            ? newWeightNumber
            : Number(Math.max(0, (Number(selectedCarcass.weightKg) || 0) + diff).toFixed(3));
          updatedCarcasses = updatedCarcasses.map((c) =>
            c.id === selectedCarcass.id
              ? {
                  ...c,
                  weightKg: newUnitWeight,
                  notes: (c.notes ? `${c.notes} | ` : '') + `Ajuste ${type} ${diff > 0 ? '+' : ''}${diff.toFixed(3)} Kg: ${finalReason}`,
                }
              : c
          );
          newTotalWeight = Number(updatedCarcasses.reduce((sum, c) => sum + (Number(c.weightKg) || 0), 0).toFixed(3));
        } else {
          // Ajuste global de la recepción (distribución proporcional)
          newTotalWeight = Number(Math.max(0, selectedReception.totalWeightKg + diff).toFixed(3));
          if (updatedCarcasses && updatedCarcasses.length > 0 && selectedReception.totalWeightKg > 0) {
            const ratio = newTotalWeight / selectedReception.totalWeightKg;
            updatedCarcasses = updatedCarcasses.map((c) => ({
              ...c,
              weightKg: Number((c.weightKg * ratio).toFixed(3)),
            }));
          }
        }

        const updatedRec = {
          ...selectedReception,
          totalWeightKg: newTotalWeight,
          carcasses: updatedCarcasses,
          notes: (selectedReception.notes ? `${selectedReception.notes} | ` : '') + `Ajuste ${type}${selectedCarcass ? ` (${selectedCarcass.label || selectedCarcass.id})` : ''}: ${diff > 0 ? '+' : ''}${diff.toFixed(3)} Kg (${finalReason})`,
        };
        await saveMeatReception(updatedRec);
      }

      setSuccessMessage(
        `¡${movementType} registrado exitosamente! Stock de ${selectedItemName} actualizado a ${formatQuantity(newStockCalculated, selectedItemUnit)}.`
      );
      setErrorMessage(null);
      setQuantity('');
      setNewUnitWeight('');
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

          {/* Selector de Producto o Media Res en Cámara */}
          <div>
            <label className="block font-bold text-black mb-1">
              Artículo, Corte de Carne o Media Res en Cámara:
            </label>
            <div className="mb-1">
              <input
                type="text"
                className="win-input w-full p-1.5 text-xs text-black font-medium border border-gray-400 placeholder:text-gray-500"
                placeholder="Buscar por descripción, tropa o proveedor..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>

            <div className="max-h-[220px] overflow-y-auto border-2 border-gray-400 bg-white rounded shadow-inner divide-y divide-gray-200 text-xs font-mono">
              {filteredReceptions.length > 0 && (
                <div>
                  <div className="bg-amber-100 text-amber-900 font-bold px-2 py-1.5 text-[11px] sticky top-0 border-b border-amber-300 flex items-center justify-between">
                    <span>🥩 MEDIAS RESES / CANALES EN GANCHO (CÁMARA)</span>
                    <span className="text-[10px] bg-amber-200 px-1.5 py-0.5 rounded text-amber-900">Merma Natural</span>
                  </div>
                  {filteredReceptions.map((r) => {
                    const targetCode = `REC:${r.id}`;
                    const isSel = selectedTargetCode === targetCode;
                    return (
                      <div
                        key={r.id}
                        onClick={() => setSelectedTargetCode(targetCode)}
                        className={`p-2.5 cursor-pointer flex items-center justify-between transition-colors ${
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {filteredMeatProducts.length > 0 && (
                <div>
                  <div className="bg-blue-100 text-blue-900 font-bold px-2 py-1.5 text-[11px] sticky top-0 border-b border-blue-300">
                    ❄️ CORTES CÁRNICOS EN CÁMARA FRIGORÍFICA
                  </div>
                  {filteredMeatProducts.map((p) => {
                    const isSel = selectedTargetCode === p.code;
                    return (
                      <div
                        key={p.code}
                        onClick={() => setSelectedTargetCode(p.code)}
                        className={`p-2.5 cursor-pointer flex items-center justify-between transition-colors ${
                          isSel ? 'bg-[#002046] text-white font-bold' : 'hover:bg-gray-100 text-black'
                        }`}
                      >
                        <div>
                          <span className="font-mono font-bold">[{p.code}]</span> {p.description || p.code} ({p.category || 'General'})
                        </div>
                        <div className="text-right">
                          {formatCurrency(p.price || 0)} / {p.unitType || 'Unid'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {filteredStoreProducts.length > 0 && (
                <div>
                  <div className="bg-emerald-100 text-emerald-950 font-bold px-2 py-1.5 text-[11px] sticky top-0 border-b border-emerald-300">
                    🏪 ARTÍCULOS DE ALMACÉN, BEBIDAS Y VARIOS (DEPÓSITO)
                  </div>
                  {filteredStoreProducts.map((p) => {
                    const isSel = selectedTargetCode === p.code;
                    return (
                      <div
                        key={p.code}
                        onClick={() => setSelectedTargetCode(p.code)}
                        className={`p-2.5 cursor-pointer flex items-center justify-between transition-colors ${
                          isSel ? 'bg-[#00522c] text-white font-bold' : 'hover:bg-emerald-50 text-black'
                        }`}
                      >
                        <div>
                          <span className="font-mono font-bold">[{p.code}]</span> {p.description || p.code} ({getStoreRubroLabel(p)})
                        </div>
                        <div className="text-right">
                          {formatCurrency(p.price || 0)} / Unid
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {filteredReceptions.length === 0 && filteredProducts.length === 0 && (
                <div className="p-4 text-center text-gray-500 text-xs">
                  No se encontraron resultados para la búsqueda.
                </div>
              )}
            </div>
          </div>

          {/* Visualizador de Stocks / Pesos */}
          {(selectedReception || selectedProduct) && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded grid grid-cols-3 gap-2 text-center font-mono">
              <div>
                <div className="text-[10px] font-bold text-gray-700">
                  {selectedReception ? 'Peso en Gancho' : 'Stock Actual'}
                </div>
                <div className="text-sm font-bold text-black">
                  {formatQuantity(currentStockOrWeight, selectedItemUnit)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-700">Variación</div>
                <div
                  className={`text-sm font-bold ${
                    effectiveIsPositive ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {effectiveIsPositive ? '+' : '-'}
                  {formatQuantity(effectiveQty, selectedItemUnit)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-700">
                  {selectedReception ? 'Peso Resultante' : 'Stock Resultante'}
                </div>
                <div
                  className={`text-sm font-bold ${
                    newStockCalculated < 0 ? 'text-red-700' : 'text-blue-900'
                  }`}
                >
                  {formatQuantity(newStockCalculated, selectedItemUnit)}
                </div>
              </div>
            </div>
          )}

          {/* LISTA DE MEDIAS RESES INDIVIDUALES (ajuste unidad por unidad) */}
          {selectedReception && selectedCarcasses.length > 0 && (
            <div className="border border-amber-300 rounded bg-amber-50">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-amber-300 bg-amber-100">
                <span className="font-bold text-[11px] text-amber-900">
                  🥩 Medias Reses Individuales ({selectedCarcasses.length} unid.)
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCarcassId(null)}
                  className={`text-[10px] px-2 py-0.5 rounded font-bold border cursor-pointer ${
                    !selectedCarcassId
                      ? 'bg-[#002046] text-white border-[#002046]'
                      : 'bg-white text-gray-700 border-gray-400 hover:bg-gray-100'
                  }`}
                >
                  Toda la tropa (ajuste proporcional)
                </button>
              </div>
              <div className="max-h-[180px] overflow-y-auto divide-y divide-amber-200">
                {selectedCarcasses.map((c) => {
                  const isSel = selectedCarcassId === c.id;
                  const st = c.status || 'DISPONIBLE';
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCarcassId(isSel ? null : c.id)}
                      className={`px-2 py-1.5 cursor-pointer flex items-center justify-between text-[11px] font-mono transition-colors ${
                        isSel ? 'bg-[#002046] text-white font-bold' : 'hover:bg-amber-100 text-black'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span
                          className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                            isSel
                              ? 'bg-white text-[#002046]'
                              : st === 'DISPONIBLE'
                              ? 'bg-green-100 text-green-800'
                              : st === 'PENDIENTE'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {st}
                        </span>
                        <span className="font-bold">{c.label || 'MR'}</span>
                        {c.tagNumber && <span className="text-[10px] opacity-75">Car. {c.tagNumber}</span>}
                      </div>
                      <div className={`font-bold ${isSel ? 'text-white' : 'text-amber-800'}`}>
                        {formatKg(c.weightKg)}
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedCarcass && (
                <div className="px-2 py-1.5 bg-[#002046] text-white text-[10px] font-bold">
                  ➜ Ajustando SOLO la unidad {selectedCarcass.label || selectedCarcass.id} — peso nuevo: {formatQuantity(newStockCalculated, 'Kg')}
                </div>
              )}
            </div>
          )}

          {/* Cantidad / Repesaje */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              {selectedCarcass ? (
                <>
                  <label className="block font-bold text-black mb-1">
                    Peso Nuevo en Balanza (Kg):
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    className="win-input w-full p-2 text-sm font-mono font-bold text-black border-2 border-amber-500 bg-amber-50"
                    placeholder={`Actual: ${formatKg(selectedCarcass.weightKg)}`}
                    value={newUnitWeight}
                    onChange={(e) => setNewUnitWeight(e.target.value)}
                  />
                  {isNewWeightMode && (
                    <div className={`mt-1 text-[11px] font-bold ${effectiveIsPositive ? 'text-green-700' : 'text-red-700'}`}>
                      Diferencia: {effectiveIsPositive ? '+' : ''}{formatKg(effectiveQty)} ({formatKg(selectedCarcass.weightKg)} → {formatKg(newWeightNumber)})
                    </div>
                  )}
                </>
              ) : (
                <>
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
                </>
              )}
            </div>

            <div>
              <label className="block font-bold text-black mb-1">Valorización Comercial:</label>
              <div className="p-2 bg-gray-100 border border-gray-400 rounded font-mono font-bold text-sm text-black">
                {formatCurrency(effectiveQty * selectedItemPrice)}
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
              disabled={isSubmitting || (!selectedProduct && !selectedReception) || (isNewWeightMode ? effectiveQty <= 0 : qtyNumber <= 0)}
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
