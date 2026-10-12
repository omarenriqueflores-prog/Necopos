import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Printer,
  Beef,
  Layers,
  Info,
} from 'lucide-react';
import { useFirebase } from '../../context/FirebaseContext';
import { MeatReception, CarcassUnit, CarcassStatus, Product, ANIMAL_CATEGORIES } from '../../types/pos';
import { formatKg, formatCurrency } from '../../utils/stockHelper';
import { generateReceptionVoucherHtml } from '../../utils/receptionHelper';

interface NewReceptionModalProps {
  onClose: () => void;
  existingReception?: MeatReception | null;
}

export const NewReceptionModal: React.FC<NewReceptionModalProps> = ({
  onClose,
  existingReception,
}) => {
  const { products, branchConfigs, localUser, user, saveMeatReception, finalizeMeatReception, updateConfirmedMeatReception } = useFirebase();

  const operatorName = localUser?.fullName || user?.displayName || localUser?.username || 'Encargado de Cámara';

  // 1. Datos Generales de la Recepción
  const [branchId, setBranchId] = useState<'NECO 1' | 'NECO 2'>(existingReception?.branchId || 'NECO 1');
  const [chamber, setChamber] = useState(existingReception?.chamber || 'Cámara Central NECO 1');
  const [supplier, setSupplier] = useState(existingReception?.supplier || 'Frigorífico Rioplatense S.A.');
  const [species, setSpecies] = useState(existingReception?.species || 'Vacuno / Bovino');
  const [category, setCategory] = useState(existingReception?.category || 'Novillito');
  const [tropaNumber, setTropaNumber] = useState(existingReception?.tropaNumber || '');
  const [invoiceNumber, setInvoiceNumber] = useState(existingReception?.invoiceNumber || '');
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState(existingReception?.deliveryNoteNumber || '');
  const [dteGuideNumber, setDteGuideNumber] = useState(existingReception?.dteGuideNumber || '');
  const [pricePerKg, setPricePerKg] = useState<number>(existingReception?.pricePerKg || 4200.0);
  const [productCode, setProductCode] = useState<string>(existingReception?.productCode || '');
  const [notes, setNotes] = useState(existingReception?.notes || '');

  const now = new Date();
  const defaultDate = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
  const defaultTime = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const [date, setDate] = useState(existingReception?.date || defaultDate);
  const [time, setTime] = useState(existingReception?.time || defaultTime);

  // 2. Medias Reses Individuales
  const [carcasses, setCarcasses] = useState<CarcassUnit[]>(() => {
    if (existingReception?.carcasses && existingReception.carcasses.length > 0) {
      return existingReception.carcasses;
    }
    // Inicializar con dos medias reses por defecto (1 res entera)
    return [
      {
        id: 'MR-001',
        tagNumber: '',
        weightKg: 118.5,
        cost: Number((118.5 * (existingReception?.pricePerKg || 4200)).toFixed(2)),
      },
      {
        id: 'MR-002',
        tagNumber: '',
        weightKg: 121.2,
        cost: Number((121.2 * (existingReception?.pricePerKg || 4200)).toFixed(2)),
      },
    ];
  });

  // Estados de proceso
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmFinalize, setShowConfirmFinalize] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Actualizar nombre de cámara al cambiar sucursal
  useEffect(() => {
    setChamber(branchId === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2');
  }, [branchId]);

  // Actualizar costo de cada media res si cambia el precio por kilo
  useEffect(() => {
    setCarcasses((prev) =>
      prev.map((c) => ({
        ...c,
        cost: Number((c.weightKg * pricePerKg).toFixed(2)),
      }))
    );
  }, [pricePerKg]);

  // Totales de la recepción
  const { totalQuantity, totalWeightKg, totalCost } = useMemo(() => {
    let weightSum = 0;
    carcasses.forEach((c) => {
      weightSum += Number(c.weightKg) || 0;
    });

    const roundedWeight = Number(weightSum.toFixed(3));
    const roundedCost = Number((roundedWeight * pricePerKg).toFixed(2));

    return {
      totalQuantity: carcasses.length,
      totalWeightKg: roundedWeight,
      totalCost: roundedCost,
    };
  }, [carcasses, pricePerKg]);

  // Modificar peso de una media res
  const handleWeightChange = (index: number, val: string) => {
    const num = Math.max(0, Number(val) || 0);
    setCarcasses((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        weightKg: num,
        cost: Number((num * pricePerKg).toFixed(2)),
      };
      return copy;
    });
  };

  // Modificar garfa / precinto
  const handleTagChange = (index: number, val: string) => {
    setCarcasses((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        tagNumber: val,
      };
      return copy;
    });
  };

  // Modificar notas individuales
  const handleItemNoteChange = (index: number, val: string) => {
    setCarcasses((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        notes: val,
      };
      return copy;
    });
  };

  // Eliminar una media res
  const handleRemoveCarcass = (index: number) => {
    setCarcasses((prev) => prev.filter((_, i) => i !== index));
  };

  // Agregar 1 media res
  const handleAddCarcass = () => {
    const nextNum = carcasses.length + 1;
    const formattedId = `MR-${String(nextNum).padStart(3, '0')}`;
    const newUnit: CarcassUnit = {
      id: formattedId,
      tagNumber: '',
      weightKg: 120.0,
      cost: Number((120.0 * pricePerKg).toFixed(2)),
    };
    setCarcasses((prev) => [...prev, newUnit]);
  };

  // Agregar 2 medias reses (1 res entera)
  const handleAddPair = () => {
    const currentCount = carcasses.length;
    const item1: CarcassUnit = {
      id: `MR-${String(currentCount + 1).padStart(3, '0')}`,
      tagNumber: '',
      weightKg: 119.0,
      cost: Number((119.0 * pricePerKg).toFixed(2)),
      notes: 'Lado Izquierdo',
    };
    const item2: CarcassUnit = {
      id: `MR-${String(currentCount + 2).padStart(3, '0')}`,
      tagNumber: '',
      weightKg: 120.5,
      cost: Number((120.5 * pricePerKg).toFixed(2)),
      notes: 'Lado Derecho',
    };
    setCarcasses((prev) => [...prev, item1, item2]);
  };

  // Construir objeto de recepción
  const buildReceptionObject = (status: 'PENDIENTE' | 'CONFIRMADO'): MeatReception => {
    const code =
      existingReception?.code ||
      `REC-${Date.now().toString().slice(-6)}`;

    const selectedProd = products.find((p) => p.code === productCode);
    const recId = existingReception?.id || `REC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const updatedCarcasses = carcasses.map((c, idx) => {
      const stableId = c.id && c.id.includes('-') && !c.id.startsWith('MR-')
        ? c.id
        : `${code}-MR-${String(idx + 1).padStart(3, '0')}`;
      return {
        ...c,
        id: stableId,
        receptionId: recId,
        tropaNumber: tropaNumber.trim() || `TR-${Date.now().toString().slice(-4)}`,
        supplier: supplier.trim() || 'Proveedor Frigorífico',
        species,
        category,
        branchId,
        chamber,
        status: (c.status || (status === 'CONFIRMADO' ? 'DISPONIBLE' : 'PENDIENTE')) as CarcassStatus,
      };
    });

    return {
      id: recId,
      code,
      date,
      time,
      timestamp: existingReception?.timestamp || Date.now(),
      branchId,
      chamber,
      status,
      operator: operatorName,
      supplier: supplier.trim() || 'Proveedor Frigorífico',
      species,
      category,
      tropaNumber: tropaNumber.trim() || `TR-${Date.now().toString().slice(-4)}`,
      invoiceNumber: invoiceNumber.trim(),
      deliveryNoteNumber: deliveryNoteNumber.trim(),
      dteGuideNumber: dteGuideNumber.trim(),
      pricePerKg,
      totalQuantity,
      totalWeightKg,
      totalCost,
      carcasses: updatedCarcasses,
      productCode: productCode.trim() || undefined,
      productDescription: selectedProd?.description,
      notes: notes.trim(),
    };
  };

  // Guardar como Borrador / Pendiente
  const handleSaveDraft = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const rec = buildReceptionObject('PENDIENTE');
      await saveMeatReception(rec);
      onClose();
    } catch (err: any) {
      console.error('Error al guardar borrador de recepción:', err);
      setErrorMessage(err.message || 'Error al guardar la recepción.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirmar e ingresar a cámara
  const handleConfirmFinalize = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      if (carcasses.length === 0 || totalWeightKg <= 0) {
        setErrorMessage('Debe ingresar al menos una media res con peso mayor a 0 Kg.');
        return;
      }
      const rec = buildReceptionObject(existingReception?.status === 'CONFIRMADO' ? 'CONFIRMADO' : 'CONFIRMADO');
      
      if (existingReception?.status === 'CONFIRMADO') {
        await updateConfirmedMeatReception(rec, existingReception, operatorName);
      } else {
        await finalizeMeatReception(rec, operatorName);
      }
      onClose();
    } catch (err: any) {
      console.error('Error al confirmar recepción e impactar en stock:', err);
      setErrorMessage(err.message || 'Error al confirmar ingreso en cámara.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Imprimir comprobante / acta de recepción
  const handlePrint = () => {
    const rec = buildReceptionObject('CONFIRMADO');
    const branchConfig = branchConfigs ? branchConfigs[branchId] : null;
    const html = generateReceptionVoucherHtml(rec, branchConfig);

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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 select-none overflow-y-auto">
      <div className="win-panel bg-[#d4d0c8] max-w-5xl w-full max-h-[96vh] flex flex-col shadow-2xl border-2 border-white">
        {/* TÍTULO DE VENTANA WINDOWS */}
        <div className="win-titlebar flex items-center justify-between p-1 bg-[#002046] text-white">
          <div className="flex items-center space-x-2 text-white font-bold text-xs pl-1">
            <Beef className="w-4 h-4 text-amber-300" />
            <span>
              NECO POS — {existingReception ? 'EDITAR RECEPCIÓN DE MEDIAS RESES' : 'NUEVO INGRESO / RECEPCIÓN DE MEDIAS RESES AL GANCHO'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="win-btn-close px-1.5 py-0.5 bg-[#c0c0c0] hover:bg-red-600 hover:text-white text-black text-xs font-bold border border-gray-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {errorMessage && (
          <div className="bg-red-100 border border-red-400 text-red-800 p-2 text-xs flex items-center space-x-2 mx-2 mt-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
        )}

        {/* CONTENIDO PRINCIPAL SCROLLEABLE */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 text-xs text-black">
          {/* SECCIÓN 1: DATOS GENERALES DEL INGRESO Y PROVEEDOR */}
          <div className="bg-[#ebeef2] border border-gray-400 p-2.5 shadow-sm rounded-sm">
            <div className="font-bold text-[11px] text-[#002046] mb-2 flex items-center space-x-1.5 border-b border-gray-300 pb-1">
              <Scale className="w-3.5 h-3.5 text-blue-800" />
              <span>1. DATOS DE ORIGEN, TROPA SENASA, COMPROBANTES Y CÁMARA DE DESTINO</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Sucursal de Destino:</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value as any)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs font-bold"
                >
                  <option value="NECO 1">NECO 1 (Central)</option>
                  <option value="NECO 2">NECO 2 (Villa Saavedra)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Cámara Frigorífica:</label>
                <input
                  type="text"
                  value={chamber}
                  onChange={(e) => setChamber(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Fecha de Ingreso:</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Hora de Ingreso:</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="font-bold text-[10px] text-gray-700 block">Proveedor / Frigorífico:</label>
                <input
                  type="text"
                  placeholder="Ej: Frigorífico Rioplatense S.A."
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Especie:</label>
                <select
                  value={species}
                  onChange={(e) => {
                    const sp = e.target.value;
                    setSpecies(sp);
                    if (sp.includes('Cerdo') || sp.includes('Porcino')) {
                      setCategory('Cerdo');
                    } else if (category === 'Cerdo') {
                      setCategory('Novillito');
                    }
                  }}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs font-bold text-indigo-900"
                >
                  <option value="Vacuno / Bovino">Vacuno / Bovino</option>
                  <option value="Porcino / Cerdo">Porcino / Cerdo</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Categoría Animal:</label>
                <select
                  value={category}
                  onChange={(e) => {
                    const cat = e.target.value;
                    setCategory(cat);
                    if (cat === 'Cerdo') {
                      setSpecies('Porcino / Cerdo');
                    } else {
                      setSpecies('Vacuno / Bovino');
                    }
                  }}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs font-bold text-blue-900"
                >
                  {ANIMAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">N° Tropa SENASA:</label>
                <input
                  type="text"
                  placeholder="Ej: 1482-B"
                  value={tropaNumber}
                  onChange={(e) => setTropaNumber(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs font-bold text-blue-900"
                />
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">N° Factura:</label>
                <input
                  type="text"
                  placeholder="Ej: A0001-00045123"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">N° Remito:</label>
                <input
                  type="text"
                  placeholder="Ej: R0001-0008451"
                  value={deliveryNoteNumber}
                  onChange={(e) => setDeliveryNoteNumber(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">DTE / Guía SENASA:</label>
                <input
                  type="text"
                  placeholder="Ej: DTE-948102"
                  value={dteGuideNumber}
                  onChange={(e) => setDteGuideNumber(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Precio Compra $/Kg Gancho:</label>
                <input
                  type="number"
                  step="10"
                  min="0"
                  value={pricePerKg}
                  onChange={(e) => setPricePerKg(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs font-bold text-green-800 text-right"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="font-bold text-[10px] text-gray-700 block">Asentar en Producto de Stock (Cámara):</label>
                <select
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs"
                >
                  <option value="">-- [Automático / Media Res Vacuna] --</option>
                  {products.map((p) => (
                    <option key={p.code} value={p.code}>
                      [{p.code}] {p.description} ({p.category})
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-3">
                <label className="font-bold text-[10px] text-gray-700 block">Encargado de Recepción / Operador:</label>
                <div className="bg-gray-200 border border-gray-400 px-2 py-1 text-xs font-semibold text-gray-800">
                  {operatorName}
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: PLANILLA DE MEDIAS RESES INGRESADAS */}
          <div className="bg-white border border-gray-400 shadow-sm">
            <div className="bg-[#002046] text-white p-2 flex items-center justify-between font-bold text-xs">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-amber-300" />
                <span>2. DETALLE INDIVIDUAL DE MEDIAS RESES RECIBIDAS (PESAJE INDIVIDUAL)</span>
              </div>
              <div className="text-[11px] text-amber-200 flex items-center space-x-3">
                <span>Medias Reses: <strong>{totalQuantity}</strong></span>
                <span>Kilos Totales: <strong>{formatKg(totalWeightKg)}</strong></span>
                <span>Total Compra: <strong>{formatCurrency(totalCost)}</strong></span>
              </div>
            </div>

            {/* BARRA DE HERRAMIENTAS RÁPIDAS PARA AGREGAR MEDIAS RESES */}
            <div className="p-2 bg-[#f0f2f5] border-b border-gray-300 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleAddCarcass}
                  className="px-2.5 py-1 bg-[#002046] text-white hover:bg-blue-900 font-bold flex items-center space-x-1 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5 text-green-300" />
                  <span>Agregar 1 Media Res</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddPair}
                  className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-400 font-bold text-gray-800 flex items-center space-x-1 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                  <span>Agregar 1 Res Completa (2 Medias)</span>
                </button>
              </div>

              <div className="text-[11px] text-gray-600">
                Cada media res conserva su peso individual y trazabilidad única.
              </div>
            </div>

            {/* TABLA DE MEDIAS RESES */}
            <div className="overflow-x-auto max-h-[280px]">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-[#e4e7ec] text-gray-700 sticky top-0 z-10 border-b border-gray-400 text-[10px]">
                  <tr>
                    <th className="p-1.5 w-10 text-center border-r border-gray-300">N°</th>
                    <th className="p-1.5 w-24 border-r border-gray-300">Identificador</th>
                    <th className="p-1.5 border-r border-gray-300">Garfa / Precinto SENASA</th>
                    <th className="p-1.5 border-r border-gray-300 text-right w-28 bg-yellow-100">Peso Real (Kg)</th>
                    <th className="p-1.5 border-r border-gray-300 text-right w-24">Precio $/Kg</th>
                    <th className="p-1.5 border-r border-gray-300 text-right w-28 bg-green-50">Costo Subtotal ($)</th>
                    <th className="p-1.5 border-r border-gray-300">Observaciones Individuales</th>
                    <th className="p-1.5 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-[11px]">
                  {carcasses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-gray-500 bg-gray-50">
                        No hay medias reses registradas en esta recepción. Haga clic en <strong>Agregar 1 Media Res</strong>.
                      </td>
                    </tr>
                  ) : (
                    carcasses.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-blue-50">
                        <td className="p-1.5 text-center font-bold text-gray-600 border-r border-gray-200">
                          {idx + 1}
                        </td>
                        <td className="p-1.5 font-mono font-bold text-blue-900 border-r border-gray-200">
                          {item.id}
                        </td>
                        <td className="p-1.5 border-r border-gray-200">
                          <input
                            type="text"
                            placeholder="Ej: Precinto 8401"
                            value={item.tagNumber}
                            onChange={(e) => handleTagChange(idx, e.target.value)}
                            className="w-full bg-white border border-gray-300 px-1 py-0.5 text-xs"
                          />
                        </td>
                        <td className="p-1.5 border-r border-gray-200 text-right bg-yellow-50">
                          <input
                            type="number"
                            step="0.001"
                            min="0.1"
                            value={item.weightKg}
                            onChange={(e) => handleWeightChange(idx, e.target.value)}
                            className="w-24 text-right font-bold text-red-700 bg-white border border-gray-300 px-1 py-0.5 text-xs"
                          />
                        </td>
                        <td className="p-1.5 border-r border-gray-200 text-right font-semibold text-gray-700">
                          {formatCurrency(pricePerKg)}
                        </td>
                        <td className="p-1.5 border-r border-gray-200 text-right font-bold text-green-900 bg-green-50/50">
                          {formatCurrency(item.cost)}
                        </td>
                        <td className="p-1.5 border-r border-gray-200">
                          <input
                            type="text"
                            placeholder="Ej: Calidad AA, grasa blanca..."
                            value={item.notes || ''}
                            onChange={(e) => handleItemNoteChange(idx, e.target.value)}
                            className="w-full bg-white border border-gray-300 px-1 py-0.5 text-xs text-gray-600"
                          />
                        </td>
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveCarcass(idx)}
                            className="text-gray-400 hover:text-red-600 p-0.5"
                            title="Eliminar media res"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* RESUMEN INFERIOR DE TOTALES */}
            <div className="p-2 bg-[#f0f4f8] border-t-2 border-[#002046] flex flex-wrap items-center justify-between text-xs">
              <div className="flex items-center space-x-6">
                <div>
                  <span className="text-gray-600 block text-[10px]">CANTIDAD MEDIAS RESES:</span>
                  <span className="text-base font-bold text-black">{totalQuantity} un.</span>
                </div>
                <div>
                  <span className="text-gray-600 block text-[10px]">PESO BRUTO TOTAL AL GANCHO:</span>
                  <span className="text-base font-bold text-red-700">{formatKg(totalWeightKg)}</span>
                </div>
                <div>
                  <span className="text-gray-600 block text-[10px]">PRECIO $/KG PACTADO:</span>
                  <span className="text-base font-bold text-green-800">{formatCurrency(pricePerKg)}</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-gray-600 block text-[10px]">COSTO TOTAL DE LA RECEPCIÓN:</span>
                <span className="text-lg font-bold text-green-900">{formatCurrency(totalCost)}</span>
              </div>
            </div>
          </div>

          {/* OBSERVACIONES GENERALES */}
          <div>
            <label className="font-bold text-[10px] text-gray-700 block mb-0.5">
              Observaciones Sanitarias / Temperatura Cámara (°C) / Auditoría:
            </label>
            <input
              type="text"
              placeholder="Ej: Ingreso con 3.5°C de temperatura en carne profunda. Conformación excelente. Remito firmado."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-white border border-gray-400 px-2 py-1 text-xs"
            />
          </div>
        </div>

        {/* PIE CON ACCIONES Y BOTONES */}
        <div className="bg-[#c0c0c0] border-t border-gray-400 p-2 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1 bg-white hover:bg-gray-100 border border-gray-400 text-black font-bold flex items-center space-x-1.5 shadow-sm"
            >
              <Printer className="w-3.5 h-3.5 text-gray-700" />
              <span>Imprimir Remito Oficial</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1 bg-[#d4d0c8] hover:bg-gray-300 border border-gray-400 text-black font-semibold shadow-sm"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSubmitting}
              className="px-3 py-1 bg-white hover:bg-amber-50 border border-gray-400 text-black font-bold flex items-center space-x-1 shadow-sm"
            >
              <Save className="w-3.5 h-3.5 text-amber-700" />
              <span>Guardar Pendiente</span>
            </button>

            <button
              type="button"
              onClick={() => setShowConfirmFinalize(true)}
              disabled={isSubmitting || carcasses.length === 0 || totalWeightKg <= 0}
              className="px-4 py-1 bg-[#002046] hover:bg-blue-900 disabled:opacity-50 text-white font-bold flex items-center space-x-1.5 shadow"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-green-300" />
              <span>CONFIRMAR INGRESO EN CÁMARA</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL DE CONFIRMACIÓN DE FINALIZACIÓN */}
      {showConfirmFinalize && (
        <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4">
          <div className="win-panel bg-[#d4d0c8] max-w-md w-full p-4 border-2 border-white shadow-2xl space-y-3">
            <div className="font-bold text-sm text-[#002046] flex items-center space-x-2 border-b border-gray-400 pb-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>Confirmar Recepción de Medias Reses</span>
            </div>

            <p className="text-xs text-gray-800 leading-relaxed">
              Esta operación <strong>incrementará efectivamente el stock en cámara</strong>:
            </p>

            <ul className="text-xs text-gray-700 list-disc list-inside space-y-1 bg-white p-2.5 border border-gray-300">
              <li>
                Sucursal: <strong>{branchId}</strong> — {chamber}
              </li>
              <li>
                Proveedor: <strong>{supplier}</strong>
              </li>
              <li>
                Tropa SENASA: <strong>{tropaNumber || 'Sin tropa'}</strong>
              </li>
              <li>
                Cantidad: <strong>{totalQuantity} medias reses</strong>
              </li>
              <li>
                Peso Total al Gancho: <strong>{formatKg(totalWeightKg)}</strong>
              </li>
              <li>
                Importe Total: <strong>{formatCurrency(totalCost)}</strong>
              </li>
              <li>
                Se registrará movimiento inmutable de stock tipo <strong>ENTRADA</strong> en el Kardex.
              </li>
            </ul>

            <div className="flex justify-end space-x-2 pt-2 border-t border-gray-300">
              <button
                type="button"
                onClick={() => setShowConfirmFinalize(false)}
                disabled={isSubmitting}
                className="px-3 py-1 bg-white hover:bg-gray-100 border border-gray-400 text-black font-bold"
              >
                Volver a Revisar
              </button>
              <button
                type="button"
                onClick={handleConfirmFinalize}
                disabled={isSubmitting}
                className="px-4 py-1 bg-[#002046] hover:bg-blue-900 text-white font-bold flex items-center space-x-1"
              >
                <CheckCircle2 className="w-4 h-4 text-green-300" />
                <span>{isSubmitting ? 'Ingresando a Stock...' : 'Confirmar e Ingresar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
