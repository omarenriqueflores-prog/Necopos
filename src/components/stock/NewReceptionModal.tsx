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
import { useDialog } from '../../context/DialogContext';
import { MeatReception, CarcassUnit, CarcassStatus, MeatSupplier, ANIMAL_CATEGORIES } from '../../types/pos';
import { carcassLabel, nextCarcassNumber, formatCarcassLabel } from '../../utils/receptionHelper';
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
  const {
    products, branchConfigs, localUser, user, meatSuppliers,
    saveMeatReception, finalizeMeatReception, updateConfirmedMeatReception, deleteOrCancelMeatReception,
  } = useFirebase();
  const { showAlert, showAdminAuth } = useDialog();

  const operatorName = localUser?.fullName || user?.displayName || localUser?.username || 'Encargado de Cámara';
  const defaultSupplierName = existingReception?.supplier || '';
  const initialSupplierProfile = meatSuppliers.find(
    (item) => item.id === existingReception?.supplierId ||
      item.name.trim().toLocaleLowerCase('es') === defaultSupplierName.trim().toLocaleLowerCase('es')
  );

  // 1. Datos Generales de la Recepción
  const [branchId, setBranchId] = useState<'NECO 1' | 'NECO 2'>(existingReception?.branchId || 'NECO 1');
  const [chamber, setChamber] = useState(existingReception?.chamber || 'Cámara Central NECO 1');
  const [supplier, setSupplier] = useState(defaultSupplierName);
  const [supplierId, setSupplierId] = useState(existingReception?.supplierId || initialSupplierProfile?.id || '');
  const [supplierCuit, setSupplierCuit] = useState(existingReception?.supplierCuit || initialSupplierProfile?.cuit || '');
  const [supplierAddress, setSupplierAddress] = useState(existingReception?.supplierAddress || initialSupplierProfile?.address || '');
  const [supplierPhone, setSupplierPhone] = useState(existingReception?.supplierPhone || initialSupplierProfile?.phone || '');
  const [supplierEmail, setSupplierEmail] = useState(existingReception?.supplierEmail || initialSupplierProfile?.email || '');
  const [supplierContact, setSupplierContact] = useState(existingReception?.supplierContact || initialSupplierProfile?.contact || '');
  const hasSavedSupplier = meatSuppliers.some((item) => item.id === supplierId);
  const supplierSelectValue = hasSavedSupplier ? supplierId : existingReception ? '__legacy__' : '';
  const [invoiceNumber, setInvoiceNumber] = useState(existingReception?.invoiceNumber || '');
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState(existingReception?.deliveryNoteNumber || '');
  const [dteGuideNumber, setDteGuideNumber] = useState(existingReception?.dteGuideNumber || '');
  const [productCode, setProductCode] = useState<string>(existingReception?.productCode || '');
  const [notes, setNotes] = useState(existingReception?.notes || '');

  const now = new Date();
  const defaultSpecies = 'Vacuno / Bovino';
  const defaultCategory = 'Novillito';
  const defaultDate = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
  const defaultTime = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const [date, setDate] = useState(existingReception?.date || defaultDate);
  const [time, setTime] = useState(existingReception?.time || defaultTime);

  // 2. Medias Reses Individuales
  const [carcasses, setCarcasses] = useState<CarcassUnit[]>(() => {
    if (existingReception?.carcasses && existingReception.carcasses.length > 0) {
      return existingReception.carcasses.map((carcass) => ({
        ...carcass,
        tropaNumber: carcass.tropaNumber || existingReception.tropaNumber,
        species: carcass.species || existingReception.species,
        category: carcass.category || existingReception.category,
        pricePerKg: carcass.pricePerKg ?? existingReception.pricePerKg,
      }));
    }
    return [];
  });

  // Estados de proceso
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmFinalize, setShowConfirmFinalize] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Actualizar nombre de cámara al cambiar sucursal
  useEffect(() => {
    setChamber(branchId === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2');
  }, [branchId]);

  // Totales de la recepción
  const { totalQuantity, totalWeightKg, totalCost } = useMemo(() => {
    let weightSum = 0;
    let costSum = 0;
    carcasses.forEach((c) => {
      const weight = Number(c.weightKg) || 0;
      const unitPrice = Number(c.pricePerKg) || 0;
      weightSum += weight;
      costSum += weight * unitPrice;
    });

    const roundedWeight = Number(weightSum.toFixed(3));
    const roundedCost = Number(costSum.toFixed(2));

    return {
      totalQuantity: carcasses.length,
      totalWeightKg: roundedWeight,
      totalCost: roundedCost,
    };
  }, [carcasses]);

  const averagePricePerKg = totalWeightKg > 0 ? Number((totalCost / totalWeightKg).toFixed(2)) : 0;
  const defaultCarcassTropa =
    existingReception?.tropaNumber ||
    existingReception?.carcasses?.find((carcass) => carcass.tropaNumber?.trim())?.tropaNumber ||
    '';
  const defaultCarcassCategory =
    existingReception?.carcasses?.find((carcass) => carcass.category)?.category ||
    existingReception?.category ||
    defaultCategory;
  const defaultCarcassPrice =
    (Number(existingReception?.pricePerKg) > 0 ? Number(existingReception?.pricePerKg) : undefined) ??
    existingReception?.carcasses?.find((carcass) => Number(carcass.pricePerKg) > 0)?.pricePerKg;
  const defaultCarcassSpecies =
    existingReception?.carcasses?.find((carcass) => carcass.species)?.species ||
    existingReception?.species ||
    defaultSpecies;

  // Modificar peso de una media res
  const handleWeightChange = (index: number, val: string) => {
    const num = Math.max(0, Number(val) || 0);
    setCarcasses((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        weightKg: num,
        cost: Number((num * (Number(copy[index].pricePerKg) || 0)).toFixed(2)),
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

  const handleCarcassFieldChange = (
    index: number,
    field: 'tropaNumber' | 'species' | 'category' | 'pricePerKg',
    value: string
  ) => {
    setCarcasses((prev) => {
      const copy = [...prev];
      const current = copy[index];
      if (field === 'pricePerKg') {
        const unitPrice = Math.max(0, Number(value) || 0);
        copy[index] = {
          ...current,
          pricePerKg: unitPrice,
          cost: Number((current.weightKg * unitPrice).toFixed(2)),
        };
      } else {
        copy[index] = { ...current, [field]: value };
      }
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

  const applySupplierProfile = (profile: MeatSupplier) => {
    setSupplier(profile.name);
    setSupplierId(profile.id);
    setSupplierCuit(profile.cuit || '');
    setSupplierAddress(profile.address || '');
    setSupplierPhone(profile.phone || '');
    setSupplierEmail(profile.email || '');
    setSupplierContact(profile.contact || '');
  };

  const handleSupplierSelect = (id: string) => {
    if (id === '__legacy__') return;
    const profile = meatSuppliers.find((item) => item.id === id);
    if (profile) {
      applySupplierProfile(profile);
      return;
    }
    setSupplier('');
    setSupplierId('');
    setSupplierCuit('');
    setSupplierAddress('');
    setSupplierPhone('');
    setSupplierEmail('');
    setSupplierContact('');
  };

  // Eliminar una media res
  const handleRemoveCarcass = (index: number) => {
    setCarcasses((prev) => prev.filter((_, i) => i !== index));
  };

  // Agregar 1 media res
  const handleAddCarcass = () => {
    const tempId = `TEMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    setCarcasses((prev) => {
      const newUnit: CarcassUnit = {
        id: tempId,
        label: formatCarcassLabel(nextCarcassNumber(prev)),
        tagNumber: '',
        weightKg: 0,
        pricePerKg: defaultCarcassPrice,
        species: defaultCarcassSpecies,
        category: defaultCarcassCategory,
        tropaNumber: defaultCarcassTropa,
        cost: 0,
      };
      return [...prev, newUnit];
    });
  };

  // Agregar 2 medias reses (1 res entera)
  const handleAddPair = () => {
    const now = Date.now();
    const next = (prev: CarcassUnit[]) => nextCarcassNumber(prev);
    const item1: CarcassUnit = {
      id: `TEMP-${now}-1`,
      label: '',
      tagNumber: '',
      weightKg: 0,
      pricePerKg: defaultCarcassPrice,
      species: defaultCarcassSpecies,
      category: defaultCarcassCategory,
      tropaNumber: defaultCarcassTropa,
      cost: 0,
      notes: 'Lado Izquierdo',
    };
    const item2: CarcassUnit = {
      id: `TEMP-${now}-2`,
      tagNumber: '',
      weightKg: 0,
      pricePerKg: defaultCarcassPrice,
      species: defaultCarcassSpecies,
      category: defaultCarcassCategory,
      tropaNumber: defaultCarcassTropa,
      cost: 0,
      notes: 'Lado Derecho',
    };
    setCarcasses((prev) => {
      const n = next(prev);
      return [
        ...prev,
        { ...item1, label: formatCarcassLabel(n) },
        { ...item2, label: formatCarcassLabel(n + 1) },
      ];
    });
  };

  // Construir objeto de recepción
  const buildReceptionObject = (status: 'PENDIENTE' | 'CONFIRMADO'): MeatReception => {
    const code =
      existingReception?.code ||
      `REC-${Date.now().toString().slice(-6)}`;

    const selectedProd = products.find((p) => p.code === productCode);
    const recId = existingReception?.id || `REC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const updatedCarcasses = carcasses.map((c, idx) => {
      // Regla B: Generar IDs únicos y persistentes. Mantener históricos.
      const isHistorical = c.id && c.id.includes('-') && !c.id.startsWith('MR-') && !c.id.startsWith('TEMP-');
      const stableId = isHistorical
        ? c.id
        : `${code}-UNIT-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`;
      return {
        ...c,
        id: stableId,
        label: carcassLabel(c, idx),
        receptionId: recId,
        tropaNumber: c.tropaNumber?.trim() || '',
        supplier: supplier.trim() || 'Proveedor Frigorífico',
        species: c.species || existingReception?.species || defaultSpecies,
        category: c.category || existingReception?.category || defaultCategory,
        pricePerKg: Number(c.pricePerKg) || 0,
        cost: Number((Number(c.weightKg) * (Number(c.pricePerKg) || 0)).toFixed(2)),
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
      supplierId: supplierId || undefined,
      supplierCuit: supplierCuit.trim() || undefined,
      supplierAddress: supplierAddress.trim() || undefined,
      supplierPhone: supplierPhone.trim() || undefined,
      supplierEmail: supplierEmail.trim() || undefined,
      supplierContact: supplierContact.trim() || undefined,
      species: updatedCarcasses[0]?.species || defaultSpecies,
      category: updatedCarcasses[0]?.category || defaultCategory,
      tropaNumber: updatedCarcasses[0]?.tropaNumber || '',
      invoiceNumber: invoiceNumber.trim(),
      deliveryNoteNumber: deliveryNoteNumber.trim(),
      dteGuideNumber: dteGuideNumber.trim(),
      pricePerKg: averagePricePerKg,
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
      if (!supplierId && !existingReception) {
        setErrorMessage('Seleccione un proveedor registrado. Para cargar uno nuevo, vaya a Stock & Cámaras > Proveedores.');
        return;
      }
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
      if (!supplierId && !existingReception) {
        setErrorMessage('Seleccione un proveedor registrado. Para cargar uno nuevo, vaya a Stock & Cámaras > Proveedores.');
        return;
      }
      if (carcasses.length === 0 || totalWeightKg <= 0 || carcasses.some((carcass) => Number(carcass.weightKg) <= 0)) {
        setErrorMessage('Cada media res debe tener un peso mayor a 0 Kg.');
        return;
      }
      const incompleteCarcass = carcasses.find(
        (carcass) =>
          !carcass.tropaNumber?.trim() ||
          !carcass.species?.trim() ||
          !carcass.category?.trim() ||
          carcass.pricePerKg === undefined ||
          !Number.isFinite(Number(carcass.pricePerKg)) ||
          Number(carcass.pricePerKg) <= 0
      );
      if (incompleteCarcass) {
        setErrorMessage(
          `Complete tropa, especie, categoría y un precio mayor a cero para cada media res. Revise ${carcassLabel(incompleteCarcass, carcasses.indexOf(incompleteCarcass))}.`
        );
        return;
      }
      const rec = buildReceptionObject(existingReception?.status === 'CONFIRMADO' ? 'CONFIRMADO' : 'PENDIENTE');
      
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

  // Eliminar recepción existente con clave de administrador
  const handleDeleteExisting = async () => {
    if (!existingReception) return;
    try {
      const authorized = await showAdminAuth(
        `¿Desea eliminar la recepción ${existingReception.code} (Tropa SENASA ${existingReception.tropaNumber}, ${formatKg(existingReception.totalWeightKg)})?\n\nEsta operación revertirá el stock de medias reses en cámara y eliminará el comprobante del sistema. Ingrese la clave de administrador para confirmar.`,
        'AUTORIZACIÓN DE ADMINISTRADOR - ELIMINAR RECEPCIÓN'
      );

      if (!authorized) return;

      setIsSubmitting(true);
      await deleteOrCancelMeatReception(
        existingReception.id,
        operatorName,
        'Eliminación autorizada con clave de Administrador',
        true
      );
      await showAlert(
        `La recepción ${existingReception.code} fue eliminada exitosamente y el stock ha sido revertido.`,
        'RECEPCIÓN ELIMINADA'
      );
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      console.error('Error al eliminar recepción:', err);
      await showAlert(
        `No se pudo eliminar la recepción: ${err.message || 'Error desconocido'}`,
        'ERROR AL ELIMINAR'
      );
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
              <span>1. DATOS DE FACTURA, FRIGORÍFICO Y CÁMARA DE DESTINO</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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

              <div className="md:col-span-3">
                <label className="font-bold text-[10px] text-gray-700 block">Proveedor / Frigorífico registrado:</label>
                <select
                  value={supplierSelectValue}
                  onChange={(e) => handleSupplierSelect(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs font-semibold"
                >
                  <option value="">Seleccione un proveedor guardado...</option>
                  {existingReception && !hasSavedSupplier && (
                    <option value="__legacy__">{supplier} (proveedor histórico)</option>
                  )}
                  {meatSuppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                {!meatSuppliers.length && (
                  <span className="mt-0.5 block text-[9px] text-red-700">
                    No hay proveedores registrados. Cárguelos en Stock & Cámaras &gt; Proveedores.
                  </span>
                )}
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

              <div className="md:col-span-2">
                <label className="font-bold text-[10px] text-gray-700 block">Producto de stock para el peso total (opcional):</label>
                <select
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs"
                >
                  <option value="">Automático: MEDIA_RES</option>
                  {products.map((p) => (
                    <option key={p.code} value={p.code}>
                      [{p.code}] {p.description} ({p.category})
                    </option>
                  ))}
                </select>
                <span className="mt-0.5 block text-[9px] leading-tight text-gray-600">
                  Registra los kilos de esta factura en un código de stock. Dejá automático para medias reses.
                </span>
              </div>

              <div className="md:col-span-2">
                <label className="font-bold text-[10px] text-gray-700 block">Encargado de Recepción / Operador:</label>
                <div className="bg-gray-200 border border-gray-400 px-2 py-1 text-xs font-semibold text-gray-800">
                  {operatorName}
                </div>
              </div>
              {(supplierCuit || supplierPhone || supplierEmail || supplierAddress || supplierContact) && (
                <div className="md:col-span-4 mt-2 p-2 bg-white border border-gray-300 text-[10px] text-gray-700 flex flex-wrap gap-x-4 gap-y-1">
                  {supplierCuit && <span>CUIT: <strong>{supplierCuit}</strong></span>}
                  {supplierAddress && <span>Domicilio: <strong>{supplierAddress}</strong></span>}
                  {supplierPhone && <span>Tel.: <strong>{supplierPhone}</strong></span>}
                  {supplierEmail && <span>Email: <strong>{supplierEmail}</strong></span>}
                  {supplierContact && <span>Contacto: <strong>{supplierContact}</strong></span>}
                </div>
              )}
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
                Tropa, especie, categoría y precio se pueden definir por unidad.
              </div>
            </div>

            {/* TABLA DE MEDIAS RESES */}
            <div className="overflow-x-auto max-h-[280px]">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-[#e4e7ec] text-gray-700 sticky top-0 z-10 border-b border-gray-400 text-[10px]">
                  <tr>
                    <th className="p-1.5 w-10 text-center border-r border-gray-300">N°</th>
                    <th className="p-1.5 w-20 border-r border-gray-300">Identificador</th>
                    <th className="p-1.5 w-24 border-r border-gray-300">Tropa SENASA</th>
                    <th className="p-1.5 w-32 border-r border-gray-300">Especie</th>
                    <th className="p-1.5 w-28 border-r border-gray-300">Categoría</th>
                    <th className="p-1.5 w-40 border-r border-gray-300">Garfa / Precinto SENASA</th>
                    <th className="p-1.5 border-r border-gray-300 text-right w-24 bg-yellow-100">Peso Real (Kg)</th>
                    <th className="p-1.5 border-r border-gray-300 text-right w-24">Precio $/Kg</th>
                    <th className="p-1.5 border-r border-gray-300 text-right w-28 bg-green-50">Costo Subtotal ($)</th>
                    <th className="p-1.5 border-r border-gray-300">Observaciones Individuales</th>
                    <th className="p-1.5 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-[11px]">
                  {carcasses.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-6 text-center text-gray-500 bg-gray-50">
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
                          {carcassLabel(item, idx)}
                        </td>
                        <td className="p-1 border-r border-gray-200">
                          <input
                            type="text"
                            placeholder="N° de tropa"
                            value={item.tropaNumber || ''}
                            onChange={(e) => handleCarcassFieldChange(idx, 'tropaNumber', e.target.value)}
                            className="w-full bg-white border border-gray-300 px-1 py-0.5 text-xs"
                          />
                        </td>
                        <td className="p-1 border-r border-gray-200">
                          <select
                            value={item.species || defaultSpecies}
                            onChange={(e) => handleCarcassFieldChange(idx, 'species', e.target.value)}
                            className="w-full bg-white border border-gray-300 px-1 py-0.5 text-xs"
                          >
                            <option value="Vacuno / Bovino">Vacuno / Bovino</option>
                            <option value="Porcino / Cerdo">Porcino / Cerdo</option>
                          </select>
                        </td>
                        <td className="p-1 border-r border-gray-200">
                          <select
                            value={item.category || defaultCategory}
                            onChange={(e) => handleCarcassFieldChange(idx, 'category', e.target.value)}
                            className="w-full bg-white border border-gray-300 px-1 py-0.5 text-xs"
                          >
                            {ANIMAL_CATEGORIES.map((animalCategory) => (
                              <option key={animalCategory} value={animalCategory}>{animalCategory}</option>
                            ))}
                          </select>
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
                            className="w-20 text-right font-bold text-red-700 bg-white border border-gray-300 px-1 py-0.5 text-xs"
                          />
                        </td>
                        <td className="p-1 border-r border-gray-200 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.pricePerKg ?? ''}
                            onChange={(e) => handleCarcassFieldChange(idx, 'pricePerKg', e.target.value)}
                            className="w-20 text-right font-semibold text-green-800 bg-white border border-gray-300 px-1 py-0.5 text-xs"
                          />
                        </td>
                        <td className="p-1.5 border-r border-gray-200 text-right font-bold text-green-900 bg-green-50/50">
                          {formatCurrency(Number((item.weightKg * (Number(item.pricePerKg) || 0)).toFixed(2)))}
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
                  <span className="text-gray-600 block text-[10px]">PRECIO PROMEDIO $/KG:</span>
                  <span className="text-base font-bold text-green-800">{formatCurrency(averagePricePerKg)}</span>
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
        <div className="bg-[#c0c0c0] border-t border-gray-400 p-2">
          <div className={`grid grid-cols-2 ${existingReception ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-2`}>
            <button
              type="button"
              onClick={handlePrint}
              className="h-10 min-w-0 px-1.5 bg-white hover:bg-gray-100 border border-gray-400 text-[11px] leading-tight text-black font-bold flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Printer className="w-3.5 h-3.5 shrink-0 text-gray-700" />
              <span className="min-w-0 text-center">Imprimir remito</span>
            </button>

            {existingReception && (
              <button
                type="button"
                onClick={handleDeleteExisting}
                disabled={isSubmitting}
                className="h-10 min-w-0 px-1.5 bg-[#ba1a1a] hover:bg-red-800 disabled:opacity-50 text-[11px] leading-tight text-white font-bold flex items-center justify-center gap-1.5 shadow-sm"
                title="Eliminar esta recepción de la base de datos (Requiere clave de Administrador)"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0 text-white" />
                <span className="min-w-0 text-center">Eliminar recepción</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-10 min-w-0 px-1.5 bg-[#d4d0c8] hover:bg-gray-300 border border-gray-400 text-[11px] leading-tight text-black font-semibold shadow-sm"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSubmitting}
              className="h-10 min-w-0 px-1.5 bg-white hover:bg-amber-50 border border-gray-400 text-[11px] leading-tight text-black font-bold flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Save className="w-3.5 h-3.5 shrink-0 text-amber-700" />
              <span className="min-w-0 text-center">Guardar pendiente</span>
            </button>

            <button
              type="button"
              onClick={handleConfirmFinalize}
              disabled={isSubmitting || carcasses.length === 0 || totalWeightKg <= 0}
              className="h-10 min-w-0 px-1.5 bg-[#002046] hover:bg-blue-900 disabled:opacity-50 text-[10px] leading-tight text-white font-bold flex items-center justify-center gap-1.5 shadow cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-green-300" />
              <span className="min-w-0 text-center">{isSubmitting ? 'Ingresando a cámara...' : 'Confirmar ingreso en cámara'}</span>
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
                Tropas SENASA: <strong>{Array.from(new Set(carcasses.map((carcass) => carcass.tropaNumber?.trim()).filter(Boolean))).join(', ') || 'Sin completar'}</strong>
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
