import React, { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Save,
  X,
  Scale,
  Beef,
  Layers,
  Sparkles,
} from 'lucide-react';
import { WindowsModal } from '../common/WindowsModal';
import {
  DeboningYieldTemplate,
  YieldCoefficientItem,
  ANIMAL_CATEGORIES,
  DeboningCarcassType,
  Product,
} from '../../types/pos';
import { useFirebase } from '../../context/FirebaseContext';
import { useDialog } from '../../context/DialogContext';
import { formatKg, formatCurrency } from '../../utils/stockHelper';

interface TemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateToEdit?: DeboningYieldTemplate | null;
  initialAnimalCategory?: string;
  onSuccess?: (template: DeboningYieldTemplate) => void;
}

// Preset estándar de cortes para Vacuno (Base 100 Kg)
const TYPICAL_BEEF_CUTS: Array<{
  productCode: string;
  description: string;
  category: string;
  cutType: 'CORTE_UTIL' | 'PICADA_RECORTES' | 'GRASA' | 'HUESO';
  defaultYieldPct: number;
}> = [
  { productCode: '101', description: 'Asado de Tira', category: 'Parrilla', cutType: 'CORTE_UTIL', defaultYieldPct: 10.5 },
  { productCode: '102', description: 'Vacío', category: 'Parrilla', cutType: 'CORTE_UTIL', defaultYieldPct: 4.8 },
  { productCode: '103', description: 'Matambre', category: 'Parrilla', cutType: 'CORTE_UTIL', defaultYieldPct: 2.5 },
  { productCode: '104', description: 'Tapa de Asado', category: 'Parrilla', cutType: 'CORTE_UTIL', defaultYieldPct: 3.2 },
  { productCode: '105', description: 'Nalga de Adentro', category: 'Milanesas', cutType: 'CORTE_UTIL', defaultYieldPct: 6.8 },
  { productCode: '106', description: 'Bola de Lomo', category: 'Milanesas', cutType: 'CORTE_UTIL', defaultYieldPct: 5.5 },
  { productCode: '107', description: 'Cuadrada', category: 'Milanesas', cutType: 'CORTE_UTIL', defaultYieldPct: 5.8 },
  { productCode: '108', description: 'Peceto', category: 'Milanesas', cutType: 'CORTE_UTIL', defaultYieldPct: 2.8 },
  { productCode: '109', description: 'Colita de Cuadril', category: 'Trasero', cutType: 'CORTE_UTIL', defaultYieldPct: 1.8 },
  { productCode: '110', description: 'Bife Angosto c/ Lomo', category: 'Trasero', cutType: 'CORTE_UTIL', defaultYieldPct: 6.2 },
  { productCode: '111', description: 'Bife Ancho c/ Hueso', category: 'Delantero', cutType: 'CORTE_UTIL', defaultYieldPct: 5.4 },
  { productCode: '112', description: 'Paleta / Carnaza', category: 'Delantero', cutType: 'CORTE_UTIL', defaultYieldPct: 6.5 },
  { productCode: '113', description: 'Roast Beef / Aguja', category: 'Delantero', cutType: 'CORTE_UTIL', defaultYieldPct: 5.2 },
  { productCode: '114', description: 'Tortuguita', category: 'Trasero', cutType: 'CORTE_UTIL', defaultYieldPct: 2.2 },
  { productCode: '115', description: 'Osobuco / Garrón', category: 'Delantero', cutType: 'CORTE_UTIL', defaultYieldPct: 4.5 },
  { productCode: '116', description: 'Picada Especial / Recortes', category: 'Elaborados', cutType: 'PICADA_RECORTES', defaultYieldPct: 10.0 },
  { productCode: '117', description: 'Grasa de Pella / Fusión', category: 'Subproductos', cutType: 'GRASA', defaultYieldPct: 8.5 },
  { productCode: '118', description: 'Hueso Blanco / Descarte', category: 'Subproductos', cutType: 'HUESO', defaultYieldPct: 6.0 },
];

export const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({
  isOpen,
  onClose,
  templateToEdit,
  initialAnimalCategory,
  onSuccess,
}) => {
  const { products, saveDeboningTemplate, localUser, user } = useFirebase();
  const { showAlert } = useDialog();

  const isEditing = Boolean(templateToEdit);

  // Form State
  const [name, setName] = useState('');
  const [animalCategory, setAnimalCategory] = useState('Novillito');
  const [species, setSpecies] = useState('Vacuno');
  const [carcassType, setCarcassType] = useState<DeboningCarcassType>('MEDIA_RES');
  const [referenceWeightKg, setReferenceWeightKg] = useState<number>(100);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<YieldCoefficientItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Add Item Row state
  const [selectedProductCode, setSelectedProductCode] = useState('');
  const [newCutWeightKg, setNewCutWeightKg] = useState<string>('');
  const [newCutYieldPct, setNewCutYieldPct] = useState<string>('');
  const [newCutType, setNewCutType] = useState<'CORTE_UTIL' | 'PICADA_RECORTES' | 'GRASA' | 'HUESO'>('CORTE_UTIL');

  // Inicializar formulario al abrir o cambiar templateToEdit
  useEffect(() => {
    if (templateToEdit) {
      setName(templateToEdit.name);
      setAnimalCategory(templateToEdit.animalCategory || 'Novillito');
      setSpecies(templateToEdit.species || 'Vacuno');
      setCarcassType(templateToEdit.carcassType || 'MEDIA_RES');
      setReferenceWeightKg(Number(templateToEdit.referenceInitialWeightKg) || 100);
      setNotes(templateToEdit.notes || '');
      setItems(templateToEdit.items ? [...templateToEdit.items] : []);
    } else {
      const defaultCategory = initialAnimalCategory || 'Novillito';
      setName(`Planilla Base - ${defaultCategory}`);
      setAnimalCategory(defaultCategory);
      setSpecies(defaultCategory.toLowerCase().includes('cerdo') || defaultCategory.toLowerCase().includes('porc') ? 'Porcino' : 'Vacuno');
      setCarcassType('MEDIA_RES');
      setReferenceWeightKg(100);
      setNotes('Planilla base para nuevos despostes');
      setItems([]);
    }
    setErrorMessage(null);
  }, [templateToEdit, initialAnimalCategory, isOpen]);

  // Sincronizar especie según la categoría elegida
  const handleAnimalCategoryChange = (cat: string) => {
    setAnimalCategory(cat);
    const lower = cat.toLowerCase();
    if (lower.includes('porc') || lower.includes('cerdo') || lower.includes('lech') || lower.includes('capon')) {
      setSpecies('Porcino');
    } else if (lower.includes('ovin') || lower.includes('cordero') || lower.includes('oveja')) {
      setSpecies('Ovino');
    } else {
      setSpecies('Vacuno');
    }
  };

  // Productos cárnicos disponibles para autocompletar
  const meatProducts = useMemo(() => {
    return products.filter((p) => {
      const cat = (p.category || '').toLowerCase();
      const rubro = (p.rubro || '').toLowerCase();
      return (
        cat.includes('carne') ||
        cat.includes('corte') ||
        cat.includes('parrilla') ||
        cat.includes('milanesa') ||
        cat.includes('delantero') ||
        cat.includes('trasero') ||
        cat.includes('elaborado') ||
        rubro.includes('carne')
      );
    });
  }, [products]);

  // Cálculos en tiempo real del balance de masa y rendimientos
  const metrics = useMemo(() => {
    const refWeight = Number(referenceWeightKg) || 100;
    let totalOutputKg = 0;
    let netMeatKg = 0; // CORTE_UTIL + PICADA_RECORTES
    let fatKg = 0;
    let boneKg = 0;

    items.forEach((item) => {
      const w = Number(item.weightKg) || 0;
      totalOutputKg += w;
      if (item.cutType === 'CORTE_UTIL' || item.cutType === 'PICADA_RECORTES') {
        netMeatKg += w;
      } else if (item.cutType === 'GRASA') {
        fatKg += w;
      } else if (item.cutType === 'HUESO') {
        boneKg += w;
      }
    });

    const netMeatYieldPct = refWeight > 0 ? Number(((netMeatKg / refWeight) * 100).toFixed(2)) : 0;
    const fatPct = refWeight > 0 ? Number(((fatKg / refWeight) * 100).toFixed(2)) : 0;
    const bonePct = refWeight > 0 ? Number(((boneKg / refWeight) * 100).toFixed(2)) : 0;
    const totalYieldPct = refWeight > 0 ? Number(((totalOutputKg / refWeight) * 100).toFixed(2)) : 0;
    const shrinkageKg = Math.max(0, Number((refWeight - totalOutputKg).toFixed(3)));
    const shrinkagePct = refWeight > 0 ? Number(((shrinkageKg / refWeight) * 100).toFixed(2)) : 0;
    const isOverWeight = totalOutputKg > refWeight + 0.001;

    return {
      refWeight,
      totalOutputKg: Number(totalOutputKg.toFixed(3)),
      netMeatKg: Number(netMeatKg.toFixed(3)),
      netMeatYieldPct,
      fatKg: Number(fatKg.toFixed(3)),
      fatPct,
      boneKg: Number(boneKg.toFixed(3)),
      bonePct,
      totalYieldPct,
      shrinkageKg,
      shrinkagePct,
      isOverWeight,
    };
  }, [items, referenceWeightKg]);

  // Cargar preset típico de Vacuno
  const handleLoadBeefPreset = () => {
    const refWeight = Number(referenceWeightKg) || 100;
    const priceMap = new Map<string, number>();
    products.forEach((p) => {
      if (p.code) priceMap.set(p.code, p.price || 0);
    });

    const presetItems: YieldCoefficientItem[] = TYPICAL_BEEF_CUTS.map((c) => {
      const weight = Number(((c.defaultYieldPct / 100) * refWeight).toFixed(3));
      const coef = Number((weight / refWeight).toFixed(4));
      return {
        productCode: c.productCode,
        description: c.description,
        category: c.category,
        cutType: c.cutType,
        weightKg: weight,
        coefficient: coef,
        yieldPercent: c.defaultYieldPct,
        suggestedPrice: priceMap.get(c.productCode) || 0,
      };
    });

    setItems(presetItems);
    setErrorMessage(null);
  };

  // Manejar cambio en nuevo peso o % para autocalcular el otro
  const handleNewCutWeightChange = (valStr: string) => {
    setNewCutWeightKg(valStr);
    const w = parseFloat(valStr);
    const refWeight = Number(referenceWeightKg) || 100;
    if (!isNaN(w) && refWeight > 0) {
      setNewCutYieldPct(((w / refWeight) * 100).toFixed(2));
    } else {
      setNewCutYieldPct('');
    }
  };

  const handleNewCutYieldChange = (valStr: string) => {
    setNewCutYieldPct(valStr);
    const pct = parseFloat(valStr);
    const refWeight = Number(referenceWeightKg) || 100;
    if (!isNaN(pct) && refWeight > 0) {
      setNewCutWeightKg(((pct / 100) * refWeight).toFixed(3));
    } else {
      setNewCutWeightKg('');
    }
  };

  // Agregar nuevo corte individual a la lista
  const handleAddCutItem = () => {
    if (!selectedProductCode) {
      setErrorMessage('Seleccione un producto del catálogo para agregar.');
      return;
    }

    const prod = products.find((p) => p.code === selectedProductCode);
    const desc = prod ? prod.description : `Corte [${selectedProductCode}]`;
    const cat = prod?.category || 'Carnes';
    const price = prod?.price || 0;

    const w = parseFloat(newCutWeightKg);
    const refWeight = Number(referenceWeightKg) || 100;
    if (isNaN(w) || w <= 0) {
      setErrorMessage('Ingrese un peso o porcentaje válido mayor a 0.');
      return;
    }

    // Verificar si ya existe en la lista
    const existingIndex = items.findIndex((it) => it.productCode === selectedProductCode);
    const coef = Number((w / refWeight).toFixed(4));
    const yieldPct = Number(((w / refWeight) * 100).toFixed(2));

    const newItem: YieldCoefficientItem = {
      productCode: selectedProductCode,
      description: desc,
      category: cat,
      cutType: newCutType,
      weightKg: w,
      coefficient: coef,
      yieldPercent: yieldPct,
      suggestedPrice: price,
    };

    if (existingIndex >= 0) {
      const updated = [...items];
      updated[existingIndex] = newItem;
      setItems(updated);
    } else {
      setItems([...items, newItem]);
    }

    // Reset row inputs
    setSelectedProductCode('');
    setNewCutWeightKg('');
    setNewCutYieldPct('');
    setErrorMessage(null);
  };

  // Eliminar corte
  const handleRemoveCut = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Guardar Planilla
  const handleSave = async () => {
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('El nombre de la planilla es obligatorio.');
      return;
    }

    if (!animalCategory) {
      setErrorMessage('Debe seleccionar la categoría animal.');
      return;
    }

    const refWeight = Number(referenceWeightKg) || 0;
    if (refWeight <= 0) {
      setErrorMessage('El peso base de referencia debe ser mayor a 0 Kg.');
      return;
    }

    if (items.length === 0) {
      setErrorMessage('Debe cargar al menos un corte en la planilla.');
      return;
    }

    if (metrics.isOverWeight) {
      setErrorMessage(
        `Error de balance: El total de cortes (${formatKg(metrics.totalOutputKg)}) supera el peso base de referencia (${formatKg(refWeight)}). Ajuste los pesos o porcentajes.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const operatorName = localUser?.fullName || user?.displayName || user?.email || 'Administrador';

      // Recalcular coeficientes exactos por si el usuario cambió el peso de referencia
      const normalizedItems: YieldCoefficientItem[] = items.map((it) => {
        const w = Number(it.weightKg) || 0;
        const coef = Number((w / refWeight).toFixed(4));
        const yieldPct = Number(((w / refWeight) * 100).toFixed(2));
        return {
          ...it,
          coefficient: coef,
          yieldPercent: yieldPct,
        };
      });

      const templateToSave: DeboningYieldTemplate = {
        id: templateToEdit?.id || `YIELD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        name: name.trim(),
        species,
        animalCategory,
        carcassType,
        referenceInitialWeightKg: refWeight,
        items: normalizedItems,
        shrinkageWeightKg: metrics.shrinkageKg,
        shrinkagePercent: metrics.shrinkagePct,
        totalYieldPercent: metrics.netMeatYieldPct,
        operator: operatorName,
        createdAt: templateToEdit?.createdAt || now,
        updatedAt: now,
        version: templateToEdit ? (templateToEdit.version || 1) + 1 : 1,
        isActive: templateToEdit?.isActive !== undefined ? templateToEdit.isActive : true,
        notes: notes.trim() || undefined,
        versionHistory: templateToEdit?.versionHistory ? [...templateToEdit.versionHistory] : [],
      };

      await saveDeboningTemplate(templateToSave);

      if (onSuccess) {
        onSuccess(templateToSave);
      }

      await showAlert(
        `Planilla de rendimiento "${templateToSave.name}" (v${templateToSave.version}) para ${templateToSave.animalCategory} guardada exitosamente.`,
        'PLANILLA GUARDADA'
      );

      onClose();
    } catch (err: any) {
      console.error('Error al guardar planilla de rendimiento:', err);
      setErrorMessage(err.message || 'Error al guardar la planilla en la base de datos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <WindowsModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `EDITAR PLANILLA DE RENDIMIENTO — v${templateToEdit?.version}` : 'CREAR NUEVA PLANILLA DE RENDIMIENTO BASE'}
      icon={<FileSpreadsheet className="w-4 h-4 text-emerald-400" />}
      maxWidth="max-w-4xl"
      zIndex="z-[9999]"
    >
      <div className="flex flex-col h-[650px] max-h-[85vh] bg-[#f1f4f8] text-xs select-none overflow-hidden">
        {/* BANNER DE ERROR */}
        {errorMessage && (
          <div className="bg-red-100 border-b border-red-300 text-red-800 p-2 text-xs font-semibold flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-700 hover:text-red-900 font-bold p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* SECCIÓN 1: DATOS GENERALES Y CATEGORÍA ANIMAL */}
          <div className="bg-white border border-[#c4c6cf] p-2.5 rounded shadow-sm">
            <div className="text-[11px] font-bold text-[#002046] uppercase border-b border-gray-200 pb-1 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Beef className="w-3.5 h-3.5 text-blue-800" />
                1. Identificación y Clasificación de la Materia Prima
              </span>
              <span className="text-[10px] text-gray-500 font-normal">
                {isEditing ? `Editando Versión ${templateToEdit?.version}` : 'Nueva Plantilla Base'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              {/* Categoría Animal */}
              <div>
                <label className="block text-[10px] font-bold text-[#002046] mb-0.5">
                  Categoría Animal: <span className="text-red-600">*</span>
                </label>
                <select
                  value={animalCategory}
                  onChange={(e) => handleAnimalCategoryChange(e.target.value)}
                  className="w-full bg-white border border-blue-500 rounded px-2 py-1 text-xs font-bold text-blue-950 focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer"
                >
                  {ANIMAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Especie */}
              <div>
                <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                  Especie:
                </label>
                <select
                  value={species}
                  onChange={(e) => setSpecies(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="Vacuno">Vacuno (Bovino)</option>
                  <option value="Porcino">Porcino (Cerdo)</option>
                  <option value="Ovino">Ovino (Cordero / Oveja)</option>
                </select>
              </div>

              {/* Tipo de Pieza / Res */}
              <div>
                <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                  Tipo de Res / Pieza:
                </label>
                <select
                  value={carcassType}
                  onChange={(e) => setCarcassType(e.target.value as DeboningCarcassType)}
                  className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="MEDIA_RES">Media Res (Al Gancho)</option>
                  <option value="CUARTO_DELANTERO">Cuarto Delantero</option>
                  <option value="CUARTO_TRASERO">Cuarto Trasero (Pistola)</option>
                  <option value="PECHO">Pecho / Costillar</option>
                  <option value="RES_COMPLETA">Res Completa</option>
                </select>
              </div>

              {/* Peso Base de Referencia */}
              <div>
                <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                  Peso Ref. Base (Kg): <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    value={referenceWeightKg}
                    onChange={(e) => setReferenceWeightKg(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-bold font-mono focus:outline-none focus:border-blue-500"
                    placeholder="100"
                  />
                  <span className="absolute right-2 top-1 text-[10px] text-gray-500 font-bold">Kg</span>
                </div>
              </div>

              {/* Nombre de la Planilla */}
              <div className="md:col-span-3">
                <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                  Nombre Descriptivo de la Planilla: <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Rendimiento Estándar Ternera Mostrador - 100Kg"
                  className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-bold text-gray-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Observaciones / Notas */}
              <div className="md:col-span-1">
                <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                  Notas / Observaciones:
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Opcional..."
                  className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: CARGA RÁPIDA Y CORTES */}
          <div className="bg-white border border-[#c4c6cf] p-2.5 rounded shadow-sm space-y-2">
            <div className="flex items-center justify-between border-b border-gray-200 pb-1">
              <span className="text-[11px] font-bold text-[#002046] uppercase flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-700" />
                2. Detalle de Cortes, Despiece y Porcentajes de Rendimiento
              </span>

              {/* Botones de Presets / Carga Rápida */}
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={handleLoadBeefPreset}
                  className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-300 rounded text-[10px] font-bold flex items-center space-x-1 cursor-pointer"
                  title="Carga automática de 18 cortes estándar de despiece vacuno argentino"
                >
                  <Sparkles className="w-3 h-3 text-indigo-600" />
                  <span>Cargar Cortes Estándar Vacuno (18 cortes)</span>
                </button>

                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setItems([])}
                    className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded text-[10px] font-semibold cursor-pointer"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            {/* BARRA PARA AGREGAR CORTE INDIVIDUAL */}
            <div className="bg-[#f8f9fa] border border-gray-200 p-2 rounded flex flex-wrap items-end gap-2 text-xs">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                  Seleccionar Producto del Catálogo:
                </label>
                <select
                  value={selectedProductCode}
                  onChange={(e) => setSelectedProductCode(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="">-- Buscar o seleccionar corte --</option>
                  {meatProducts.map((p) => (
                    <option key={p.code} value={p.code}>
                      [{p.code}] {p.description} ({p.category || 'Carnes'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-28">
                <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                  Tipo de Destino:
                </label>
                <select
                  value={newCutType}
                  onChange={(e) => setNewCutType(e.target.value as any)}
                  className="w-full bg-white border border-gray-300 rounded px-1.5 py-1 text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="CORTE_UTIL">Carne Mostrador</option>
                  <option value="PICADA_RECORTES">Picada / Recorte</option>
                  <option value="GRASA">Grasa / Fusión</option>
                  <option value="HUESO">Hueso / Descarte</option>
                </select>
              </div>

              <div className="w-24">
                <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                  Peso (Kg):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newCutWeightKg}
                  onChange={(e) => handleNewCutWeightChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-bold font-mono focus:outline-none"
                />
              </div>

              <div className="w-24">
                <label className="block text-[10px] font-bold text-gray-700 mb-0.5">
                  Rendimiento (%):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={newCutYieldPct}
                  onChange={(e) => handleNewCutYieldChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs font-bold font-mono focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleAddCutItem}
                className="px-3 py-1 bg-[#002046] hover:bg-blue-900 text-white font-bold rounded flex items-center space-x-1 cursor-pointer h-[28px]"
              >
                <Plus className="w-3.5 h-3.5 text-green-400" />
                <span>Agregar</span>
              </button>
            </div>

            {/* TABLA DE CORTES CARGADOS */}
            <div className="border border-gray-300 rounded overflow-hidden max-h-[260px] overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-[#002046] text-white sticky top-0 text-[10px]">
                  <tr>
                    <th className="p-1.5 text-left w-16">Código</th>
                    <th className="p-1.5 text-left">Corte / Descripción</th>
                    <th className="p-1.5 text-left w-24">Categoría</th>
                    <th className="p-1.5 text-center w-28">Tipo</th>
                    <th className="p-1.5 text-right w-20">Kilos (Kg)</th>
                    <th className="p-1.5 text-right w-20">Rend %</th>
                    <th className="p-1.5 text-right w-20">Coeficiente</th>
                    <th className="p-1.5 text-center w-12">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-[11px]">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-gray-400">
                        No hay cortes cargados. Utilice "Cargar Cortes Estándar Vacuno" o agregue cortes individuales arriba.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, idx) => (
                      <tr key={`${item.productCode}_${idx}`} className="hover:bg-blue-50">
                        <td className="p-1.5 font-mono font-bold text-gray-700">{item.productCode}</td>
                        <td className="p-1.5 font-semibold text-gray-900">{item.description}</td>
                        <td className="p-1.5 text-gray-600 text-[10px]">{item.category}</td>
                        <td className="p-1.5 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              item.cutType === 'CORTE_UTIL'
                                ? 'bg-green-100 text-green-800'
                                : item.cutType === 'PICADA_RECORTES'
                                ? 'bg-amber-100 text-amber-800'
                                : item.cutType === 'GRASA'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {item.cutType === 'CORTE_UTIL'
                              ? 'MOSTRADOR'
                              : item.cutType === 'PICADA_RECORTES'
                              ? 'RECORTES'
                              : item.cutType === 'GRASA'
                              ? 'GRASA'
                              : 'HUESO'}
                          </span>
                        </td>
                        <td className="p-1.5 text-right font-mono font-bold text-blue-950">
                          {formatKg(item.weightKg)}
                        </td>
                        <td className="p-1.5 text-right font-mono font-bold text-blue-900">
                          {item.yieldPercent}%
                        </td>
                        <td className="p-1.5 text-right font-mono text-gray-500 text-[10px]">
                          {item.coefficient}
                        </td>
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveCut(idx)}
                            className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded cursor-pointer"
                            title="Eliminar corte"
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
          </div>

          {/* SECCIÓN 3: BALANCE DE MASAS Y RENDIMIENTO EN TIEMPO REAL */}
          <div className="bg-white border border-[#c4c6cf] p-2.5 rounded shadow-sm">
            <div className="text-[11px] font-bold text-[#002046] uppercase border-b border-gray-200 pb-1 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-green-700" />
                3. Balance de Masa y Rendimientos Proyectados
              </span>
              <span className="text-[10px] font-semibold text-gray-600">
                {items.length} cortes especificados
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
              {/* Kilos Obtenidos */}
              <div className="bg-blue-50 border border-blue-200 p-2 rounded">
                <div className="text-[10px] text-blue-800 font-bold uppercase">Total Salida (Kg)</div>
                <div className="text-base font-extrabold text-blue-950 mt-0.5">{formatKg(metrics.totalOutputKg)}</div>
                <div className="text-[9px] text-blue-700">de {formatKg(metrics.refWeight)} inicial</div>
              </div>

              {/* Carne Útil Mostrador */}
              <div className="bg-green-50 border border-green-200 p-2 rounded">
                <div className="text-[10px] text-green-800 font-bold uppercase">Rend. Carne Útil</div>
                <div className="text-base font-extrabold text-green-900 mt-0.5">{metrics.netMeatYieldPct}%</div>
                <div className="text-[9px] text-green-700">{formatKg(metrics.netMeatKg)} carne limpia</div>
              </div>

              {/* Grasa */}
              <div className="bg-yellow-50 border border-yellow-200 p-2 rounded">
                <div className="text-[10px] text-yellow-800 font-bold uppercase">Grasa / Fusión</div>
                <div className="text-base font-extrabold text-yellow-900 mt-0.5">{metrics.fatPct}%</div>
                <div className="text-[9px] text-yellow-700">{formatKg(metrics.fatKg)} de pella</div>
              </div>

              {/* Hueso */}
              <div className="bg-gray-100 border border-gray-300 p-2 rounded">
                <div className="text-[10px] text-gray-700 font-bold uppercase">Hueso / Descarte</div>
                <div className="text-base font-extrabold text-gray-900 mt-0.5">{metrics.bonePct}%</div>
                <div className="text-[9px] text-gray-600">{formatKg(metrics.boneKg)} sin valor</div>
              </div>

              {/* Merma Técnica */}
              <div className={`p-2 rounded border ${metrics.isOverWeight ? 'bg-red-100 border-red-300 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                <div className="text-[10px] font-bold uppercase">Merma Técnica / Oreo</div>
                <div className="text-base font-extrabold mt-0.5">{metrics.shrinkagePct}%</div>
                <div className="text-[9px]">{formatKg(metrics.shrinkageKg)} pérdida natural</div>
              </div>
            </div>

            {/* Alerta de Sobrepeso si la suma de cortes excede el peso de referencia */}
            {metrics.isOverWeight && (
              <div className="mt-2 p-2 bg-red-100 border border-red-300 text-red-800 rounded text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  ¡Atención! La suma de kilos de los cortes ({formatKg(metrics.totalOutputKg)}) excede el peso base de referencia ({formatKg(metrics.refWeight)}). Por favor corrija los valores antes de guardar.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* PIE DEL MODAL CON BOTONES DE ACCIÓN */}
        <div className="bg-[#f0f2f5] border-t border-gray-300 p-2.5 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-gray-600 font-semibold">
            Esta planilla quedará guardada en la base de datos y se podrá seleccionar directamente en <strong>Nuevo Desposte</strong>.
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 border border-gray-400 text-gray-800 text-xs font-bold rounded cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || metrics.isOverWeight || items.length === 0}
              className="px-5 py-1.5 bg-[#002046] hover:bg-blue-900 disabled:bg-gray-400 text-white text-xs font-bold rounded shadow-sm flex items-center space-x-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4 text-green-400" />
              <span>{isSubmitting ? 'Guardando...' : isEditing ? 'Actualizar Planilla' : 'Guardar Planilla'}</span>
            </button>
          </div>
        </div>
      </div>
    </WindowsModal>
  );
};
