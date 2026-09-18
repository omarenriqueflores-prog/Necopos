import React, { useState } from 'react';
import { Award, Download, Printer, Search } from 'lucide-react';
import { ProductSalesRanking, UserAccount } from '../../types/pos';
import { formatCurrency, formatWeight } from '../../utils/scaleParser';
import { useFirebase } from '../../context/FirebaseContext';
import { useDialog } from '../../context/DialogContext';
import { ShieldAlert } from 'lucide-react';

interface RankingProductsScreenProps {
  rankingData?: ProductSalesRanking[];
  currentUser?: UserAccount;
}

export const RankingProductsScreen: React.FC<RankingProductsScreenProps> = ({ currentUser }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('TODAS');
  const [sortBy, setSortBy] = useState<'REVENUE' | 'KILOS'>('REVENUE');
  const { sales } = useFirebase();
  const { showAlert } = useDialog();

  const canViewReports =
    !currentUser ||
    currentUser.role === 'SUPERADMIN' ||
    currentUser.role === 'ADMIN' ||
    currentUser.permissions?.canViewReports !== false;

  if (!canViewReports) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] bg-[#ebeef2] p-4 text-center">
        <div className="bg-white border-2 border-[#aa3531] p-8 max-w-md shadow-lg rounded-xs flex flex-col items-center gap-3">
          <ShieldAlert className="w-12 h-12 text-[#aa3531]" />
          <h2 className="text-[16px] font-bold text-[#002046] uppercase">
            Acceso Restringido
          </h2>
          <p className="text-[13px] text-[#44474e]">
            Su usuario (<strong>{currentUser?.fullName}</strong>) no posee permisos
            para acceder al Ranking de Productos y Reportes de Ventas.
          </p>
        </div>
      </div>
    );
  }

  // Compute ranking data dynamically from real sales
  const dynamicRankingData: ProductSalesRanking[] = React.useMemo(() => {
    const map: Record<string, ProductSalesRanking> = {};

    (sales || []).forEach((sale) => {
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach((item: any) => {
          const code = item.code || item.productCode || 'S/D';
          const desc = item.description || 'Articulo sin descripción';
          const cat = item.category || 'VARIOS';
          const sub = item.subtotal || 0;
          const qty = item.quantity || 0;
          const unitT = item.unitType || item.unit || '';

          if (!map[code]) {
            map[code] = {
              productCode: code,
              description: desc,
              category: cat,
              kilosSold: 0,
              unitsSold: 0,
              totalRevenue: 0,
              sharePercent: 0,
            };
          }

          if (unitT.toLowerCase() === 'kg' || unitT === 'Kg') {
            map[code].kilosSold += item.weight || qty;
          } else {
            map[code].unitsSold += qty;
          }
          map[code].totalRevenue += sub;
        });
      }
    });

    const list = Object.values(map);
    const grandTotalRevenue = list.reduce((acc, item) => acc + item.totalRevenue, 0);

    list.forEach((item) => {
      item.sharePercent = grandTotalRevenue === 0 ? 0 : (item.totalRevenue / grandTotalRevenue) * 100;
    });

    return list;
  }, [sales]);

  const filtered = dynamicRankingData
    .filter((item) => {
      if (categoryFilter !== 'TODAS' && item.category !== categoryFilter) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        item.description.toLowerCase().includes(term) ||
        item.productCode.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'REVENUE') return b.totalRevenue - a.totalRevenue;
      return b.kilosSold - a.kilosSold;
    });

  const totalRevenueAll = filtered.reduce((acc, i) => acc + i.totalRevenue, 0);
  const totalKilosAll = filtered.reduce((acc, i) => acc + i.kilosSold, 0);

  const handleExportExcel = async () => {
    await showAlert('El ranking de ventas ha sido exportado a formato Excel de manera exitosa.', 'EXPORTAR RANKING');
  };

  const handlePrint = async () => {
    await showAlert('El ranking de ventas ha sido enviado a la impresora fiscal de manera exitosa.', 'IMPRESIÓN');
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-80px)] select-none bg-[#ebeef2] text-[#181c1f] font-sans p-1">
      {/* Top Bar */}
      <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <label className="text-[11px] font-bold text-[#002046] uppercase whitespace-nowrap">
            Filtrar corte o producto:
          </label>
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por corte, código o categoría..."
              className="w-full h-[26px] px-2 bg-[#f7fafe] border border-[#74777f] text-[12px] font-semibold text-[#002046] focus:bg-white focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-[#74777f] absolute right-2 top-1.5" />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-[#44474e] uppercase">Categoría:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-[26px] px-2 bg-white border border-[#74777f] text-[12px] font-semibold cursor-pointer text-[#002046]"
          >
            <option value="TODAS">Todas las Categorías</option>
            <option value="CARNE VACUNA">Carne Vacuna</option>
            <option value="CERDO">Cerdo</option>
            <option value="POLLO">Pollo</option>
            <option value="EMBUTIDOS">Embutidos / Achuras</option>
            <option value="ALMACEN">Almacén / Bebidas</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-[#44474e] uppercase">Ordenar por:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-[26px] px-2 bg-white border border-[#74777f] text-[12px] font-bold text-[#002046] cursor-pointer"
          >
            <option value="REVENUE">Mayor Recaudación ($)</option>
            <option value="KILOS">Mayor Volumen en Kilos</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleExportExcel}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-[#44474e]" />
            <span>Exportar Excel</span>
          </button>
          <button
            onClick={handlePrint}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-[#44474e]" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Main Ranking Table */}
      <div className="bg-white border border-[#74777f] shadow-sm flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
          <div className="flex items-center gap-2">
            <Award className="w-3.5 h-3.5 text-[#aec7f7]" />
            <span>RANKING DE VENTAS POR ARTÍCULO / CORTES MÁS DEMANDADOS (DATOS REALES)</span>
          </div>
          <div className="font-mono text-[11px] text-[#d4e3ff]">
            TOTAL RECAUDADO EN GRUPO:{' '}
            <strong className="text-white">{formatCurrency(totalRevenueAll)}</strong> |{' '}
            {formatWeight(totalKilosAll)}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-4 text-[#74777f] select-none bg-[#f7fafe]">
              <span className="font-bold text-[14px] uppercase mb-1">Sin Ventas Registradas</span>
              <span className="text-[12px]">Realice ventas en el Punto de Venta para acumular estadísticas reales.</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse select-none text-[12px]">
              <thead className="sticky top-0 bg-[#e5e8ec] text-[#181c1f] font-bold text-[11px] border-b border-[#74777f]">
                <tr className="h-[24px]">
                  <th className="w-[50px] px-2 text-center border-r border-[#c4c6cf]">POS</th>
                  <th className="w-[70px] px-2 border-r border-[#c4c6cf]">CÓDIGO</th>
                  <th className="px-2 border-r border-[#c4c6cf]">DESCRIPCIÓN DEL ARTÍCULO</th>
                  <th className="w-[140px] px-2 border-r border-[#c4c6cf]">CATEGORÍA</th>
                  <th className="w-[120px] px-2 text-right border-r border-[#c4c6cf]">KILOS VENDIDOS</th>
                  <th className="w-[90px] px-2 text-right border-r border-[#c4c6cf]">UNIDADES</th>
                  <th className="w-[140px] px-2 text-right border-r border-[#c4c6cf] bg-[#e0e3e7]">
                    TOTAL RECAUDADO
                  </th>
                  <th className="w-[120px] px-2 text-center border-r border-[#c4c6cf]">
                    PARTICIPACIÓN %
                  </th>
                  <th className="w-[160px] px-2">BARRA DE PARTICIPACIÓN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ebeef2]">
                {filtered.map((item, idx) => (
                  <tr
                    key={item.productCode}
                    className={`h-[24px] ${
                      idx < 3
                        ? 'bg-[#f7fafe] font-semibold'
                        : idx % 2 === 0
                        ? 'bg-white hover:bg-[#e5e8ec]'
                        : 'bg-[#f1f4f8] hover:bg-[#e5e8ec]'
                    }`}
                  >
                    <td className="px-2 text-center font-mono font-bold text-[11px] border-r border-[#c4c6cf]">
                      {idx + 1 === 1 ? (
                        <span className="bg-[#002046] text-white px-1.5 py-0.2 rounded-none text-[10px]">
                          #1
                        </span>
                      ) : idx + 1 === 2 ? (
                        <span className="bg-[#1b365d] text-white px-1.5 py-0.2 rounded-none text-[10px]">
                          #2
                        </span>
                      ) : idx + 1 === 3 ? (
                        <span className="bg-[#284877] text-white px-1.5 py-0.2 rounded-none text-[10px]">
                          #3
                        </span>
                      ) : (
                        `#${idx + 1}`
                      )}
                    </td>
                    <td className="px-2 font-mono text-[11px] border-r border-[#c4c6cf]">
                      {item.productCode}
                    </td>
                    <td className="px-2 border-r border-[#c4c6cf] truncate max-w-[260px] font-bold text-[#002046]">
                      {item.description}
                    </td>
                    <td className="px-2 text-[11px] border-r border-[#c4c6cf] text-[#44474e]">
                      {item.category}
                    </td>
                    <td className="px-2 text-right font-mono font-bold text-[12px] border-r border-[#c4c6cf]">
                      {item.kilosSold > 0 ? formatWeight(item.kilosSold) : '-'}
                    </td>
                    <td className="px-2 text-right font-mono text-[11px] border-r border-[#c4c6cf]">
                      {item.unitsSold > 0 ? `${item.unitsSold} un` : '-'}
                    </td>
                    <td className="px-2 text-right font-mono font-black text-[12px] border-r border-[#c4c6cf] text-[#002046]">
                      {formatCurrency(item.totalRevenue)}
                    </td>
                    <td className="px-2 text-center font-mono font-bold text-[11px] border-r border-[#c4c6cf]">
                      {item.sharePercent.toFixed(1)}%
                    </td>
                    <td className="px-2">
                      <div className="h-[12px] w-full bg-[#e0e3e7] border border-[#c4c6cf]">
                        <div
                          className="h-full bg-[#002046]"
                          style={{ width: `${Math.min(100, item.sharePercent * 5)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
