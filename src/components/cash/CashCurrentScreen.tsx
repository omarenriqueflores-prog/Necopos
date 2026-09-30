import React, { useState } from 'react';
import {
  Landmark,
  PlusCircle,
  MinusCircle,
  DollarSign,
  History,
  Lock,
  Printer,
  FileCheck,
  AlertCircle,
  CheckCircle,
  Receipt,
  Trash2,
  Store,
} from 'lucide-react';
import { CashMovement, BranchConfig, UserAccount } from '../../types/pos';
import { formatCurrency, formatWeight } from '../../utils/scaleParser';
import { generateTicketHtml, printTicket } from '../../utils/ticketGenerator';
import { WindowsModal } from '../common/WindowsModal';
import { useDialog } from '../../context/DialogContext';
import { useFirebase } from '../../context/FirebaseContext';

interface CashCurrentScreenProps {
  currentBranch: BranchConfig;
  currentUser: UserAccount;
  cashOpen: boolean;
  movements: CashMovement[];
  onAddMovement: (mov: CashMovement) => void;
  onNavigateToClosure: () => void;
  onNavigateToOpening: () => void;
  onNavigateToHistory: () => void;
}

export const CashCurrentScreen: React.FC<CashCurrentScreenProps> = ({
  currentBranch,
  currentUser,
  cashOpen,
  movements,
  onAddMovement,
  onNavigateToClosure,
  onNavigateToOpening,
  onNavigateToHistory,
}) => {
  const { showAlert, showConfirm, showAdminAuth } = useDialog();
  const { 
    sales, 
    deleteSaleRecord, 
    deleteCashMovement,
    customers,
    employees,
    accountMovements,
    saveCustomer,
    saveEmployee,
    deleteAccountMovement
  } = useFirebase();

  const isAdminOrSuperadmin = currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN';
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(
    isAdminOrSuperadmin ? 'TODAS' : currentBranch.id
  );

  const [activeTab, setActiveTab] = useState<'MOVIMIENTOS' | 'VENTAS'>('MOVIMIENTOS');
  const [isMovementModalOpen, setIsMovementModalOpen] = useState<boolean>(false);
  const [movementType, setMovementType] = useState<'INGRESO' | 'RETIRO' | 'EGRESO'>('RETIRO');
  const [movementAmount, setMovementAmount] = useState<string>('');
  const [movementConcept, setMovementConcept] = useState<string>('');
  const [movementVoucher, setMovementVoucher] = useState<string>('');
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [selectedSaleForDetail, setSelectedSaleForDetail] = useState<any | null>(null);

  const handlePurgeCurrentShift = async () => {
    const isAuthorized = await showAdminAuth(
      `Vaciar ventas y movimientos activos en la caja actual (${selectedBranchFilter === 'TODAS' ? 'Todas las sucursales' : selectedBranchFilter}).\n\nSe eliminarán de la base de datos ${branchSales.length} ventas y ${branchMovements.length} movimientos de caja del turno actual.`,
      'AUTORIZACIÓN REQUERIDA - VACIAR CAJA ACTUAL'
    );

    if (!isAuthorized) return;

    try {
      let salesCount = 0;
      let movsCount = 0;

      for (const s of branchSales) {
        if (s.id) {
          await deleteSaleRecord(s.id);
          salesCount++;
        }
      }

      for (const m of branchMovements) {
        if (m.id) {
          await deleteCashMovement(m.id);
          movsCount++;
        }
      }

      await showAlert(`Caja actual vaciada correctamente. Se eliminaron ${salesCount} ventas y ${movsCount} movimientos de caja.`);
    } catch (err: any) {
      console.error('Error vaciando caja actual:', err);
      await showAlert(`Error al vaciar la caja actual: ${err?.message || 'Error en la base de datos'}`);
    }
  };

  const handlePrintTicket = (sale: any) => {
    const operatorName = sale.operatorEmail || currentUser.fullName;
    
    // Normalize sale data for the generator
    const ticketData = {
      ...sale,
      operatorName,
      createdAt: sale.createdAt || new Date().toISOString(),
      customerName: sale.customerName || 'CONSUMIDOR FINAL',
      customerDni: sale.customerDni || '--',
      customerVatCondition: sale.customerVatCondition || 'Consumidor Final',
    };

    const htmlContent = generateTicketHtml(ticketData, currentBranch);
    printTicket(htmlContent);
  };

  // Financial aggregates calculated from REAL sales (both branches accessible to Admins)
  const branchSales = (sales || []).filter((s: any) => {
    const sBranch = s.branchId || (s.pointOfSale === '0018' || s.ticketNumber?.startsWith('0018') ? 'NECO 2' : 'NECO 1');
    if (!isAdminOrSuperadmin) {
      return sBranch === currentBranch.id;
    }
    if (selectedBranchFilter === 'TODAS') return true;
    return sBranch === selectedBranchFilter;
  });

  const getSaleBreakdown = (s: any) => {
    const tot = Number(s.total) || 0;
    if (s.paymentMethod === 'PAGO_COMBINADO' && Array.isArray(s.combinedPayments)) {
      let cash = 0;
      let card = 0;
      let transfer = 0;
      let currentAcc = 0;
      for (const p of s.combinedPayments) {
        const amt = Number(p.amount) || 0;
        if (p.method === 'EFECTIVO') cash += amt;
        else if (p.method === 'TARJETA' || p.method === 'TARJETA_DEBITO' || p.method === 'TARJETA_CREDITO') card += amt;
        else if (p.method === 'TRANSFERENCIA' || p.method === 'QR_MERCADOPAGO' || p.method === 'QR') transfer += amt;
        else if (p.method === 'CUENTA_CORRIENTE') currentAcc += amt;
      }
      return { cash, card, transfer, currentAcc };
    }
    return {
      cash: s.paymentMethod === 'EFECTIVO' ? tot : 0,
      card: (s.paymentMethod === 'TARJETA' || s.paymentMethod === 'TARJETA_DEBITO' || s.paymentMethod === 'TARJETA_CREDITO') ? tot : 0,
      transfer: (s.paymentMethod === 'TRANSFERENCIA' || s.paymentMethod === 'QR_MERCADOPAGO' || s.paymentMethod === 'QR') ? tot : 0,
      currentAcc: s.paymentMethod === 'CUENTA_CORRIENTE' ? tot : 0,
    };
  };

  let cashSales = 0;
  let cardSales = 0;
  let transferSales = 0;
  let currentAccountSales = 0;

  for (const s of branchSales) {
    const b = getSaleBreakdown(s);
    cashSales += b.cash;
    cardSales += b.card;
    transferSales += b.transfer;
    currentAccountSales += b.currentAcc;
  }

  const totalSales = cashSales + cardSales + transferSales + currentAccountSales;

  // Filter movements belonging strictly to the selected branch
  const branchMovements = (movements || []).filter((m: any) => {
    const mBranch = m.branchId || (m.ticketNumber?.startsWith('0018') || m.concept?.includes('0018') || m.concept?.includes('NECO 2') ? 'NECO 2' : 'NECO 1');
    if (!isAdminOrSuperadmin) {
      return mBranch === currentBranch.id;
    }
    if (selectedBranchFilter === 'TODAS') return true;
    return mBranch === selectedBranchFilter;
  });

  // Real initial fund from movements of type 'FONDO'
  const initialFund = branchMovements
    .filter((m) => m.type === 'FONDO')
    .reduce((s, m) => s + (Number(m.amount) || 0), 0);

  // Movements calculation (exclude sale automatic entries from manual cash entries)
  const totalEntries = branchMovements
    .filter((m) => m.type === 'INGRESO' && !m.concept?.includes('Venta POS'))
    .reduce((s, m) => s + (Number(m.amount) || 0), 0);

  const totalWithdrawals = branchMovements
    .filter((m) => m.type === 'RETIRO')
    .reduce((s, m) => s + Math.abs(Number(m.amount) || 0), 0);

  const totalExpenses = branchMovements
    .filter((m) => m.type === 'EGRESO')
    .reduce((s, m) => s + Math.abs(Number(m.amount) || 0), 0);

  const theoreticalCash =
    initialFund + cashSales + totalEntries - totalWithdrawals - totalExpenses;

  const handleCreateMovement = async () => {
    const amt = parseFloat(movementAmount) || 0;
    if (amt <= 0) {
      await showAlert('Ingrese un importe válido.');
      return;
    }

    const newMov: CashMovement = {
      id: `CM-${Date.now()}`,
      date: new Date().toLocaleDateString('es-AR'),
      time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      createdAt: new Date().toISOString(),
      type: movementType,
      concept: movementConcept,
      voucher: movementVoucher,
      amount: movementType === 'INGRESO' ? amt : -amt,
      branchId: currentBranch.id,
    };

    onAddMovement(newMov);
    setIsMovementModalOpen(false);
    await showAlert(`Movimiento de caja registrado: ${movementType} de ${formatCurrency(amt)}.`);
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-80px)] select-none bg-[#ebeef2] text-[#181c1f] font-sans p-1">
      {/* Top Header & Sub-Navigation */}
      <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-3 h-3 rounded-full bg-[#1b365d] animate-pulse" />
          <span className="font-bold text-[#002046] text-[13px]">
            {selectedBranchFilter === 'TODAS'
              ? 'ARQUEO Y FACTURACIÓN EN VIVO — CONSOLIDADO TODAS LAS SUCURSALES (NECO 1 + NECO 2)'
              : `ARQUEO EN VIVO — SUCURSAL ${selectedBranchFilter} (CAJA ${selectedBranchFilter === 'NECO 2' ? '0018' : '0017'})`}
          </span>
          <span className="text-[11px] text-[#44474e]">
            Operador actual: <strong>{currentUser.fullName}</strong>
          </span>

          {/* Selector de Sucursal para Administradores y Superadmins */}
          {isAdminOrSuperadmin && (
            <div className="flex items-center gap-1.5 ml-2 bg-[#f0f4f9] px-2 py-0.5 border border-[#74777f]">
              <Store className="w-3.5 h-3.5 text-[#002046]" />
              <span className="font-bold text-[11px] text-[#002046]">Facturación:</span>
              <select
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="h-[22px] px-1 bg-white border border-[#74777f] font-bold text-[#002046] text-[11px] cursor-pointer"
              >
                <option value="TODAS">🏢 Ambas Sucursales (Consolidado)</option>
                <option value="NECO 1">📍 Sucursal NECO 1 (Central - PV 0017)</option>
                <option value="NECO 2">📍 Sucursal NECO 2 (Villa Saavedra - PV 0018)</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onNavigateToOpening}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-semibold cursor-pointer"
          >
            Apertura de Caja
          </button>
          <button
            onClick={() => {
              setMovementType('INGRESO');
              setMovementConcept('Ingreso de cambio extraordinario');
              setIsMovementModalOpen(true);
            }}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#002046] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <PlusCircle className="w-3 h-3 text-[#002046]" />
            <span>Ingreso de Dinero</span>
          </button>
          <button
            onClick={() => {
              setMovementType('RETIRO');
              setMovementConcept('Retiro parcial a caja fuerte');
              setIsMovementModalOpen(true);
            }}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#aa3531] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <MinusCircle className="w-3 h-3 text-[#aa3531]" />
            <span>Retiro Parcial</span>
          </button>
          <button
            onClick={() => {
              setMovementType('EGRESO');
              setMovementConcept('Pago de flete / insumos');
              setIsMovementModalOpen(true);
            }}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
          >
            <span>Pago de Gasto</span>
          </button>
          <button
            onClick={() => setIsAuditModalOpen(true)}
            className="h-[26px] px-2.5 bg-[#1b365d] hover:bg-[#284877] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <FileCheck className="w-3 h-3 text-[#aec7f7]" />
            <span>Arqueo Rápido</span>
          </button>
          <button
            onClick={onNavigateToClosure}
            className="h-[26px] px-3 bg-[#aa3531] hover:bg-[#891c1d] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-sm"
          >
            <Lock className="w-3 h-3" />
            <span>Cierre Z de Turno</span>
          </button>
          <button
            onClick={onNavigateToHistory}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
          >
            <History className="w-3 h-3 text-[#44474e]" />
            <span>Historial</span>
          </button>

          {isAdminOrSuperadmin && (
            <button
              onClick={handlePurgeCurrentShift}
              disabled={branchSales.length === 0 && branchMovements.length === 0}
              className="h-[26px] px-2.5 bg-[#ffdad6] hover:bg-[#ffb4ab] border border-[#ba1a1a] text-[#aa3531] text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40 shadow-2xs"
              title="Eliminar de la base de datos todas las ventas y movimientos registrados en el turno activo (Requiere clave de Administrador)"
            >
              <Trash2 className="w-3.5 h-3.5 text-[#aa3531]" />
              <span>Limpiar Ventas / Caja Actual</span>
            </button>
          )}
        </div>
      </div>

      {/* Operational KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-1 mb-1">
        <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm flex flex-col">
          <span className="text-[10px] font-bold text-[#44474e] uppercase">Total Vendido</span>
          <span className="font-mono text-[14px] font-black text-[#002046]">
            {formatCurrency(totalSales)}
          </span>
        </div>
        <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm flex flex-col">
          <span className="text-[10px] font-bold text-[#44474e] uppercase">Ventas Efectivo</span>
          <span className="font-mono text-[14px] font-black text-[#002046]">
            {formatCurrency(cashSales)}
          </span>
        </div>
        <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm flex flex-col">
          <span className="text-[10px] font-bold text-[#44474e] uppercase">Tarjetas Déb/Créd</span>
          <span className="font-mono text-[14px] font-bold text-[#181c1f]">
            {formatCurrency(cardSales)}
          </span>
        </div>
        <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm flex flex-col">
          <span className="text-[10px] font-bold text-[#44474e] uppercase">Transferencias QR</span>
          <span className="font-mono text-[14px] font-bold text-[#181c1f]">
            {formatCurrency(transferSales)}
          </span>
        </div>
        <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm flex flex-col">
          <span className="text-[10px] font-bold text-[#44474e] uppercase">Cuentas Corrientes</span>
          <span className="font-mono text-[14px] font-bold text-[#181c1f]">
            {formatCurrency(currentAccountSales)}
          </span>
        </div>
        <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm flex flex-col">
          <span className="text-[10px] font-bold text-[#44474e] uppercase">Fondo Inicial</span>
          <span className="font-mono text-[14px] font-semibold text-[#44474e]">
            {formatCurrency(initialFund)}
          </span>
        </div>
        <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm flex flex-col">
          <span className="text-[10px] font-bold text-[#44474e] uppercase">Retiros / Gastos</span>
          <span className="font-mono text-[14px] font-bold text-[#aa3531]">
            -{formatCurrency(totalWithdrawals + totalExpenses)}
          </span>
        </div>
        {/* THEORETICAL CASH HIGHLIGHT */}
        <div className="bg-[#002046] text-white p-2 border border-[#001b3d] shadow-sm flex flex-col justify-center">
          <span className="text-[9px] font-mono font-bold uppercase text-[#aec7f7]">
            EFECTIVO TEÓRICO:
          </span>
          <span className="font-mono text-[16px] font-black text-white">
            {formatCurrency(theoreticalCash)}
          </span>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center bg-[#e5e8ec] border border-[#74777f] border-b-0 px-1 pt-1 gap-1">
        <button
          onClick={() => setActiveTab('MOVIMIENTOS')}
          className={`h-[28px] px-4 text-[11px] font-bold border-t border-x border-[#74777f] flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'MOVIMIENTOS'
              ? 'bg-white text-[#002046] border-b-white -mb-px'
              : 'bg-[#d6d9de] text-[#44474e] hover:bg-[#e0e3e7]'
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>Libro de Movimientos ({branchMovements.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('VENTAS')}
          className={`h-[28px] px-4 text-[11px] font-bold border-t border-x border-[#74777f] flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'VENTAS'
              ? 'bg-white text-[#002046] border-b-white -mb-px'
              : 'bg-[#d6d9de] text-[#44474e] hover:bg-[#e0e3e7]'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Ventas y Tickets del Turno ({branchSales.length})</span>
        </button>
      </div>

      {/* Main Table Content */}
      <div className="bg-white border border-[#74777f] shadow-sm flex-1 flex flex-col overflow-hidden min-h-0">
        {activeTab === 'MOVIMIENTOS' ? (
          /* Live Table of Cash Movements */
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
              <div className="flex items-center gap-2">
                <Landmark className="w-3.5 h-3.5 text-[#aec7f7]" />
                <span>LIBRO DE ENTRADAS Y SALIDAS DE DINERO POR CAJA (TURNO EN CURSO)</span>
              </div>
              <div className="font-mono text-[11px] text-[#d4e3ff]">
                {branchMovements.length} MOVIMIENTOS REGISTRADOS
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-auto">
              <table className="w-full min-w-max text-left border-collapse select-none text-[12px] whitespace-nowrap">
                <thead className="sticky top-0 bg-[#e5e8ec] text-[#181c1f] font-bold text-[11px] border-b border-[#74777f]">
                  <tr className="h-[28px] whitespace-nowrap">
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">FECHA / HORA</th>
                    <th className="px-3 border-r border-[#c4c6cf] text-center whitespace-nowrap">TIPO</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">CONCEPTO / DESTINO</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">COMPROBANTE</th>
                    <th className="px-3 text-right bg-[#e0e3e7] border-r border-[#c4c6cf] whitespace-nowrap">IMPORTE ($)</th>
                    <th className="px-3 text-center whitespace-nowrap">ACCIÓN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebeef2]">
                  {branchMovements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-500 italic">
                        No se registran movimientos manuales en la caja actual.
                      </td>
                    </tr>
                  ) : (
                    branchMovements.map((m, idx) => {
                      const movDateStr = m.date
                        ? `${m.date} ${m.time || ''}`
                        : m.createdAt
                        ? `${new Date(m.createdAt).toLocaleDateString('es-AR')} ${m.time || ''}`
                        : `${new Date().toLocaleDateString('es-AR')} ${m.time || ''}`;
                      return (
                        <tr
                          key={m.id}
                          className={`h-[28px] whitespace-nowrap ${
                            idx % 2 === 0 ? 'bg-white hover:bg-[#e5e8ec]' : 'bg-[#f1f4f8] hover:bg-[#e5e8ec]'
                          }`}
                        >
                          <td className="px-3 font-mono text-[11px] border-r border-[#c4c6cf] text-[#44474e] whitespace-nowrap">
                            {movDateStr}
                          </td>
                        <td className="px-3 border-r border-[#c4c6cf] text-center whitespace-nowrap">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 font-bold whitespace-nowrap ${
                              m.type === 'FONDO'
                                ? 'bg-[#d6e3ff] text-[#002046]'
                                : m.type === 'INGRESO'
                                ? 'bg-[#d6e3ff] text-[#002046]'
                                : m.type === 'RETIRO'
                                ? 'bg-[#ffdad6] text-[#aa3531]'
                                : 'bg-[#ffdad6] text-[#aa3531]'
                            }`}
                          >
                            {m.type}
                          </span>
                        </td>
                        <td className="px-3 border-r border-[#c4c6cf] text-[12px] whitespace-nowrap">{m.concept}</td>
                        <td className="px-3 font-mono text-[11px] border-r border-[#c4c6cf] text-[#44474e] whitespace-nowrap">
                          {m.voucher}
                        </td>
                        <td
                          className={`px-3 text-right font-mono font-bold text-[12px] border-r border-[#c4c6cf] whitespace-nowrap ${
                            m.amount >= 0 ? 'text-[#002046]' : 'text-[#aa3531]'
                          }`}
                        >
                          {formatCurrency(m.amount)}
                        </td>
                        <td className="px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={async () => {
                              const authorized = await showAdminAuth(
                                `¿Desea eliminar este movimiento de caja?\n\n"${m.concept}" por ${formatCurrency(m.amount)}`,
                                'AUTORIZACIÓN DE ADMINISTRADOR'
                              );
                              if (authorized && m.id) {
                                await deleteCashMovement(m.id);

                                // Propagate deletion to Cuentas Corrientes if it was a linked employee/customer transaction
                                if (m.voucher) {
                                  const matchingAccMov = (accountMovements || []).find(
                                    (am) => am.voucher === m.voucher
                                  );
                                  if (matchingAccMov) {
                                    await deleteAccountMovement(matchingAccMov.id);

                                    // Recalculate balance for customer or employee
                                    if (matchingAccMov.partyType === 'CLIENTE') {
                                      const cust = (customers || []).find(c => c.code === matchingAccMov.partyCode);
                                      if (cust) {
                                        cust.currentBalance = Math.max(0, (cust.currentBalance || 0) - matchingAccMov.debit + matchingAccMov.credit);
                                        await saveCustomer(cust);
                                      }
                                    } else if (matchingAccMov.partyType === 'EMPLEADO') {
                                      const emp = (employees || []).find(e => e.code === matchingAccMov.partyCode);
                                      if (emp) {
                                        emp.currentBalance = Math.max(0, (emp.currentBalance || 0) - matchingAccMov.debit + matchingAccMov.credit);
                                        await saveEmployee(emp);
                                      }
                                    }
                                  }
                                }

                                await showAlert('Movimiento de caja eliminado correctamente.');
                              }
                            }}
                            title="Eliminar movimiento de caja (Requiere clave de Administrador)"
                            className="px-2 py-0.5 bg-[#ffdad6] hover:bg-[#ffb4ab] text-[#aa3531] text-[10px] font-bold cursor-pointer rounded-none border border-[#74777f] inline-flex items-center gap-0.5 whitespace-nowrap"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                            <span>Borrar</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Live Table of Shift Sales */
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
              <div className="flex items-center gap-2">
                <Receipt className="w-3.5 h-3.5 text-[#aec7f7]" />
                <span>
                  VENTAS Y RECIBOS REGISTRADOS EN ESTE TURNO {selectedBranchFilter === 'TODAS' ? '[CONSOLIDADO TODAS LAS SUCURSALES]' : `[SUCURSAL ${selectedBranchFilter}]`}
                </span>
              </div>
              <div className="font-mono text-[11px] text-[#d4e3ff]">
                TOTAL: {formatCurrency(totalSales)} ({branchSales.length} TICKETS)
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-auto">
              <table className="w-full min-w-max text-left border-collapse select-none text-[12px] whitespace-nowrap">
                <thead className="sticky top-0 bg-[#e5e8ec] text-[#181c1f] font-bold text-[11px] border-b border-[#74777f]">
                  <tr className="h-[28px] whitespace-nowrap">
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">FECHA / HORA</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">SUCURSAL</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">TICKET / N°</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">TIPO COMPROBANTE</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">CLIENTE</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">MEDIO DE PAGO</th>
                    <th className="px-3 border-r border-[#c4c6cf] text-center whitespace-nowrap">ITEMS</th>
                    <th className="px-3 text-right bg-[#e0e3e7] border-r border-[#c4c6cf] whitespace-nowrap">TOTAL ($)</th>
                    <th className="px-3 text-center whitespace-nowrap">ACCIÓN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebeef2]">
                  {branchSales.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-gray-500 italic">
                        No se registran ventas en el turno actual para la sucursal seleccionada.
                      </td>
                    </tr>
                  ) : (
                    branchSales.map((s: any, idx: number) => {
                      const dateStr = s.createdAt
                        ? `${new Date(s.createdAt).toLocaleDateString('es-AR')} ${new Date(s.createdAt).toLocaleTimeString('es-AR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`
                        : s.date
                        ? `${s.date} ${s.time || ''}`
                        : '--:--';
                      const sBranch = s.branchId || (s.pointOfSale === '0018' || s.ticketNumber?.startsWith('0018') ? 'NECO 2' : 'NECO 1');
                      return (
                        <tr
                          key={s.id || idx}
                          onDoubleClick={() => setSelectedSaleForDetail(s)}
                          title="Doble clic para ver el detalle de productos de este ticket"
                          className={`h-[28px] cursor-pointer whitespace-nowrap ${
                            idx % 2 === 0 ? 'bg-white hover:bg-[#e5e8ec]' : 'bg-[#f1f4f8] hover:bg-[#e5e8ec]'
                          }`}
                        >
                          <td className="px-3 font-mono text-[11px] border-r border-[#c4c6cf] text-[#44474e] whitespace-nowrap">
                            {dateStr}
                          </td>
                          <td className="px-3 border-r border-[#c4c6cf] font-bold text-[11px] whitespace-nowrap">
                            <span
                              className={`px-1.5 py-0.5 text-[10px] whitespace-nowrap font-bold ${
                                sBranch === 'NECO 1'
                                  ? 'bg-[#d6e3ff] text-[#002046]'
                                  : 'bg-[#e2f0d9] text-[#276a3c]'
                              }`}
                            >
                              {sBranch}
                            </span>
                          </td>
                          <td className="px-3 font-mono text-[11px] font-bold border-r border-[#c4c6cf] text-[#002046] whitespace-nowrap">
                            {s.ticketNumber || s.id}
                          </td>
                          <td className="px-3 border-r border-[#c4c6cf] text-[11px] whitespace-nowrap">
                            <span
                              className={`px-1.5 py-0.5 font-bold text-[9px] whitespace-nowrap ${
                                s.invoiceType === 'RECIBO_COMUN'
                                  ? 'bg-[#e0e3e7] text-[#181c1f]'
                                  : s.invoiceType === 'FACTURA_A'
                                  ? 'bg-[#d6e3ff] text-[#002046]'
                                  : 'bg-[#e2f0d9] text-[#276a3c]'
                              }`}
                            >
                              {s.invoiceType === 'RECIBO_COMUN'
                                ? 'RECIBO COMÚN'
                                : s.invoiceType || 'RECIBO'}
                            </span>
                          </td>
                          <td className="px-3 border-r border-[#c4c6cf] text-[11px] whitespace-nowrap">
                            {s.customerName || 'Consumidor Final'}
                          </td>
                          <td className="px-3 border-r border-[#c4c6cf] text-[11px] font-semibold whitespace-nowrap">
                            {s.paymentMethod ? s.paymentMethod.replace(/_/g, ' ') : 'EFECTIVO'}
                          </td>
                          <td className="px-3 border-r border-[#c4c6cf] text-center font-mono text-[11px] whitespace-nowrap">
                            {s.items?.length || 1}
                          </td>
                          <td className="px-3 text-right font-mono font-black text-[12px] text-[#002046] border-r border-[#c4c6cf] whitespace-nowrap">
                            {formatCurrency(Number(s.total) || 0)}
                          </td>
                          <td className="px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={async () => {
                                const authorized = await showAdminAuth(
                                  `¿Desea anular/eliminar la venta ${s.ticketNumber || s.id} por ${formatCurrency(Number(s.total) || 0)}?`,
                                  'AUTORIZACIÓN DE ADMINISTRADOR'
                                );
                                if (authorized && s.id) {
                                  await deleteSaleRecord(s.id);
                                  const matchingMov = (movements || []).find(
                                    (m) =>
                                      (s.ticketNumber && m.ticketNumber === s.ticketNumber) ||
                                      (m.concept?.includes('Venta POS') &&
                                        Math.abs(Number(m.amount) - Number(s.total)) < 0.01)
                                  );
                                  if (matchingMov?.id) {
                                    await deleteCashMovement(matchingMov.id);
                                  }

                                  // Propagate deletion to Cuentas Corrientes if it was a credit sale
                                  if (s.paymentMethod === 'CUENTA_CORRIENTE') {
                                    const matchingAccMov = (accountMovements || []).find(
                                      (am) => am.voucher === s.ticketNumber
                                    );
                                    if (matchingAccMov) {
                                      await deleteAccountMovement(matchingAccMov.id);

                                      // Recalculate balance for customer or employee
                                      if (matchingAccMov.partyType === 'CLIENTE') {
                                        const cust = (customers || []).find(c => c.code === matchingAccMov.partyCode);
                                        if (cust) {
                                          cust.currentBalance = Math.max(0, (cust.currentBalance || 0) - matchingAccMov.debit + matchingAccMov.credit);
                                          await saveCustomer(cust);
                                        }
                                      } else if (matchingAccMov.partyType === 'EMPLEADO') {
                                        const emp = (employees || []).find(e => e.code === matchingAccMov.partyCode);
                                        if (emp) {
                                          emp.currentBalance = Math.max(0, (emp.currentBalance || 0) - matchingAccMov.debit + matchingAccMov.credit);
                                          await saveEmployee(emp);
                                        }
                                      }
                                    }
                                  }

                                  await showAlert(`Venta ${s.ticketNumber || s.id} eliminada correctamente.`);
                                }
                              }}
                              title="Eliminar venta / comprobante (Requiere clave de Administrador)"
                              className="px-2 py-0.5 bg-[#ffdad6] hover:bg-[#ffb4ab] text-[#aa3531] text-[10px] font-bold cursor-pointer rounded-none border border-[#74777f] inline-flex items-center gap-0.5 whitespace-nowrap"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                              <span>Borrar</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Add Movement */}
      <WindowsModal
        isOpen={isMovementModalOpen}
        onClose={() => setIsMovementModalOpen(false)}
        title={`MOVIMIENTO MANUAL DE CAJA: ${movementType}`}
        maxWidth="max-w-md"
      >
        <div className="flex flex-col gap-2 p-1 text-[12px]">
          <div>
            <label className="font-bold text-[#181c1f] block mb-0.5">Tipo de Movimiento:</label>
            <select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as any)}
              className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
            >
              <option value="RETIRO">RETIRO PARCIAL (Seguridad / Buzón)</option>
              <option value="INGRESO">INGRESO DE EFECTIVO (Cambio adicional)</option>
              <option value="EGRESO">PAGO DE GASTO POR CAJA</option>
            </select>
          </div>

          <div>
            <label className="font-bold text-[#002046] block mb-0.5">Importe ($):</label>
            <input
              type="number"
              value={movementAmount}
              onChange={(e) => setMovementAmount(e.target.value)}
              className="w-full h-[28px] px-2 bg-white border border-[#74777f] font-mono text-[15px] font-black text-[#002046]"
              autoFocus
            />
          </div>

          <div>
            <label className="font-bold text-[#181c1f] block mb-0.5">N° Comprobante / Recibo:</label>
            <input
              type="text"
              value={movementVoucher}
              onChange={(e) => setMovementVoucher(e.target.value)}
              className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold"
            />
          </div>

          <div>
            <label className="font-bold text-[#181c1f] block mb-0.5">Concepto / Motivo:</label>
            <input
              type="text"
              value={movementConcept}
              onChange={(e) => setMovementConcept(e.target.value)}
              className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#c4c6cf]">
            <button
              onClick={() => setIsMovementModalOpen(false)}
              className="h-[26px] px-3 bg-[#ebeef2] border border-[#74777f] text-[11px] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreateMovement}
              className="h-[26px] px-4 bg-[#002046] text-white font-bold text-[11px] cursor-pointer"
            >
              Registrar Movimiento
            </button>
          </div>
        </div>
      </WindowsModal>

      {/* Modal: Quick Cash Count Audit */}
      <WindowsModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        title="ARQUEO RÁPIDO DE GAVETA DE CAJA"
        maxWidth="max-w-md"
      >
        <div className="flex flex-col gap-2 p-1 text-[12px]">
          <div className="bg-white p-2 border border-[#c4c6cf] flex flex-col">
            <span className="font-bold text-[#002046]">
              Saldo Teórico Esperado en Gaveta: {formatCurrency(theoreticalCash)}
            </span>
            <span className="text-[11px] text-[#44474e]">
              Controle billetes de $20.000, $10.000, $2.000 y cambio chico antes de emitir cierre Z.
            </span>
          </div>

          <div className="bg-[#e0e3e7] p-2 border border-[#c4c6cf] flex items-center justify-between">
            <span className="font-bold">Diferencia preliminar:</span>
            <span className="font-mono font-black text-[#002046]">$ 0,00 (CUADRADA)</span>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#c4c6cf]">
            <button
              onClick={() => setIsAuditModalOpen(false)}
              className="h-[26px] px-4 bg-[#002046] text-white font-bold text-[11px] cursor-pointer"
            >
              Aceptar
            </button>
          </div>
        </div>
      </WindowsModal>

      {/* Modal: Detalle de Productos del Recibo */}
      <WindowsModal
        isOpen={selectedSaleForDetail !== null}
        onClose={() => setSelectedSaleForDetail(null)}
        title={`Detalle de Comprobante / Recibo: ${selectedSaleForDetail?.ticketNumber || selectedSaleForDetail?.id || ''}`}
        icon={<Receipt className="w-4 h-4 text-[#aec7f7]" />}
        maxWidth="max-w-2xl"
      >
        {selectedSaleForDetail && (
          <div className="flex flex-col gap-3 p-1 text-black font-sans">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-2 bg-[#f0f2f5] p-3 border border-black/20 text-xs">
              <div>
                <strong>Nº Comprobante:</strong> {selectedSaleForDetail.ticketNumber || selectedSaleForDetail.id}
              </div>
              <div>
                <strong>Fecha/Hora:</strong>{' '}
                {selectedSaleForDetail.createdAt
                  ? new Date(selectedSaleForDetail.createdAt).toLocaleString('es-AR')
                  : '--'}
              </div>
              <div>
                <strong>Cliente:</strong> {selectedSaleForDetail.customerName || 'Consumidor Final'}
              </div>
              <div>
                <strong>Medio de Pago:</strong>{' '}
                <span className="font-bold text-[#002046]">
                  {selectedSaleForDetail.paymentMethod?.replace(/_/g, ' ') || 'EFECTIVO'}
                </span>
              </div>
              <div>
                <strong>Tipo de Ticket:</strong>{' '}
                {selectedSaleForDetail.invoiceType === 'RECIBO_COMUN'
                  ? 'RECIBO COMÚN / TICKET INTERNO'
                  : selectedSaleForDetail.invoiceType || 'RECIBO'}
              </div>
              <div>
                <strong>Sucursal:</strong> {selectedSaleForDetail.branchId || currentBranch.id}
              </div>
            </div>

            {/* Items Table */}
            <div className="border border-black/30 overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="bg-[#e5e8ec] border-b border-black/30 font-bold h-7">
                    <th className="px-2">Código</th>
                    <th className="px-2">Descripción</th>
                    <th className="px-2 text-right">Cant/Peso</th>
                    <th className="px-2 text-right">Precio Unit.</th>
                    <th className="px-2 text-right">Desc.</th>
                    <th className="px-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 bg-white">
                  {Array.isArray(selectedSaleForDetail.items) && selectedSaleForDetail.items.length > 0 ? (
                    selectedSaleForDetail.items.map((item: any, idx: number) => {
                      const qtyStr = item.weight
                        ? `${item.weight} Kg`
                        : item.quantity
                        ? `${item.quantity} Unid`
                        : '1 Unid';
                      return (
                        <tr key={item.id || idx} className="h-6 hover:bg-gray-50">
                          <td className="px-2 text-[#555]">{item.code || '--'}</td>
                          <td className="px-2 font-sans font-bold">{item.description}</td>
                          <td className="px-2 text-right font-bold">{qtyStr}</td>
                          <td className="px-2 text-right">{formatCurrency(item.unitPrice)}</td>
                          <td className="px-2 text-right text-[#aa3531]">
                            {item.discountPercent ? `${item.discountPercent}%` : '-'}
                          </td>
                          <td className="px-2 text-right font-bold text-[#002046]">
                            {formatCurrency(item.subtotal)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-gray-500 italic">
                        No hay detalles cargados para este comprobante.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary Totals */}
            <div className="flex justify-end font-mono">
              <div className="w-[260px] border border-black/20 p-2.5 bg-[#f0f2f5] text-right font-bold text-xs flex flex-col gap-1">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(selectedSaleForDetail.subtotal || selectedSaleForDetail.total)}</span>
                </div>
                {selectedSaleForDetail.employeeDiscountAmount > 0 && (
                  <div className="flex justify-between text-[#aa3531]">
                    <span>Desc. Empleado ({selectedSaleForDetail.employeeDiscountPercent}%):</span>
                    <span>-{formatCurrency(selectedSaleForDetail.employeeDiscountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black border-t border-black/30 pt-1 text-[#002046]">
                  <span>Total Facturado:</span>
                  <span>{formatCurrency(selectedSaleForDetail.total)}</span>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-black/10">
              <button
                type="button"
                onClick={() => handlePrintTicket(selectedSaleForDetail)}
                className="h-[30px] px-4 bg-[#2e7d32] hover:bg-[#1b5e20] text-white font-bold text-[11px] cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5 text-[#a3e2a6]" />
                <span>Reimprimir Ticket (80mm)</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedSaleForDetail(null)}
                className="h-[30px] px-4 bg-[#002046] hover:bg-[#1b365d] text-white font-bold text-[11px] cursor-pointer"
              >
                Entendido / Cerrar
              </button>
            </div>
          </div>
        )}
      </WindowsModal>
    </div>
  );
};
