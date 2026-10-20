import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Boxes,
  Save,
  CheckCircle,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { useFirebase } from '../../context/FirebaseContext';
import { isMeatProduct, formatKg } from '../../utils/stockHelper';

interface ChamberInitModalProps {
  onClose: () => void;
}

export const ChamberInitModal: React.FC<ChamberInitModalProps> = ({ onClose }) => {
  const { products, branchStock, initializeChamberStock, localUser, user } = useFirebase();

  const [branchId, setBranchId] = useState<'NECO 1' | 'NECO 2'>('NECO 1');
  const [stockByBranch, setStockByBranch] = useState<Record<string, Record<string, number>>>({
    'NECO 1': {},
    'NECO 2': {},
  });
  const [searchFilter, setSearchFilter] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const operatorName = localUser?.fullName || user?.displayName || localUser?.username || 'Encargado de Cámara';

  // Solo productos cárnicos (excluye bebidas, almacén, limpieza, carbón, huevos, fideos, etc.)
  const meatProducts = useMemo(() => {
    return products.filter((p) => isMeatProduct(p));
  }, [products]);

  // Inicializar estado con stock actual existente para cada sucursal si aún no se editó
  useEffect(() => {
    setStockByBranch((prev) => {
      const updated = { ...prev };
      (['NECO 1', 'NECO 2'] as const).forEach((b) => {
        if (!updated[b] || Object.keys(updated[b]).length === 0) {
          const initial: Record<string, number> = {};
          meatProducts.forEach((p) => {
            const found = branchStock.find((s) => s.branchId === b && s.productCode === p.code);
            initial[p.code] = found ? Number(found.currentStock) || 0 : 0;
          });
          updated[b] = initial;
        }
      });
      return updated;
    });
  }, [branchStock, meatProducts]);

  const currentStockValues = stockByBranch[branchId] || {};

  // Filtrado de la lista
  const filteredProducts = useMemo(() => {
    if (!searchFilter.trim()) return meatProducts;
    const q = searchFilter.toLowerCase().trim();
    return meatProducts.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        (p.scalePlu && p.scalePlu.toString().toLowerCase().includes(q)) ||
        p.description.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
    );
  }, [meatProducts, searchFilter]);

  const handleStockChange = (code: string, val: string) => {
    const num = Math.max(0, Number(val) || 0);
    setStockByBranch((prev) => ({
      ...prev,
      [branchId]: {
        ...(prev[branchId] || {}),
        [code]: num,
      },
    }));
  };

  // Total de kilos a asentar para la cámara activa
  const totalKilos = useMemo(() => {
    let sum = 0;
    Object.values(currentStockValues).forEach((v) => (sum += Number(v) || 0));
    return Number(sum.toFixed(3));
  }, [currentStockValues]);

  const handleSaveConfirmed = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const itemsToInit = meatProducts.map((p) => ({
        productCode: p.code,
        stock: currentStockValues[p.code] !== undefined ? currentStockValues[p.code] : 0,
        minStock: 20,
      }));

      await initializeChamberStock(branchId, itemsToInit, operatorName);
      onClose();
    } catch (err: any) {
      console.error('Error al inicializar stock:', err);
      setErrorMessage(`Error al inicializar stock: ${err.message || 'Ocurrió un error inesperado'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="win-panel bg-[#d4d0c8] max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border-2 border-white">
        {/* TITLE BAR */}
        <div className="win-titlebar flex items-center justify-between p-1 select-none">
          <div className="flex items-center space-x-2 text-white font-bold text-xs pl-1">
            <Boxes className="w-4 h-4" />
            <span>Apertura / Inicialización de Stock de Cámaras Frigoríficas</span>
          </div>
          <button onClick={onClose} className="win-button p-0.5 w-5 h-5 flex items-center justify-center text-xs">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* CONTENIDO */}
        <div className="p-4 overflow-auto flex-1 space-y-3 text-xs">
          {errorMessage && (
            <div className="p-3 bg-red-100 border border-red-400 text-red-800 rounded flex items-center space-x-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="p-3 bg-white border border-gray-400 rounded flex flex-wrap items-center justify-between gap-3">
            <div>
              <label className="block font-bold text-gray-800 mb-1">Cámara a Inicializar:</label>
              <div className="flex rounded border border-gray-400 overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setBranchId('NECO 1');
                    setShowConfirm(false);
                  }}
                  className={`px-4 py-1.5 font-bold text-xs cursor-pointer transition-colors ${
                    branchId === 'NECO 1' ? 'bg-[#002046] text-white shadow-sm' : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  NECO 1 (Casa Central)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBranchId('NECO 2');
                    setShowConfirm(false);
                  }}
                  className={`px-4 py-1.5 font-bold text-xs cursor-pointer transition-colors border-l border-gray-300 ${
                    branchId === 'NECO 2' ? 'bg-[#002046] text-white shadow-sm' : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  NECO 2 (Sucursal)
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="font-mono text-gray-800 bg-gray-100 px-3 py-1.5 rounded border border-gray-300">
                Total Kilos a Asentar: <strong className="text-blue-900 text-sm">{formatKg(totalKilos)}</strong>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="relative w-64">
              <input
                type="text"
                className="win-input w-full pl-7 pr-2 py-1 text-xs text-black"
                placeholder="Buscar corte cárnico..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-2" />
            </div>
            <div className="text-xs text-gray-600">
              Mostrando <strong>{filteredProducts.length}</strong> cortes cárnicos
            </div>
          </div>

          {/* TABLA EDITABLE */}
          <div className="border border-gray-400 rounded bg-white overflow-hidden max-h-96 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#002046] text-white sticky top-0">
                <tr>
                  <th className="p-2 border-b border-gray-300 w-20 text-center">PLU</th>
                  <th className="p-2 border-b border-gray-300 w-20 text-center">CÓDIGO</th>
                  <th className="p-2 border-b border-gray-300">CORTE DE CARNE</th>
                  <th className="p-2 border-b border-gray-300 w-32">CATEGORÍA</th>
                  <th className="p-2 border-b border-gray-300 w-16 text-center">UNIDAD</th>
                  <th className="p-2 border-b border-gray-300 w-36 text-center bg-[#002c61]">
                    STOCK INICIAL (KG/UNID)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProducts.map((p) => (
                  <tr key={p.code} className="hover:bg-blue-50">
                    <td className="p-2 text-center font-mono font-bold text-blue-900 bg-blue-50/40">
                      {p.scalePlu || p.code}
                    </td>
                    <td className="p-2 text-center font-mono font-bold text-gray-700">{p.code}</td>
                    <td className="p-2 font-bold text-gray-900">{p.description}</td>
                    <td className="p-2 text-gray-600">{p.category}</td>
                    <td className="p-2 text-center font-bold text-gray-700">{p.unitType}</td>
                    <td className="p-2 text-center bg-blue-50/30">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        className="win-input w-28 px-2 py-1 text-xs font-mono font-bold text-center border-blue-600 text-black bg-white"
                        value={currentStockValues[p.code] !== undefined ? currentStockValues[p.code] : 0}
                        onChange={(e) => handleStockChange(p.code, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* DIÁLOGO / CONFIRMACIÓN DE ASENTAMIENTO */}
        {showConfirm ? (
          <div className="p-3 bg-amber-50 border-t-2 border-amber-400 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center space-x-2 text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <strong className="block text-xs">¿Confirmar Asentamiento de Stock en {branchId}?</strong>
                <span className="text-[11px] text-gray-700">
                  Se inicializarán <strong>{meatProducts.length}</strong> cortes cárnicos con un peso total de{' '}
                  <strong>{formatKg(totalKilos)}</strong>.
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={isSubmitting}
                className="win-button py-1.5 px-3 text-xs text-gray-800 cursor-pointer"
              >
                Volver a Revisar
              </button>
              <button
                type="button"
                onClick={handleSaveConfirmed}
                disabled={isSubmitting}
                className="win-button py-1.5 px-4 text-xs font-bold text-white bg-green-700 hover:bg-green-800 disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4 text-white" />
                <span>{isSubmitting ? 'Asentando...' : 'Sí, Asentar Stock de Cámara'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-[#d4d0c8] border-t border-gray-400 flex items-center justify-between">
            <div className="text-xs text-gray-700 font-medium">
              Operador: <strong>{operatorName}</strong> | Sucursal: <strong className="text-blue-900">{branchId}</strong>
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={onClose} className="win-button py-1.5 px-3 text-xs text-gray-800 cursor-pointer">
                Cancelar
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={isSubmitting}
                className="win-button py-1.5 px-4 text-xs font-bold text-white bg-[#002046] hover:bg-[#002c61] disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer shadow"
              >
                <Save className="w-4 h-4 text-white" />
                <span>Asentar Stock de Cámara</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
