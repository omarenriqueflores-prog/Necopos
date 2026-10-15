import React, { useState, useMemo, useRef } from 'react';
import {
  Search,
  Download,
  AlertTriangle,
  Store,
  PlusCircle,
  ArrowRightLeft,
  DollarSign,
  TrendingDown,
  Layers,
  Edit2,
  Check,
  X,
  Barcode,
  PackagePlus,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useFirebase } from '../../context/FirebaseContext';
import { Product, StockMovement } from '../../types/pos';
import {
  isMeatProduct,
  getStoreRubroLabel,
  getStorageLocationName,
  formatCurrency,
  STORE_CATEGORIES,
} from '../../utils/stockHelper';

interface StoreStockTabProps {
  onOpenNewTransfer: (defaultProduct?: Product) => void;
  onOpenStoreInitModal: () => void;
  onOpenQuickAdjustment: (product: Product, branchId: 'NECO 1' | 'NECO 2') => void;
}

export const StoreStockTab: React.FC<StoreStockTabProps> = ({
  onOpenNewTransfer,
  onOpenStoreInitModal,
  onOpenQuickAdjustment,
}) => {
  const { products, branchStock, updateProductMinStock, recordStockMovement, localUser, user } =
    useFirebase();

  const [selectedBranch, setSelectedBranch] = useState<'ALL' | 'NECO 1' | 'NECO 2'>('ALL');
  const [selectedRubro, setSelectedRubro] = useState<string>('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'OUT' | 'NORMAL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMinStockCode, setEditingMinStockCode] = useState<string | null>(null);
  const [tempMinStock, setTempMinStock] = useState<number>(10);

  // Modal de Ingreso Rápido de Mercadería / Compra Proveedor Almacén
  const [quickEntryProduct, setQuickEntryProduct] = useState<Product | null>(null);
  const [quickEntryBranch, setQuickEntryBranch] = useState<'NECO 1' | 'NECO 2'>('NECO 1');
  const [quickEntryMode, setQuickEntryMode] = useState<'ADD' | 'SET'>('ADD');
  const [quickEntryQty, setQuickEntryQty] = useState<string>('1');
  const [quickEntryNotes, setQuickEntryNotes] = useState<string>('Ingreso de mercadería a Almacén');
  const [isSavingQuick, setIsSavingQuick] = useState(false);
  const quickQtyRef = useRef<HTMLInputElement>(null);

  const operatorName =
    localUser?.fullName || user?.displayName || localUser?.username || 'Encargado de Almacén';

  // Map rápido de existencias: `${branchId}_${productCode}` -> currentStock
  const stockMap = useMemo(() => {
    const map = new Map<string, { currentStock: number; minStock: number }>();
    branchStock.forEach((bs) => {
      map.set(`${bs.branchId}_${bs.productCode}`, {
        currentStock: Number(Number(bs.currentStock).toFixed(3)) || 0,
        minStock: bs.minStock !== undefined ? Number(bs.minStock) : 10,
      });
    });
    return map;
  }, [branchStock]);

  // Solo artículos de Almacén, Bebidas, Limpieza, Carbón, Huevos, Fideos y Varios (EXCLUYE carnes de cámara)
  const storeItems = useMemo(() => {
    return products
      .filter((p) => !isMeatProduct(p))
      .map((p) => {
        const neco1 = stockMap.get(`NECO 1_${p.code}`) || { currentStock: 0, minStock: 10 };
        const neco2 = stockMap.get(`NECO 2_${p.code}`) || { currentStock: 0, minStock: 10 };
        const totalStock = Number((neco1.currentStock + neco2.currentStock).toFixed(3));
        const minStockRef = Math.max(neco1.minStock, neco2.minStock);
        const storeRubro = getStoreRubroLabel(p);

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
          storeRubro,
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
  }, [products, stockMap]);

  // Rubros disponibles en almacén
  const availableRubros = useMemo(() => {
    const custom = new Set<string>(STORE_CATEGORIES);
    storeItems.forEach((it) => {
      if (it.storeRubro) custom.add(it.storeRubro);
    });
    return Array.from(custom);
  }, [storeItems]);

  // Filtrado
  const filteredItems = useMemo(() => {
    return storeItems.filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = item.code.toLowerCase().includes(q);
        const matchBarcode = item.barcode?.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        const matchRubro = item.storeRubro.toLowerCase().includes(q);
        if (!matchCode && !matchBarcode && !matchDesc && !matchRubro) return false;
      }

      if (selectedRubro !== 'ALL' && item.storeRubro !== selectedRubro) {
        return false;
      }

      if (stockFilter === 'LOW' && item.status !== 'LOW') return false;
      if (stockFilter === 'OUT' && item.status !== 'OUT') return false;
      if (stockFilter === 'NORMAL' && item.status !== 'NORMAL') return false;

      return true;
    });
  }, [storeItems, searchQuery, selectedRubro, stockFilter]);

  // Métricas consolidadas de Almacén
  const metrics = useMemo(() => {
    let totalUnidades = 0;
    let totalUnidadesNeco1 = 0;
    let totalUnidadesNeco2 = 0;
    let totalValorNeco1 = 0;
    let totalValorNeco2 = 0;
    let totalValorConsolidado = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    storeItems.forEach((it) => {
      totalUnidades += it.totalStock;
      totalUnidadesNeco1 += it.neco1Stock;
      totalUnidadesNeco2 += it.neco2Stock;
      totalValorNeco1 += it.valorComercialNeco1;
      totalValorNeco2 += it.valorComercialNeco2;
      totalValorConsolidado += it.valorComercialTotal;
      if (it.status === 'LOW') lowStockCount++;
      if (it.status === 'OUT') outOfStockCount++;
    });

    return {
      totalUnidades,
      totalUnidadesNeco1,
      totalUnidadesNeco2,
      totalValorNeco1,
      totalValorNeco2,
      totalValorConsolidado,
      lowStockCount,
      outOfStockCount,
      totalProducts: storeItems.length,
    };
  }, [storeItems]);

  const handleOpenQuickEntry = (
    product: Product,
    branch: 'NECO 1' | 'NECO 2' = selectedBranch === 'NECO 2' ? 'NECO 2' : 'NECO 1',
    mode: 'ADD' | 'SET' = 'ADD'
  ) => {
    setQuickEntryProduct(product);
    setQuickEntryBranch(branch);
    setQuickEntryMode(mode);
    const current = stockMap.get(`${branch}_${product.code}`)?.currentStock || 0;
    setQuickEntryQty(mode === 'SET' ? String(current) : '');
    setQuickEntryNotes(
      mode === 'ADD'
        ? 'Ingreso de mercadería / Proveedor de Almacén'
        : 'Ajuste de conteo físico en Almacén / Góndola'
    );
    setTimeout(() => {
      quickQtyRef.current?.focus();
      quickQtyRef.current?.select();
    }, 50);
  };

  const handleSaveQuickEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEntryProduct) return;

    const inputNum = Math.round(Number(quickEntryQty) || 0);
    const currentStock =
      stockMap.get(`${quickEntryBranch}_${quickEntryProduct.code}`)?.currentStock || 0;

    let delta = 0;
    let newStock = currentStock;

    if (quickEntryMode === 'ADD') {
      if (inputNum <= 0) return;
      delta = inputNum;
      newStock = currentStock + inputNum;
    } else {
      if (inputNum < 0) return;
      delta = inputNum - currentStock;
      newStock = inputNum;
      if (delta === 0) {
        setQuickEntryProduct(null);
        return;
      }
    }

    try {
      setIsSavingQuick(true);
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = now.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const absQty = Math.abs(delta);
      const isPositive = delta > 0;

      const movement: StockMovement = {
        id: `SM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        idempotencyKey: `STORE_ENTRY_${Date.now()}_${quickEntryBranch}_${quickEntryProduct.code}`,
        date: dateStr,
        time: timeStr,
        timestamp: Date.now(),
        branchId: quickEntryBranch,
        chamber: getStorageLocationName(quickEntryBranch, false),
        productCode: quickEntryProduct.code,
        productDescription: quickEntryProduct.description,
        category: getStoreRubroLabel(quickEntryProduct),
        unitType: 'Unid',
        type: quickEntryMode === 'ADD' ? 'ENTRADA' : isPositive ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
        quantity: absQty,
        factor: isPositive ? 1 : -1,
        previousStock: currentStock,
        newStock,
        unitPrice: quickEntryProduct.price,
        totalValue: Number((absQty * quickEntryProduct.price).toFixed(2)),
        referenceDoc: `ALM-${Date.now().toString().slice(-6)}`,
        operator: operatorName,
        reason: quickEntryNotes.trim() || 'Ingreso a Almacén',
        notes: quickEntryNotes.trim() || 'Movimiento de stock de Almacén y Artículos Varios',
      };

      await recordStockMovement(movement);
      setQuickEntryProduct(null);
    } catch (err) {
      console.error('Error guardando stock de almacén:', err);
    } finally {
      setIsSavingQuick(false);
    }
  };

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
      Código: it.code,
      'Código de Barras (EAN)': it.barcode || '-',
      'Artículo de Almacén': it.description,
      'Rubro / Sector': it.storeRubro,
      Unidad: 'Unid',
      'Almacén NECO 1 (Unid)': it.neco1Stock,
      'Almacén NECO 2 (Unid)': it.neco2Stock,
      'Total Consolidado (Unid)': it.totalStock,
      'Mínimo Reposición (Unid)': it.minStockRef,
      'Precio Venta Vigente ($)': it.price,
      'Valor Stock NECO 1 ($)': it.valorComercialNeco1,
      'Valor Stock NECO 2 ($)': it.valorComercialNeco2,
      'Valor Stock Total ($)': it.valorComercialTotal,
      Estado:
        it.status === 'NORMAL'
          ? 'Normal'
          : it.status === 'LOW'
          ? 'Reponer (Stock Bajo)'
          : 'Sin Stock',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock_Almacen');
    XLSX.writeFile(wb, `NECO_Stock_Almacen_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* TARJETAS RESUMEN DE ALMACÉN Y ARTÍCULOS VARIOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="win-panel p-3 border-l-4 border-l-emerald-700 bg-white flex items-center space-x-3">
          <div className="w-10 h-10 rounded bg-emerald-100 flex items-center justify-center text-emerald-800">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">
              Unidades en Almacén y Góndola
            </div>
            <div className="text-xl font-bold font-mono text-gray-900">
              {metrics.totalUnidades.toLocaleString('es-AR')} Unid
            </div>
            <div className="text-[11px] text-gray-600">
              {metrics.totalProducts} artículos de almacén y varios (fuera de cámara)
            </div>
          </div>
        </div>

        <div className="win-panel p-3 border-l-4 border-l-green-700 bg-white flex items-center space-x-3">
          <div className="w-10 h-10 rounded bg-green-100 flex items-center justify-center text-green-800">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">
              Valor Comercial Stock Almacén
            </div>
            <div className="text-xl font-bold font-mono text-green-900">
              {formatCurrency(metrics.totalValorConsolidado)}
            </div>
            <div className="text-[11px] text-gray-600">
              Bebidas, limpieza, carbón, huevos, fideos y varios
            </div>
          </div>
        </div>

        <div className="win-panel p-3 border-l-4 border-l-amber-600 bg-white flex items-center space-x-3">
          <div className="w-10 h-10 rounded bg-amber-100 flex items-center justify-center text-amber-800">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">
              Alertas de Reposición Almacén
            </div>
            <div className="text-xl font-bold font-mono text-amber-700">
              {metrics.lowStockCount + metrics.outOfStockCount}{' '}
              <span className="text-xs text-gray-500 font-normal">artículos</span>
            </div>
            <div className="text-[11px] text-gray-600">
              {metrics.outOfStockCount} agotados | {metrics.lowStockCount} para reponer
            </div>
          </div>
        </div>

        <div className="win-panel p-3 border-l-4 border-l-teal-700 bg-white flex items-center space-x-3">
          <div className="w-10 h-10 rounded bg-teal-100 flex items-center justify-center text-teal-800">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">
              Stock Almacén por Sucursal
            </div>
            <div className="text-xs font-mono font-bold text-gray-800">
              NECO 1:{' '}
              <span className="text-emerald-800">
                {metrics.totalUnidadesNeco1} Unid ({formatCurrency(metrics.totalValorNeco1)})
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-gray-800">
              NECO 2:{' '}
              <span className="text-teal-800">
                {metrics.totalUnidadesNeco2} Unid ({formatCurrency(metrics.totalValorNeco2)})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS, ESCÁNER DE PISTOLA Y ACCIONES */}
      <div className="win-toolbar p-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Búsqueda / Pistola Lectora */}
          <div className="relative w-72">
            <input
              type="text"
              className="win-input w-full pl-7 pr-2 py-1 text-xs font-semibold"
              placeholder="Escanee código de barras o busque bebida, limpieza, carbón..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  const q = searchQuery.trim().toLowerCase();
                  const exactMatch = storeItems.find(
                    (it) =>
                      (it.barcode && it.barcode.trim().toLowerCase() === q) ||
                      it.code.trim().toLowerCase() === q
                  );
                  if (exactMatch) {
                    e.preventDefault();
                    handleOpenQuickEntry(
                      exactMatch,
                      selectedBranch === 'NECO 2' ? 'NECO 2' : 'NECO 1',
                      'ADD'
                    );
                  }
                }
              }}
            />
            <Barcode className="w-3.5 h-3.5 text-emerald-700 absolute left-2 top-2" />
          </div>

          {/* Sucursal */}
          <div className="flex items-center space-x-1">
            <span className="text-gray-700 font-bold">Depósito:</span>
            <select
              className="win-select py-1 text-xs"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value as any)}
            >
              <option value="ALL">Ambos Depósitos (NECO 1 + NECO 2)</option>
              <option value="NECO 1">Almacén NECO 1 (Casa Central)</option>
              <option value="NECO 2">Almacén NECO 2 (Sucursal)</option>
            </select>
          </div>

          {/* Rubro de Almacén */}
          <div className="flex items-center space-x-1">
            <span className="text-gray-700 font-bold">Rubro Almacén:</span>
            <select
              className="win-select py-1 text-xs max-w-[170px] font-semibold text-emerald-900"
              value={selectedRubro}
              onChange={(e) => setSelectedRubro(e.target.value)}
            >
              <option value="ALL">Todos los rubros</option>
              {availableRubros.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Estado */}
          <div className="flex items-center space-x-1">
            <span className="text-gray-700 font-bold">Estado:</span>
            <select
              className="win-select py-1 text-xs"
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as any)}
            >
              <option value="ALL">Todos los estados</option>
              <option value="NORMAL">Stock Normal</option>
              <option value="LOW">Stock Bajo (Reponer)</option>
              <option value="OUT">Sin Stock (Agotado)</option>
            </select>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenStoreInitModal}
            className="win-button py-1 px-2.5 flex items-center space-x-1 text-xs font-bold text-emerald-950"
            title="Cargar o inicializar stock masivo de bebidas, almacén, limpieza, carbón, huevos, etc."
          >
            <Store className="w-3.5 h-3.5 text-emerald-700" />
            <span>Carga Masiva / Inicializar Almacén</span>
          </button>

          <button
            onClick={() => onOpenNewTransfer()}
            className="win-button py-1 px-2.5 flex items-center space-x-1 text-xs font-bold text-blue-900"
            title="Transferir artículos de almacén entre sucursales NECO 1 y NECO 2"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-blue-700" />
            <span>Traslado entre Sucursales</span>
          </button>

          <button
            onClick={exportToExcel}
            className="win-button py-1 px-2.5 flex items-center space-x-1 text-xs text-gray-800"
            title="Descargar planilla de stock de almacén en Excel"
          >
            <Download className="w-3.5 h-3.5 text-green-700" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* TABLA DE STOCK DE ALMACÉN Y ARTÍCULOS VARIOS */}
      <div className="win-panel flex-1 overflow-auto bg-white">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-[#00522c] text-white sticky top-0 z-10 select-none">
            <tr>
              <th className="p-2 border border-[#003d20] w-20 text-center">CÓDIGO</th>
              <th className="p-2 border border-[#003d20] w-36">CÓD. DE BARRAS (EAN)</th>
              <th className="p-2 border border-[#003d20]">
                ARTÍCULO DE ALMACÉN / BEBIDAS / LIMPIEZA / VARIOS
              </th>
              <th className="p-2 border border-[#003d20] w-36">RUBRO ALMACÉN</th>
              <th className="p-2 border border-[#003d20] w-14 text-center">UNIDAD</th>
              {(selectedBranch === 'ALL' || selectedBranch === 'NECO 1') && (
                <th className="p-2 border border-[#003d20] w-32 text-right bg-[#006637]">
                  ALMACÉN NECO 1
                </th>
              )}
              {(selectedBranch === 'ALL' || selectedBranch === 'NECO 2') && (
                <th className="p-2 border border-[#003d20] w-32 text-right bg-[#006637]">
                  ALMACÉN NECO 2
                </th>
              )}
              {selectedBranch === 'ALL' && (
                <th className="p-2 border border-[#003d20] w-28 text-right bg-[#003d20]">
                  TOTAL UNID.
                </th>
              )}
              <th className="p-2 border border-[#003d20] w-24 text-center">MÍN. ALERTA</th>
              <th className="p-2 border border-[#003d20] w-24 text-right">PRECIO VIG.</th>
              <th className="p-2 border border-[#003d20] w-32 text-right">VALOR STOCK</th>
              <th className="p-2 border border-[#003d20] w-24 text-center">ESTADO</th>
              <th className="p-2 border border-[#003d20] w-28 text-center">ACCIONES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 font-sans">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={13} className="p-8 text-center text-gray-500 italic">
                  No se encontraron artículos de almacén o varios con los filtros seleccionados.
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
                    className={`hover:bg-emerald-50/70 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    } ${
                      item.status === 'OUT'
                        ? 'bg-red-50/50'
                        : item.status === 'LOW'
                        ? 'bg-amber-50/50'
                        : ''
                    }`}
                  >
                    <td className="p-2 text-center font-mono font-bold text-gray-800 border border-gray-200">
                      {item.code}
                    </td>
                    <td className="p-2 font-mono border border-gray-200">
                      {item.barcode ? (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-900 px-1.5 py-0.5 rounded border border-blue-200 text-[11px] font-bold">
                          <Barcode className="w-3 h-3 text-blue-700" />
                          {item.barcode}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-[11px]">Sin código</span>
                      )}
                    </td>
                    <td className="p-2 border border-gray-200 font-bold text-gray-900">
                      <div className="flex items-center space-x-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-full bg-emerald-600 flex-shrink-0"
                          title="Artículo de Almacén y Varios (separado de cámara frigorífica)"
                        />
                        <span>{item.description}</span>
                      </div>
                    </td>
                    <td className="p-2 border border-gray-200">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 font-semibold text-[11px]">
                        {item.storeRubro}
                      </span>
                    </td>
                    <td className="p-2 border border-gray-200 text-center font-bold text-emerald-800">
                      Unid
                    </td>

                    {/* Stock Almacén NECO 1 */}
                    {(selectedBranch === 'ALL' || selectedBranch === 'NECO 1') && (
                      <td
                        onClick={() => handleOpenQuickEntry(item, 'NECO 1', 'SET')}
                        title="Clic para cargar o modificar unidades en Almacén NECO 1"
                        className={`p-2 border border-gray-200 text-right font-mono font-bold cursor-pointer hover:underline ${
                          item.neco1Stock <= 0
                            ? 'text-red-700 bg-red-50/60'
                            : item.neco1Stock <= item.neco1Min
                            ? 'text-amber-800 bg-amber-50/60'
                            : 'text-gray-900'
                        }`}
                      >
                        {item.neco1Stock.toLocaleString('es-AR')} Unid
                      </td>
                    )}

                    {/* Stock Almacén NECO 2 */}
                    {(selectedBranch === 'ALL' || selectedBranch === 'NECO 2') && (
                      <td
                        onClick={() => handleOpenQuickEntry(item, 'NECO 2', 'SET')}
                        title="Clic para cargar o modificar unidades en Almacén NECO 2"
                        className={`p-2 border border-gray-200 text-right font-mono font-bold cursor-pointer hover:underline ${
                          item.neco2Stock <= 0
                            ? 'text-red-700 bg-red-50/60'
                            : item.neco2Stock <= item.neco2Min
                            ? 'text-amber-800 bg-amber-50/60'
                            : 'text-gray-900'
                        }`}
                      >
                        {item.neco2Stock.toLocaleString('es-AR')} Unid
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
                            : 'text-emerald-900'
                        }`}
                      >
                        {item.totalStock.toLocaleString('es-AR')} Unid
                      </td>
                    )}

                    {/* Stock Mínimo Editable */}
                    <td className="p-2 border border-gray-200 text-center">
                      {isEditingMin ? (
                        <div className="flex items-center justify-center space-x-1">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className="w-14 px-1 py-0.5 text-xs border border-emerald-600 rounded font-mono text-center"
                            value={tempMinStock}
                            onChange={(e) =>
                              setTempMinStock(Math.max(0, Math.round(Number(e.target.value))))
                            }
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
                          title="Clic para editar stock mínimo de reposición"
                        >
                          <span className="font-mono text-gray-600 group-hover:text-emerald-700">
                            {item.minStockRef} Unid
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
                          REPONER
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
                          onClick={() =>
                            handleOpenQuickEntry(
                              item,
                              selectedBranch === 'NECO 2' ? 'NECO 2' : 'NECO 1',
                              'ADD'
                            )
                          }
                          className="px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 font-bold text-[10px] flex items-center gap-0.5 cursor-pointer"
                          title="Sumar / Ingresar unidades compradas a proveedor"
                        >
                          <PlusCircle className="w-3 h-3 text-emerald-700" />
                          <span>+ Unid</span>
                        </button>
                        <button
                          onClick={() =>
                            onOpenQuickAdjustment(
                              item,
                              selectedBranch === 'NECO 2' ? 'NECO 2' : 'NECO 1'
                            )
                          }
                          className="p-1 rounded hover:bg-gray-200 text-gray-700 cursor-pointer"
                          title="Registrar Baja / Ajuste de Almacén"
                        >
                          <TrendingDown className="w-3.5 h-3.5 text-amber-700" />
                        </button>
                        <button
                          onClick={() => onOpenNewTransfer(item)}
                          className="p-1 rounded hover:bg-gray-200 text-gray-700 cursor-pointer"
                          title="Transferir a otra sucursal"
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
          Mostrando <strong>{filteredItems.length}</strong> de <strong>{storeItems.length}</strong>{' '}
          artículos en Stock de Almacén y Varios (separado de Cámara Frigorífica)
        </div>
        <div className="flex items-center space-x-4 font-mono">
          <span>
            Total Unidades Almacén:{' '}
            <strong className="text-emerald-900">
              {metrics.totalUnidades.toLocaleString('es-AR')} Unid
            </strong>
          </span>
          <span>
            Valor Comercial Almacén:{' '}
            <strong className="text-green-800">
              {formatCurrency(metrics.totalValorConsolidado)}
            </strong>
          </span>
        </div>
      </div>

      {/* MODAL RÁPIDO DE INGRESO / MODIFICACIÓN DE UNIDADES DE ALMACÉN */}
      {quickEntryProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="win-panel bg-[#d4d0c8] max-w-md w-full flex flex-col shadow-2xl border-2 border-white">
            <div className="win-titlebar flex items-center justify-between p-1.5 select-none">
              <div className="flex items-center space-x-2 text-white font-bold text-xs pl-1">
                <PackagePlus className="w-4 h-4" />
                <span>Carga de Stock en Almacén — {quickEntryProduct.description}</span>
              </div>
              <button
                onClick={() => setQuickEntryProduct(null)}
                className="win-button p-0.5 w-5 h-5 flex items-center justify-center text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickEntry} className="p-4 space-y-3 text-xs bg-white">
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded">
                <div className="font-bold text-sm text-emerald-950">
                  {quickEntryProduct.description}
                </div>
                <div className="text-[11px] text-gray-600 flex items-center gap-3 mt-0.5 font-mono">
                  <span>Cód: {quickEntryProduct.code}</span>
                  {quickEntryProduct.barcode && <span>EAN: {quickEntryProduct.barcode}</span>}
                  <span>Rubro: {getStoreRubroLabel(quickEntryProduct)}</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-800 mb-1">
                  Sucursal / Depósito de Almacén:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setQuickEntryBranch('NECO 1');
                      if (quickEntryMode === 'SET') {
                        const c =
                          stockMap.get(`NECO 1_${quickEntryProduct.code}`)?.currentStock || 0;
                        setQuickEntryQty(String(c));
                      }
                    }}
                    className={`py-1.5 px-3 rounded font-bold text-xs cursor-pointer border ${
                      quickEntryBranch === 'NECO 1'
                        ? 'bg-[#00522c] text-white border-[#00522c]'
                        : 'bg-gray-50 text-black border-gray-300'
                    }`}
                  >
                    Almacén NECO 1
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickEntryBranch('NECO 2');
                      if (quickEntryMode === 'SET') {
                        const c =
                          stockMap.get(`NECO 2_${quickEntryProduct.code}`)?.currentStock || 0;
                        setQuickEntryQty(String(c));
                      }
                    }}
                    className={`py-1.5 px-3 rounded font-bold text-xs cursor-pointer border ${
                      quickEntryBranch === 'NECO 2'
                        ? 'bg-[#00522c] text-white border-[#00522c]'
                        : 'bg-gray-50 text-black border-gray-300'
                    }`}
                  >
                    Almacén NECO 2
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-800 mb-1">Modo de Operación:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setQuickEntryMode('ADD');
                      setQuickEntryQty('');
                      setQuickEntryNotes('Ingreso de mercadería / Proveedor de Almacén');
                      setTimeout(() => quickQtyRef.current?.select(), 30);
                    }}
                    className={`py-1.5 px-2 rounded font-bold text-xs cursor-pointer border ${
                      quickEntryMode === 'ADD'
                        ? 'bg-blue-900 text-white border-blue-900'
                        : 'bg-gray-50 text-black border-gray-300'
                    }`}
                  >
                    + Sumar Unidades (Compra)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickEntryMode('SET');
                      const cur =
                        stockMap.get(`${quickEntryBranch}_${quickEntryProduct.code}`)
                          ?.currentStock || 0;
                      setQuickEntryQty(String(cur));
                      setQuickEntryNotes('Ajuste de conteo físico en Almacén / Góndola');
                      setTimeout(() => quickQtyRef.current?.select(), 30);
                    }}
                    className={`py-1.5 px-2 rounded font-bold text-xs cursor-pointer border ${
                      quickEntryMode === 'SET'
                        ? 'bg-blue-900 text-white border-blue-900'
                        : 'bg-gray-50 text-black border-gray-300'
                    }`}
                  >
                    = Fijar Stock Exacto
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center bg-gray-50 p-2.5 rounded border border-gray-300">
                <div>
                  <div className="text-[11px] text-gray-500 font-bold">
                    Stock Actual ({quickEntryBranch}):
                  </div>
                  <div className="text-lg font-mono font-bold text-gray-800">
                    {stockMap.get(`${quickEntryBranch}_${quickEntryProduct.code}`)?.currentStock ||
                      0}{' '}
                    Unid
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-emerald-900 mb-0.5">
                    {quickEntryMode === 'ADD' ? 'Unidades a Sumar (+):' : 'Nuevo Stock Total:'}
                  </label>
                  <input
                    ref={quickQtyRef}
                    type="number"
                    min="0"
                    step="1"
                    value={quickEntryQty}
                    onChange={(e) => setQuickEntryQty(e.target.value)}
                    className="win-input w-full px-2 py-1.5 text-base font-mono font-bold text-center border-2 border-emerald-700 bg-white text-black"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Detalle / Proveedor (opcional):
                </label>
                <input
                  type="text"
                  value={quickEntryNotes}
                  onChange={(e) => setQuickEntryNotes(e.target.value)}
                  className="win-input w-full px-2 py-1 text-xs"
                  placeholder="Ej: Ingreso proveedor Coca-Cola, compra mayorista..."
                />
              </div>

              <div className="pt-2 border-t border-gray-300 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setQuickEntryProduct(null)}
                  className="win-button py-1.5 px-3 text-xs text-gray-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuick}
                  className="win-button py-1.5 px-4 text-xs font-bold text-white bg-[#00522c] hover:bg-[#003d20] cursor-pointer flex items-center space-x-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSavingQuick ? 'Guardando...' : 'Confirmar Stock Almacén'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
