import React, { useState, useMemo } from 'react';
import {
  Beef,
  Plus,
  Search,
  Filter,
  Download,
  Printer,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Scale,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
  Building2,
  Calendar,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useFirebase } from '../../context/FirebaseContext';
import { MeatDeboning, ANIMAL_CATEGORIES } from '../../types/pos';
import { formatKg, formatCurrency } from '../../utils/stockHelper';
import { generateDeboningVoucherHtml } from '../../utils/deboningHelper';
import { NewDeboningModal } from './NewDeboningModal';
import { DeboningDetailModal } from './DeboningDetailModal';

export const MeatDeboningTab: React.FC = () => {
  const { meatDebonings, branchConfigs, localUser, user, finalizeMeatDeboning, deleteOrCancelMeatDeboning } = useFirebase();

  const [selectedBranch, setSelectedBranch] = useState<'ALL' | 'NECO 1' | 'NECO 2'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'FINALIZADO' | 'BORRADOR' | 'ANULADO'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingDeboning, setEditingDeboning] = useState<MeatDeboning | null>(null);
  const [viewingDeboning, setViewingDeboning] = useState<MeatDeboning | null>(null);

  // Filtrado
  const filteredDebonings = useMemo(() => {
    return meatDebonings.filter((d) => {
      // Sucursal
      if (selectedBranch !== 'ALL' && d.branchId !== selectedBranch) return false;

      // Estado
      if (selectedStatus !== 'ALL' && d.status !== selectedStatus) return false;

      // Categoría Animal
      if (selectedCategory !== 'ALL' && d.animalCategory !== selectedCategory) return false;

      // Búsqueda
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = d.code.toLowerCase().includes(q);
        const matchTropa = d.tropaNumber.toLowerCase().includes(q);
        const matchSupplier = d.supplier.toLowerCase().includes(q);
        const matchDte = d.dteGuideNumber?.toLowerCase().includes(q);
        const matchCategory = d.animalCategory?.toLowerCase().includes(q);
        if (!matchCode && !matchTropa && !matchSupplier && !matchDte && !matchCategory) {
          return false;
        }
      }

      return true;
    });
  }, [meatDebonings, selectedBranch, selectedStatus, searchQuery]);

  // Métricas agregadas de los registros filtrados
  const metrics = useMemo(() => {
    let totalInitialKg = 0;
    let totalOutputKg = 0;
    let totalNetMeatKg = 0;
    let totalInitialCost = 0;
    let totalCommercialValue = 0;
    let countFinalized = 0;

    filteredDebonings.forEach((d) => {
      if (d.status === 'FINALIZADO' || d.status === 'BORRADOR') {
        totalInitialKg += Number(d.initialWeightKg) || 0;
        totalOutputKg += Number(d.totalOutputWeightKg) || 0;
        totalNetMeatKg += Number(d.netMeatWeightKg) || 0;
        totalInitialCost += Number(d.totalInitialCost) || 0;
        totalCommercialValue += Number(d.totalCommercialValue) || 0;
        if (d.status === 'FINALIZADO') countFinalized++;
      }
    });

    const netMeatYieldPct = totalInitialKg > 0 ? Number(((totalNetMeatKg / totalInitialKg) * 100).toFixed(2)) : 0;
    const shrinkageKg = Math.max(0, totalInitialKg - totalOutputKg);
    const shrinkagePct = totalInitialKg > 0 ? Number(((shrinkageKg / totalInitialKg) * 100).toFixed(2)) : 0;
    const grossMarginTotal = totalCommercialValue - totalInitialCost;
    const grossMarginPct = totalCommercialValue > 0 ? Number(((grossMarginTotal / totalCommercialValue) * 100).toFixed(2)) : 0;
    const multiplicationFactor = totalInitialCost > 0 ? Number((totalCommercialValue / totalInitialCost).toFixed(2)) : 1;

    return {
      totalOrders: filteredDebonings.length,
      countFinalized,
      totalInitialKg,
      totalOutputKg,
      totalNetMeatKg,
      netMeatYieldPct,
      shrinkageKg,
      shrinkagePct,
      totalInitialCost,
      totalCommercialValue,
      grossMarginTotal,
      grossMarginPct,
      multiplicationFactor,
    };
  }, [filteredDebonings]);

  // Imprimir comprobante
  const handlePrint = (deboning: MeatDeboning) => {
    const branchConfig = branchConfigs ? branchConfigs[deboning.branchId] : null;
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

  // Exportar a Excel
  const handleExportExcel = () => {
    const data = filteredDebonings.map((d) => ({
      'Código Desposte': d.code,
      'Fecha': d.date,
      'Hora': d.time,
      'Sucursal': d.branchId,
      'Cámara': d.chamber,
      'N° Tropa SENASA': d.tropaNumber,
      'Proveedor': d.supplier,
      'DTE Guía': d.dteGuideNumber || '',
      'Categoría': d.animalCategory,
      'Tipo Res': d.carcassType,
      'Peso Gancho (Kg)': d.initialWeightKg,
      'Kilos Obtenidos (Kg)': d.totalOutputWeightKg,
      'Carne Limpia (Kg)': d.netMeatWeightKg,
      'Rendimiento Carne (%)': d.netMeatYieldPercent,
      'Merma (Kg)': d.shrinkageWeightKg,
      'Merma (%)': d.shrinkagePercent,
      'Costo Compra Total ($)': d.totalInitialCost,
      'Valor Venta Total ($)': d.totalCommercialValue,
      'Margen Bruto ($)': d.grossMarginTotal,
      'Margen (%)': d.grossMarginPercent,
      'Factor Multiplicador': d.multiplicationFactor,
      'Estado': d.status,
      'Operador': d.operator,
      'Despostador': d.butcherMaster || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Despostes Neco');
    XLSX.writeFile(wb, `NECO_POS_Despostes_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full bg-[#f1f4f8] space-y-2 select-none overflow-hidden p-2 text-xs">
      {/* TARJETAS RESUMEN KPIS */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 shrink-0">
        <div className="bg-white border border-[#c4c6cf] p-2 rounded shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-semibold flex items-center justify-between">
            <span>Tropas Faenadas</span>
            <Beef className="w-3.5 h-3.5 text-blue-800" />
          </div>
          <div className="text-lg font-bold text-[#002046] mt-0.5">{metrics.countFinalized}</div>
          <div className="text-[10px] text-gray-600 font-semibold">{metrics.totalOrders} órdenes totales</div>
        </div>

        <div className="bg-white border border-[#c4c6cf] p-2 rounded shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-semibold flex items-center justify-between">
            <span>Kilos Procesados</span>
            <Scale className="w-3.5 h-3.5 text-indigo-700" />
          </div>
          <div className="text-lg font-bold text-indigo-900 mt-0.5">{formatKg(metrics.totalInitialKg)}</div>
          <div className="text-[10px] text-indigo-700 font-semibold">{formatKg(metrics.totalOutputKg)} obtenidos</div>
        </div>

        <div className="bg-white border border-[#c4c6cf] p-2 rounded shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-semibold flex items-center justify-between">
            <span>Rend. Carne Útil</span>
            <TrendingUp className="w-3.5 h-3.5 text-green-700" />
          </div>
          <div className="text-lg font-bold text-green-800 mt-0.5">{metrics.netMeatYieldPct}%</div>
          <div className="text-[10px] text-green-700 font-semibold">{formatKg(metrics.totalNetMeatKg)} mostrador</div>
        </div>

        <div className="bg-white border border-[#c4c6cf] p-2 rounded shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-semibold flex items-center justify-between">
            <span>Merma Técnica</span>
            <TrendingDown className="w-3.5 h-3.5 text-amber-700" />
          </div>
          <div className={`text-lg font-bold mt-0.5 ${metrics.shrinkagePct <= 2.5 ? 'text-gray-800' : 'text-red-700'}`}>
            {metrics.shrinkagePct}%
          </div>
          <div className="text-[10px] text-gray-600 font-semibold">{formatKg(metrics.shrinkageKg)} oreo/aserrín</div>
        </div>

        <div className="bg-white border border-[#c4c6cf] p-2 rounded shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-semibold flex items-center justify-between">
            <span>Valor Comercial</span>
            <DollarSign className="w-3.5 h-3.5 text-blue-700" />
          </div>
          <div className="text-lg font-bold text-blue-900 mt-0.5">{formatCurrency(metrics.totalCommercialValue)}</div>
          <div className="text-[10px] text-blue-700 font-semibold">Costo: {formatCurrency(metrics.totalInitialCost)}</div>
        </div>

        <div className="bg-white border border-[#c4c6cf] p-2 rounded shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-semibold flex items-center justify-between">
            <span>Margen Bruto</span>
            <DollarSign className="w-3.5 h-3.5 text-green-700" />
          </div>
          <div className="text-lg font-bold text-green-800 mt-0.5">+{metrics.grossMarginPct}%</div>
          <div className="text-[10px] text-green-700 font-semibold">{formatCurrency(metrics.grossMarginTotal)} ({metrics.multiplicationFactor}x)</div>
        </div>
      </div>

      {/* BARRA DE HERRAMIENTAS Y FILTROS */}
      <div className="bg-white border border-[#c4c6cf] p-2 flex flex-wrap items-center justify-between gap-2 shadow-sm shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* Botón Nuevo Desposte */}
          <button
            type="button"
            onClick={() => {
              setEditingDeboning(null);
              setShowNewModal(true);
            }}
            className="px-3 py-1.5 bg-[#002046] hover:bg-blue-900 text-white font-bold flex items-center space-x-1.5 shadow-sm text-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-green-400" />
            <span>NUEVO DESPOSTE DE TROPA / MEDIA RES</span>
          </button>

          {/* Filtro Sucursal */}
          <div className="flex items-center space-x-1 border border-gray-300 rounded px-1.5 py-0.5 bg-[#f8f9fa]">
            <Building2 className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value as any)}
              className="bg-transparent border-none text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todas las Sucursales</option>
              <option value="NECO 1">NECO 1 (Central)</option>
              <option value="NECO 2">NECO 2 (Villa Saavedra)</option>
            </select>
          </div>

          {/* Filtro Estado */}
          <div className="flex items-center space-x-1 border border-gray-300 rounded px-1.5 py-0.5 bg-[#f8f9fa]">
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="bg-transparent border-none text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todos los Estados</option>
              <option value="FINALIZADO">Finalizados (En Stock)</option>
              <option value="BORRADOR">Borradores</option>
              <option value="ANULADO">Anulados</option>
            </select>
          </div>

          {/* Filtro Categoría Animal */}
          <div className="flex items-center space-x-1 border border-gray-300 rounded px-1.5 py-0.5 bg-[#f8f9fa]">
            <Beef className="w-3.5 h-3.5 text-blue-900" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent border-none text-xs font-semibold focus:outline-none cursor-pointer text-blue-950"
            >
              <option value="ALL">Todas las Categorías</option>
              {ANIMAL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Buscador */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Buscar por N° Tropa, Código, Proveedor, DTE..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 py-1 bg-white border border-gray-300 rounded text-xs w-64 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-300 rounded font-semibold text-gray-700 flex items-center space-x-1 shadow-sm text-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-green-700" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE DESPOSTES */}
      <div className="flex-1 bg-white border border-[#c4c6cf] overflow-hidden shadow-sm flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-[#002046] text-white sticky top-0 z-10 text-[10px]">
              <tr>
                <th className="p-2 text-left w-24">Código</th>
                <th className="p-2 text-left w-28">Fecha / Hora</th>
                <th className="p-2 text-left w-20">Sucursal</th>
                <th className="p-2 text-left w-28">Tropa SENASA</th>
                <th className="p-2 text-left">Proveedor / Matadero</th>
                <th className="p-2 text-left w-28">Tipo / Categoría</th>
                <th className="p-2 text-right w-24">Gancho (Kg)</th>
                <th className="p-2 text-right w-24">Obtenido (Kg)</th>
                <th className="p-2 text-right w-20">Rend %</th>
                <th className="p-2 text-right w-20">Merma %</th>
                <th className="p-2 text-right w-24">Costo Total</th>
                <th className="p-2 text-right w-24">Venta Total</th>
                <th className="p-2 text-right w-20">Margen %</th>
                <th className="p-2 text-center w-24">Estado</th>
                <th className="p-2 text-center w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-[11px]">
              {filteredDebonings.length === 0 ? (
                <tr>
                  <td colSpan={15} className="p-8 text-center text-gray-500">
                    <Beef className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                    <p className="font-semibold">No se encontraron órdenes de desposte registradas.</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Haga clic en "NUEVO DESPOSTE DE TROPA / MEDIA RES" para registrar la primera faena.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredDebonings.map((deb) => (
                  <tr key={deb.id} className="hover:bg-blue-50/60 transition-colors">
                    <td className="p-2 font-mono font-bold text-[#002046]">
                      {deb.code}
                    </td>
                    <td className="p-2 text-gray-600 font-mono text-[10px]">
                      {deb.date} <span className="text-gray-400">{deb.time}</span>
                    </td>
                    <td className="p-2 font-semibold">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 font-bold text-gray-800">
                        {deb.branchId}
                      </span>
                    </td>
                    <td className="p-2 font-bold text-blue-900">
                      {deb.tropaNumber}
                    </td>
                    <td className="p-2 text-gray-700 truncate max-w-[150px]" title={deb.supplier}>
                      {deb.supplier}
                    </td>
                    <td className="p-2 text-gray-600 text-[10px]">
                      {deb.animalCategory}
                    </td>
                    <td className="p-2 text-right font-bold text-red-700">
                      {formatKg(deb.initialWeightKg)}
                    </td>
                    <td className="p-2 text-right font-bold text-blue-900">
                      {formatKg(deb.totalOutputWeightKg)}
                    </td>
                    <td className="p-2 text-right font-bold text-green-700">
                      {deb.netMeatYieldPercent}%
                    </td>
                    <td
                      className={`p-2 text-right font-semibold ${
                        deb.shrinkagePercent <= 2.5 ? 'text-gray-600' : 'text-red-600 font-bold'
                      }`}
                    >
                      {deb.shrinkagePercent}%
                    </td>
                    <td className="p-2 text-right font-semibold text-gray-800">
                      {formatCurrency(deb.totalInitialCost)}
                    </td>
                    <td className="p-2 text-right font-bold text-blue-900">
                      {formatCurrency(deb.totalCommercialValue)}
                    </td>
                    <td
                      className={`p-2 text-right font-bold ${
                        deb.grossMarginPercent >= 0 ? 'text-green-800' : 'text-red-600'
                      }`}
                    >
                      +{deb.grossMarginPercent}%
                    </td>
                    <td className="p-2 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          deb.status === 'FINALIZADO'
                            ? 'bg-green-100 text-green-800 border border-green-300'
                            : deb.status === 'BORRADOR'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-red-100 text-red-800 border border-red-300'
                        }`}
                      >
                        {deb.status}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          type="button"
                          onClick={() => setViewingDeboning(deb)}
                          className="p-1 text-blue-700 hover:bg-blue-100 rounded"
                          title="Ver Ficha Técnica"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrint(deb)}
                          className="p-1 text-gray-700 hover:bg-gray-100 rounded"
                          title="Imprimir Acta"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {deb.status === 'BORRADOR' && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDeboning(deb);
                              setShowNewModal(true);
                            }}
                            className="p-1 text-green-700 hover:bg-green-100 rounded font-bold"
                            title="Continuar / Finalizar Borrador"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PIE DE TABLA */}
        <div className="bg-[#f0f2f5] border-t border-gray-300 p-2 flex justify-between items-center text-[11px] text-gray-600">
          <div>
            Mostrando <strong>{filteredDebonings.length}</strong> de <strong>{meatDebonings.length}</strong> órdenes registradas
          </div>
          <div className="space-x-4">
            <span>Kilos Gancho: <strong>{formatKg(metrics.totalInitialKg)}</strong></span>
            <span>Kilos Cortes: <strong>{formatKg(metrics.totalOutputKg)}</strong></span>
            <span>Margen Global: <strong className="text-green-700">+{metrics.grossMarginPct}%</strong></span>
          </div>
        </div>
      </div>

      {/* MODAL NUEVO / EDITAR DESPOSTE */}
      {showNewModal && (
        <NewDeboningModal
          onClose={() => {
            setShowNewModal(false);
            setEditingDeboning(null);
          }}
          existingDeboning={editingDeboning}
        />
      )}

      {/* MODAL VER DETALLE DESPOSTE */}
      {viewingDeboning && (
        <DeboningDetailModal
          deboning={viewingDeboning}
          onClose={() => setViewingDeboning(null)}
          onFinalizeDraft={(d) => {
            setViewingDeboning(null);
            setEditingDeboning(d);
            setShowNewModal(true);
          }}
        />
      )}
    </div>
  );
};
