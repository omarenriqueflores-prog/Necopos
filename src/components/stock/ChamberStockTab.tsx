import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  AlertTriangle,
  Boxes,
  PlusCircle,
  ArrowRightLeft,
  DollarSign,
  TrendingDown,
  Layers,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useFirebase } from '../../context/FirebaseContext';
import { Product, UnitType, ANIMAL_CATEGORIES } from '../../types/pos';
import { isMeatProduct, formatKg, formatQuantity, formatCurrency } from '../../utils/stockHelper';
import { Store } from 'lucide-react';

interface ChamberStockTabProps {
  onOpenNewTransfer: (defaultProduct?: Product) => void;
  onOpenInitModal: () => void;
  onOpenQuickAdjustment: (product: Product, branchId: 'NECO 1' | 'NECO 2') => void;
  onSwitchToStoreStock?: () => void;
}

export const ChamberStockTab: React.FC<ChamberStockTabProps> = ({
  onOpenNewTransfer,
  onOpenInitModal,
  onOpenQuickAdjustment,
  onSwitchToStoreStock,
}) => {
  const { products, branchStock, updateProductMinStock } = useFirebase();

  const [selectedBranch, setSelectedBranch] = useState<'ALL' | 'NECO 1' | 'NECO 2'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'OUT' | 'NORMAL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMinStockCode, setEditingMinStockCode] = useState<string | null>(null);
  const [tempMinStock, setTempMinStock] = useState<number>(20);

  // Filtrar estrictamente carnes y productos de cámara frigorífica (excluye Coca Cola, almacén, limpieza, carbón, huevos, fideos, etc.)
  const meatProductsOnly = useMemo(() => {
    return products.filter((p) => isMeatProduct(p));
  }, [products]);

  const storeProductsCount = useMemo(() => {
    return products.filter((p) => !isMeatProduct(p)).length;
  }, [products]);

  // Categorías cárnicas disponibles en cámara
  const categories = useMemo(() => {
    const customCats = new Set<string>();
    meatProductsOnly.forEach((p) => {
      if (p.category) customCats.add(p.category);
    });
    return Array.from(new Set([...ANIMAL_CATEGORIES, ...Array.from(customCats)]));
  }, [meatProductsOnly]);

  // Map rápido de existencias: `${branchId}_${productCode}` -> currentStock
  const stockMap = useMemo(() => {
    const map = new Map<string, { currentStock: number; minStock: number }>();
    branchStock.forEach((bs) => {
      map.set(`${bs.branchId}_${bs.productCode}`, {
        currentStock: Number(bs.currentStock) || 0,
        minStock: Number(bs.minStock) || 20,
      });
    });
    return map;
  }, [branchStock]);

  // Lista procesada de productos CÁRNICOS con sus stocks por cámara frigorífica
  const processedItems = useMemo(() => {
    return meatProductsOnly.map((p) => {
      const neco1 = stockMap.get(`NECO 1_${p.code}`) || { currentStock: 0, minStock: 20 };
      const neco2 = stockMap.get(`NECO 2_${p.code}`) || { currentStock: 0, minStock: 20 };
      const totalStock = Number((neco1.currentStock + neco2.currentStock).toFixed(3));
      const isMeat = true;
      const minStockRef = Math.max(neco1.minStock, neco2.minStock);

      // Estado de stock
      let status: 'NORMAL' | 'LOW' | 'OUT' = 'NORMAL';
      if (totalStock <= 0) {
        status = 'OUT';
      } else if (totalStock <= minStockRef) {
        status = 'LOW';
      }

      const valorComercialNeco1 = Number((neco1.currentStock * p.price).toFixed(2));
      const valorComercialNeco2 = Number((neco2.currentStock * p.price).toFixed(2));
      const valorComercialTotal = Number((totalStock * p.price).toFixed(2));

      return {
        ...p,
        isMeat,
        neco1Stock: neco1.currentStock,
        neco1Min: neco1.minStock,
        neco2Stock: neco2.currentStock,
        neco2Min: neco2.minStock,
        totalStock,
        status,
        minStockRef,
        valorComercialNeco1,
        valorComercialNeco2,
        valorComercialTotal,
      };
    });
  }, [meatProductsOnly, stockMap]);

  // Filtrado
  const filteredItems = useMemo(() => {
    return processedItems.filter((item) => {
      // Búsqueda
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = item.code.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        const matchPlu = item.scalePlu?.toString().includes(q);
        if (!matchCode && !matchDesc && !matchPlu) return false;
      }

      // Categoría
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }

      // Estado de stock
      if (stockFilter === 'LOW' && item.status !== 'LOW') return false;
      if (stockFilter === 'OUT' && item.status !== 'OUT') return false;
      if (stockFilter === 'NORMAL' && item.status !== 'NORMAL') return false;

      // Sucursal específica (si seleccionó ver solo NECO 1 o NECO 2, filtramos solo si pide bajo stock de esa)
      return true;
    });
  }, [processedItems, searchQuery, selectedCategory, stockFilter]);

  // Métricas consolidadas
  const metrics = useMemo(() => {
    let totalKilosCarnicos = 0;
    let totalValorCarnicoNeco1 = 0;
    let totalValorCarnicoNeco2 = 0;
    let totalValorCarnicoConsolidado = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    processedItems.forEach((it) => {
      if (it.isMeat) {
        totalKilosCarnicos += it.totalStock;
        totalValorCarnicoNeco1 += it.valorComercialNeco1;
        totalValorCarnicoNeco2 += it.valorComercialNeco2;
        totalValorCarnicoConsolidado += it.valorComercialTotal;
      }
      if (it.status === 'LOW') lowStockCount++;
      if (it.status === 'OUT') outOfStockCount++;
    });

    return {
      totalKilosCarnicos,
      totalValorCarnicoNeco1,
      totalValorCarnicoNeco2,
      totalValorCarnicoConsolidado,
      lowStockCount,
      outOfStockCount,
      totalProducts: processedItems.length,
    };
  }, [processedItems]);

  const handleSaveMinStock = async (productCode: string) => {
    try {
      await updateProductMinStock('NECO 1', productCode, tempMinStock);
      await updateProductMinStock('NECO 2', productCode, tempMinStock);
      setEditingMinStockCode(null);
    } catch (err) {
      console.error('Error saving min stock:', err);
    }
  };

  const exportToExcel = () => {
    const data = filteredItems.map((it) => ({
      'Código': it.code,
      'PLU Balanza': it.scalePlu || '-',
      'Descripción': it.description,
      'Categoría': it.category,
      'Rubro Cárnico': it.isMeat ? 'SÍ (Cárnico)' : 'NO (Almacén)',
      'Unidad': it.unitType,
      'Stock NECO 1 (Cámara Central)': it.neco1Stock,
      'Stock NECO 2 (Cámara Frig.)': it.neco2Stock,
      'Stock Total Consolidado': it.totalStock,
      'Stock Mínimo Alerta': it.minStockRef,
      'Precio Venta Vigente ($)': it.price,
      'Valor Comercial NECO 1 ($)': it.valorComercialNeco1,
      'Valor Comercial NECO 2 ($)': it.valorComercialNeco2,
      'Valor Comercial Consolidado ($)': it.valorComercialTotal,
      'Estado': it.status === 'NORMAL' ? 'Normal' : it.status === 'LOW' ? 'Alerta Bajo' : 'Sin Stock',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Existencias_Camaras');
    XLSX.writeFile(wb, `NECO_Inventario_Camaras_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* TARJETAS RESUMEN DE CÁMARAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="win-panel p-3 border-l-4 border-l-blue-800 bg-white flex items-center space-x-3">
          <div className="w-10 h-10 rounded bg-blue-100 flex items-center justify-center text-blue-800">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Kilos Cárnicos en Cámaras</div>
            <div className="text-xl font-bold font-mono text-gray-900">{formatKg(metrics.totalKilosCarnicos)}</div>
            <div className="text-[11px] text-gray-600">Stock físico total cámaras 1 y 2</div>
          </div>
        </div>

        <div className="win-panel p-3 border-l-4 border-l-green-700 bg-white flex items-center space-x-3">
          <div className="w-10 h-10 rounded bg-green-100 flex items-center justify-center text-green-800">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Valor Comercial Stock Cárnico</div>
            <div className="text-xl font-bold font-mono text-green-900">{formatCurrency(metrics.totalValorCarnicoConsolidado)}</div>
            <div className="text-[11px] text-gray-600">Al precio de venta vigente</div>
          </div>
        </div>

        <div className="win-panel p-3 border-l-4 border-l-amber-600 bg-white flex items-center space-x-3">
          <div className="w-10 h-10 rounded bg-amber-100 flex items-center justify-center text-amber-800">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Alertas Stock Crítico / Bajo</div>
            <div className="text-xl font-bold font-mono text-amber-700">
              {metrics.lowStockCount + metrics.outOfStockCount} <span className="text-xs text-gray-500 font-normal">cortes</span>
            </div>
            <div className="text-[11px] text-gray-600">{metrics.outOfStockCount} agotados | {metrics.lowStockCount} bajo mínimo</div>
          </div>
        </div>

        <div className="win-panel p-3 border-l-4 border-l-purple-700 bg-white flex items-center space-x-3">
          <div className="w-10 h-10 rounded bg-purple-100 flex items-center justify-center text-purple-800">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Distribución por Sucursal</div>
            <div className="text-xs font-mono font-bold text-gray-800">
              NECO 1: <span className="text-blue-700">{formatCurrency(metrics.totalValorCarnicoNeco1)}</span>
            </div>
            <div className="text-xs font-mono font-bold text-gray-800">
              NECO 2: <span className="text-purple-700">{formatCurrency(metrics.totalValorCarnicoNeco2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS Y ACCIONES */}
      <div className="win-toolbar p-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Búsqueda */}
          <div className="relative w-56">
            <input
              type="text"
              className="win-input w-full pl-7 pr-2 py-1 text-xs"
              placeholder="Buscar por código, corte, PLU..."
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
              <option value="ALL">Ambas Sucursales (Comparativa)</option>
              <option value="NECO 1">NECO 1 (Casa Central)</option>
              <option value="NECO 2">NECO 2 (Sucursal)</option>
            </select>
          </div>

          {/* Categoría */}
          <div className="flex items-center space-x-1">
            <span className="text-gray-700 font-bold">Categoría:</span>
            <select
              className="win-select py-1 text-xs max-w-[160px]"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="ALL">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro de Nivel de Stock */}
          <div className="flex items-center space-x-1">
            <span className="text-gray-700 font-bold">Estado:</span>
            <select
              className="win-select py-1 text-xs"
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as any)}
            >
              <option value="ALL">Todos los estados</option>
              <option value="NORMAL">Stock Normal</option>
              <option value="LOW">Stock Bajo (Alerta)</option>
              <option value="OUT">Sin Stock (Agotado)</option>
            </select>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex items-center space-x-2">
          {onSwitchToStoreStock && (
            <button
              onClick={onSwitchToStoreStock}
              className="win-button py-1 px-2.5 flex items-center space-x-1 text-xs font-bold text-emerald-900 bg-emerald-50 border-emerald-600 cursor-pointer"
              title="Ver Stock de Almacén, Bebidas, Limpieza, Carbón, Huevos y Artículos Varios"
            >
              <Store className="w-3.5 h-3.5 text-emerald-700" />
              <span>Ir a Stock Almacén ({storeProductsCount})</span>
            </button>
          )}

          <button
            onClick={onOpenInitModal}
            className="win-button py-1 px-2.5 flex items-center space-x-1 text-xs font-bold text-gray-800 cursor-pointer"
            title="Cargar stock inicial de cortes cárnicos en cámaras"
          >
            <Boxes className="w-3.5 h-3.5 text-blue-700" />
            <span>Apertura / Inicializar Cámara</span>
          </button>

          <button
            onClick={() => onOpenNewTransfer()}
            className="win-button py-1 px-2.5 flex items-center space-x-1 text-xs font-bold text-blue-900 cursor-pointer"
            title="Iniciar transferencia de mercadería entre cámaras NECO 1 y NECO 2"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-blue-700" />
            <span>Nueva Transferencia</span>
          </button>

          <button
            onClick={exportToExcel}
            className="win-button py-1 px-2.5 flex items-center space-x-1 text-xs text-gray-800 cursor-pointer"
            title="Descargar listado en formato Excel"
          >
            <Download className="w-3.5 h-3.5 text-green-700" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* TABLA DE EXISTENCIAS */}
      <div className="win-panel flex-1 overflow-auto bg-white">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-[#002046] text-white sticky top-0 z-10 select-none">
            <tr>
              <th className="p-2 border border-[#00152e] w-12 text-center">PLU</th>
              <th className="p-2 border border-[#00152e] w-20 text-center">CÓDIGO</th>
              <th className="p-2 border border-[#00152e]">DESCRIPCIÓN DEL CORTE / ARTÍCULO</th>
              <th className="p-2 border border-[#00152e] w-36">RUBRO / CATEGORÍA</th>
              <th className="p-2 border border-[#00152e] w-14 text-center">UNIDAD</th>
              {(selectedBranch === 'ALL' || selectedBranch === 'NECO 1') && (
                <th className="p-2 border border-[#00152e] w-28 text-right bg-[#002c61]">
                  CÁMARA NECO 1
                </th>
              )}
              {(selectedBranch === 'ALL' || selectedBranch === 'NECO 2') && (
                <th className="p-2 border border-[#00152e] w-28 text-right bg-[#002c61]">
                  CÁMARA NECO 2
                </th>
              )}
              {selectedBranch === 'ALL' && (
                <th className="p-2 border border-[#00152e] w-28 text-right bg-[#001e42]">
                  TOTAL CONSOLIDADO
                </th>
              )}
              <th className="p-2 border border-[#00152e] w-24 text-center">STOCK MÍN.</th>
              <th className="p-2 border border-[#00152e] w-24 text-right">PRECIO VIG.</th>
              <th className="p-2 border border-[#00152e] w-32 text-right">VALOR STOCK</th>
              <th className="p-2 border border-[#00152e] w-24 text-center">ESTADO</th>
              <th className="p-2 border border-[#00152e] w-24 text-center">ACCIONES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 font-sans">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={13} className="p-8 text-center text-gray-500 italic">
                  No se encontraron productos o cortes con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              filteredItems.map((item, index) => {
                const isEditingMin = editingMinStockCode === item.code;
                const valorMostrar =
                  selectedBranch === 'NECO 1'
                    ? item.valorComercialNeco1
                    : selectedBranch === 'NECO 2'
                    ? item.valorComercialNeco2
                    : item.valorComercialTotal;

                return (
                  <tr
                    key={item.code}
                    className={`hover:bg-blue-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    } ${item.status === 'OUT' ? 'bg-red-50/50' : item.status === 'LOW' ? 'bg-amber-50/50' : ''}`}
                  >
                    <td className="p-2 text-center font-mono font-bold text-gray-600 border border-gray-200">
                      {item.scalePlu || '-'}
                    </td>
                    <td className="p-2 text-center font-mono font-bold text-gray-800 border border-gray-200">
                      {item.code}
                    </td>
                    <td className="p-2 border border-gray-200 font-bold text-gray-900">
                      <div className="flex items-center space-x-1.5">
                        {item.isMeat ? (
                          <span
                            className="inline-block w-2 h-2 rounded-full bg-red-600 flex-shrink-0"
                            title="Producto cárnico para valorización"
                          />
                        ) : (
                          <span
                            className="inline-block w-2 h-2 rounded-full bg-gray-400 flex-shrink-0"
                            title="Almacén / Otros (no computable en valorización cárnica)"
                          />
                        )}
                        <span>{item.description}</span>
                      </div>
                    </td>
                    <td className="p-2 border border-gray-200 text-gray-600 truncate max-w-[140px]">
                      {item.category}
                    </td>
                    <td className="p-2 border border-gray-200 text-center font-semibold text-gray-700">
                      {item.unitType}
                    </td>

                    {/* Stock NECO 1 */}
                    {(selectedBranch === 'ALL' || selectedBranch === 'NECO 1') && (
                      <td
                        className={`p-2 border border-gray-200 text-right font-mono font-bold ${
                          item.neco1Stock <= 0
                            ? 'text-red-700 bg-red-50/60'
                            : item.neco1Stock <= item.neco1Min
                            ? 'text-amber-800 bg-amber-50/60'
                            : 'text-gray-900'
                        }`}
                      >
                        {formatQuantity(item.neco1Stock, item.unitType)}
                      </td>
                    )}

                    {/* Stock NECO 2 */}
                    {(selectedBranch === 'ALL' || selectedBranch === 'NECO 2') && (
                      <td
                        className={`p-2 border border-gray-200 text-right font-mono font-bold ${
                          item.neco2Stock <= 0
                            ? 'text-red-700 bg-red-50/60'
                            : item.neco2Stock <= item.neco2Min
                            ? 'text-amber-800 bg-amber-50/60'
                            : 'text-gray-900'
                        }`}
                      >
                        {formatQuantity(item.neco2Stock, item.unitType)}
                      </td>
                    )}

                    {/* Total Consolidado */}
                    {selectedBranch === 'ALL' && (
                      <td
                        className={`p-2 border border-gray-200 text-right font-mono font-bold ${
                          item.totalStock <= 0
                            ? 'text-red-700'
                            : item.totalStock <= item.minStockRef
                            ? 'text-amber-800'
                            : 'text-blue-900'
                        }`}
                      >
                        {formatQuantity(item.totalStock, item.unitType)}
                      </td>
                    )}

                    {/* Stock Mínimo Editable */}
                    <td className="p-2 border border-gray-200 text-center">
                      {isEditingMin ? (
                        <div className="flex items-center justify-center space-x-1">
                          <input
                            type="number"
                            min="0"
                            className="w-14 px-1 py-0.5 text-xs border border-blue-600 rounded font-mono text-center"
                            value={tempMinStock}
                            onChange={(e) => setTempMinStock(Math.max(0, Number(e.target.value)))}
                          />
                          <button
                            onClick={() => handleSaveMinStock(item.code)}
                            className="text-green-700 hover:text-green-900 p-0.5"
                            title="Guardar"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingMinStockCode(null)}
                            className="text-red-700 hover:text-red-900 p-0.5"
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="flex items-center justify-center space-x-1 cursor-pointer group"
                          onClick={() => {
                            setEditingMinStockCode(item.code);
                            setTempMinStock(item.minStockRef);
                          }}
                          title="Clic para editar stock mínimo de alerta"
                        >
                          <span className="font-mono text-gray-600 group-hover:text-blue-700">
                            {formatQuantity(item.minStockRef, item.unitType)}
                          </span>
                          <Edit2 className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100" />
                        </div>
                      )}
                    </td>

                    {/* Precio Venta Vigente */}
                    <td className="p-2 border border-gray-200 text-right font-mono text-gray-700">
                      {formatCurrency(item.price)}
                    </td>

                    {/* Valor Comercial */}
                    <td className="p-2 border border-gray-200 text-right font-mono font-bold text-gray-900">
                      {formatCurrency(valorMostrar)}
                    </td>

                    {/* Estado Badge */}
                    <td className="p-2 border border-gray-200 text-center">
                      {item.status === 'OUT' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">
                          SIN STOCK
                        </span>
                      ) : item.status === 'LOW' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          STOCK BAJO
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800 border border-green-300">
                          NORMAL
                        </span>
                      )}
                    </td>

                    {/* Acciones Rápidas */}
                    <td className="p-2 border border-gray-200 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          onClick={() => onOpenQuickAdjustment(item, selectedBranch === 'NECO 2' ? 'NECO 2' : 'NECO 1')}
                          className="p-1 rounded hover:bg-gray-200 text-gray-700"
                          title="Registrar Ajuste / Merma para este corte"
                        >
                          <TrendingDown className="w-3.5 h-3.5 text-amber-700" />
                        </button>
                        <button
                          onClick={() => onOpenNewTransfer(item)}
                          className="p-1 rounded hover:bg-gray-200 text-gray-700"
                          title="Transferir corte a otra sucursal"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 text-blue-700" />
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

      {/* FOOTER BARRA DE ESTADO */}
      <div className="win-statusbar p-1.5 flex items-center justify-between text-[11px] text-gray-700">
        <div>
          Mostrando <strong>{filteredItems.length}</strong> de <strong>{meatProductsOnly.length}</strong> cortes cárnicos en Cámara Frigorífica (los {storeProductsCount} artículos de almacén y varios tienen su propio stock separado)
        </div>
        <div className="flex items-center space-x-4 font-mono">
          <span>
            Total Cárnico:{' '}
            <strong className="text-blue-900">{formatKg(metrics.totalKilosCarnicos)}</strong>
          </span>
          <span>
            Valor Comercial:{' '}
            <strong className="text-green-800">{formatCurrency(metrics.totalValorCarnicoConsolidado)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
