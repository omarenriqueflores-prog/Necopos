import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Printer,
  Layers,
  Calculator,
  Beef,
  Search,
  Filter,
  RefreshCw,
  Info,
} from 'lucide-react';
import { useFirebase } from '../../context/FirebaseContext';
import {
  MeatDeboning,
  DeboningCutItem,
  DeboningCarcassType,
  Product,
  ANIMAL_CATEGORIES,
  DeboningYieldTemplate,
  CarcassUnit,
  CarcassStatus,
} from '../../types/pos';
import {
  calculateDeboningMassBalance,
  allocateDeboningCosts,
  calculateDeboningEconomics,
  generateDeboningVoucherHtml,
  createYieldTemplateFromDeboning,
  applyYieldTemplateToCarcass,
  DEBONING_TEMPLATES,
} from '../../utils/deboningHelper';
import { formatKg, formatCurrency, isMeatCategory } from '../../utils/stockHelper';
import { SaveYieldTemplateModal } from './SaveYieldTemplateModal';
import { TemplateEditorModal } from './TemplateEditorModal';

interface NewDeboningModalProps {
  onClose: () => void;
  existingDeboning?: MeatDeboning | null;
}

export const NewDeboningModal: React.FC<NewDeboningModalProps> = ({
  onClose,
  existingDeboning,
}) => {
  const {
    products,
    branchConfigs,
    localUser,
    user,
    saveMeatDeboning,
    finalizeMeatDeboning,
    meatReceptions,
    meatDebonings,
    deboningTemplates,
    saveDeboningTemplate,
  } = useFirebase();

  const operatorName = localUser?.fullName || user?.displayName || localUser?.username || 'Encargado de Faena';

  // Lista de todos los productos activos cargados en Productos
  const activeProducts = useMemo(() => {
    return products.filter((p) => p && p.active !== false);
  }, [products]);

  // Recepciones disponibles con medias reses aún no despostadas
  const availableReceptions = useMemo(() => {
    if (!meatReceptions) return [];
    return meatReceptions.filter((r) => {
      if (r.status !== 'CONFIRMADO') return false;
      // Si tiene lista de medias reses, verificar si tiene alguna DISPONIBLE
      if (r.carcasses && r.carcasses.length > 0) {
        return r.carcasses.some((c) => c.status === 'DISPONIBLE' || !c.status);
      }
      // Si no tiene arreglo de carcasses, verificar si no fue completamente despostada por un desposte finalizado
      const hasFinalized = meatDebonings?.some(
        (d) => d.status === 'FINALIZADO' && (d.tropaNumber === r.tropaNumber || d.sourceProductCode === r.code)
      );
      return !hasFinalized;
    });
  }, [meatReceptions, meatDebonings]);

  // Productos que son exclusivamente medias reses / canales / cuartos (excluyendo cortes ya despostados)
  const carcassProducts = useMemo(() => {
    const cutKeywords = ['bife', 'lomo', 'asado', 'vacio', 'nalga', 'bola', 'cuadrada', 'roast', 'falda', 'tapa', 'matambre', 'entraña', 'picada', 'carne picada', 'peceto', 'tortuguita', 'cogote', 'ossobuco', 'carnaza', 'albondiga', 'hamburguesa', 'milanesa'];
    
    const filtered = activeProducts.filter((p) => {
      const desc = (p.description || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      
      const hasCutKeyword = cutKeywords.some(kw => desc.includes(kw));
      if (hasCutKeyword) return false;

      return (
        desc.includes('media') ||
        desc.includes('res') ||
        desc.includes('cuarto') ||
        desc.includes('carcasa') ||
        desc.includes('canal') ||
        desc.includes('tropa') ||
        desc.includes('gancho') ||
        cat.includes('media') ||
        cat.includes('carcasa') ||
        cat.includes('canal')
      );
    });
    
    const receptionCodes = new Set(availableReceptions.map(r => r.productCode).filter(Boolean));
    const receptionProducts = activeProducts.filter(p => receptionCodes.has(p.code));
    
    const combined = Array.from(new Set([...filtered, ...receptionProducts]));
    return combined.length > 0 ? combined : activeProducts.filter(p => p.description.toLowerCase().includes('res') || p.description.toLowerCase().includes('media'));
  }, [activeProducts, availableReceptions]);

  // 1. Datos Generales de la Tropa y Materia Prima
  const [selectedReceptionId, setSelectedReceptionId] = useState<string>('');
  const [selectedCarcassIds, setSelectedCarcassIds] = useState<string[]>(existingDeboning?.selectedCarcassIds || []);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(existingDeboning?.yieldTemplateId || '');
  const [isEstimated, setIsEstimated] = useState<boolean>(existingDeboning?.isEstimated || false);

  const [branchId, setBranchId] = useState<'NECO 1' | 'NECO 2'>(existingDeboning?.branchId || 'NECO 1');
  const [chamber, setChamber] = useState(existingDeboning?.chamber || 'Cámara Central NECO 1');
  const [tropaNumber, setTropaNumber] = useState(existingDeboning?.tropaNumber || '');
  const [supplier, setSupplier] = useState(existingDeboning?.supplier || 'Frigorífico Rioplatense S.A.');
  const [dteGuideNumber, setDteGuideNumber] = useState(existingDeboning?.dteGuideNumber || '');
  const [animalCategory, setAnimalCategory] = useState(existingDeboning?.animalCategory || 'Novillito');
  const [carcassType, setCarcassType] = useState<DeboningCarcassType>(existingDeboning?.carcassType || 'MEDIA_RES');
  const [butcherMaster, setButcherMaster] = useState(existingDeboning?.butcherMaster || 'Maestro Despostador Neco');
  const [notes, setNotes] = useState(existingDeboning?.notes || '');

  // Pesos y Costos de Entrada
  const [initialWeightKg, setInitialWeightKg] = useState<number>(existingDeboning?.initialWeightKg || 120.0);
  const [costPerKgInitial, setCostPerKgInitial] = useState<number>(existingDeboning?.costPerKgInitial || 4200.0);
  const [sourceProductCode, setSourceProductCode] = useState<string>(existingDeboning?.sourceProductCode || '');

  // Recepción actualmente seleccionada
  const selectedReceptionObj = useMemo(() => {
    if (!selectedReceptionId) return null;
    return availableReceptions.find((r) => r.id === selectedReceptionId) || null;
  }, [availableReceptions, selectedReceptionId]);

  // Medias reses individuales disponibles en la recepción elegida
  const availableCarcassesForSelected = useMemo(() => {
    if (!selectedReceptionObj || !selectedReceptionObj.carcasses) return [];
    return selectedReceptionObj.carcasses.filter((c) => c.status === 'DISPONIBLE' || !c.status);
  }, [selectedReceptionObj]);

  // Manejador de selección de una media res individual
  const handleToggleCarcass = (carcass: CarcassUnit) => {
    const isSelected = selectedCarcassIds.includes(carcass.id);
    const newIds = isSelected
      ? selectedCarcassIds.filter((id) => id !== carcass.id)
      : [...selectedCarcassIds, carcass.id];
    
    setSelectedCarcassIds(newIds);

    if (selectedReceptionObj && selectedReceptionObj.carcasses) {
      const sumWeight = selectedReceptionObj.carcasses
        .filter((c) => newIds.includes(c.id))
        .reduce((sum, c) => sum + (Number(c.weightKg) || 0), 0);
      
      if (sumWeight > 0) {
        setInitialWeightKg(Number(sumWeight.toFixed(3)));
      }
    }
  };

  const handleSelectAllCarcasses = () => {
    if (!availableCarcassesForSelected || availableCarcassesForSelected.length === 0) return;
    const allIds = availableCarcassesForSelected.map((c) => c.id);
    setSelectedCarcassIds(allIds);
    const sumWeight = availableCarcassesForSelected.reduce((sum, c) => sum + (Number(c.weightKg) || 0), 0);
    setInitialWeightKg(Number(sumWeight.toFixed(3)));
  };

  const handleDeselectAllCarcasses = () => {
    setSelectedCarcassIds([]);
  };

  // 2. Cortes Obtenidos en el Desposte (Inicialmente vacío o existentes cargados previamente)
  const [cuts, setCuts] = useState<DeboningCutItem[]>(() => {
    if (existingDeboning?.cuts && existingDeboning.cuts.length > 0) {
      return existingDeboning.cuts;
    }
    return [];
  });

  // Selector y buscador para agregar cortes UNO POR UNO desde Productos
  const [selectedProductCode, setSelectedProductCode] = useState<string>('');
  const [cutWeightInput, setCutWeightInput] = useState<string>('');
  const [cutSalePriceInput, setCutSalePriceInput] = useState<string>('');
  const [cutTypeInput, setCutTypeInput] = useState<'CORTE_UTIL' | 'PICADA_RECORTES' | 'GRASA' | 'HUESO'>('CORTE_UTIL');
  const [categoryFilter, setCategoryFilter] = useState<string>('TODAS');
  const [searchCutText, setSearchCutText] = useState<string>('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const weightInputRef = useRef<HTMLInputElement>(null);

  // Estados de proceso
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmFinalize, setShowConfirmFinalize] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Actualizar nombre de cámara al cambiar sucursal
  useEffect(() => {
    setChamber(branchId === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2');
  }, [branchId]);



  // Categorías presentes en los productos (con las oficiales primero)
  const availableCategories = useMemo(() => {
    const customCats = new Set<string>();
    activeProducts.forEach((p) => {
      if (p.category && p.category.trim()) {
        customCats.add(p.category.trim());
      }
    });
    const combined = Array.from(new Set([...ANIMAL_CATEGORIES, ...Array.from(customCats)]));
    return ['TODAS', ...combined];
  }, [activeProducts]);

  // Productos filtrados según búsqueda y categoría para el selector
  const filteredProductsForSelect = useMemo(() => {
    return activeProducts.filter((p) => {
      if (categoryFilter !== 'TODAS' && p.category !== categoryFilter) {
        return false;
      }
      if (searchCutText.trim()) {
        const q = searchCutText.toLowerCase().trim();
        const matchCode = String(p.code || '').toLowerCase().includes(q);
        const matchDesc = String(p.description || '').toLowerCase().includes(q);
        const matchPlu = String(p.scalePlu || '').toLowerCase().includes(q);
        if (!matchCode && !matchDesc && !matchPlu) return false;
      }
      return true;
    });
  }, [activeProducts, categoryFilter, searchCutText]);

  // Producto actualmente seleccionado para agregar
  const selectedProductObj = useMemo(() => {
    if (!selectedProductCode) return null;
    return activeProducts.find((p) => p.code === selectedProductCode) || null;
  }, [activeProducts, selectedProductCode]);

  // Cuando cambia el producto seleccionado en el combo, actualizar precio y tipo sugerido
  useEffect(() => {
    if (selectedProductObj) {
      setCutSalePriceInput(String(selectedProductObj.price || 0));

      // Detección automática sugerida del tipo de corte según nombre o categoría
      const descLower = (selectedProductObj.description || '').toLowerCase();
      if (descLower.includes('grasa') || descLower.includes('sebo') || descLower.includes('pella')) {
        setCutTypeInput('GRASA');
      } else if (descLower.includes('hueso') || descLower.includes('aserrin') || descLower.includes('desecho') || descLower.includes('carcasa')) {
        setCutTypeInput('HUESO');
      } else if (descLower.includes('picada') || descLower.includes('recorte') || descLower.includes('molida')) {
        setCutTypeInput('PICADA_RECORTES');
      } else {
        setCutTypeInput('CORTE_UTIL');
      }

      // Enfocar automáticamente el input de peso
      setTimeout(() => {
        weightInputRef.current?.focus();
        weightInputRef.current?.select();
      }, 50);
    }
  }, [selectedProductObj]);

  // Total costo de compra al gancho
  const totalInitialCost = useMemo(() => {
    return Number((initialWeightKg * costPerKgInitial).toFixed(2));
  }, [initialWeightKg, costPerKgInitial]);

  // Recalcular balance de masa y costos asignados dinámicamente
  const { massBalance, cutsWithCalculations, economics } = useMemo(() => {
    const rawBalance = calculateDeboningMassBalance(initialWeightKg, cuts);

    // Actualizar rendimientos porcentuales por corte
    const updatedWithYield = cuts.map((c) => {
      const w = Math.max(0, Number(c.weightKg) || 0);
      const yieldPct = initialWeightKg > 0 ? Number(((w / initialWeightKg) * 100).toFixed(2)) : 0;
      return {
        ...c,
        yieldPercent: yieldPct,
      };
    });

    const allocatedCuts = allocateDeboningCosts(totalInitialCost, updatedWithYield);
    const econ = calculateDeboningEconomics(totalInitialCost, allocatedCuts, rawBalance.netMeatWeightKg);

    return {
      massBalance: rawBalance,
      cutsWithCalculations: allocatedCuts,
      economics: econ,
    };
  }, [initialWeightKg, totalInitialCost, cuts]);

  // AGREGAR CORTE UNO POR UNO A LA PLANILLA
  const handleAddCutOneByOne = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setFeedbackMessage(null);

    if (!selectedProductObj) {
      setErrorMessage('Por favor seleccione un corte cargado en Productos.');
      return;
    }

    const weightNum = Number(cutWeightInput) || 0;
    if (weightNum <= 0) {
      setErrorMessage(`Ingrese los kilos reales pesados para el corte "${selectedProductObj.description}". Debe ser mayor a 0.`);
      weightInputRef.current?.focus();
      return;
    }

    const salePriceNum = Number(cutSalePriceInput) >= 0 ? Number(cutSalePriceInput) : (selectedProductObj.price || 0);

    // Verificar si el corte ya existe en la planilla
    const existingIndex = cuts.findIndex((c) => c.productCode === selectedProductObj.code);

    if (existingIndex >= 0) {
      // Sumar los kilos al corte ya existente (muy útil en carnicería al pesar varias bandejas)
      const existingCut = cuts[existingIndex];
      const newTotalWeight = Number((existingCut.weightKg + weightNum).toFixed(3));
      setCuts((prev) => {
        const copy = [...prev];
        copy[existingIndex] = {
          ...copy[existingIndex],
          weightKg: newTotalWeight,
          currentSalePrice: salePriceNum,
          totalSaleValue: Number((newTotalWeight * salePriceNum).toFixed(2)),
          cutType: cutTypeInput,
        };
        return copy;
      });

      setFeedbackMessage(
        `Se sumaron ${formatKg(weightNum)} a "${selectedProductObj.description}". Peso acumulado: ${formatKg(newTotalWeight)}.`
      );
    } else {
      // Agregar como nuevo corte a la planilla
      const newCut: DeboningCutItem = {
        productId: selectedProductObj.id || selectedProductObj.docId,
        productCode: selectedProductObj.code,
        description: selectedProductObj.description,
        category: selectedProductObj.category || 'CARNES VACUNAS',
        unitType: selectedProductObj.unitType || 'Kg',
        weightKg: Number(weightNum.toFixed(3)),
        yieldPercent: initialWeightKg > 0 ? Number(((weightNum / initialWeightKg) * 100).toFixed(2)) : 0,
        currentSalePrice: salePriceNum,
        totalSaleValue: Number((weightNum * salePriceNum).toFixed(2)),
        allocatedCostPerKg: 0,
        totalAllocatedCost: 0,
        projectedMarginPercent: 0,
        cutType: cutTypeInput,
      };

      setCuts((prev) => [...prev, newCut]);
      setFeedbackMessage(`Corte "${selectedProductObj.description}" agregado con ${formatKg(weightNum)}.`);
    }

    // Limpiar entrada de peso para el siguiente pesaje
    setCutWeightInput('');
    // Mantener o resetear selector para siguiente corte
    setSelectedProductCode('');
  };

  // Cargar todos los cortes que están en Productos con 0 Kg (para carga rápida desde grilla)
  const handleLoadAllProductsAsZeroKg = () => {
    if (activeProducts.length === 0) {
      alert('No hay productos cargados en el sistema.');
      return;
    }

    if (cuts.length > 0) {
      const confirmReplace = window.confirm(
        '¿Desea poblar la planilla con todos los cortes registrados en Productos? Se conservarán los pesos de los que ya ingresó.'
      );
      if (!confirmReplace) return;
    }

    const existingMap = new Map<string, DeboningCutItem>(cuts.map((c) => [c.productCode, c]));
    const newCutsList: DeboningCutItem[] = [];

    activeProducts.forEach((prod) => {
      const existing = existingMap.get(prod.code);
      if (existing) {
        newCutsList.push(existing);
      } else {
        const descLower = (prod.description || '').toLowerCase();
        let cutType: 'CORTE_UTIL' | 'PICADA_RECORTES' | 'GRASA' | 'HUESO' = 'CORTE_UTIL';
        if (descLower.includes('grasa') || descLower.includes('sebo')) {
          cutType = 'GRASA';
        } else if (descLower.includes('hueso') || descLower.includes('aserrin')) {
          cutType = 'HUESO';
        } else if (descLower.includes('picada') || descLower.includes('recorte')) {
          cutType = 'PICADA_RECORTES';
        }

        newCutsList.push({
          productId: prod.id || prod.docId,
          productCode: prod.code,
          description: prod.description,
          category: prod.category || 'CARNES VACUNAS',
          unitType: prod.unitType || 'Kg',
          weightKg: 0,
          yieldPercent: 0,
          currentSalePrice: prod.price || 0,
          totalSaleValue: 0,
          allocatedCostPerKg: 0,
          totalAllocatedCost: 0,
          projectedMarginPercent: 0,
          cutType,
        });
      }
    });

    setCuts(newCutsList);
    setFeedbackMessage(`Se cargaron los ${newCutsList.length} cortes disponibles desde el catálogo de Productos.`);
  };

  // Limpiar todos los cortes
  const handleClearAllCuts = () => {
    if (cuts.length === 0) return;
    if (window.confirm('¿Está seguro de vaciar la planilla de cortes?')) {
      setCuts([]);
      setFeedbackMessage('Planilla de cortes vaciada.');
    }
  };

  // Modificar peso de un corte en la tabla
  const handleWeightChange = (index: number, val: string) => {
    const num = Math.max(0, Number(val) || 0);
    setCuts((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        weightKg: num,
        totalSaleValue: Number((num * (copy[index].currentSalePrice || 0)).toFixed(2)),
      };
      return copy;
    });
  };

  // Modificar precio de venta de un corte en la tabla
  const handleSalePriceChange = (index: number, val: string) => {
    const num = Math.max(0, Number(val) || 0);
    setCuts((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        currentSalePrice: num,
        totalSaleValue: Number(((copy[index].weightKg || 0) * num).toFixed(2)),
      };
      return copy;
    });
  };

  // Modificar tipo de corte (Corte Útil, Picada, Grasa, Hueso) en la tabla
  const handleCutTypeChange = (index: number, newType: 'CORTE_UTIL' | 'PICADA_RECORTES' | 'GRASA' | 'HUESO') => {
    setCuts((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        cutType: newType,
      };
      return copy;
    });
  };

  // Eliminar un corte de la tabla
  const handleRemoveCut = (index: number) => {
    setCuts((prev) => prev.filter((_, i) => i !== index));
  };

  // Construir objeto de orden de desposte
  const buildDeboningObject = (status: 'BORRADOR' | 'FINALIZADO'): MeatDeboning => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const code =
      existingDeboning?.code ||
      `DESP-${Date.now().toString().slice(-6)}`;

    return {
      id: existingDeboning?.id || `DESP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      code,
      date: existingDeboning?.date || dateStr,
      time: existingDeboning?.time || timeStr,
      timestamp: existingDeboning?.timestamp || Date.now(),
      branchId,
      chamber,
      status,
      operator: operatorName,
      butcherMaster,
      tropaNumber: tropaNumber.trim() || `TR-${Date.now().toString().slice(-4)}`,
      supplier: supplier.trim() || 'Proveedor Central',
      carcassType,
      animalCategory,
      dteGuideNumber: dteGuideNumber.trim(),
      initialWeightKg,
      costPerKgInitial,
      totalInitialCost,
      sourceProductCode: sourceProductCode.trim() || undefined,
      cuts: cutsWithCalculations,
      totalOutputWeightKg: massBalance.totalOutputWeightKg,
      netMeatWeightKg: massBalance.netMeatWeightKg,
      boneWeightKg: massBalance.boneWeightKg,
      fatWeightKg: massBalance.fatWeightKg,
      scrapWeightKg: massBalance.scrapWeightKg,
      shrinkageWeightKg: massBalance.shrinkageWeightKg,
      shrinkagePercent: massBalance.shrinkagePercent,
      netMeatYieldPercent: massBalance.netMeatYieldPercent,
      totalYieldPercent: massBalance.totalYieldPercent,
      totalCommercialValue: economics.totalCommercialValue,
      grossMarginTotal: economics.grossMarginTotal,
      grossMarginPercent: economics.grossMarginPercent,
      multiplicationFactor: economics.multiplicationFactor,
      breakEvenPricePerKg: economics.breakEvenPricePerKg,
      selectedCarcassIds: selectedCarcassIds.length > 0 ? selectedCarcassIds : undefined,
      isEstimated,
      yieldTemplateId: selectedTemplateId || undefined,
      notes: notes.trim(),
    };
  };

  // Aplicar planilla de rendimiento / coeficientes (Regla A.4)
  const handleApplyYieldTemplate = (template: DeboningYieldTemplate) => {
    if (initialWeightKg <= 0) {
      setErrorMessage('Seleccione o ingrese primero el peso de entrada antes de aplicar la planilla.');
      setSelectedTemplateId('');
      return;
    }

    const isCompatible = template.animalCategory === animalCategory && template.carcassType === carcassType;
    if (!isCompatible) {
       const confirmIncompatible = window.confirm(
         `⚠️ ATENCIÓN: La planilla "${template.name}" es para ${template.animalCategory} (${template.carcassType}), pero usted tiene seleccionado ${animalCategory} (${carcassType}).\n\n¿Desea aplicarla de todas formas?`
       );
       if (!confirmIncompatible) {
         setSelectedTemplateId('');
         return;
       }
    }

    const estimatedCuts = applyYieldTemplateToCarcass(template, initialWeightKg, activeProducts);
    setCuts(estimatedCuts);
    setIsEstimated(true); // Regla A.4: Indicar que los cortes provienen de estimación
    setSelectedTemplateId(template.id);
    
    setFeedbackMessage(
      `✓ Planilla "${template.name}" aplicada. LOS KILOS SON ESTIMADOS (${formatKg(initialWeightKg)}). Verifique y ajuste con el pesaje real de balanza.`
    );
  };


  // Guardar como Borrador
  const handleSaveDraft = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const deboning = buildDeboningObject('BORRADOR');
      await saveMeatDeboning(deboning);
      onClose();
    } catch (err: any) {
      console.error('Error al guardar borrador de desposte:', err);
      setErrorMessage(err.message || 'Error al guardar el borrador.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Finalizar e impactar en stock
  const handleConfirmFinalize = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const deboning = buildDeboningObject('BORRADOR');
      await finalizeMeatDeboning(deboning, operatorName);
      onClose();
    } catch (err: any) {
      console.error('Error al finalizar desposte:', err);
      setErrorMessage(err.message || 'Error al finalizar e impactar en stock.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Imprimir comprobante / ficha técnica
  const handlePrint = () => {
    const deboning = buildDeboningObject('BORRADOR');
    const branchConfig = branchConfigs ? branchConfigs[branchId] : null;
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 select-none overflow-y-auto">
      <div className="win-panel bg-[#d4d0c8] max-w-6xl w-full max-h-[96vh] flex flex-col shadow-2xl border-2 border-white">
        {/* TÍTULO DE VENTANA WINDOWS */}
        <div className="win-titlebar flex items-center justify-between p-1 bg-[#002046] text-white">
          <div className="flex items-center space-x-2 text-white font-bold text-xs pl-1">
            <Beef className="w-4 h-4 text-amber-300" />
            <span>
              NECO POS — {existingDeboning ? 'EDITAR ORDEN DE DESPOSTE' : 'NUEVO DESPOSTE DE MEDIAS RESES & RENDIMIENTO'}
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

        {feedbackMessage && (
          <div className="bg-green-100 border border-green-400 text-green-900 p-1.5 text-xs flex items-center justify-between mx-2 mt-2">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-green-700 shrink-0" />
              <span>{feedbackMessage}</span>
            </div>
            <button
              onClick={() => setFeedbackMessage(null)}
              className="text-gray-500 hover:text-black text-[10px] font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* CONTENIDO PRINCIPAL SCROLLEABLE */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2 text-xs text-black">
          {/* SECCIÓN 1: DATOS DE LA TROPA Y MATERIA PRIMA */}
          <div className="bg-[#ebeef2] border border-gray-400 p-2 shadow-sm rounded-sm">
            <div className="font-bold text-[11px] text-[#002046] mb-1.5 flex items-center justify-between border-b border-gray-300 pb-1">
              <div className="flex items-center space-x-1.5">
                <Scale className="w-3.5 h-3.5 text-blue-800" />
                <span>1. DATOS DE ENTRADA DE MATERIA PRIMA & TROPA SENASA</span>
              </div>
              {availableReceptions && availableReceptions.length > 0 && (
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] text-gray-600 font-semibold">Cargar desde Recepción:</span>
                  <select
                    onChange={(e) => {
                      const rec = availableReceptions.find((r) => r.id === e.target.value);
                      if (rec) {
                        setSelectedReceptionId(rec.id);
                        setSelectedCarcassIds(rec.carcasses?.map(c => c.id) || []);
                        setBranchId(rec.branchId);
                        setChamber(rec.chamber);
                        setTropaNumber(rec.tropaNumber);
                        setSupplier(rec.supplier);
                        setAnimalCategory(rec.category || 'Novillito');
                        setDteGuideNumber(rec.dteGuideNumber || rec.deliveryNoteNumber || '');
                        setInitialWeightKg(rec.totalWeightKg);
                        setCostPerKgInitial(rec.pricePerKg);
                        if (rec.productCode) setSourceProductCode(rec.productCode);
                        setFeedbackMessage(`Datos vinculados desde Recepción ${rec.code} (Tropa ${rec.tropaNumber}, ${formatKg(rec.totalWeightKg)}).`);
                      }
                    }}
                    className="bg-white border border-blue-400 px-1 py-0.5 text-[10px] font-bold text-blue-900"
                    defaultValue=""
                  >
                    <option value="">-- Seleccionar Tropa / Recepción --</option>
                    {availableReceptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        [{r.code}] Tropa {r.tropaNumber} — {r.supplier} ({formatKg(r.totalWeightKg)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Sucursal Destino:</label>
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
                <label className="font-bold text-[10px] text-gray-700 block">Proveedor / Frigorífico:</label>
                <input
                  type="text"
                  placeholder="Ej: Frigorífico Gorina"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">DTE / Guía Tránsito:</label>
                <input
                  type="text"
                  placeholder="Ej: DTE-948102"
                  value={dteGuideNumber}
                  onChange={(e) => setDteGuideNumber(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Categoría Animal:</label>
                <select
                  value={animalCategory}
                  onChange={(e) => setAnimalCategory(e.target.value)}
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
                <label className="font-bold text-[10px] text-gray-700 block">Tipo Materia Prima:</label>
                <select
                  value={carcassType}
                  onChange={(e) => setCarcassType(e.target.value as DeboningCarcassType)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs font-bold text-indigo-900"
                >
                  <option value="MEDIA_RES">Media Res Vacuna</option>
                  <option value="CUARTO_DELANTERO">Cuarto Delantero Vacuno</option>
                  <option value="CUARTO_TRASERO">Cuarto Trasero Pistola</option>
                  <option value="RES_ENTERA">Res Vacuna Entera</option>
                  <option value="CERDO_ENTERO">Cerdo / Media Res Porcina</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Peso al Gancho (Kg):</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.1"
                  value={initialWeightKg}
                  onChange={(e) => setInitialWeightKg(Math.max(0.1, Number(e.target.value) || 0))}
                  className="w-full bg-yellow-50 border border-gray-400 px-1.5 py-1 text-xs font-bold text-red-700 text-right"
                />
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Costo $/Kg al Gancho:</label>
                <input
                  type="number"
                  step="10"
                  min="0"
                  value={costPerKgInitial}
                  onChange={(e) => setCostPerKgInitial(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs font-bold text-green-800 text-right"
                />
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Costo Total Materia Prima:</label>
                <div className="bg-gray-200 border border-gray-400 px-1.5 py-1 text-xs font-bold text-black text-right">
                  {formatCurrency(totalInitialCost)}
                </div>
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Maestro Despostador:</label>
                <input
                  type="text"
                  value={butcherMaster}
                  onChange={(e) => setButcherMaster(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Planilla de Rendimiento (Regla A.4):</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => {
                    const tid = e.target.value;
                    setSelectedTemplateId(tid);
                    if (tid) {
                      const found = deboningTemplates.find(temp => temp.id === tid);
                      if (found) handleApplyYieldTemplate(found);
                    }
                  }}
                  className="w-full bg-white border border-blue-400 px-1.5 py-1 text-xs font-bold text-blue-900"
                >
                  <option value="">-- Sin planilla (Carga manual) --</option>
                  {deboningTemplates.filter(t => t.isActive !== false).map((t) => {
                    const isCompatible = t.animalCategory === animalCategory && t.carcassType === carcassType;
                    return (
                      <option key={t.id} value={t.id}>
                        {!isCompatible ? '[INCOMPATIBLE] ' : ''}{t.name} (v{t.version}) - {t.animalCategory} {t.carcassType.replace('_', ' ')} — Ref: {formatKg(t.referenceInitialWeightKg)}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="font-bold text-[10px] text-gray-700 block">Descontar Código Cámara:</label>
                <select
                  value={sourceProductCode}
                  onChange={(e) => setSourceProductCode(e.target.value)}
                  className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs"
                >
                  <option value="">-- Sin descontar stock previo --</option>
                  {carcassProducts.map((p) => (
                    <option key={p.code} value={p.code}>
                      [{p.code}] {p.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: AGREGAR CORTES UNO POR UNO TOMADOS DE PRODUCTOS */}
          <div className="bg-white border-2 border-[#002046] shadow-md">
            <div className="bg-[#002046] text-white p-2 flex items-center justify-between font-bold text-xs">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-amber-300" />
                <span>2. AGREGAR CORTES DEL DESPOSTE UNO POR UNO (CATÁLOGO PRODUCTOS NECO)</span>
              </div>
              <div className="text-[11px] text-amber-200 flex items-center space-x-3">
                <span>Cortes en Planilla: <strong>{cuts.length}</strong></span>
                <span>Obtenido: <strong>{formatKg(massBalance.totalOutputWeightKg)}</strong> ({massBalance.totalYieldPercent}%)</span>
              </div>
            </div>

            {isEstimated && (
              <div className="bg-amber-100 border-b border-amber-300 text-amber-950 px-3 py-1.5 text-xs font-bold flex items-center justify-between">
                <span className="flex items-center space-x-1.5">
                  <Info className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>⚠️ VALORES PROYECTADOS SEGÚN PLANILLA: Los kilos mostrados son estimaciones teóricas según la planilla. Verifique y ajuste cada corte con el pesaje real de balanza antes de finalizar.</span>
                </span>
                <span className="px-1.5 py-0.5 bg-amber-200 border border-amber-400 text-amber-950 rounded text-[10px] uppercase font-extrabold">
                  Proyección Teórica
                </span>
              </div>
            )}

            {/* PANEL DESTACADO: AGREGAR CORTE UNO POR UNO */}
            <form onSubmit={handleAddCutOneByOne} className="p-2.5 bg-[#f5f7fa] border-b border-gray-400 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-gray-300 text-xs">
                <span className="font-bold text-[#002046] flex items-center space-x-1.5">
                  <Plus className="w-4 h-4 text-green-700" />
                  <span>Ingreso Individual de Corte Pesado en Balanza:</span>
                </span>

                <div className="flex items-center space-x-2 text-[11px]">
                  {/* Filtro por Categoría */}
                  <div className="flex items-center space-x-1">
                    <Filter className="w-3.5 h-3.5 text-gray-600" />
                    <span className="text-gray-600 font-semibold">Rubro:</span>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="bg-white border border-gray-400 px-1 py-0.5 text-xs font-semibold"
                    >
                      {availableCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Búsqueda rápida por nombre o código */}
                  <div className="flex items-center space-x-1">
                    <Search className="w-3.5 h-3.5 text-gray-600" />
                    <input
                      type="text"
                      placeholder="Buscar por corte..."
                      value={searchCutText}
                      onChange={(e) => setSearchCutText(e.target.value)}
                      className="bg-white border border-gray-400 px-1.5 py-0.5 text-xs w-32"
                    />
                  </div>

                  {/* Botón para cargar todos los cortes de Productos con 0 kg */}
                  <button
                    type="button"
                    onClick={handleLoadAllProductsAsZeroKg}
                    className="px-2 py-0.5 bg-white hover:bg-gray-100 border border-gray-400 text-[10px] font-semibold text-gray-700 flex items-center space-x-1"
                    title="Cargar todos los cortes que están cargados en Productos con 0 Kg"
                  >
                    <RefreshCw className="w-3 h-3 text-blue-600" />
                    <span>Poblar Todo (0 Kg)</span>
                  </button>

                  {cuts.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllCuts}
                      className="px-2 py-0.5 bg-white hover:bg-red-50 text-red-700 border border-red-300 text-[10px] font-semibold"
                    >
                      Vaciar Planilla
                    </button>
                  )}
                </div>
              </div>

              {/* CAMPOS DE CARGA DEL CORTE */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end pt-1">
                {/* 1. Selección del Producto */}
                <div className="md:col-span-5">
                  <label className="font-bold text-[11px] text-gray-800 block mb-0.5">
                    Corte de Productos ({filteredProductsForSelect.length} disponibles):
                  </label>
                  <select
                    value={selectedProductCode}
                    onChange={(e) => setSelectedProductCode(e.target.value)}
                    className="w-full bg-white border-2 border-blue-600 px-2 py-1 text-xs font-bold text-black focus:outline-none"
                  >
                    <option value="">-- Seleccionar corte cargado en Productos --</option>
                    {filteredProductsForSelect.map((prod) => {
                      const isAdded = cuts.some(c => c.productCode === prod.code);
                      return (
                        <option key={prod.code} value={prod.code} disabled={isAdded}>
                          {isAdded ? '[AGREGADO] ' : ''}[{prod.code}] {prod.description} ({prod.category}) — ${prod.price}/Kg
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 2. Kilos Obtenidos */}
                <div className="md:col-span-2">
                  <label className="font-bold text-[11px] text-gray-800 block mb-0.5">
                    Kilos Balanza (Kg):
                  </label>
                  <div className="relative">
                    <input
                      ref={weightInputRef}
                      type="number"
                      step="0.001"
                      min="0.001"
                      placeholder="0.000"
                      value={cutWeightInput}
                      onChange={(e) => setCutWeightInput(e.target.value)}
                      className="w-full bg-yellow-100 border-2 border-amber-600 px-2 py-1 text-xs font-extrabold text-blue-950 text-right pr-7 focus:bg-yellow-50 focus:outline-none"
                    />
                    <span className="absolute right-1.5 top-1 text-[10px] font-bold text-gray-600">Kg</span>
                  </div>
                </div>

                {/* 3. Tipo de Subproducto / Clasificación */}
                <div className="md:col-span-2">
                  <label className="font-bold text-[11px] text-gray-800 block mb-0.5">
                    Tipo / Destino:
                  </label>
                  <select
                    value={cutTypeInput}
                    onChange={(e) => setCutTypeInput(e.target.value as any)}
                    className="w-full bg-white border border-gray-400 px-1.5 py-1 text-xs font-semibold"
                  >
                    <option value="CORTE_UTIL">Corte Útil Mostrador</option>
                    <option value="PICADA_RECORTES">Picada / Recortes</option>
                    <option value="GRASA">Grasa de Pella / Sebo</option>
                    <option value="HUESO">Hueso / Desecho</option>
                  </select>
                </div>

                {/* 4. Precio Mostrador $/Kg */}
                <div className="md:col-span-1">
                  <label className="font-bold text-[11px] text-gray-800 block mb-0.5">
                    Venta $/Kg:
                  </label>
                  <input
                    type="number"
                    step="10"
                    min="0"
                    value={cutSalePriceInput}
                    onChange={(e) => setCutSalePriceInput(e.target.value)}
                    className="w-full bg-white border border-gray-400 px-1 py-1 text-xs font-bold text-right text-gray-800"
                  />
                </div>

                {/* 5. Botón de Agregar */}
                <div className="md:col-span-2 flex items-center">
                  <button
                    type="submit"
                    disabled={!selectedProductCode || !cutWeightInput || Number(cutWeightInput) <= 0}
                    className="w-full py-1.5 px-2 bg-[#002046] hover:bg-blue-900 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow"
                  >
                    <Plus className="w-4 h-4 text-green-300" />
                    <span>AGREGAR CORTE</span>
                  </button>
                </div>
              </div>

              {selectedProductObj && (
                <div className="text-[11px] text-blue-900 font-semibold bg-blue-50 border border-blue-200 p-1 flex items-center space-x-2 rounded-sm">
                  <Info className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                  <span>
                    Seleccionado: <strong>[{selectedProductObj.code}] {selectedProductObj.description}</strong> — Rubro: {selectedProductObj.category} — Precio lista: {formatCurrency(selectedProductObj.price)}/Kg. Ingrese los kilos y presione <strong>Enter</strong> o <strong>AGREGAR CORTE</strong>.
                  </span>
                </div>
              )}
            </form>

            {/* TABLA DE CORTES AGREGADOS */}
            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-[#e4e7ec] text-gray-700 sticky top-0 z-10 border-b border-gray-400 text-[10px]">
                  <tr>
                    <th className="p-1 w-12 border-r border-gray-300">Cód</th>
                    <th className="p-1 border-r border-gray-300">Corte Cárnico (Productos)</th>
                    <th className="p-1 border-r border-gray-300 w-28">Clasificación</th>
                    <th className={`p-1 border-r border-gray-300 text-right w-28 ${isEstimated ? 'bg-amber-100 text-amber-950 font-extrabold' : 'bg-yellow-100 text-gray-800'}`}>
                      {isEstimated ? 'Kilos (Proyectados s/ Plantilla)' : 'Kilos Reales (Kg)'}
                    </th>
                    <th className="p-1 border-r border-gray-300 text-right w-16">Rend %</th>
                    <th className="p-1 border-r border-gray-300 text-right w-24">Venta $/Kg</th>
                    <th className="p-1 border-r border-gray-300 text-right w-28">Total Venta ($)</th>
                    <th className="p-1 border-r border-gray-300 text-right w-24 bg-green-50">Costo $/Kg</th>
                    <th className="p-1 border-r border-gray-300 text-right w-20">Margen %</th>
                    <th className="p-1 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-[11px]">
                  {cutsWithCalculations.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-6 text-center text-gray-500 bg-gray-50">
                        <Beef className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                        <p className="font-bold text-xs text-gray-700">No hay cortes agregados en la planilla todavía.</p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          Seleccione los cortes cargados en Productos arriba e ingrese los kilos pesados para irlos agregando uno por uno.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    cutsWithCalculations.map((cut, idx) => (
                      <tr
                        key={`${cut.productCode}-${idx}`}
                        className={`hover:bg-blue-50 ${
                          cut.cutType === 'HUESO'
                            ? 'bg-gray-100 text-gray-600'
                            : cut.cutType === 'GRASA'
                            ? 'bg-amber-50/50'
                            : ''
                        }`}
                      >
                        <td className="p-1 font-mono font-bold text-gray-700 border-r border-gray-200">
                          {cut.productCode}
                        </td>
                        <td className="p-1 font-bold text-black border-r border-gray-200">
                          <div>{cut.description}</div>
                          <div className="text-[9px] text-gray-500 font-normal">{cut.category}</div>
                        </td>
                        <td className="p-1 border-r border-gray-200">
                          <select
                            value={cut.cutType || 'CORTE_UTIL'}
                            onChange={(e) => handleCutTypeChange(idx, e.target.value as any)}
                            className="bg-white border border-gray-300 text-[10px] px-1 py-0.5 rounded font-semibold w-full"
                          >
                            <option value="CORTE_UTIL">Corte Útil</option>
                            <option value="PICADA_RECORTES">Picada / Recorte</option>
                            <option value="GRASA">Grasa de Pella</option>
                            <option value="HUESO">Hueso / Desecho</option>
                          </select>
                        </td>
                        <td className="p-1 border-r border-gray-200 text-right bg-yellow-50">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={cut.weightKg}
                            onChange={(e) => handleWeightChange(idx, e.target.value)}
                            className="w-20 text-right font-bold text-blue-900 bg-white border border-gray-300 px-1 py-0.5 text-xs"
                          />
                        </td>
                        <td className="p-1 border-r border-gray-200 text-right font-bold text-blue-800">
                          {cut.yieldPercent.toFixed(1)}%
                        </td>
                        <td className="p-1 border-r border-gray-200 text-right">
                          <input
                            type="number"
                            step="50"
                            min="0"
                            value={cut.currentSalePrice}
                            onChange={(e) => handleSalePriceChange(idx, e.target.value)}
                            className="w-20 text-right font-semibold text-black bg-white border border-gray-300 px-1 py-0.5 text-xs"
                          />
                        </td>
                        <td className="p-1 border-r border-gray-200 text-right font-bold text-black">
                          {formatCurrency(cut.totalSaleValue)}
                        </td>
                        <td className="p-1 border-r border-gray-200 text-right font-bold text-green-900 bg-green-50/50">
                          {formatCurrency(cut.allocatedCostPerKg)}
                        </td>
                        <td
                          className={`p-1 border-r border-gray-200 text-right font-bold ${
                            cut.projectedMarginPercent >= 0 ? 'text-green-700' : 'text-red-600'
                          }`}
                        >
                          {cut.projectedMarginPercent.toFixed(1)}%
                        </td>
                        <td className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveCut(idx)}
                            className="text-gray-400 hover:text-red-600 p-0.5"
                            title="Eliminar corte de la planilla"
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

            {/* BARRA INFERIOR DE RESUMEN DE LA TABLA */}
            <div className="p-1.5 bg-[#f0f2f5] border-t border-gray-300 flex items-center justify-between text-xs">
              <div className="font-bold text-gray-700">
                Total Kilos Ingresados: <span className="text-[#002046]">{formatKg(massBalance.totalOutputWeightKg)}</span> de {formatKg(initialWeightKg)}
              </div>
              <div className="text-[11px] text-gray-600">
                Método Contable: <strong>Valor Relativo de Realización Comercial</strong> (Costo proporcional sin desvío)
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: BALANCE DE MASA Y RENDIMIENTO ECONÓMICO */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {/* BALANCE DE MASA */}
            <div className="bg-white border border-gray-400 p-2 shadow-sm rounded-sm">
              <div className="font-bold text-[11px] text-[#002046] mb-1 flex items-center justify-between border-b border-gray-300 pb-1">
                <span className="flex items-center space-x-1">
                  <Scale className="w-3.5 h-3.5 text-blue-700" />
                  <span>BALANCE DE MASA CÁRNICA (KILOGRAMOS)</span>
                </span>
                <span
                  className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                    massBalance.shrinkagePercent <= 2.5
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  Merma: {massBalance.shrinkagePercent}% ({formatKg(massBalance.shrinkageWeightKg)})
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-center mt-2">
                <div className="bg-blue-50 border border-blue-200 p-1.5 rounded">
                  <div className="text-[10px] text-gray-600 font-semibold uppercase">Carne Limpia</div>
                  <div className="text-sm font-bold text-blue-900">{formatKg(massBalance.netMeatWeightKg)}</div>
                  <div className="text-[10px] text-blue-700 font-bold">{massBalance.netMeatYieldPercent}%</div>
                </div>

                <div className="bg-indigo-50 border border-indigo-200 p-1.5 rounded">
                  <div className="text-[10px] text-gray-600 font-semibold uppercase">Recortes / Picada</div>
                  <div className="text-sm font-bold text-indigo-900">{formatKg(massBalance.scrapWeightKg)}</div>
                  <div className="text-[10px] text-indigo-700 font-bold">
                    {initialWeightKg > 0 ? ((massBalance.scrapWeightKg / initialWeightKg) * 100).toFixed(1) : 0}%
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 p-1.5 rounded">
                  <div className="text-[10px] text-gray-600 font-semibold uppercase">Grasa / Pella</div>
                  <div className="text-sm font-bold text-amber-900">{formatKg(massBalance.fatWeightKg)}</div>
                  <div className="text-[10px] text-amber-700 font-bold">
                    {initialWeightKg > 0 ? ((massBalance.fatWeightKg / initialWeightKg) * 100).toFixed(1) : 0}%
                  </div>
                </div>

                <div className="bg-gray-100 border border-gray-300 p-1.5 rounded">
                  <div className="text-[10px] text-gray-600 font-semibold uppercase">Hueso / Desecho</div>
                  <div className="text-sm font-bold text-gray-800">{formatKg(massBalance.boneWeightKg)}</div>
                  <div className="text-[10px] text-gray-700 font-bold">
                    {initialWeightKg > 0 ? ((massBalance.boneWeightKg / initialWeightKg) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </div>

              {/* Barra de masa visual */}
              <div className="mt-2.5">
                <div className="flex justify-between text-[9px] text-gray-600 mb-0.5">
                  <span>Composición de la Materia Prima</span>
                  <span>Salida Total: {formatKg(massBalance.totalOutputWeightKg)} / {formatKg(initialWeightKg)}</span>
                </div>
                <div className="h-3 w-full bg-gray-200 rounded-sm overflow-hidden flex">
                  <div
                    style={{ width: `${massBalance.netMeatYieldPercent}%` }}
                    className="bg-blue-600 h-full"
                    title={`Carne Útil: ${massBalance.netMeatYieldPercent}%`}
                  />
                  <div
                    style={{ width: `${initialWeightKg > 0 ? (massBalance.scrapWeightKg / initialWeightKg) * 100 : 0}%` }}
                    className="bg-indigo-500 h-full"
                    title={`Picada: ${massBalance.scrapWeightKg} Kg`}
                  />
                  <div
                    style={{ width: `${initialWeightKg > 0 ? (massBalance.fatWeightKg / initialWeightKg) * 100 : 0}%` }}
                    className="bg-amber-400 h-full"
                    title={`Grasa: ${massBalance.fatWeightKg} Kg`}
                  />
                  <div
                    style={{ width: `${initialWeightKg > 0 ? (massBalance.boneWeightKg / initialWeightKg) * 100 : 0}%` }}
                    className="bg-gray-400 h-full"
                    title={`Hueso: ${massBalance.boneWeightKg} Kg`}
                  />
                  {massBalance.shrinkagePercent > 0 && (
                    <div
                      style={{ width: `${Math.min(100, massBalance.shrinkagePercent)}%` }}
                      className="bg-red-400 h-full"
                      title={`Merma técnica: ${massBalance.shrinkagePercent}%`}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* RENDIMIENTO ECONÓMICO */}
            <div className="bg-white border border-gray-400 p-2 shadow-sm rounded-sm">
              <div className="font-bold text-[11px] text-[#002046] mb-1 flex items-center justify-between border-b border-gray-300 pb-1">
                <span className="flex items-center space-x-1">
                  <Calculator className="w-3.5 h-3.5 text-green-700" />
                  <span>VALORIZACIÓN ECONÓMICA & MARGEN BRUTO</span>
                </span>
                <span className="font-mono text-[10px] text-gray-600 font-bold">
                  Factor: <span className="text-[#002046]">{economics.multiplicationFactor}x</span>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-center mt-2">
                <div className="bg-gray-100 border border-gray-300 p-1.5 rounded">
                  <div className="text-[10px] text-gray-600 font-semibold uppercase">Costo Compra</div>
                  <div className="text-sm font-bold text-gray-900">{formatCurrency(totalInitialCost)}</div>
                  <div className="text-[10px] text-gray-600 font-semibold">{formatCurrency(costPerKgInitial)}/kg gancho</div>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-1.5 rounded">
                  <div className="text-[10px] text-gray-600 font-semibold uppercase">Venta Estimada</div>
                  <div className="text-sm font-bold text-blue-900">{formatCurrency(economics.totalCommercialValue)}</div>
                  <div className="text-[10px] text-blue-700 font-semibold">Mostrador Neco</div>
                </div>

                <div className="bg-green-50 border border-green-200 p-1.5 rounded">
                  <div className="text-[10px] text-gray-600 font-semibold uppercase">Margen Bruto</div>
                  <div className="text-sm font-bold text-green-800">{formatCurrency(economics.grossMarginTotal)}</div>
                  <div className="text-[10px] text-green-700 font-bold">+{economics.grossMarginPercent}%</div>
                </div>
              </div>

              <div className="mt-2.5 bg-[#f7f9fc] border border-gray-200 p-1.5 text-[10px] flex items-center justify-between rounded">
                <span>
                  Costo de Equilibrio por Kg de Carne Limpia: <strong>{formatCurrency(economics.breakEvenPricePerKg)} / Kg</strong>
                </span>
                <span className="text-gray-500 font-mono">
                  Rentabilidad: {economics.grossMarginPercent > 25 ? 'ÓPTIMA' : 'AJUSTADA'}
                </span>
              </div>
            </div>
          </div>

          {/* OBSERVACIONES */}
          <div>
            <label className="font-bold text-[10px] text-gray-700 block mb-0.5">Observaciones de la Tropa / Auditoría:</label>
            <input
              type="text"
              placeholder="Ej: Calidad excelente, grasa blanca, conformación AA..."
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
              <span>Imprimir Ficha Técnica</span>
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
              onClick={async () => {
                console.log('existingDeboning:', existingDeboning);
                console.log('existingDeboning.status:', existingDeboning?.status);
                setErrorMessage(null);
                // Regla A.2: Si no está finalizado, ofrecer finalizar automáticamente para guardar planilla
                if (!existingDeboning || existingDeboning.status !== 'FINALIZADO') {
                  const confirmFinalizeAndSave = window.confirm(
                    'Regla A.2: Para guardar esta planilla de rendimiento, el desposte debe estar finalizado e impactado en stock.\n\n¿Desea finalizar e impactar en stock este desposte automáticamente para guardarlo como planilla?'
                  );
                  if (!confirmFinalizeAndSave) {
                    setErrorMessage(
                      'Regla A.2: Solo es posible guardar una planilla de rendimiento a partir de una orden de desposte cuya finalización real esté confirmada y persistida en el sistema. Finalice e impacte en stock la orden primero.'
                    );
                    return;
                  }
                  try {
                    setIsSubmitting(true);
                    const deboning = buildDeboningObject('BORRADOR');
                    await finalizeMeatDeboning(deboning, operatorName);
                    setShowSaveTemplateModal(true);
                  } catch (err: any) {
                    console.error('Error auto-finalizando desposte:', err);
                    setErrorMessage(`Error al finalizar desposte automáticamente: ${err.message || 'Error desconocido'}`);
                  } finally {
                    setIsSubmitting(false);
                  }
                  return;
                }
                if (existingDeboning.status === 'ANULADO') {
                  setErrorMessage('Regla A.2: No se puede generar una planilla a partir de una orden de desposte anulada.');
                  return;
                }
                if (existingDeboning.isEstimated) {
                  setErrorMessage('Regla A.2: No se puede guardar como planilla un desposte que use pesos estimados.');
                  return;
                }
                setShowSaveTemplateModal(true);
              }}
              className="px-3 py-1 bg-white hover:bg-indigo-50 border border-indigo-300 text-indigo-900 font-bold flex items-center space-x-1 shadow-sm"
              title="Guardar coeficientes reales como planilla reutilizable (Regla A.1)"
            >
              <Save className="w-3.5 h-3.5 text-indigo-700" />
              <span>Guardar como Planilla</span>
            </button>

            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSubmitting}
              className="px-3 py-1 bg-white hover:bg-amber-50 border border-gray-400 text-black font-bold flex items-center space-x-1 shadow-sm"
            >
              <Save className="w-3.5 h-3.5 text-amber-700" />
              <span>Guardar Borrador</span>
            </button>

            <button
              type="button"
              onClick={() => setShowConfirmFinalize(true)}
              disabled={isSubmitting || cuts.length === 0}
              className="px-4 py-1 bg-[#002046] hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold flex items-center space-x-1.5 shadow"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-green-300" />
              <span>FINALIZAR E IMPACTAR EN STOCK</span>
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
              <span>Confirmar Finalización de Desposte</span>
            </div>

            <p className="text-xs text-gray-800 leading-relaxed">
              Esta operación es <strong>definitiva e impactará directamente en las existencias</strong>:
            </p>

            <ul className="text-xs text-gray-700 list-disc list-inside space-y-1 bg-white p-2 border border-gray-300">
              <li>
                Se ingresarán <strong>{formatKg(massBalance.totalOutputWeightKg)}</strong> en <strong>{cuts.length} cortes</strong> de Productos a la{' '}
                <strong>{chamber}</strong>.
              </li>
              <li>
                Se generarán movimientos inmutables de tipo <strong>PRODUCCION</strong> en el Kardex de stock para cada corte.
              </li>
              {sourceProductCode && (
                <li>
                  Se descontarán <strong>{formatKg(initialWeightKg)}</strong> del producto de media res <strong>{sourceProductCode}</strong>.
                </li>
              )}
              <li>
                Trazabilidad registrada bajo Tropa SENASA: <strong>{tropaNumber || 'Sin tropa'}</strong>.
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
                <span>{isSubmitting ? 'Asentando en Stock...' : 'Confirmar e Ingresar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL DE GUARDAR COMO PLANILLA DE RENDIMIENTO (Regla A.1 y A.2) */}
      {showSaveTemplateModal && existingDeboning && existingDeboning.status === 'FINALIZADO' && (
        <SaveYieldTemplateModal
          isOpen={showSaveTemplateModal}
          onClose={() => setShowSaveTemplateModal(false)}
          deboning={existingDeboning}
          onSuccess={(tmpl) => {
            setFeedbackMessage(`✓ Planilla de rendimiento "${tmpl.name}" guardada exitosamente (${tmpl.items.length} cortes).`);
          }}
        />
      )}
    </div>
  );
};
