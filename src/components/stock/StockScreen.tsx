import React, { useState } from 'react';
import {
  Boxes,
  ArrowRightLeft,
  Clock,
  TrendingDown,
  ClipboardCheck,
  DollarSign,
  Truck,
  Printer,
  X,
  Beef,
  FileCheck,
} from 'lucide-react';
import { ChamberStockTab } from './ChamberStockTab';
import { StockMovementsTab } from './StockMovementsTab';
import { StockTransfersTab } from './StockTransfersTab';
import { StockAdjustmentsTab } from './StockAdjustmentsTab';
import { PhysicalInventoryTab } from './PhysicalInventoryTab';
import { StockValorizationTab } from './StockValorizationTab';
import { MeatDeboningTab } from './MeatDeboningTab';
import { MeatReconciliationTab } from './MeatReconciliationTab';
import { MeatReceptionTab } from './MeatReceptionTab';
import { NewTransferModal } from './NewTransferModal';
import { ChamberInitModal } from './ChamberInitModal';
import { Product, StockTransfer } from '../../types/pos';
import { printTransferRemito, formatKg, formatCurrency } from '../../utils/stockHelper';
import { useFirebase } from '../../context/FirebaseContext';

type StockSubTab =
  | 'EXISTENCIAS'
  | 'RECEPCION'
  | 'DESPOSTE'
  | 'CONCILIACION_VENTAS'
  | 'MOVIMIENTOS'
  | 'TRANSFERENCIAS'
  | 'AJUSTES_MERMAS'
  | 'INVENTARIO_FISICO'
  | 'VALORIZACION';

export const StockScreen: React.FC = () => {
  const { branchConfigs } = useFirebase();
  const [activeTab, setActiveTab] = useState<StockSubTab>('EXISTENCIAS');

  // Modals state
  const [showNewTransferModal, setShowNewTransferModal] = useState(false);
  const [transferDefaultProduct, setTransferDefaultProduct] = useState<Product | null>(null);
  const [showInitModal, setShowInitModal] = useState(false);

  // Quick adjustment preselection
  const [quickAdjProduct, setQuickAdjProduct] = useState<Product | null>(null);
  const [quickAdjBranch, setQuickAdjBranch] = useState<'NECO 1' | 'NECO 2'>('NECO 1');

  // Transfer detail modal
  const [viewingTransfer, setViewingTransfer] = useState<StockTransfer | null>(null);

  const handleOpenNewTransfer = (prod?: Product) => {
    setTransferDefaultProduct(prod || null);
    setShowNewTransferModal(true);
  };

  const handleOpenQuickAdjustment = (product: Product, branchId: 'NECO 1' | 'NECO 2') => {
    setQuickAdjProduct(product);
    setQuickAdjBranch(branchId);
    setActiveTab('AJUSTES_MERMAS');
  };

  return (
    <div className="flex flex-col h-full bg-[#d4d0c8] p-2 space-y-2 select-none overflow-hidden">
      {/* WINDOW TITLE BAR */}
      <div className="bg-white border border-[#b8bcc4] flex items-center justify-between p-2 shadow-sm text-black">
        <div className="flex items-center space-x-2 text-black font-bold text-[12px] pl-1">
          <Boxes className="w-4 h-4 text-black" />
          <span className="text-black font-bold">NECO POS — GESTIÓN PROFESIONAL DE STOCK E INVENTARIO EN CÁMARAS</span>
        </div>
        <div className="text-[11px] text-black font-bold pr-2">
          Control Frigorífico Multi-Sucursal (NECO 1 ⇄ NECO 2)
        </div>
      </div>

      {/* PESTAÑAS PRINCIPALES DEL MÓDULO */}
      <div className="flex space-x-1 border-b border-gray-400 px-1 pt-1 text-xs">
        <button
          onClick={() => setActiveTab('EXISTENCIAS')}
          className={`px-3 py-1.5 font-bold flex items-center space-x-1.5 border-t border-l border-r rounded-t ${
            activeTab === 'EXISTENCIAS'
              ? 'bg-white text-blue-900 border-gray-400 -mb-px pb-2 shadow-sm'
              : 'bg-[#c0c0c0] text-black border-gray-400 hover:bg-gray-100'
          }`}
        >
          <Boxes className="w-3.5 h-3.5 text-blue-700" />
          <span>Existencias en Cámaras</span>
        </button>

        <button
          onClick={() => setActiveTab('MOVIMIENTOS')}
          className={`px-3 py-1.5 font-bold flex items-center space-x-1.5 border-t border-l border-r rounded-t ${
            activeTab === 'MOVIMIENTOS'
              ? 'bg-white text-blue-900 border-gray-400 -mb-px pb-2 shadow-sm'
              : 'bg-[#c0c0c0] text-black border-gray-400 hover:bg-gray-100'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-indigo-700" />
          <span>Kardex / Movimientos</span>
        </button>

        <button
          onClick={() => setActiveTab('RECEPCION')}
          className={`px-3 py-1.5 font-bold flex items-center space-x-1.5 border-t border-l border-r rounded-t ${
            activeTab === 'RECEPCION'
              ? 'bg-white text-red-900 border-gray-400 -mb-px pb-2 shadow-sm'
              : 'bg-[#c0c0c0] text-black border-gray-400 hover:bg-gray-100'
          }`}
        >
          <Truck className="w-3.5 h-3.5 text-red-700" />
          <span>Recepción de Medias Reses</span>
        </button>

        <button
          onClick={() => setActiveTab('DESPOSTE')}
          className={`px-3 py-1.5 font-bold flex items-center space-x-1.5 border-t border-l border-r rounded-t ${
            activeTab === 'DESPOSTE'
              ? 'bg-white text-red-900 border-gray-400 -mb-px pb-2 shadow-sm'
              : 'bg-[#c0c0c0] text-black border-gray-400 hover:bg-gray-100'
          }`}
        >
          <Beef className="w-3.5 h-3.5 text-amber-700" />
          <span>Desposte & Rendimientos</span>
        </button>

        <button
          onClick={() => setActiveTab('CONCILIACION_VENTAS')}
          className={`px-3 py-1.5 font-bold flex items-center space-x-1.5 border-t border-l border-r rounded-t ${
            activeTab === 'CONCILIACION_VENTAS'
              ? 'bg-white text-emerald-900 border-gray-400 -mb-px pb-2 shadow-sm'
              : 'bg-[#c0c0c0] text-black border-gray-400 hover:bg-gray-100'
          }`}
        >
          <FileCheck className="w-3.5 h-3.5 text-emerald-700" />
          <span>Conciliación Prod. vs Ventas</span>
        </button>

        <button
          onClick={() => setActiveTab('TRANSFERENCIAS')}
          className={`px-3 py-1.5 font-bold flex items-center space-x-1.5 border-t border-l border-r rounded-t ${
            activeTab === 'TRANSFERENCIAS'
              ? 'bg-white text-blue-900 border-gray-400 -mb-px pb-2 shadow-sm'
              : 'bg-[#c0c0c0] text-black border-gray-400 hover:bg-gray-100'
          }`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5 text-purple-700" />
          <span>Traslados Inter-Sucursal</span>
        </button>

        <button
          onClick={() => setActiveTab('AJUSTES_MERMAS')}
          className={`px-3 py-1.5 font-bold flex items-center space-x-1.5 border-t border-l border-r rounded-t ${
            activeTab === 'AJUSTES_MERMAS'
              ? 'bg-white text-blue-900 border-gray-400 -mb-px pb-2 shadow-sm'
              : 'bg-[#c0c0c0] text-black border-gray-400 hover:bg-gray-100'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5 text-amber-700" />
          <span>Mermas y Ajustes</span>
        </button>

        <button
          onClick={() => setActiveTab('INVENTARIO_FISICO')}
          className={`px-3 py-1.5 font-bold flex items-center space-x-1.5 border-t border-l border-r rounded-t ${
            activeTab === 'INVENTARIO_FISICO'
              ? 'bg-white text-blue-900 border-gray-400 -mb-px pb-2 shadow-sm'
              : 'bg-[#c0c0c0] text-black border-gray-400 hover:bg-gray-100'
          }`}
        >
          <ClipboardCheck className="w-3.5 h-3.5 text-green-700" />
          <span>Arqueo Físico de Cámara</span>
        </button>

        <button
          onClick={() => setActiveTab('VALORIZACION')}
          className={`px-3 py-1.5 font-bold flex items-center space-x-1.5 border-t border-l border-r rounded-t ${
            activeTab === 'VALORIZACION'
              ? 'bg-white text-green-900 border-gray-400 -mb-px pb-2 shadow-sm'
              : 'bg-[#c0c0c0] text-black border-gray-400 hover:bg-gray-100'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5 text-green-700" />
          <span>Valorización Comercial Cárnica</span>
        </button>
      </div>

      {/* CONTENIDO DE LA PESTAÑA ACTIVA */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'EXISTENCIAS' && (
          <ChamberStockTab
            onOpenNewTransfer={handleOpenNewTransfer}
            onOpenInitModal={() => setShowInitModal(true)}
            onOpenQuickAdjustment={handleOpenQuickAdjustment}
          />
        )}

        {activeTab === 'RECEPCION' && <MeatReceptionTab />}

        {activeTab === 'MOVIMIENTOS' && <StockMovementsTab />}

        {activeTab === 'DESPOSTE' && <MeatDeboningTab />}

        {activeTab === 'CONCILIACION_VENTAS' && <MeatReconciliationTab />}

        {activeTab === 'TRANSFERENCIAS' && (
          <StockTransfersTab
            onOpenNewTransfer={() => handleOpenNewTransfer()}
            onViewTransferDetail={(transfer) => setViewingTransfer(transfer)}
          />
        )}

        {activeTab === 'AJUSTES_MERMAS' && (
          <StockAdjustmentsTab
            initialProduct={quickAdjProduct}
            initialBranch={quickAdjBranch}
          />
        )}

        {activeTab === 'INVENTARIO_FISICO' && <PhysicalInventoryTab />}

        {activeTab === 'VALORIZACION' && <StockValorizationTab />}
      </div>

      {/* MODAL NUEVA TRANSFERENCIA */}
      {showNewTransferModal && (
        <NewTransferModal
          onClose={() => {
            setShowNewTransferModal(false);
            setTransferDefaultProduct(null);
          }}
          defaultProduct={transferDefaultProduct}
        />
      )}

      {/* MODAL APERTURA DE STOCK */}
      {showInitModal && <ChamberInitModal onClose={() => setShowInitModal(false)} />}

      {/* MODAL VER DETALLE TRASLADO */}
      {viewingTransfer && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="win-panel bg-[#d4d0c8] max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border-2 border-white">
            <div className="win-titlebar flex items-center justify-between p-1 select-none">
              <div className="flex items-center space-x-2 text-white font-bold text-xs pl-1">
                <Truck className="w-4 h-4" />
                <span>Detalle de Remito de Traslado — {viewingTransfer.transferNumber}</span>
              </div>
              <button
                onClick={() => setViewingTransfer(null)}
                className="win-button p-0.5 w-5 h-5 flex items-center justify-center text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 overflow-auto flex-1 space-y-3 text-xs bg-white">
              <div className="p-3 bg-gray-50 border border-gray-300 rounded grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <div className="text-[10px] text-gray-500">Origen</div>
                  <div className="font-bold text-blue-900">{viewingTransfer.originBranch}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500">Destino</div>
                  <div className="font-bold text-purple-900">{viewingTransfer.destinationBranch}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500">Estado</div>
                  <div className="font-bold">{viewingTransfer.status}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500">Fecha</div>
                  <div className="font-mono">{viewingTransfer.createdAt}</div>
                </div>
              </div>

              {viewingTransfer.driverName && (
                <div className="text-xs text-gray-700">
                  <strong>Transportista:</strong> {viewingTransfer.driverName}{' '}
                  {viewingTransfer.vehiclePlate ? `| Patente: ${viewingTransfer.vehiclePlate}` : ''}
                </div>
              )}

              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#002046] text-white">
                  <tr>
                    <th className="p-1.5 border border-[#00152e] w-16 text-center">CÓDIGO</th>
                    <th className="p-1.5 border border-[#00152e]">CORTE</th>
                    <th className="p-1.5 border border-[#00152e] w-24">CATEGORÍA</th>
                    <th className="p-1.5 border border-[#00152e] w-14 text-center">UNIDAD</th>
                    <th className="p-1.5 border border-[#00152e] w-24 text-right">CANTIDAD</th>
                    <th className="p-1.5 border border-[#00152e] w-24 text-right">PRECIO</th>
                    <th className="p-1.5 border border-[#00152e] w-28 text-right">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {viewingTransfer.items.map((it) => (
                    <tr key={it.productCode}>
                      <td className="p-1.5 border border-gray-200 font-mono text-center">{it.productCode}</td>
                      <td className="p-1.5 border border-gray-200 font-bold">{it.description}</td>
                      <td className="p-1.5 border border-gray-200 text-gray-600">{it.category}</td>
                      <td className="p-1.5 border border-gray-200 text-center">{it.unitType}</td>
                      <td className="p-1.5 border border-gray-200 text-right font-mono font-bold">
                        {it.quantity} {it.unitType}
                      </td>
                      <td className="p-1.5 border border-gray-200 text-right font-mono">
                        {formatCurrency(it.price)}
                      </td>
                      <td className="p-1.5 border border-gray-200 text-right font-mono font-bold">
                        {formatCurrency(it.totalValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 font-bold">
                  <tr>
                    <td colSpan={4} className="p-2 text-right">TOTALES:</td>
                    <td className="p-2 text-right font-mono text-blue-900">{formatKg(viewingTransfer.totalKilos)}</td>
                    <td></td>
                    <td className="p-2 text-right font-mono text-green-900">{formatCurrency(viewingTransfer.totalCommercialValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="p-3 bg-[#d4d0c8] border-t border-gray-400 flex justify-between items-center">
              <button
                onClick={() => printTransferRemito(viewingTransfer, branchConfigs)}
                className="win-button py-1 px-3 text-xs font-bold text-gray-800 flex items-center space-x-1"
              >
                <Printer className="w-3.5 h-3.5 text-blue-700" />
                <span>Imprimir Remito Oficial</span>
              </button>
              <button
                onClick={() => setViewingTransfer(null)}
                className="win-button py-1 px-3 text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
