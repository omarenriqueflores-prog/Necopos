import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  FileText,
  User,
  Clock,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useFirebase } from '../../context/FirebaseContext';
import { StockMovement, StockMovementType } from '../../types/pos';
import { formatQuantity, formatCurrency } from '../../utils/stockHelper';

export const StockMovementsTab: React.FC = () => {
  const { stockMovements } = useFirebase();

  const [selectedBranch, setSelectedBranch] = useState<'ALL' | 'NECO 1' | 'NECO 2'>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtrado de movimientos
  const filteredMovements = useMemo(() => {
    const today = new Date().toLocaleDateString('es-AR').split('/').reverse().join('-');
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toLocaleDateString('es-AR')
      .split('/')
      .reverse()
      .join('-');
    const currentMonthPrefix = today.slice(0, 7); // YYYY-MM

    return stockMovements.filter((m) => {
      // Sucursal
      if (selectedBranch !== 'ALL' && m.branchId !== selectedBranch) {
        return false;
      }

      // Tipo de Movimiento
      if (selectedType !== 'ALL' && m.type !== selectedType) {
        return false;
      }

      // Filtro de Fecha
      if (dateFilter === 'TODAY' && m.date !== today) {
        return false;
      }
      if (dateFilter === 'WEEK' && m.date < oneWeekAgo) {
        return false;
      }
      if (dateFilter === 'MONTH' && !m.date.startsWith(currentMonthPrefix)) {
        return false;
      }

      // Búsqueda de texto
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchProd = m.productDescription.toLowerCase().includes(q) || m.productCode.toLowerCase().includes(q);
        const matchRef = m.referenceDoc?.toLowerCase().includes(q);
        const matchOp = m.operator.toLowerCase().includes(q);
        const matchNotes = m.notes?.toLowerCase().includes(q);
        if (!matchProd && !matchRef && !matchOp && !matchNotes) {
          return false;
        }
      }

      return true;
    });
  }, [stockMovements, selectedBranch, selectedType, dateFilter, searchQuery]);

  const exportToExcel = () => {
    const data = filteredMovements.map((m) => ({
      'ID Movimiento': m.id,
      'Fecha': m.date,
      'Hora': m.time,
      'Sucursal': m.branchId,
      'Cámara': m.chamber,
      'Tipo Movimiento': m.type,
      'Código Producto': m.productCode,
      'Descripción': m.productDescription,
      'Categoría': m.category,
      'Unidad': m.unitType,
      'Cantidad': m.factor * m.quantity,
      'Stock Anterior': m.previousStock,
      'Stock Resultante': m.newStock,
      'Precio Venta ($)': m.unitPrice,
      'Valor Total ($)': m.totalValue,
      'Documento Referencia': m.referenceDoc || '-',
      'Operador': m.operator,
      'Motivo / Causa': m.reason || '-',
      'Observaciones': m.notes || '-',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos_Stock');
    XLSX.writeFile(wb, `NECO_Movimientos_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const getMovementBadge = (type: StockMovementType) => {
    switch (type) {
      case 'VENTA':
        return {
          label: 'VENTA POS',
          bg: 'bg-blue-100 text-blue-800 border-blue-300',
          icon: <ArrowDownRight className="w-3 h-3 text-blue-700 inline mr-0.5" />,
        };
      case 'ENTRADA':
        return {
          label: 'ENTRADA PROV.',
          bg: 'bg-green-100 text-green-800 border-green-300',
          icon: <ArrowUpRight className="w-3 h-3 text-green-700 inline mr-0.5" />,
        };
      case 'TRANSFERENCIA_SALIDA':
        return {
          label: 'TRANSF. SALIDA',
          bg: 'bg-indigo-100 text-indigo-800 border-indigo-300',
          icon: <ArrowDownRight className="w-3 h-3 text-indigo-700 inline mr-0.5" />,
        };
      case 'TRANSFERENCIA_ENTRADA':
        return {
          label: 'TRANSF. ENTRADA',
          bg: 'bg-purple-100 text-purple-800 border-purple-300',
          icon: <ArrowUpRight className="w-3 h-3 text-purple-700 inline mr-0.5" />,
        };
      case 'AJUSTE_POSITIVO':
        return {
          label: 'AJUSTE POSITIVO',
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          icon: <ArrowUpRight className="w-3 h-3 text-emerald-700 inline mr-0.5" />,
        };
      case 'AJUSTE_NEGATIVO':
        return {
          label: 'AJUSTE NEGATIVO',
          bg: 'bg-amber-100 text-amber-800 border-amber-300',
          icon: <ArrowDownRight className="w-3 h-3 text-amber-700 inline mr-0.5" />,
        };
      case 'MERMA':
        return {
          label: 'MERMA CÁMARA',
          bg: 'bg-red-100 text-red-800 border-red-300',
          icon: <ArrowDownRight className="w-3 h-3 text-red-700 inline mr-0.5" />,
        };
      case 'DEVOLUCION':
        return {
          label: 'DEVOLUCIÓN / NC',
          bg: 'bg-cyan-100 text-cyan-800 border-cyan-300',
          icon: <ArrowUpRight className="w-3 h-3 text-cyan-700 inline mr-0.5" />,
        };
      case 'STOCK_INICIAL':
        return {
          label: 'STOCK INICIAL',
          bg: 'bg-gray-100 text-gray-800 border-gray-300',
          icon: <RefreshCw className="w-3 h-3 text-gray-700 inline mr-0.5" />,
        };
      default:
        return {
          label: type,
          bg: 'bg-gray-100 text-gray-700 border-gray-300',
          icon: null,
        };
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* BARRA DE FILTROS */}
      <div className="win-toolbar p-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Búsqueda */}
          <div className="relative w-64">
            <input
              type="text"
              className="win-input w-full pl-7 pr-2 py-1 text-xs"
              placeholder="Buscar por artículo, comprobante, operador..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2 top-2" />
          </div>

          {/* Sucursal */}
          <div className="flex items-center space-x-1">
            <span className="text-gray-700 font-bold">Sucursal:</span>
            <select
              className="win-select py-1 text-xs"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value as any)}
            >
              <option value="ALL">Todas las sucursales</option>
              <option value="NECO 1">NECO 1 (Casa Central)</option>
              <option value="NECO 2">NECO 2 (Sucursal)</option>
            </select>
          </div>

          {/* Tipo de Movimiento */}
          <div className="flex items-center space-x-1">
            <span className="text-gray-700 font-bold">Tipo:</span>
            <select
              className="win-select py-1 text-xs"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="ALL">Todos los tipos</option>
              <option value="VENTA">Ventas POS</option>
              <option value="ENTRADA">Entradas Proveedor</option>
              <option value="TRANSFERENCIA_SALIDA">Transferencia Salida</option>
              <option value="TRANSFERENCIA_ENTRADA">Transferencia Entrada</option>
              <option value="AJUSTE_POSITIVO">Ajuste Positivo (+)</option>
              <option value="AJUSTE_NEGATIVO">Ajuste Negativo (-)</option>
              <option value="MERMA">Mermas / Desposte</option>
              <option value="DEVOLUCION">Devoluciones / NC</option>
              <option value="STOCK_INICIAL">Stock Inicial</option>
            </select>
          </div>

          {/* Rango de Fechas */}
          <div className="flex items-center space-x-1">
            <span className="text-gray-700 font-bold">Período:</span>
            <select
              className="win-select py-1 text-xs"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
            >
              <option value="ALL">Historial Completo</option>
              <option value="TODAY">Hoy</option>
              <option value="WEEK">Últimos 7 días</option>
              <option value="MONTH">Este mes</option>
            </select>
          </div>
        </div>

        {/* Exportar */}
        <button
          onClick={exportToExcel}
          className="win-button py-1 px-2.5 flex items-center space-x-1 text-xs text-gray-800"
          title="Exportar todos los movimientos filtrados a Excel"
        >
          <Download className="w-3.5 h-3.5 text-green-700" />
          <span>Exportar a Excel</span>
        </button>
      </div>

      {/* TABLA DEL KARDEX AUDITABLE */}
      <div className="win-panel flex-1 overflow-auto bg-white">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-[#002046] text-white sticky top-0 z-10 select-none">
            <tr>
              <th className="p-2 border border-[#00152e] w-28">FECHA / HORA</th>
              <th className="p-2 border border-[#00152e] w-24 text-center">SUCURSAL</th>
              <th className="p-2 border border-[#00152e] w-36 text-center">TIPO MOVIMIENTO</th>
              <th className="p-2 border border-[#00152e]">CÓDIGO & DESCRIPCIÓN DEL CORTE</th>
              <th className="p-2 border border-[#00152e] w-28 text-right">VARIACIÓN</th>
              <th className="p-2 border border-[#00152e] w-32 text-center">STOCK ANTERIOR ➔ FINAL</th>
              <th className="p-2 border border-[#00152e] w-24 text-right">PRECIO VIG.</th>
              <th className="p-2 border border-[#00152e] w-28 text-right">VALOR MOV.</th>
              <th className="p-2 border border-[#00152e] w-32">COMPROBANTE</th>
              <th className="p-2 border border-[#00152e] w-28">OPERADOR</th>
              <th className="p-2 border border-[#00152e]">MOTIVO / NOTAS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 font-sans">
            {filteredMovements.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-8 text-center text-gray-500 italic">
                  No se registraron movimientos de stock para los filtros seleccionados.
                </td>
              </tr>
            ) : (
              filteredMovements.map((m, index) => {
                const badge = getMovementBadge(m.type);
                const isPositive = m.factor > 0;
                return (
                  <tr
                    key={m.id}
                    className={`hover:bg-blue-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }`}
                  >
                    <td className="p-2 border border-gray-200 font-mono text-gray-700 whitespace-nowrap">
                      <div>{m.date}</div>
                      <div className="text-[10px] text-gray-500">{m.time}</div>
                    </td>
                    <td className="p-2 border border-gray-200 text-center font-bold text-gray-800">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          m.branchId === 'NECO 1' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                        }`}
                      >
                        {m.branchId}
                      </span>
                    </td>
                    <td className="p-2 border border-gray-200 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${badge.bg}`}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                    </td>
                    <td className="p-2 border border-gray-200">
                      <div className="font-bold text-gray-900">{m.productDescription}</div>
                      <div className="font-mono text-[10px] text-gray-500">
                        Cód: {m.productCode} | {m.category}
                      </div>
                    </td>
                    <td
                      className={`p-2 border border-gray-200 text-right font-mono font-bold whitespace-nowrap ${
                        isPositive ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {isPositive ? '+' : '-'}
                      {formatQuantity(m.quantity, m.unitType)}
                    </td>
                    <td className="p-2 border border-gray-200 text-center font-mono text-xs whitespace-nowrap">
                      <span className="text-gray-500">{formatQuantity(m.previousStock, m.unitType)}</span>
                      <span className="mx-1 text-gray-400">➔</span>
                      <span className="font-bold text-gray-900">{formatQuantity(m.newStock, m.unitType)}</span>
                    </td>
                    <td className="p-2 border border-gray-200 text-right font-mono text-gray-700">
                      {formatCurrency(m.unitPrice)}
                    </td>
                    <td className="p-2 border border-gray-200 text-right font-mono font-bold text-gray-800">
                      {formatCurrency(m.totalValue)}
                    </td>
                    <td className="p-2 border border-gray-200 font-mono text-xs text-gray-800">
                      {m.referenceDoc || '-'}
                    </td>
                    <td className="p-2 border border-gray-200 text-xs text-gray-700 truncate max-w-[100px]">
                      {m.operator}
                    </td>
                    <td className="p-2 border border-gray-200 text-xs text-gray-600 truncate max-w-[200px]">
                      {m.notes || m.reason || '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* FOOTER */}
      <div className="win-statusbar p-1.5 flex items-center justify-between text-[11px] text-gray-700">
        <div>
          Total registros de auditoría: <strong>{filteredMovements.length}</strong>
        </div>
        <div className="text-gray-500">
          Los movimientos de stock se registran de forma automática e inmutable por cada operación.
        </div>
      </div>
    </div>
  );
};
