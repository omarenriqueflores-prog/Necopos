import React, { useState, useMemo } from 'react';
import {
  Beef,
  Plus,
  Search,
  Filter,
  Download,
  Printer,
  Eye,
  Edit2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Scale,
  DollarSign,
  Truck,
  Building2,
  Calendar,
  Trash2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useFirebase } from '../../context/FirebaseContext';
import { useDialog } from '../../context/DialogContext';
import { MeatReception, ANIMAL_CATEGORIES } from '../../types/pos';
import { formatKg, formatCurrency } from '../../utils/stockHelper';
import { generateReceptionVoucherHtml } from '../../utils/receptionHelper';
import { NewReceptionModal } from './NewReceptionModal';
import { ReceptionDetailModal } from './ReceptionDetailModal';

export const MeatReceptionTab: React.FC = () => {
  const { meatReceptions, branchConfigs, finalizeMeatReception, updateMeatReceptionStatus, deleteOrCancelMeatReception, localUser, user } = useFirebase();
  const { showAlert, showConfirm, showAdminAuth } = useDialog();

  const operatorName = localUser?.fullName || user?.displayName || localUser?.username || 'Encargado de Cámara';

  const [selectedBranch, setSelectedBranch] = useState<'ALL' | 'NECO 1' | 'NECO 2'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'CONFIRMADO' | 'PENDIENTE' | 'ANULADO'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingReception, setEditingReception] = useState<MeatReception | null>(null);
  const [viewingReception, setViewingReception] = useState<MeatReception | null>(null);

  // Filtrado
  const filteredReceptions = useMemo(() => {
    return meatReceptions.filter((r) => {
      // Sucursal
      if (selectedBranch !== 'ALL' && r.branchId !== selectedBranch) return false;

      // Estado
      if (selectedStatus !== 'ALL' && r.status !== selectedStatus) return false;

      // Categoría Animal
      if (selectedCategory !== 'ALL' && r.category !== selectedCategory) return false;

      // Búsqueda
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = r.code.toLowerCase().includes(q);
        const matchTropa = r.tropaNumber.toLowerCase().includes(q);
        const matchSupplier = r.supplier.toLowerCase().includes(q);
        const matchInvoice = r.invoiceNumber?.toLowerCase().includes(q);
        const matchRemito = r.deliveryNoteNumber?.toLowerCase().includes(q);
        const matchDte = r.dteGuideNumber?.toLowerCase().includes(q);
        if (!matchCode && !matchTropa && !matchSupplier && !matchInvoice && !matchRemito && !matchDte) {
          return false;
        }
      }

      return true;
    });
  }, [meatReceptions, selectedBranch, selectedStatus, selectedCategory, searchQuery]);

  // Métricas agregadas
  const metrics = useMemo(() => {
    let totalMRCount = 0;
    let totalKg = 0;
    let totalCost = 0;
    let countConfirmed = 0;
    const tropaSet = new Set<string>();

    filteredReceptions.forEach((r) => {
      if (r.status === 'CONFIRMADO' || r.status === 'PENDIENTE') {
        totalMRCount += Number(r.totalQuantity) || 0;
        totalKg += Number(r.totalWeightKg) || 0;
        totalCost += Number(r.totalCost) || 0;
        if (r.tropaNumber) tropaSet.add(r.tropaNumber);
        if (r.status === 'CONFIRMADO') countConfirmed++;
      }
    });

    const avgCostPerKg = totalKg > 0 ? Number((totalCost / totalKg).toFixed(2)) : 0;

    return {
      totalReceptions: filteredReceptions.length,
      countConfirmed,
      totalMRCount,
      totalKg,
      totalCost,
      avgCostPerKg,
      uniqueTropas: tropaSet.size,
    };
  }, [filteredReceptions]);

  // Imprimir comprobante
  const handlePrint = (reception: MeatReception) => {
    const branchConfig = branchConfigs ? branchConfigs[reception.branchId] : null;
    const html = generateReceptionVoucherHtml(reception, branchConfig);

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

  // Eliminar recepción con autorización de administrador
  const handleDeleteReception = async (reception: MeatReception) => {
    try {
      const authorized = await showAdminAuth(
        `¿Desea eliminar la recepción ${reception.code} (Tropa SENASA ${reception.tropaNumber}, ${formatKg(reception.totalWeightKg)})?\n\nEsta operación revertirá el stock de medias reses en cámara y eliminará el comprobante del sistema. Ingrese la clave de administrador para confirmar.`,
        'AUTORIZACIÓN DE ADMINISTRADOR - ELIMINAR RECEPCIÓN'
      );

      if (!authorized) return;

      const operator = localUser?.fullName || user?.displayName || localUser?.username || 'Administrador';
      await deleteOrCancelMeatReception(reception.id, operator, 'Eliminación autorizada con clave de Administrador', true);
      await showAlert(
        `La recepción ${reception.code} (Tropa ${reception.tropaNumber}) fue eliminada exitosamente y el stock ha sido revertido.`,
        'RECEPCIÓN ELIMINADA'
      );
    } catch (err: any) {
      console.error('Error al eliminar recepción:', err);
      await showAlert(
        `No se pudo eliminar la recepción: ${err.message || 'Error desconocido'}`,
        'ERROR AL ELIMINAR'
      );
    }
  };

  // Anular recepción con autorización de administrador
  const handleCancelReception = async (reception: MeatReception) => {
    try {
      const authorized = await showAdminAuth(
        `¿Desea anular la recepción ${reception.code} (Tropa SENASA ${reception.tropaNumber}, ${formatKg(reception.totalWeightKg)})?\n\nEsta operación revertirá el stock ingresado en cámara y marcará el acta como anulada. Ingrese la clave de administrador para confirmar.`,
        'AUTORIZACIÓN DE ADMINISTRADOR - ANULAR RECEPCIÓN'
      );

      if (!authorized) return;

      const operator = localUser?.fullName || user?.displayName || localUser?.username || 'Administrador';
      await deleteOrCancelMeatReception(reception.id, operator, 'Anulación autorizada con clave de Administrador', false);
      await showAlert(
        `La recepción ${reception.code} fue anulada correctamente y el stock en cámara ha sido revertido.`,
        'RECEPCIÓN ANULADA'
      );
    } catch (err: any) {
      console.error('Error al anular recepción:', err);
      await showAlert(
        `No se pudo anular la recepción: ${err.message || 'Error desconocido'}`,
        'ERROR AL ANULAR'
      );
    }
  };

  // Exportar a Excel
  const handleExportExcel = () => {
    if (filteredReceptions.length === 0) {
      alert('No hay recepciones para exportar.');
      return;
    }

    const data = filteredReceptions.map((r) => ({
      Código: r.code,
      Fecha: r.date,
      Hora: r.time,
      Sucursal: r.branchId,
      Cámara: r.chamber,
      Estado: r.status,
      Proveedor: r.supplier,
      Especie: r.species,
      Categoría: r.category,
      Tropa_SENASA: r.tropaNumber,
      Factura: r.invoiceNumber || '',
      Remito: r.deliveryNoteNumber || '',
      DTE_SENASA: r.dteGuideNumber || '',
      Medias_Reses: r.totalQuantity,
      Kilos_Totales: r.totalWeightKg,
      Precio_Kg: r.pricePerKg,
      Costo_Total: r.totalCost,
      Operador: r.operator,
      Observaciones: r.notes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recepciones_Medias_Reses');
    XLSX.writeFile(wb, `NECO_Recepciones_Medias_Reses_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full bg-[#d4d0c8] space-y-2 select-none overflow-hidden text-black">
      {/* TARJETAS SUPERIORES DE INDICADORES DE RECEPCIÓN */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="bg-white border border-gray-400 p-2 shadow-sm rounded-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-600 font-bold uppercase">Medias Reses</span>
            <Beef className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-lg font-extrabold text-blue-900 mt-0.5">{metrics.totalMRCount} un.</div>
          <div className="text-[10px] text-gray-500 font-semibold">{metrics.countConfirmed} confirmadas</div>
        </div>

        <div className="bg-white border border-gray-400 p-2 shadow-sm rounded-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-600 font-bold uppercase">Kilos al Gancho</span>
            <Scale className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-lg font-extrabold text-red-700 mt-0.5">{formatKg(metrics.totalKg)}</div>
          <div className="text-[10px] text-gray-500 font-semibold">{metrics.uniqueTropas} tropas recibidas</div>
        </div>

        <div className="bg-white border border-gray-400 p-2 shadow-sm rounded-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-600 font-bold uppercase">Costo Total Compra</span>
            <DollarSign className="w-4 h-4 text-green-700" />
          </div>
          <div className="text-lg font-extrabold text-green-900 mt-0.5">{formatCurrency(metrics.totalCost)}</div>
          <div className="text-[10px] text-gray-500 font-semibold">Inversión en faena</div>
        </div>

        <div className="bg-white border border-gray-400 p-2 shadow-sm rounded-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-600 font-bold uppercase">Costo Promedio $/Kg</span>
            <Truck className="w-4 h-4 text-indigo-700" />
          </div>
          <div className="text-lg font-extrabold text-[#002046] mt-0.5">{formatCurrency(metrics.avgCostPerKg)}</div>
          <div className="text-[10px] text-gray-500 font-semibold">Ponderado gancho</div>
        </div>

        <div className="bg-white border border-gray-400 p-2 shadow-sm rounded-sm col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-600 font-bold uppercase">Comprobantes</span>
            <Building2 className="w-4 h-4 text-purple-700" />
          </div>
          <div className="text-lg font-extrabold text-purple-900 mt-0.5">{metrics.totalReceptions}</div>
          <div className="text-[10px] text-gray-500 font-semibold">Actas registradas</div>
        </div>
      </div>

      {/* BARRA DE FILTROS Y ACCIÓN */}
      <div className="bg-white border border-gray-400 p-2 shadow-sm flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Sucursal */}
          <div className="flex items-center space-x-1">
            <span className="font-bold text-gray-700 text-[11px]">Sucursal:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value as any)}
              className="bg-white border border-gray-400 px-2 py-1 text-xs font-semibold"
            >
              <option value="ALL">Todas las Sucursales</option>
              <option value="NECO 1">NECO 1 (Central)</option>
              <option value="NECO 2">NECO 2 (Villa Saavedra)</option>
            </select>
          </div>

          {/* Estado */}
          <div className="flex items-center space-x-1">
            <span className="font-bold text-gray-700 text-[11px]">Estado:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="bg-white border border-gray-400 px-2 py-1 text-xs font-semibold"
            >
              <option value="ALL">Todos los Estados</option>
              <option value="CONFIRMADO">Confirmados en Cámara</option>
              <option value="PENDIENTE">Pendientes / Borradores</option>
              <option value="ANULADO">Anulados</option>
            </select>
          </div>

          {/* Categoría Animal */}
          <div className="flex items-center space-x-1">
            <span className="font-bold text-gray-700 text-[11px]">Categoría:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-1 text-xs font-semibold text-blue-900"
            >
              <option value="ALL">Todas las Categorías</option>
              {ANIMAL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Búsqueda */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Buscar por tropa, proveedor, factura o remito..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 py-1 bg-white border border-gray-400 text-xs w-64"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-400 font-bold flex items-center space-x-1 text-xs shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-green-700" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingReception(null);
              setShowNewModal(true);
            }}
            className="px-3 py-1 bg-[#002046] hover:bg-blue-900 text-white font-bold flex items-center space-x-1.5 text-xs shadow"
          >
            <Plus className="w-4 h-4 text-amber-300" />
            <span>＋ NUEVA RECEPCIÓN DE MEDIAS RESES</span>
          </button>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE RECEPCIONES */}
      <div className="flex-1 min-h-0 bg-white border border-gray-400 shadow-sm overflow-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-[#e4e7ec] text-gray-700 sticky top-0 z-10 border-b border-gray-400 text-[10px]">
            <tr>
              <th className="p-1.5 border-r border-gray-300 w-20">Acta / Cód</th>
              <th className="p-1.5 border-r border-gray-300 w-24">Fecha & Hora</th>
              <th className="p-1.5 border-r border-gray-300 w-20">Sucursal</th>
              <th className="p-1.5 border-r border-gray-300">Proveedor / Frigorífico</th>
              <th className="p-1.5 border-r border-gray-300 w-24 font-mono">Tropa SENASA</th>
              <th className="p-1.5 border-r border-gray-300 w-28">Factura / Remito</th>
              <th className="p-1.5 border-r border-gray-300 w-28">Especie & Cat.</th>
              <th className="p-1.5 border-r border-gray-300 text-right w-16">Cant. MR</th>
              <th className="p-1.5 border-r border-gray-300 text-right w-24 bg-yellow-100">Kilos Brutos</th>
              <th className="p-1.5 border-r border-gray-300 text-right w-20">$/Kg</th>
              <th className="p-1.5 border-r border-gray-300 text-right w-24 bg-green-50">Total Compra</th>
              <th className="p-1.5 border-r border-gray-300 text-center w-20">Estado</th>
              <th className="p-1.5 text-center w-24">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-[11px]">
            {filteredReceptions.length === 0 ? (
              <tr>
                <td colSpan={13} className="p-8 text-center text-gray-500 bg-gray-50">
                  <Beef className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <p className="font-bold text-xs text-gray-700">No hay recepciones de medias reses registradas.</p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Haga clic en <strong>"NUEVA RECEPCIÓN DE MEDIAS RESES"</strong> para ingresar tropas al gancho.
                  </p>
                </td>
              </tr>
            ) : (
              filteredReceptions.map((r) => (
                <tr key={r.id} className="hover:bg-blue-50">
                  <td className="p-1.5 font-mono font-bold text-blue-900 border-r border-gray-200">
                    {r.code}
                  </td>
                  <td className="p-1.5 border-r border-gray-200 text-gray-700 text-[10px]">
                    <div>{r.date}</div>
                    <div className="text-gray-400">{r.time}</div>
                  </td>
                  <td className="p-1.5 border-r border-gray-200 font-bold">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        r.branchId === 'NECO 1' ? 'bg-blue-100 text-blue-900' : 'bg-purple-100 text-purple-900'
                      }`}
                    >
                      {r.branchId}
                    </span>
                  </td>
                  <td className="p-1.5 border-r border-gray-200 font-semibold text-gray-900">
                    <div>{r.supplier}</div>
                    <div className="text-[9px] text-gray-500">{r.chamber}</div>
                  </td>
                  <td className="p-1.5 border-r border-gray-200 font-mono font-bold text-blue-900 text-xs">
                    {r.tropaNumber}
                  </td>
                  <td className="p-1.5 border-r border-gray-200 text-[10px] text-gray-700">
                    <div>Fac: {r.invoiceNumber || 'S/F'}</div>
                    <div className="text-gray-500">Rem: {r.deliveryNoteNumber || r.dteGuideNumber || 'S/R'}</div>
                  </td>
                  <td className="p-1.5 border-r border-gray-200 text-[10px] text-gray-800">
                    <div className="font-bold">{r.species}</div>
                    <div className="text-gray-500">{r.category}</div>
                  </td>
                  <td className="p-1.5 border-r border-gray-200 text-right font-bold text-black">
                    {r.totalQuantity}
                  </td>
                  <td className="p-1.5 border-r border-gray-200 text-right font-bold text-red-700 bg-yellow-50">
                    {formatKg(r.totalWeightKg)}
                  </td>
                  <td className="p-1.5 border-r border-gray-200 text-right text-gray-800">
                    {formatCurrency(r.pricePerKg)}
                  </td>
                  <td className="p-1.5 border-r border-gray-200 text-right font-bold text-green-900 bg-green-50/50">
                    {formatCurrency(r.totalCost)}
                  </td>
                  <td className="p-1.5 border-r border-gray-200 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        r.status === 'CONFIRMADO'
                          ? 'bg-green-100 text-green-800 border border-green-300'
                          : r.status === 'PENDIENTE'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-red-100 text-red-800 border border-red-300'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="p-1.5 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      {r.status === 'PENDIENTE' && (
                        <button
                          type="button"
                          onClick={() => finalizeMeatReception(r, operatorName)}
                          className="p-1 bg-green-100 hover:bg-green-200 rounded text-green-800"
                          title="Confirmar e ingresar en cámara"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {r.status === 'CONFIRMADO' && (
                        <button
                          type="button"
                          onClick={() => updateMeatReceptionStatus(r.id, 'FINALIZADO', operatorName)}
                          className="p-1 bg-blue-100 hover:bg-blue-200 rounded text-blue-800"
                          title="Marcar como Finalizada (ya despostada)"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setViewingReception(r)}
                        className="p-1 hover:bg-gray-200 rounded text-blue-700"
                        title="Ver detalle del acta y medias reses"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingReception(r);
                          setShowNewModal(true);
                        }}
                        className="p-1 hover:bg-gray-200 rounded text-amber-700"
                        title="Editar recepción"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrint(r)}
                        className="p-1 hover:bg-gray-200 rounded text-gray-700"
                        title="Imprimir remito oficial"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      {r.status !== 'ANULADO' && (
                        <button
                          type="button"
                          onClick={() => handleCancelReception(r)}
                          className="p-1 hover:bg-amber-100 rounded text-amber-700"
                          title="Anular recepción (Requiere clave de Administrador)"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteReception(r)}
                        className="p-1 hover:bg-red-100 rounded text-red-700"
                        title="Eliminar recepción de la base de datos (Requiere clave de Administrador)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL NUEVA / EDITAR RECEPCIÓN */}
      {showNewModal && (
        <NewReceptionModal
          onClose={() => {
            setShowNewModal(false);
            setEditingReception(null);
          }}
          existingReception={editingReception}
        />
      )}

      {/* MODAL VER DETALLE RECEPCIÓN */}
      {viewingReception && (
        <ReceptionDetailModal
          reception={viewingReception}
          onClose={() => setViewingReception(null)}
          onConfirmDraft={async (rec) => {
            await finalizeMeatReception(rec, operatorName);
            setViewingReception(null);
          }}
        />
      )}
    </div>
  );
};
