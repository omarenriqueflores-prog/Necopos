import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Search,
  Filter,
  Eye,
  Trash2,
  Copy,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
  Plus,
  Scale,
  Beef,
  Layers,
  History,
  Lock,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react';
import { useFirebase } from '../../context/FirebaseContext';
import { useDialog } from '../../context/DialogContext';
import { WindowsModal } from '../common/WindowsModal';
import { DeboningYieldTemplate, ANIMAL_CATEGORIES } from '../../types/pos';
import { formatKg } from '../../utils/stockHelper';
import { YieldTemplateDetailModal } from './YieldTemplateDetailModal';

interface YieldTemplatesManagerProps {
  onSelectTemplateToApply?: (template: DeboningYieldTemplate) => void;
  onOpenNewDeboningWithTemplate?: (template: DeboningYieldTemplate) => void;
}

export const YieldTemplatesManager: React.FC<YieldTemplatesManagerProps> = ({
  onSelectTemplateToApply,
  onOpenNewDeboningWithTemplate,
}) => {
  const {
    deboningTemplates,
    saveDeboningTemplate,
    deleteDeboningTemplate,
    localUser,
    user,
  } = useFirebase();

  const { showAdminAuth, showAlert } = useDialog();

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecies, setSelectedSpecies] = useState<string>('TODAS');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODAS');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modales
  const [viewingTemplate, setViewingTemplate] = useState<DeboningYieldTemplate | null>(null);

  // Modal de duplicar
  const [templateToDuplicate, setTemplateToDuplicate] = useState<DeboningYieldTemplate | null>(null);
  const [duplicateNewName, setDuplicateNewName] = useState('');

  // Modal de autorización para eliminar
  const [templateToDelete, setTemplateToDelete] = useState<DeboningYieldTemplate | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Filtrado de plantillas
  const filteredTemplates = useMemo(() => {
    return deboningTemplates.filter((t) => {
      // Estado activa/inactiva
      if (statusFilter === 'ACTIVE' && t.isActive === false) return false;
      if (statusFilter === 'INACTIVE' && t.isActive !== false) return false;

      // Especie
      if (selectedSpecies !== 'TODAS' && t.species !== selectedSpecies) return false;

      // Categoría
      if (selectedCategory !== 'TODAS' && t.animalCategory !== selectedCategory) return false;

      // Búsqueda por texto (nombre, tropa, operador, notas)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = t.name.toLowerCase().includes(q);
        const matchTropa = (t.tropaNumber || '').toLowerCase().includes(q);
        const matchOp = (t.operator || '').toLowerCase().includes(q);
        const matchNotes = (t.notes || '').toLowerCase().includes(q);
        const matchCategory = (t.animalCategory || '').toLowerCase().includes(q);
        if (!matchName && !matchTropa && !matchOp && !matchNotes && !matchCategory) {
          return false;
        }
      }

      return true;
    });
  }, [deboningTemplates, statusFilter, selectedSpecies, selectedCategory, searchQuery]);

  // Métricas de resumen
  const metrics = useMemo(() => {
    const totalCount = deboningTemplates.length;
    const activeCount = deboningTemplates.filter((t) => t.isActive !== false).length;
    const avgYield =
      totalCount > 0
        ? Number(
            (
              deboningTemplates.reduce((sum, t) => sum + (t.totalYieldPercent || 0), 0) /
              totalCount
            ).toFixed(1)
          )
        : 0;

    return { totalCount, activeCount, avgYield };
  }, [deboningTemplates]);

  // Activar / Desactivar plantilla (Regla A.5)
  const handleToggleActive = async (template: DeboningYieldTemplate) => {
    const newStatus = template.isActive === false ? true : false;
    try {
      await saveDeboningTemplate({
        ...template,
        isActive: newStatus,
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('Error al cambiar estado de plantilla:', err);
      alert(`Error al actualizar estado: ${err.message}`);
    }
  };

  // Duplicar plantilla (Regla A.5)
  const handleConfirmDuplicate = async () => {
    if (!templateToDuplicate || !duplicateNewName.trim()) return;
    try {
      const now = new Date().toISOString();
      const operatorName =
        localUser?.fullName || user?.displayName || user?.email || templateToDuplicate.operator;

      const duplicatedTemplate: DeboningYieldTemplate = {
        ...templateToDuplicate,
        id: `YIELD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        name: duplicateNewName.trim(),
        version: 1,
        createdAt: now,
        updatedAt: now,
        operator: operatorName,
        isActive: true,
        versionHistory: [],
        notes: `Duplicada a partir de "${templateToDuplicate.name}" (v${templateToDuplicate.version})`,
      };

      await saveDeboningTemplate(duplicatedTemplate);
      setTemplateToDuplicate(null);
      setDuplicateNewName('');
      await showAlert(`Planilla duplicada exitosamente como "${duplicatedTemplate.name}".`, 'PLANILLA DUPLICADA');
    } catch (err: any) {
      console.error('Error al duplicar plantilla:', err);
      alert(`Error al duplicar: ${err.message}`);
    }
  };

  // Eliminar plantilla con confirmación y clave de administrador (Regla A.5)
  const handleDeleteTemplate = async (template: DeboningYieldTemplate) => {
    try {
      const authorized = await showAdminAuth(
        `¿Desea eliminar la planilla de rendimiento "${template.name}" (v${template.version})? Esta acción la desactivará de forma segura sin borrar los datos históricos.`
      );

      if (authorized) {
        await deleteDeboningTemplate(template.id);
        await showAlert(`La planilla "${template.name}" fue eliminada / desactivada correctamente.`, 'PLANILLA ELIMINADA');
      }
    } catch {
      // Fallback a modal con clave directa
      setTemplateToDelete(template);
      setPasswordInput('');
      setPasswordError('');
      setPasswordModalOpen(true);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#d4d0c8] space-y-2 select-none overflow-hidden text-black">
      {/* TARJETAS SUPERIORES DE INDICADORES */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div className="bg-white border border-gray-400 p-2 shadow-sm rounded-sm">
          <div className="text-[10px] text-gray-500 uppercase font-bold flex items-center justify-between">
            <span>Total Planillas</span>
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-700" />
          </div>
          <div className="text-lg font-bold text-blue-900 mt-0.5">{metrics.totalCount}</div>
          <div className="text-[10px] text-gray-500 font-semibold">Configuradas en Firestore</div>
        </div>

        <div className="bg-white border border-gray-400 p-2 shadow-sm rounded-sm">
          <div className="text-[10px] text-gray-500 uppercase font-bold flex items-center justify-between">
            <span>Planillas Activas</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-green-700" />
          </div>
          <div className="text-lg font-bold text-green-800 mt-0.5">{metrics.activeCount}</div>
          <div className="text-[10px] text-green-700 font-semibold">Disponibles en desposte</div>
        </div>

        <div className="bg-white border border-gray-400 p-2 shadow-sm rounded-sm">
          <div className="text-[10px] text-gray-500 uppercase font-bold flex items-center justify-between">
            <span>Rendimiento Promedio</span>
            <Scale className="w-3.5 h-3.5 text-amber-700" />
          </div>
          <div className="text-lg font-bold text-amber-900 mt-0.5">{metrics.avgYield}%</div>
          <div className="text-[10px] text-gray-500 font-semibold">Base promedio gancho</div>
        </div>

        <div className="bg-white border border-gray-400 p-2 shadow-sm rounded-sm">
          <div className="text-[10px] text-gray-500 uppercase font-bold flex items-center justify-between">
            <span>Regla A.2</span>
            <Beef className="w-3.5 h-3.5 text-red-700" />
          </div>
          <div className="text-xs font-bold text-gray-800 mt-1">Pesajes Reales</div>
          <div className="text-[10px] text-gray-600 font-semibold">Verificables sin estimaciones</div>
        </div>
      </div>

      {/* BARRA DE HERRAMIENTAS Y FILTROS */}
      <div className="bg-white border border-gray-400 p-2 flex flex-wrap items-center justify-between gap-2 shadow-sm shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* Búsqueda */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Buscar por nombre, lote, operador..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 py-1 bg-white border border-gray-400 rounded text-xs w-60 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Filtro Especie */}
          <div className="flex items-center space-x-1 border border-gray-400 rounded px-1.5 py-0.5 bg-[#f8f9fa]">
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={selectedSpecies}
              onChange={(e) => setSelectedSpecies(e.target.value)}
              className="bg-transparent border-none text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="TODAS">Todas las Especies</option>
              <option value="Vacuno">Vacuno</option>
              <option value="Porcino">Porcino</option>
              <option value="Ovino">Ovino</option>
            </select>
          </div>

          {/* Filtro Categoría */}
          <div className="flex items-center space-x-1 border border-gray-400 rounded px-1.5 py-0.5 bg-[#f8f9fa]">
            <Beef className="w-3.5 h-3.5 text-blue-900" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent border-none text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="TODAS">Todas las Categorías</option>
              {ANIMAL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Estado */}
          <div className="flex items-center space-x-1 border border-gray-400 rounded px-1.5 py-0.5 bg-[#f8f9fa]">
            <span className="text-[11px] font-semibold text-gray-600">Estado:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-transparent border-none text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todas</option>
              <option value="ACTIVE">Solo Activas</option>
              <option value="INACTIVE">Solo Inactivas</option>
            </select>
          </div>
        </div>

        <div className="text-[11px] text-gray-600 font-semibold">
          Mostrando <strong>{filteredTemplates.length}</strong> de <strong>{deboningTemplates.length}</strong> planillas
        </div>
      </div>

      {/* TABLA PRINCIPAL DE PLANILLAS */}
      <div className="flex-1 bg-white border border-gray-400 overflow-hidden shadow-sm flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-[#002046] text-white sticky top-0 z-10 text-[10px]">
              <tr>
                <th className="p-2 text-left">Nombre de Planilla</th>
                <th className="p-2 text-left w-28">Especie / Categoría</th>
                <th className="p-2 text-left w-28">Materia Prima</th>
                <th className="p-2 text-left w-24">Tropa / Lote</th>
                <th className="p-2 text-right w-24">Peso Ref (Kg)</th>
                <th className="p-2 text-center w-20">Cortes</th>
                <th className="p-2 text-right w-20">Rend %</th>
                <th className="p-2 text-right w-20">Merma %</th>
                <th className="p-2 text-center w-24">Estado</th>
                <th className="p-2 text-left w-24">Creador</th>
                <th className="p-2 text-center w-36">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-[11px]">
              {filteredTemplates.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-gray-500">
                    <FileSpreadsheet className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                    <p className="font-semibold">No se encontraron planillas de rendimiento.</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Finalice una orden de desposte real y haga clic en "Guardar como planilla de rendimiento" para registrar la primera.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTemplates.map((template) => {
                  const isActive = template.isActive !== false;
                  return (
                    <tr
                      key={template.id}
                      className={`hover:bg-blue-50 transition-colors ${
                        !isActive ? 'opacity-60 bg-gray-50' : ''
                      }`}
                    >
                      <td className="p-2">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-[#002046]">{template.name}</span>
                          <span className="px-1.5 py-0.2 bg-blue-100 text-blue-900 border border-blue-300 text-[9px] font-bold rounded">
                            v{template.version}
                          </span>
                        </div>
                        <div className="text-[9px] text-gray-400 font-mono">{template.id}</div>
                      </td>

                      <td className="p-2 text-gray-800">
                        <div>{template.species}</div>
                        <div className="text-[10px] text-gray-500 font-semibold">{template.animalCategory}</div>
                      </td>

                      <td className="p-2 text-gray-700 font-medium">
                        {template.carcassType.replace('_', ' ')}
                      </td>

                      <td className="p-2 font-mono text-gray-800">
                        {template.tropaNumber || 'S/N'}
                      </td>

                      <td className="p-2 text-right font-bold text-blue-950">
                        {formatKg(template.referenceInitialWeightKg)}
                      </td>

                      <td className="p-2 text-center font-bold text-gray-700">
                        {template.items?.length || 0}
                      </td>

                      <td className="p-2 text-right font-extrabold text-blue-900">
                        {template.totalYieldPercent}%
                      </td>

                      <td className="p-2 text-right font-extrabold text-red-700">
                        {template.shrinkagePercent}%
                      </td>

                      <td className="p-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isActive
                              ? 'bg-green-100 text-green-800 border-green-300'
                              : 'bg-gray-100 text-gray-600 border-gray-300'
                          }`}
                        >
                          {isActive ? 'ACTIVA' : 'INACTIVA'}
                        </span>
                      </td>

                      <td className="p-2 text-gray-600 text-[10px]">
                        {template.operator || 'Operador'}
                      </td>

                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          {/* Ver Detalle */}
                          <button
                            type="button"
                            onClick={() => setViewingTemplate(template)}
                            className="p-1 text-blue-700 hover:bg-blue-100 rounded"
                            title="Ver Coeficientes y Detalle"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Activar / Desactivar */}
                          <button
                            type="button"
                            onClick={() => handleToggleActive(template)}
                            className={`p-1 rounded ${
                              isActive
                                ? 'text-green-700 hover:bg-green-100'
                                : 'text-gray-500 hover:bg-gray-200'
                            }`}
                            title={isActive ? 'Desactivar Planilla' : 'Activar Planilla'}
                          >
                            {isActive ? (
                              <ToggleRight className="w-4 h-4" />
                            ) : (
                              <ToggleLeft className="w-4 h-4" />
                            )}
                          </button>

                          {/* Duplicar */}
                          <button
                            type="button"
                            onClick={() => {
                              setTemplateToDuplicate(template);
                              setDuplicateNewName(`${template.name} (Copia)`);
                            }}
                            className="p-1 text-amber-700 hover:bg-amber-100 rounded"
                            title="Duplicar o Crear Nueva Versión"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {/* Eliminar */}
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(template)}
                            className="p-1 text-red-700 hover:bg-red-100 rounded"
                            title="Eliminar Planilla (Requiere Clave Admin)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PIE DE TABLA */}
        <div className="bg-[#f0f2f5] border-t border-gray-300 p-2 flex justify-between items-center text-[11px] text-gray-600">
          <div>
            Las planillas activas aparecen disponibles automáticamente en el formulario de <strong>Nuevo Desposte</strong>.
          </div>
          <div>
            Auditado según <strong>Regla A (Planillas de Rendimiento)</strong>
          </div>
        </div>
      </div>

      {/* MODAL DETALLE DE PLANILLA */}
      {viewingTemplate && (
        <YieldTemplateDetailModal
          isOpen={!!viewingTemplate}
          template={viewingTemplate}
          onClose={() => setViewingTemplate(null)}
          onApplyToNewDeboning={onOpenNewDeboningWithTemplate}
        />
      )}

      {/* MODAL DUPLICAR PLANILLA */}
      {templateToDuplicate && (
        <WindowsModal
          isOpen={!!templateToDuplicate}
          onClose={() => setTemplateToDuplicate(null)}
          title="DUPLICAR PLANILLA DE RENDIMIENTO"
          icon={<Copy className="w-4 h-4 text-amber-300" />}
          maxWidth="max-w-md"
          zIndex="z-[10000]"
        >
          <div className="p-3 space-y-3 text-black select-none">
            <div className="text-xs text-gray-700">
              Se creará una copia exacta de la plantilla <strong>"{templateToDuplicate.name}"</strong>{' '}
              con sus {templateToDuplicate.items.length} cortes y coeficientes de rendimiento.
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-800 mb-0.5">
                Nombre de la Nueva Planilla:
              </label>
              <input
                type="text"
                autoFocus
                value={duplicateNewName}
                onChange={(e) => setDuplicateNewName(e.target.value)}
                className="w-full bg-white border-2 border-blue-600 px-2 py-1 text-xs font-bold"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-gray-300">
              <button
                type="button"
                onClick={() => setTemplateToDuplicate(null)}
                className="px-3 py-1 bg-gray-200 hover:bg-gray-300 border border-gray-400 text-xs font-semibold rounded"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDuplicate}
                disabled={!duplicateNewName.trim()}
                className="px-4 py-1 bg-[#002046] hover:bg-blue-900 text-white text-xs font-bold rounded shadow-sm"
              >
                Duplicar Planilla
              </button>
            </div>
          </div>
        </WindowsModal>
      )}

      {/* MODAL DE CONTRASEÑA FALLBACK PARA ELIMINACIÓN */}
      {passwordModalOpen && templateToDelete && (
        <WindowsModal
          isOpen={passwordModalOpen}
          onClose={() => {
            setPasswordModalOpen(false);
            setTemplateToDelete(null);
            setPasswordInput('');
            setPasswordError('');
          }}
          title="AUTORIZACIÓN DE ADMINISTRADOR - ELIMINAR PLANILLA"
          icon={<ShieldAlert className="w-4 h-4 text-[#ffdad6]" />}
          maxWidth="max-w-md"
          zIndex="z-[10000]"
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (passwordInput.trim() === '26635235') {
                await deleteDeboningTemplate(templateToDelete.id);
                setPasswordModalOpen(false);
                setTemplateToDelete(null);
                setPasswordInput('');
                setPasswordError('');
                await showAlert(
                  `La planilla "${templateToDelete.name}" fue eliminada / desactivada exitosamente.`,
                  'PLANILLA ELIMINADA'
                );
              } else {
                setPasswordError('Clave incorrecta. Acceso denegado.');
                setPasswordInput('');
              }
            }}
            className="p-3 text-black space-y-3 select-none"
          >
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-red-100 border border-red-300 rounded shrink-0">
                <Lock className="w-6 h-6 text-red-700" />
              </div>
              <div className="space-y-1">
                <div className="font-bold text-xs text-gray-900">
                  ¿Confirma la eliminación de la planilla "{templateToDelete.name}"?
                </div>
                <div className="text-[11px] text-gray-600">
                  Versión v{templateToDelete.version} ({templateToDelete.items.length} cortes). Ingrese la clave de administrador para proceder.
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-800 mb-0.5">Clave de Administrador:</label>
              <input
                type="password"
                autoFocus
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setPasswordError('');
                }}
                className="w-full bg-white border-2 border-red-500 px-2 py-1 text-xs font-bold"
                placeholder="••••••••"
              />
              {passwordError && (
                <div className="text-[11px] text-red-600 font-bold mt-1">{passwordError}</div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-gray-300">
              <button
                type="button"
                onClick={() => {
                  setPasswordModalOpen(false);
                  setTemplateToDelete(null);
                }}
                className="px-3 py-1 bg-gray-200 hover:bg-gray-300 border border-gray-400 text-xs font-semibold rounded"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded shadow-sm"
              >
                Confirmar Eliminación
              </button>
            </div>
          </form>
        </WindowsModal>
      )}
    </div>
  );
};
