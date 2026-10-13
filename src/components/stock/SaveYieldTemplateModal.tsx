import React, { useState, useMemo } from 'react';
import {
  Save,
  CheckCircle2,
  AlertTriangle,
  Layers,
  FileSpreadsheet,
  Info,
  Scale,
  Beef,
  History,
} from 'lucide-react';
import { WindowsModal } from '../common/WindowsModal';
import { useFirebase } from '../../context/FirebaseContext';
import {
  MeatDeboning,
  DeboningYieldTemplate,
  ANIMAL_CATEGORIES,
  DeboningCarcassType,
  AnimalCategory,
} from '../../types/pos';
import { createYieldTemplateFromDeboning } from '../../utils/deboningHelper';
import { formatKg } from '../../utils/stockHelper';

interface SaveYieldTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  deboning: MeatDeboning;
  existingTemplate?: DeboningYieldTemplate | null;
  onSuccess?: (template: DeboningYieldTemplate) => void;
}

export const SaveYieldTemplateModal: React.FC<SaveYieldTemplateModalProps> = ({
  isOpen,
  onClose,
  deboning,
  existingTemplate,
  onSuccess,
}) => {
  const { deboningTemplates, meatDebonings, saveDeboningTemplate, localUser, user } = useFirebase();

  // Estados del formulario (Regla A.1)
  const [templateName, setTemplateName] = useState<string>(
    existingTemplate?.name ||
      `Rendimiento ${deboning.animalCategory} - Tropa ${deboning.tropaNumber}`
  );
  const [species, setSpecies] = useState<string>(
    existingTemplate?.species ||
      (deboning.animalCategory.toLowerCase().includes('cerdo') ? 'Porcino' : 'Vacuno')
  );
  const [animalCategory, setAnimalCategory] = useState<string>(
    existingTemplate?.animalCategory || deboning.animalCategory || 'Novillito'
  );
  const [carcassType, setCarcassType] = useState<DeboningCarcassType>(
    existingTemplate?.carcassType || deboning.carcassType || 'MEDIA_RES'
  );
  const [tropaNumber, setTropaNumber] = useState<string>(
    existingTemplate?.tropaNumber || deboning.tropaNumber || ''
  );
  const [initialWeightKg, setInitialWeightKg] = useState<number>(
    existingTemplate?.referenceInitialWeightKg ?? Number(deboning.initialWeightKg) ?? 0
  );
  const [notes, setNotes] = useState<string>(
    existingTemplate?.notes || deboning.notes || ''
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Estado para confirmación en caso de nombre duplicado (Regla A.3)
  const [duplicateConflict, setDuplicateConflict] = useState<{
    existing: DeboningYieldTemplate;
  } | null>(null);

  // Cálculos de resumen de los cortes reales medidos
  const cutsSummary = useMemo(() => {
    const list = deboning.cuts || [];
    const totalOutputKg = list.reduce((acc, c) => acc + (Number(c.weightKg) || 0), 0);
    const shrinkageKg = Math.max(0, initialWeightKg - totalOutputKg);
    const shrinkagePct =
      initialWeightKg > 0 ? Number(((shrinkageKg / initialWeightKg) * 100).toFixed(2)) : 0;
    const netMeatKg = list
      .filter((c) => c.cutType === 'CORTE_UTIL' || c.cutType === 'PICADA_RECORTES')
      .reduce((acc, c) => acc + (Number(c.weightKg) || 0), 0);
    const netMeatPct =
      initialWeightKg > 0 ? Number(((netMeatKg / initialWeightKg) * 100).toFixed(2)) : 0;

    return {
      list,
      totalOutputKg: Number(totalOutputKg.toFixed(3)),
      shrinkageKg: Number(shrinkageKg.toFixed(3)),
      shrinkagePct,
      netMeatKg: Number(netMeatKg.toFixed(3)),
      netMeatPct,
    };
  }, [deboning.cuts, initialWeightKg]);

  // Manejo de envío con validación estricta de pesajes persistidos
  const handleSubmit = async (forceNewVersionOfId?: string) => {
    setErrorMessage(null);

    // 1. Obtener el desposte finalizado desde la fuente persistida autoritativa
    const persistedDeboning = meatDebonings?.find(
      (d) => d.id === deboning.id || (d.code && d.code === deboning.code)
    );

    if (!persistedDeboning) {
      setErrorMessage(
        'La orden de desposte no se encuentra persistida en la base de datos. Solo se puede guardar una planilla a partir de una orden cuya finalización real esté confirmada y persistida.'
      );
      return;
    }

    // 2. Comprobar que el desposte exista y que su estado persistido sea exactamente FINALIZADO
    if (persistedDeboning.status !== 'FINALIZADO') {
      setErrorMessage(
        `La orden de desposte no está finalizada en la base de datos (estado actual: ${persistedDeboning.status}). Solo órdenes en estado FINALIZADO pueden generar planillas de rendimiento.`
      );
      return;
    }

    // 3. Verificar que no esté anulado, borrador ni marcado como estimado
    if (persistedDeboning.status === 'ANULADO') {
      setErrorMessage(
        'No se puede generar una planilla de rendimiento a partir de una orden de desposte anulada.'
      );
      return;
    }

    if (persistedDeboning.isEstimated) {
      setErrorMessage(
        'No se puede guardar como rendimiento real un desposte generado mediante estimaciones o proyecciones teóricas.'
      );
      return;
    }

    // 4. Comprobar que la operación de stock no tenga movimientos pendientes
    if (persistedDeboning.hasPendingStockMovements) {
      setErrorMessage(
        'La orden de desposte posee movimientos de stock pendientes o incompletos. No se puede generar la planilla hasta que la operación de stock esté completada.'
      );
      return;
    }

    // 5. Verificar trazabilidad de origen de la materia prima (Modalidad A o Modalidad B)
    const hasTraceableOrigin =
      Boolean(persistedDeboning.sourceProductCode && persistedDeboning.sourceProductCode.trim()) ||
      Boolean(persistedDeboning.selectedCarcassIds && persistedDeboning.selectedCarcassIds.length > 0);

    if (!hasTraceableOrigin) {
      setErrorMessage(
        'La orden de desposte carece de trazabilidad de materia prima de origen verificable (sin código de stock ni medias reses identificadas). Rechazado.'
      );
      return;
    }

    // 6. Verificar que los pesos iniciales y los pesos de cada corte sean numéricos, finitos y mayores que cero
    const initialWeightPersisted = Number(persistedDeboning.initialWeightKg);
    if (!Number.isFinite(initialWeightPersisted) || initialWeightPersisted <= 0) {
      setErrorMessage(
        'El peso inicial persistido de la orden de desposte no es un valor numérico positivo válido.'
      );
      return;
    }

    const cuts = persistedDeboning.cuts || [];
    if (cuts.length === 0) {
      setErrorMessage('El desposte persistido no contiene cortes cargados.');
      return;
    }

    const invalidCut = cuts.find(
      (c) => !c.weightKg || !Number.isFinite(Number(c.weightKg)) || Number(c.weightKg) <= 0
    );
    if (invalidCut) {
      setErrorMessage(
        `El corte "${invalidCut.description || invalidCut.productCode}" carece de un pesaje real positivo válido (${invalidCut.weightKg}).`
      );
      return;
    }

    // 7. Verificar balance de masas persistido (salidas no pueden superar entrada)
    const totalOutputPersisted = cuts.reduce((sum, c) => sum + (Number(c.weightKg) || 0), 0);
    if (totalOutputPersisted > initialWeightPersisted + 0.001) {
      setErrorMessage(
        `Los kilos de salida persistidos (${formatKg(totalOutputPersisted)}) no pueden superar el peso inicial (${formatKg(initialWeightPersisted)}).`
      );
      return;
    }

    // 8. Nombre obligatorio de la planilla
    const cleanName = templateName.trim();
    if (!cleanName) {
      setErrorMessage('El nombre personalizado de la planilla es obligatorio.');
      return;
    }

    // Detección de duplicado por nombre si no se ha forzado versionado
    if (!forceNewVersionOfId) {
      const nameConflict = deboningTemplates.find(
        (t) =>
          t.name.trim().toLowerCase() === cleanName.toLowerCase() &&
          t.id !== existingTemplate?.id
      );

      if (nameConflict) {
        setDuplicateConflict({ existing: nameConflict });
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const operatorName =
        localUser?.fullName || user?.displayName || user?.email || persistedDeboning.operator || 'Operador';

      const targetTemplateId = forceNewVersionOfId || existingTemplate?.id;
      const targetVersion = forceNewVersionOfId
        ? (duplicateConflict?.existing.version || 1) + 1
        : existingTemplate?.version || 1;

      // 9. Calcular coeficientes EXCLUSIVAMENTE a partir del desposte real persistido (no de valores mutados del modal)
      const template = createYieldTemplateFromDeboning(
        persistedDeboning,
        cleanName,
        targetVersion,
        targetTemplateId,
        notes.trim(),
        {
          species,
          animalCategory: persistedDeboning.animalCategory,
          carcassType: persistedDeboning.carcassType,
          tropaNumber: persistedDeboning.tropaNumber,
          referenceInitialWeightKg: initialWeightPersisted,
          operator: operatorName,
        }
      );

      await saveDeboningTemplate(template);

      if (onSuccess) {
        onSuccess(template);
      }
      onClose();
    } catch (err: any) {
      console.error('Error al guardar planilla de rendimiento:', err);
      setErrorMessage(`Error al guardar la planilla: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <WindowsModal
      isOpen={isOpen}
      onClose={onClose}
      title="GUARDAR COMO PLANILLA DE RENDIMIENTO PERSONALIZADA"
      icon={<Save className="w-4 h-4 text-amber-300" />}
      maxWidth="max-w-3xl"
      zIndex="z-[10000]"
    >
      <div className="p-3 text-black space-y-3 select-none">
        {/* ENCABEZADO NORMATIVO REGLA A.2 */}
        <div className="bg-blue-50 border border-blue-300 p-2 text-[11px] text-blue-950 rounded flex items-start space-x-2">
          <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <div className="leading-tight">
            <strong>Auditoría & Trazabilidad Real (Regla A.1 / A.2):</strong> Los coeficientes
            de rendimiento y factores se calcularán automáticamente a partir de los pesajes
            reales de balanza de la orden <strong>{deboning.code || deboning.id}</strong> (Tropa{' '}
            <strong>{deboning.tropaNumber}</strong>). No se admiten estimaciones ficticias.
          </div>
        </div>

        {errorMessage && (
          <div className="bg-red-50 border-2 border-red-500 p-2.5 text-xs text-red-900 rounded font-semibold flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* DIÁLOGO DE CONFLICTO POR NOMBRE DUPLICADO (Regla A.3) */}
        {duplicateConflict && (
          <div className="bg-amber-50 border-2 border-amber-500 p-3 text-xs text-amber-950 rounded space-y-2">
            <div className="font-bold flex items-center space-x-1.5 text-amber-900">
              <History className="w-4 h-4 text-amber-700" />
              <span>Ya existe una planilla con el nombre "{duplicateConflict.existing.name}"</span>
            </div>
            <p className="text-[11px]">
              La planilla existente está en versión <strong>v{duplicateConflict.existing.version}</strong>{' '}
              ({duplicateConflict.existing.items.length} cortes, Ref:{' '}
              {formatKg(duplicateConflict.existing.referenceInitialWeightKg)}).
              Para evitar sobrescrituras silenciosas, seleccione cómo desea continuar:
            </p>
            <div className="flex items-center space-x-2 pt-1">
              <button
                type="button"
                onClick={() => handleSubmit(duplicateConflict.existing.id)}
                disabled={isSubmitting}
                className="px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded shadow-sm flex items-center space-x-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  Crear Nueva Versión (v{duplicateConflict.existing.version + 1})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDuplicateConflict(null)}
                className="px-3 py-1 bg-white hover:bg-gray-100 border border-gray-400 text-black font-semibold text-xs rounded shadow-sm"
              >
                Cambiar Nombre Personalizado
              </button>
            </div>
          </div>
        )}

        {/* FORMULARIO DE CAMPOS DE LA PLANILLA (Regla A.1) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-white border border-gray-400 p-2.5 rounded shadow-sm">
          {/* 1. Nombre personalizado (obligatorio) */}
          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-gray-800 mb-0.5">
              Nombre Personalizado de la Planilla <span className="text-red-600">*</span>:
            </label>
            <input
              type="text"
              required
              autoFocus
              value={templateName}
              onChange={(e) => {
                setTemplateName(e.target.value);
                setDuplicateConflict(null);
              }}
              placeholder="Ej: Rendimiento Novillito Invierno - Grasa 2"
              className="w-full bg-yellow-50 border-2 border-blue-600 px-2 py-1 text-xs font-bold text-blue-950 focus:bg-white focus:outline-none"
            />
          </div>

          {/* 2. Especie */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-0.5">Especie:</label>
            <select
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              className="w-full bg-white border border-gray-400 px-2 py-1 text-xs font-semibold"
            >
              <option value="Vacuno">Vacuno</option>
              <option value="Porcino">Porcino</option>
              <option value="Ovino">Ovino</option>
            </select>
          </div>

          {/* 3. Categoría Animal */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
              Categoría Animal:
            </label>
            <select
              value={animalCategory}
              onChange={(e) => setAnimalCategory(e.target.value)}
              className="w-full bg-white border border-gray-400 px-2 py-1 text-xs font-semibold"
            >
              {ANIMAL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Tipo de Materia Prima */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
              Tipo de Materia Prima:
            </label>
            <select
              value={carcassType}
              onChange={(e) => setCarcassType(e.target.value as DeboningCarcassType)}
              className="w-full bg-white border border-gray-400 px-2 py-1 text-xs font-semibold"
            >
              <option value="MEDIA_RES">Media Res Completa</option>
              <option value="CUARTO_DELANTERO">Cuarto Delantero (Mocho/Paleta)</option>
              <option value="CUARTO_TRASERO">Cuarto Trasero (Pistola/Mocho)</option>
              <option value="PECHO_COSTILLAR">Costillar / Asado</option>
              <option value="RES_ENTERA">Res Entera (Lechón/Cordero)</option>
            </select>
          </div>

          {/* 5. Tropa o Lote de Referencia */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
              Tropa o Lote de Referencia:
            </label>
            <input
              type="text"
              value={tropaNumber}
              onChange={(e) => setTropaNumber(e.target.value)}
              placeholder="Ej: TR-8821"
              className="w-full bg-white border border-gray-400 px-2 py-1 text-xs font-semibold"
            />
          </div>

          {/* 6. Peso Inicial Real de la Media Res */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
              Peso Inicial Real de Gancho (Kg):
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={initialWeightKg}
                onChange={(e) => setInitialWeightKg(Math.max(0, Number(e.target.value) || 0))}
                className="w-full bg-yellow-50 border border-gray-400 px-2 py-1 text-xs font-bold text-blue-900 pr-7"
              />
              <span className="absolute right-2 top-1 text-[11px] text-gray-500 font-bold">Kg</span>
            </div>
          </div>

          {/* 7. Observaciones */}
          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
              Observaciones / Características del Lote:
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles sobre conformación de grasa, frigorífico de origen, rendimiento particular..."
              className="w-full bg-white border border-gray-400 px-2 py-1 text-xs resize-none"
            />
          </div>
        </div>

        {/* RESUMEN DE LOS CORTES Y SUS PESOS MEDIDOS (Regla A.1) */}
        <div className="bg-white border border-gray-400 rounded overflow-hidden shadow-sm">
          <div className="bg-[#002046] text-white p-1.5 flex items-center justify-between text-xs font-bold">
            <div className="flex items-center space-x-1.5">
              <Scale className="w-4 h-4 text-amber-300" />
              <span>RESUMEN DE CORTES Y PESAJES MEDIDOS EN BALANZA</span>
            </div>
            <div className="text-[11px] text-amber-200">
              Total Cortes: <strong>{cutsSummary.list.length}</strong> | Salida Medida:{' '}
              <strong>{formatKg(cutsSummary.totalOutputKg)}</strong>
            </div>
          </div>

          <div className="overflow-x-auto max-h-48 divide-y divide-gray-200 text-xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#eceff1] text-[10px] text-gray-700 sticky top-0 border-b border-gray-300">
                <tr>
                  <th className="p-1.5 w-8 text-center">#</th>
                  <th className="p-1.5 w-16">Cód.</th>
                  <th className="p-1.5">Corte Cárnico</th>
                  <th className="p-1.5 w-24">Tipo</th>
                  <th className="p-1.5 w-24 text-right bg-yellow-50">Peso Real (Kg)</th>
                  <th className="p-1.5 w-20 text-right">% Rend</th>
                  <th className="p-1.5 w-24 text-right">Coeficiente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-[11px]">
                {cutsSummary.list.map((cut, idx) => {
                  const weight = Number(cut.weightKg) || 0;
                  const coef = initialWeightKg > 0 ? Number((weight / initialWeightKg).toFixed(6)) : 0;
                  const pct = initialWeightKg > 0 ? Number(((weight / initialWeightKg) * 100).toFixed(2)) : 0;

                  return (
                    <tr key={`${cut.productCode}-${idx}`} className="hover:bg-blue-50">
                      <td className="p-1.5 text-center text-gray-500 font-mono text-[10px]">
                        {idx + 1}
                      </td>
                      <td className="p-1.5 font-mono font-bold text-gray-700">{cut.productCode}</td>
                      <td className="p-1.5 font-semibold text-black">
                        {cut.description}
                        <span className="text-[9px] text-gray-500 block">{cut.category}</span>
                      </td>
                      <td className="p-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            cut.cutType === 'HUESO'
                              ? 'bg-gray-200 text-gray-700'
                              : cut.cutType === 'GRASA'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {cut.cutType === 'CORTE_UTIL'
                            ? 'Corte Útil'
                            : cut.cutType === 'PICADA_RECORTES'
                            ? 'Picada/Recorte'
                            : cut.cutType === 'GRASA'
                            ? 'Grasa'
                            : 'Hueso'}
                        </span>
                      </td>
                      <td className="p-1.5 text-right font-extrabold text-blue-900 bg-yellow-50">
                        {formatKg(weight)}
                      </td>
                      <td className="p-1.5 text-right font-bold text-blue-800">{pct}%</td>
                      <td className="p-1.5 text-right font-mono text-gray-700">{coef.toFixed(6)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* BARRA DE BALANCE DE MASAS DEL RESUMEN */}
          <div className="bg-[#f0f2f5] border-t border-gray-300 p-2 flex flex-wrap items-center justify-between text-[11px] font-bold">
            <div className="flex items-center space-x-3 text-gray-700">
              <span>Gancho Inicial: <strong>{formatKg(initialWeightKg)}</strong></span>
              <span>Cortes Salida: <strong>{formatKg(cutsSummary.totalOutputKg)}</strong></span>
              <span>Carne Limpia: <strong className="text-green-800">{formatKg(cutsSummary.netMeatKg)} ({cutsSummary.netMeatPct}%)</strong></span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-gray-600">Merma Técnica Real:</span>
              <span className="text-red-700 font-extrabold">
                {formatKg(cutsSummary.shrinkageKg)} ({cutsSummary.shrinkagePct}%)
              </span>
            </div>
          </div>
        </div>

        {/* PIE DE ACCIONES */}
        <div className="flex justify-end items-center space-x-2 pt-2 border-t border-gray-300">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 border border-gray-400 text-black font-semibold text-xs shadow-sm rounded-sm"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isSubmitting || !templateName.trim() || initialWeightKg <= 0}
            className="px-4 py-1.5 bg-[#002046] hover:bg-blue-900 disabled:opacity-50 text-white font-bold text-xs shadow-sm flex items-center space-x-1.5 rounded-sm cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-amber-300" />
            <span>{isSubmitting ? 'Guardando en Firestore...' : 'GUARDAR PLANILLA DE RENDIMIENTO'}</span>
          </button>
        </div>
      </div>
    </WindowsModal>
  );
};
