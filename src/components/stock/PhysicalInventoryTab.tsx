import React, { useState, useMemo } from 'react';
import {
  ClipboardCheck,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Save,
  Search,
  History,
  FileCheck,
  Scale,
} from 'lucide-react';
import { useFirebase } from '../../context/FirebaseContext';
import { PhysicalInventory, PhysicalInventoryItem, ANIMAL_CATEGORIES } from '../../types/pos';
import { isMeatProduct, formatKg, formatCurrency } from '../../utils/stockHelper';

export const PhysicalInventoryTab: React.FC = () => {
  const { products, branchStock, applyPhysicalInventory, physicalInventories, localUser, user } = useFirebase();

  const [branchId, setBranchId] = useState<'NECO 1' | 'NECO 2'>('NECO 1');
  const [countsByBranch, setCountsByBranch] = useState<Record<string, Record<string, number>>>({
    'NECO 1': {},
    'NECO 2': {},
  });
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyDifferences, setOnlyDifferences] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<PhysicalInventory | null>(null);

  const operatorName = localUser?.fullName || user?.displayName || localUser?.username || 'Auditor de Cámara';
  const counts = countsByBranch[branchId] || {};

  // Categorías de productos cárnicos con las oficiales primero
  const categories = useMemo(() => {
    const customCats = new Set<string>();
    products
      .filter((p) => isMeatProduct(p))
      .forEach((p) => {
        if (p.category) customCats.add(p.category);
      });
    return Array.from(new Set([...ANIMAL_CATEGORIES, ...Array.from(customCats)]));
  }, [products]);

  // Obtener items cárnicos y su stock del sistema (excluye artículos de almacén y varios)
  const chamberItems = useMemo(() => {
    return products
      .filter((p) => isMeatProduct(p))
      .map((p) => {
        const stockDoc = branchStock.find((s) => s.branchId === branchId && s.productCode === p.code);
        const systemStock = stockDoc ? Number(stockDoc.currentStock) || 0 : 0;
        const physicalCount = counts[p.code] !== undefined ? counts[p.code] : systemStock;
        const difference = Number((physicalCount - systemStock).toFixed(3));
        const differenceValue = Number((difference * p.price).toFixed(2));

        return {
          productCode: p.code,
          description: p.description,
          category: p.category,
          unitType: p.unitType,
          price: p.price,
          systemStock,
          physicalCount,
          difference,
          differenceValue,
        };
      });
  }, [products, branchStock, branchId, counts]);

  // Filtrado de la grilla
  const filteredChamberItems = useMemo(() => {
    return chamberItems.filter((item) => {
      if (filterCategory !== 'ALL' && item.category !== filterCategory) {
        return false;
      }
      if (onlyDifferences && item.difference === 0) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = item.productCode.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        if (!matchCode && !matchDesc) return false;
      }
      return true;
    });
  }, [chamberItems, filterCategory, onlyDifferences, searchQuery]);

  // Resumen del arqueo
  const totals = useMemo(() => {
    let totalSystemKg = 0;
    let totalPhysicalKg = 0;
    let totalDiffKg = 0;
    let totalDiffValue = 0;
    let diffCount = 0;

    chamberItems.forEach((it) => {
      totalSystemKg += it.systemStock;
      totalPhysicalKg += it.physicalCount;
      totalDiffKg += it.difference;
      totalDiffValue += it.differenceValue;
      if (it.difference !== 0) diffCount++;
    });

    return {
      totalSystemKg: Number(totalSystemKg.toFixed(3)),
      totalPhysicalKg: Number(totalPhysicalKg.toFixed(3)),
      totalDiffKg: Number(totalDiffKg.toFixed(3)),
      totalDiffValue: Number(totalDiffValue.toFixed(2)),
      diffCount,
      totalItems: chamberItems.length,
    };
  }, [chamberItems]);

  const handlePhysicalCountChange = (productCode: string, value: string) => {
    const valNum = Math.max(0, Number(value) || 0);
    setCountsByBranch((prev) => ({
      ...prev,
      [branchId]: {
        ...(prev[branchId] || {}),
        [productCode]: valNum,
      },
    }));
  };

  const handleResetToSystem = () => {
    setCountsByBranch((prev) => ({
      ...prev,
      [branchId]: {},
    }));
    setNotification({
      type: 'info',
      message: `Conteos físicos de ${branchId} restablecidos a los valores teóricos del sistema.`,
    });
  };

  const handleOpenConfirm = () => {
    setNotification(null);
    if (totals.diffCount === 0) {
      setNotification({
        type: 'info',
        message: `No se detectaron diferencias entre el conteo físico y el sistema en ${branchId}. Las existencias ya están conciliadas.`,
      });
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmApply = async () => {
    try {
      setIsApplying(true);
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const itemsForInventory: PhysicalInventoryItem[] = chamberItems.map((it) => ({
        productCode: it.productCode,
        description: it.description,
        category: it.category,
        unitType: it.unitType,
        systemStock: it.systemStock,
        physicalCount: it.physicalCount,
        difference: it.difference,
        unitPrice: it.price,
        differenceValue: it.differenceValue,
      }));

      const inventoryDoc: PhysicalInventory = {
        id: `INV-${Date.now()}`,
        inventoryNumber: `ACTA-${branchId.replace(' ', '')}-${dateStr.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`,
        branchId,
        chamber: branchId === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2',
        date: dateStr,
        time: timeStr,
        operator: operatorName,
        status: 'BORRADOR',
        totalDifferencesKg: totals.totalDiffKg,
        totalDifferencesValue: totals.totalDiffValue,
        items: itemsForInventory,
        notes: `Arqueo físico general de cortes en cámara ${branchId}`,
      };

      await applyPhysicalInventory(inventoryDoc, operatorName);

      // Limpiar los conteos ingresados para esta sucursal
      setCountsByBranch((prev) => ({
        ...prev,
        [branchId]: {},
      }));

      setShowConfirmModal(false);
      setNotification({
        type: 'success',
        message: `¡Inventario físico de ${branchId} conciliado con éxito! Se registraron los asientos y se actualizaron las existencias en cámara.`,
      });
    } catch (err: any) {
      console.error('Error al aplicar inventario:', err);
      setNotification({
        type: 'error',
        message: `Error al conciliar inventario: ${err.message || 'Error desconocido'}`,
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* PANEL SUPERIOR DE AUDITORÍA */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="win-panel p-3 border-l-4 border-l-blue-800 bg-white">
          <div className="text-xs text-gray-500 font-bold uppercase">Stock Teórico Sistema</div>
          <div className="text-xl font-bold font-mono text-gray-900">{formatKg(totals.totalSystemKg)}</div>
          <div className="text-[11px] text-gray-600">Total registrado en base de datos</div>
        </div>

        <div className="win-panel p-3 border-l-4 border-l-purple-800 bg-white">
          <div className="text-xs text-gray-500 font-bold uppercase">Conteo Físico Real</div>
          <div className="text-xl font-bold font-mono text-purple-900">{formatKg(totals.totalPhysicalKg)}</div>
          <div className="text-[11px] text-gray-600">Pesaje real en cámara de frío</div>
        </div>

        <div
          className={`win-panel p-3 border-l-4 bg-white ${
            totals.totalDiffKg === 0
              ? 'border-l-green-600'
              : totals.totalDiffKg > 0
              ? 'border-l-emerald-600'
              : 'border-l-red-600'
          }`}
        >
          <div className="text-xs text-gray-500 font-bold uppercase">Diferencia Neta de Kilos</div>
          <div
            className={`text-xl font-bold font-mono ${
              totals.totalDiffKg === 0
                ? 'text-green-700'
                : totals.totalDiffKg > 0
                ? 'text-emerald-700'
                : 'text-red-700'
            }`}
          >
            {totals.totalDiffKg > 0 ? '+' : ''}
            {formatKg(totals.totalDiffKg)}
          </div>
          <div className="text-[11px] text-gray-600">{totals.diffCount} cortes con diferencias</div>
        </div>

        <div
          className={`win-panel p-3 border-l-4 bg-white ${
            totals.totalDiffValue === 0
              ? 'border-l-green-600'
              : totals.totalDiffValue > 0
              ? 'border-l-emerald-600'
              : 'border-l-red-600'
          }`}
        >
          <div className="text-xs text-gray-500 font-bold uppercase">Impacto Económico Desvío</div>
          <div
            className={`text-xl font-bold font-mono ${
              totals.totalDiffValue === 0
                ? 'text-green-700'
                : totals.totalDiffValue > 0
                ? 'text-emerald-700'
                : 'text-red-700'
            }`}
          >
            {totals.totalDiffValue > 0 ? '+' : ''}
            {formatCurrency(totals.totalDiffValue)}
          </div>
          <div className="text-[11px] text-gray-600">Valorizado a precio venta vigente</div>
        </div>
      </div>

      {/* NOTIFICACIONES */}
      {notification && (
        <div
          className={`p-2.5 rounded border text-xs font-bold flex items-center justify-between shadow-sm ${
            notification.type === 'success'
              ? 'bg-green-100 border-green-400 text-green-900'
              : notification.type === 'error'
              ? 'bg-red-100 border-red-400 text-red-900'
              : 'bg-blue-100 border-blue-400 text-blue-900'
          }`}
        >
          <div className="flex items-center space-x-2">
            {notification.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-green-700 flex-shrink-0" />
            ) : notification.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0" />
            ) : (
              <FileCheck className="w-4 h-4 text-blue-700 flex-shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="win-button text-xs px-2 py-0.5 ml-2 cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* BARRA DE CONTROLES */}
      <div className="win-toolbar p-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Sucursal */}
          <div className="flex items-center space-x-1.5">
            <span className="font-bold text-gray-800">Cámara a Auditar:</span>
            <div className="flex rounded border border-gray-400 overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setBranchId('NECO 1');
                  setNotification(null);
                }}
                className={`px-3 py-1 font-bold cursor-pointer transition-colors ${
                  branchId === 'NECO 1' ? 'bg-[#002046] text-white shadow-inner' : 'bg-white text-black hover:bg-gray-100'
                }`}
              >
                NECO 1 (Central)
              </button>
              <button
                type="button"
                onClick={() => {
                  setBranchId('NECO 2');
                  setNotification(null);
                }}
                className={`px-3 py-1 font-bold cursor-pointer transition-colors border-l border-gray-300 ${
                  branchId === 'NECO 2' ? 'bg-[#002046] text-white shadow-inner' : 'bg-white text-black hover:bg-gray-100'
                }`}
              >
                NECO 2 (Sucursal)
              </button>
            </div>
          </div>

          {/* Filtro Categoría Animal */}
          <div className="flex items-center space-x-1">
            <span className="font-bold text-gray-800 text-[11px]">Categoría:</span>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-white border border-gray-400 px-2 py-1 text-xs font-semibold text-blue-900 shadow-sm"
            >
              <option value="ALL">Todas las Categorías</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Búsqueda */}
          <div className="relative w-56">
            <input
              type="text"
              className="win-input w-full pl-7 pr-2 py-1 text-xs text-black"
              placeholder="Buscar corte cárnico..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2 top-2" />
          </div>

          {/* Checkbox solo diferencias */}
          <label className="flex items-center space-x-1.5 cursor-pointer font-bold text-gray-700 ml-2">
            <input
              type="checkbox"
              checked={onlyDifferences}
              onChange={(e) => setOnlyDifferences(e.target.checked)}
              className="rounded"
            />
            <span>Mostrar sólo cortes con diferencia</span>
          </label>
        </div>

        {/* Acciones */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleResetToSystem}
            className="win-button py-1 px-2.5 flex items-center space-x-1 text-xs text-gray-700 cursor-pointer"
            title="Restablecer los valores contados a los teóricos del sistema"
          >
            <RotateCcw className="w-3.5 h-3.5 text-gray-600" />
            <span>Restablecer</span>
          </button>

          <button
            type="button"
            disabled={isApplying}
            onClick={handleOpenConfirm}
            className="win-button py-1.5 px-3.5 flex items-center space-x-1.5 text-xs font-bold text-white bg-green-700 hover:bg-green-800 disabled:opacity-50 cursor-pointer shadow"
            title="Ajustar y conciliar stock de cámara"
          >
            <CheckCircle className="w-4 h-4 text-white" />
            <span>{isApplying ? 'Conciliando...' : 'Aplicar y Conciliar Stock Físico'}</span>
          </button>
        </div>
      </div>

      {/* GRILLA DE CONTEO */}
      <div className="win-panel flex-1 overflow-auto bg-white">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-[#002046] text-white sticky top-0 z-10 select-none">
            <tr>
              <th className="p-2 border border-[#00152e] w-20 text-center">CÓDIGO</th>
              <th className="p-2 border border-[#00152e]">DESCRIPCIÓN DEL CORTE CÁRNICO</th>
              <th className="p-2 border border-[#00152e] w-36">CATEGORÍA</th>
              <th className="p-2 border border-[#00152e] w-14 text-center">UNIDAD</th>
              <th className="p-2 border border-[#00152e] w-28 text-right bg-[#002c61]">STOCK SISTEMA</th>
              <th className="p-2 border border-[#00152e] w-36 text-center bg-[#001e42]">
                CONTEO FÍSICO REAL
              </th>
              <th className="p-2 border border-[#00152e] w-28 text-right">DIFERENCIA (KG)</th>
              <th className="p-2 border border-[#00152e] w-24 text-right">PRECIO VIG.</th>
              <th className="p-2 border border-[#00152e] w-32 text-right">VALOR DIFERENCIA</th>
              <th className="p-2 border border-[#00152e] w-24 text-center">ESTADO</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 font-sans">
            {filteredChamberItems.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-gray-500 italic">
                  No se encontraron cortes de carne para auditar con los filtros aplicados.
                </td>
              </tr>
            ) : (
              filteredChamberItems.map((item, index) => {
                const hasDiff = item.difference !== 0;
                const isSurplus = item.difference > 0;

                return (
                  <tr
                    key={item.productCode}
                    className={`hover:bg-blue-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    } ${hasDiff ? (isSurplus ? 'bg-emerald-50/40' : 'bg-red-50/40') : ''}`}
                  >
                    <td className="p-2 text-center font-mono font-bold text-gray-700 border border-gray-200">
                      {item.productCode}
                    </td>
                    <td className="p-2 border border-gray-200 font-bold text-gray-900">
                      {item.description}
                    </td>
                    <td className="p-2 border border-gray-200 text-gray-600">
                      {item.category}
                    </td>
                    <td className="p-2 border border-gray-200 text-center font-bold text-gray-700">
                      {item.unitType}
                    </td>
                    <td className="p-2 border border-gray-200 text-right font-mono font-bold text-gray-800">
                      {formatKg(item.systemStock)}
                    </td>

                    {/* Input editable de conteo físico */}
                    <td className="p-2 border border-gray-200 text-center bg-blue-50/30">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        className="win-input w-28 px-2 py-1 text-xs font-mono font-bold text-center border-blue-600 bg-white"
                        value={item.physicalCount}
                        onChange={(e) => handlePhysicalCountChange(item.productCode, e.target.value)}
                      />
                    </td>

                    {/* Diferencia */}
                    <td
                      className={`p-2 border border-gray-200 text-right font-mono font-bold ${
                        !hasDiff
                          ? 'text-gray-400'
                          : isSurplus
                          ? 'text-emerald-700'
                          : 'text-red-700'
                      }`}
                    >
                      {hasDiff ? `${isSurplus ? '+' : ''}${formatKg(item.difference)}` : '0,000 Kg'}
                    </td>

                    <td className="p-2 border border-gray-200 text-right font-mono text-gray-700">
                      {formatCurrency(item.price)}
                    </td>

                    <td
                      className={`p-2 border border-gray-200 text-right font-mono font-bold ${
                        !hasDiff
                          ? 'text-gray-400'
                          : isSurplus
                          ? 'text-emerald-700'
                          : 'text-red-700'
                      }`}
                    >
                      {hasDiff ? `${isSurplus ? '+' : ''}${formatCurrency(item.differenceValue)}` : '$ 0,00'}
                    </td>

                    <td className="p-2 border border-gray-200 text-center">
                      {!hasDiff ? (
                        <span className="text-gray-500 font-bold text-[10px]">CONCILIADO</span>
                      ) : isSurplus ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          SOBRANTE (+)
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">
                          FALTANTE (-)
                        </span>
                      )}
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
          Cortes auditados: <strong>{filteredChamberItems.length}</strong> | Diferencias pendientes:{' '}
          <strong className={totals.diffCount > 0 ? 'text-amber-700 font-bold' : 'text-green-700'}>
            {totals.diffCount}
          </strong>
        </div>
        <div className="text-gray-500">
          Responsable de auditoría: <strong>{operatorName}</strong> | Sucursal: <strong>{branchId}</strong>
        </div>
      </div>

      {/* MODAL DE CONFIRMACIÓN DE CONCILIACIÓN */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="win-panel bg-[#d4d0c8] max-w-lg w-full shadow-2xl border-2 border-white">
            <div className="win-titlebar flex items-center justify-between p-1 select-none">
              <div className="flex items-center space-x-2 text-white font-bold text-xs pl-1">
                <CheckCircle className="w-4 h-4" />
                <span>Confirmar Conciliación de Stock Físico</span>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="win-button p-0.5 w-5 h-5 flex items-center justify-center text-xs cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 bg-white text-xs text-black">
              <div className="flex items-start space-x-3 p-3 bg-blue-50 border border-blue-200 rounded">
                <Scale className="w-6 h-6 text-blue-800 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-sm text-blue-900">
                    ¿Desea conciliar el stock físico de {branchId === 'NECO 1' ? 'NECO 1 (Cámara Central)' : 'NECO 2 (Sucursal)'}?
                  </p>
                  <p className="text-gray-600 text-[11px]">
                    Se generarán los asientos de ajuste en el sistema para igualar el stock teórico con el pesaje físico real registrado.
                  </p>
                </div>
              </div>

              <div className="border border-gray-300 rounded overflow-hidden">
                <table className="w-full text-xs">
                  <tbody>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <td className="p-2 font-bold text-gray-700">Cámara / Sucursal:</td>
                      <td className="p-2 font-bold text-right text-gray-900">{branchId}</td>
                    </tr>
                    <tr className="border-b border-gray-200">
                      <td className="p-2 font-bold text-gray-700">Cortes con diferencia a conciliar:</td>
                      <td className="p-2 font-mono font-bold text-right text-amber-800">
                        {totals.diffCount} cortes
                      </td>
                    </tr>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <td className="p-2 font-bold text-gray-700">Diferencia neta en kilos:</td>
                      <td className={`p-2 font-mono font-bold text-right ${totals.totalDiffKg > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {totals.totalDiffKg > 0 ? '+' : ''}{formatKg(totals.totalDiffKg)}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-200">
                      <td className="p-2 font-bold text-gray-700">Impacto económico estimado:</td>
                      <td className={`p-2 font-mono font-bold text-right ${totals.totalDiffValue > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {totals.totalDiffValue > 0 ? '+' : ''}{formatCurrency(totals.totalDiffValue)}
                      </td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="p-2 font-bold text-gray-700">Auditor responsable:</td>
                      <td className="p-2 text-right font-medium text-gray-800">{operatorName}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-3 bg-[#d4d0c8] border-t border-gray-400 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isApplying}
                className="win-button py-1.5 px-3 text-xs text-gray-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmApply}
                disabled={isApplying}
                className="win-button py-1.5 px-4 text-xs font-bold text-white bg-green-700 hover:bg-green-800 disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer shadow"
              >
                <CheckCircle className="w-4 h-4 text-white" />
                <span>{isApplying ? 'Conciliando Cámara...' : 'Confirmar y Conciliar Ahora'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
