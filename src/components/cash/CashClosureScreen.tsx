import React, { useState } from 'react';
import {
  Lock,
  Printer,
  ArrowLeft,
  Check,
  AlertTriangle,
  CreditCard,
  Smartphone,
  Users,
  Banknote,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Layers,
  FileText,
  DollarSign,
  Landmark,
  QrCode,
  Clock,
} from 'lucide-react';
import { CashClosure, CashMovement, BranchConfig, UserAccount } from '../../types/pos';
import { formatCurrency } from '../../utils/scaleParser';
import { useDialog } from '../../context/DialogContext';
import { useFirebase } from '../../context/FirebaseContext';
import { getCurrentShiftStatus } from '../../utils/scheduleHelper';
import { printClosureTicket, printSummaryXTicket } from '../../utils/closureTicketGenerator';

interface CashClosureScreenProps {
  currentBranch: BranchConfig;
  currentUser: UserAccount;
  movements?: CashMovement[];
  onConfirmClosure: (closure: CashClosure) => void;
  onCancel: () => void;
}

export const CashClosureScreen: React.FC<CashClosureScreenProps> = ({
  currentBranch,
  currentUser,
  movements = [],
  onConfirmClosure,
  onCancel,
}) => {
  const { showAlert, showConfirm } = useDialog();
  const { sales, cashClosures } = useFirebase();
  const shiftStatus = getCurrentShiftStatus();
  const [selectedShift, setSelectedShift] = useState<string>(
    shiftStatus.isSunday ? 'TURNO MAÑANA' : shiftStatus.recommendedShift === 'TARDE' ? 'TURNO TARDE' : 'TURNO MAÑANA'
  );

  // Robust date parser for es-AR locale strings and ISO dates
  const parseLocalesDate = (dateStr: string | any): Date => {
    if (!dateStr) return new Date(0);
    if (dateStr instanceof Date) return dateStr;
    const clean = String(dateStr).replace(/,/g, '').trim();
    if (clean.includes('T')) {
      const parsed = new Date(clean);
      return isNaN(parsed.getTime()) ? new Date(0) : parsed;
    }

    const isPM = /p\.?\s*m\.?/i.test(clean);
    const isAM = /a\.?\s*m\.?/i.test(clean);

    const parts = clean.split(' ');
    const dateParts = parts[0].split('/');
    if (dateParts.length === 3) {
      const day = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1;
      const year = parseInt(dateParts[2], 10);
      let hours = 0, minutes = 0, seconds = 0;
      if (parts[1]) {
        const timeParts = parts[1].split(':');
        hours = parseInt(timeParts[0], 10) || 0;
        minutes = parseInt(timeParts[1], 10) || 0;
        seconds = parseInt(timeParts[2], 10) || 0;
      }

      if (isPM && hours < 12) {
        hours += 12;
      } else if (isAM && hours === 12) {
        hours = 0;
      } else if (!isPM && !isAM && hours > 0 && hours < 8) {
        // Heuristic for retail closures: 1:00-7:00 without AM/PM is PM (13:00-19:00)
        hours += 12;
      }

      return new Date(year, month, day, hours, minutes, seconds);
    }
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date(0) : parsed;
  };

  // Current shift financial totals calculated from real sales in current branch
  const lastClosure = (cashClosures || [])
    .filter((c: any) => c.branch === currentBranch.id || c.branchId === currentBranch.id)
    .sort((a: any, b: any) => {
      const timeA = a.createdAt || parseLocalesDate(a.date).getTime();
      const timeB = b.createdAt || parseLocalesDate(b.date).getTime();
      return timeB - timeA;
    })[0];

  const lastClosureDate = lastClosure 
    ? (lastClosure.createdAt || parseLocalesDate(lastClosure.date).getTime()) 
    : 0;

  const getMovementTimestamp = (m: any) => {
    if (m.id && m.id.startsWith('CM-')) {
      const ts = parseInt(m.id.split('-')[1], 10);
      if (!isNaN(ts)) return ts;
    }
    return 0;
  };

  const getSaleTimestamp = (s: any) => {
    if (s.createdAt) {
      const t = new Date(s.createdAt).getTime();
      if (!isNaN(t)) return t;
    }
    if (s.date) {
      const t = new Date(s.date).getTime();
      if (!isNaN(t)) return t;
    }
    if (s.id && s.id.startsWith('SALE-')) {
      const ts = parseInt(s.id.split('-')[1], 10);
      if (!isNaN(ts)) return ts;
    }
    return 0;
  };

  // Filter movements belonging strictly to the current shift (after the last closure)
  const shiftMovements = (movements || []).filter((m: any) => {
    const mBranch = m.branchId || (m.ticketNumber?.startsWith('0018') || m.concept?.includes('0018') || m.concept?.includes('NECO 2') ? 'NECO 2' : 'NECO 1');
    if (mBranch !== currentBranch.id) return false;
    const mTimestamp = getMovementTimestamp(m);
    return mTimestamp > lastClosureDate;
  });

  const branchSales = (sales || []).filter((s: any) => {
    const sBranch = s.branchId || (s.pointOfSale === '0018' || s.ticketNumber?.startsWith('0018') ? 'NECO 2' : 'NECO 1');
    if (sBranch !== currentBranch.id) return false;
    
    // Convert sale date to timestamp for comparison
    const saleDate = getSaleTimestamp(s);
    return saleDate > lastClosureDate;
  });

  // Calculate collection totals from movements
  const collectionTotal = (shiftMovements || [])
    .filter((cm: any) => cm.type === 'INGRESO' && cm.concept && cm.concept.includes('Cobro Cta Cte'))
    .reduce((sum: number, cm: any) => sum + (cm.amount || 0), 0);

  // Detailed totals by payment method
  let cashAmount = 0;
  let cardAmount = 0;
  let qrAmount = 0;
  let transferAmount = 0;
  let currentAccountAmount = 0;
  let combinedSalesTotal = 0;
  let combinedSalesCount = 0;
  const currentAccountDetails: Array<{
    customerName: string;
    amount: number;
    ticketNumber?: string;
    time?: string;
  }> = [];

  branchSales.forEach((s: any) => {
    const total = Number(s.total) || 0;
    if (s.paymentMethod === 'PAGO_COMBINADO') {
      combinedSalesTotal += total;
      combinedSalesCount += 1;
      if (Array.isArray(s.combinedPayments) && s.combinedPayments.length > 0) {
        s.combinedPayments.forEach((cp: any) => {
          const amt = Number(cp.amount) || 0;
          if (cp.method === 'EFECTIVO') {
            cashAmount += amt;
          } else if (
            cp.method === 'TARJETA' ||
            cp.method === 'TARJETA_DEBITO' ||
            cp.method === 'TARJETA_CREDITO'
          ) {
            cardAmount += amt;
          } else if (cp.method === 'QR') {
            qrAmount += amt;
          } else if (cp.method === 'TRANSFERENCIA') {
            transferAmount += amt;
          } else if (cp.method === 'CUENTA_CORRIENTE') {
            currentAccountAmount += amt;
            currentAccountDetails.push({
              customerName: s.customerName || 'Cliente Cta. Cte.',
              amount: amt,
              ticketNumber: s.ticketNumber,
              time: s.time || (s.date ? new Date(s.date).toLocaleTimeString('es-AR') : ''),
            });
          }
        });
      } else {
        // Fallback if combined array not present
        const m1 = s.combinedMethod1 || 'EFECTIVO';
        const a1 = Number(s.combinedAmount1) || 0;
        const m2 = s.combinedMethod2 || 'TARJETA';
        const a2 = Number(s.combinedAmount2) || Math.max(0, total - a1);
        [
          { method: m1, amount: a1 },
          { method: m2, amount: a2 },
        ].forEach((cp) => {
          if (cp.method === 'EFECTIVO') cashAmount += cp.amount;
          else if (
            cp.method === 'TARJETA' ||
            cp.method === 'TARJETA_DEBITO' ||
            cp.method === 'TARJETA_CREDITO'
          )
            cardAmount += cp.amount;
          else if (cp.method === 'QR') qrAmount += cp.amount;
          else if (cp.method === 'TRANSFERENCIA') transferAmount += cp.amount;
          else if (cp.method === 'CUENTA_CORRIENTE') {
            currentAccountAmount += cp.amount;
            currentAccountDetails.push({
              customerName: s.customerName || 'Cliente Cta. Cte.',
              amount: cp.amount,
              ticketNumber: s.ticketNumber,
              time: s.time || (s.date ? new Date(s.date).toLocaleTimeString('es-AR') : ''),
            });
          }
        });
      }
    } else {
      if (s.paymentMethod === 'EFECTIVO') {
        cashAmount += total;
      } else if (
        s.paymentMethod === 'TARJETA' ||
        s.paymentMethod === 'TARJETA_DEBITO' ||
        s.paymentMethod === 'TARJETA_CREDITO'
      ) {
        cardAmount += total;
      } else if (s.paymentMethod === 'QR') {
        qrAmount += total;
      } else if (s.paymentMethod === 'TRANSFERENCIA') {
        transferAmount += total;
      } else if (s.paymentMethod === 'CUENTA_CORRIENTE') {
        currentAccountAmount += total;
        currentAccountDetails.push({
          customerName: s.customerName || 'Cliente Cta. Cte.',
          amount: total,
          ticketNumber: s.ticketNumber,
          time: s.time || (s.date ? new Date(s.date).toLocaleTimeString('es-AR') : ''),
        });
      }
    }
  });

  const totalSales =
    cashAmount + cardAmount + qrAmount + transferAmount + currentAccountAmount;

  const totalCombined = totalSales + collectionTotal;

  // Invoices by document type
  const invoicesA = branchSales
    .filter((s: any) => s.invoiceType === 'FACTURA_A')
    .reduce((sum: number, s: any) => sum + (Number(s.total) || 0), 0);

  const invoicesB = branchSales
    .filter((s: any) => s.invoiceType === 'FACTURA_B')
    .reduce((sum: number, s: any) => sum + (Number(s.total) || 0), 0);

  const commonReceipts = branchSales
    .filter((s: any) => s.invoiceType === 'RECIBO_COMUN' || !s.invoiceType)
    .reduce((sum: number, s: any) => sum + (Number(s.total) || 0), 0);

  // Cash drawer theoretical calculation
  const initialFund = (shiftMovements || [])
    .filter((m) => m.type === 'FONDO')
    .reduce((s, m) => s + (Number(m.amount) || 0), 0);

  const entries = (shiftMovements || [])
    .filter((m) => m.type === 'INGRESO' && !m.concept?.includes('Venta POS'))
    .reduce((s, m) => s + (Number(m.amount) || 0), 0);

  const withdrawals = (shiftMovements || [])
    .filter((m) => m.type === 'RETIRO')
    .reduce((s, m) => s + Math.abs(Number(m.amount) || 0), 0);

  const expenses = (shiftMovements || [])
    .filter((m) => m.type === 'EGRESO')
    .reduce((s, m) => s + Math.abs(Number(m.amount) || 0), 0);

  // Vales y adelantos de empleados registrados en el turno
  const employeeValesMovements = (shiftMovements || []).filter(
    (m) => (m.type === 'EGRESO' || m.type === 'RETIRO') && m.concept?.toLowerCase().includes('vale empleado')
  );
  const totalEmployeeValesAmount = employeeValesMovements.reduce(
    (sum, m) => sum + Math.abs(Number(m.amount) || 0), 0
  );

  const expectedCash = initialFund + cashAmount + entries - withdrawals - expenses;

  // IMPORTANT: Cierre de Lote Posnet engloba Tarjetas (Débito + Crédito) + QR.
  // Las Transferencias Bancarias NO salen en el Posnet, se verifican directo en banco/app.
  const expectedPosnet = cardAmount + qrAmount;
  const expectedTransfer = transferAmount;

  // States for real physical cash entered by cashier (only manual input required)
  const [actualCash, setActualCash] = useState<string>('0');
  const [showCurrentAccountList, setShowCurrentAccountList] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');

  const actualCashNum = parseFloat(actualCash.replace(/\./g, '').replace(',', '.')) || 0;

  // Real physical cash difference
  const cashDifference = actualCashNum - expectedCash;
  const posnetDifference = 0;
  const transferDifference = 0;
  const totalDifference = cashDifference;

  const handleExecuteZ = async () => {
    const hasCashDifference = Math.abs(cashDifference) >= 1;

    let confirmMsg =
      '¿Está seguro de emitir el CIERRE Z DEFINITIVO de turno?\nEsta acción consolidará los comprobantes fiscales y cerrará la caja.';
    if (hasCashDifference) {
      confirmMsg += `\n\nATENCIÓN: Existe diferencia en el arqueo de efectivo:\n` +
        `• Efectivo Físico: ${formatCurrency(cashDifference)} (${cashDifference > 0 ? 'SOBRANTE' : 'FALTANTE'})\n\n¿Desea continuar y asentar el acta?`;
    }

    const confirmed = await showConfirm(confirmMsg);
    if (confirmed) {
      const closure: CashClosure = {
        id: `Z-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${currentBranch.pointOfSale}`,
        date: new Date().toLocaleString('es-AR'),
        branch: currentBranch.id,
        branchId: currentBranch.id,
        createdAt: Date.now(),
        register: `${currentBranch.pointOfSale} (POS Principal)`,
        operator: currentUser.fullName,
        shift: selectedShift,
        totalSales,
        invoicesA,
        invoicesB,
        commonReceipts,
        cashAmount,
        cardAmount,
        qrAmount,
        transferAmount,
        currentAccountAmount,
        combinedSalesTotal,
        combinedSalesCount,
        entries,
        withdrawals,
        expenses,
        initialFund,
        expectedCash,
        actualCash: actualCashNum,
        difference: cashDifference,
        posnetAmount: expectedPosnet,
        expectedPosnet,
        actualPosnet: expectedPosnet,
        posnetDifference: 0,
        expectedCard: cardAmount,
        actualCard: cardAmount,
        cardDifference: 0,
        expectedTransfer,
        actualTransfer: expectedTransfer,
        transferDifference: 0,
        currentAccountCount: currentAccountDetails.length,
        currentAccountDetails,
        notes,
        status: Math.abs(cashDifference) < 1 ? 'CONCILIADO' : 'CON_DIFERENCIA',
      };

      // Impresión de ticket de cierre fiscal Z en impresora térmica 80mm
      printClosureTicket(closure, currentBranch);

      onConfirmClosure(closure);
    }
  };

  return (
    <div className="flex flex-col items-center justify-start w-full h-[calc(100vh-80px)] select-none bg-[#ebeef2] text-[#181c1f] font-sans p-2 overflow-y-auto">
      <div className="w-full max-w-5xl bg-white border-2 border-[#002046] shadow-lg flex flex-col my-auto mb-4">
        {/* Title Bar */}
        <div className="h-[32px] bg-[#002046] text-white flex items-center justify-between px-3 text-[12px] font-bold">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#ffdad6]" />
            <span>CIERRE DEFINITIVO DE CAJA (CIERRE Z) — SUCURSAL {currentBranch.name || currentBranch.id}</span>
          </div>
          <span className="text-[11px] font-mono text-[#d4e3ff]">
            Pto. Venta: {currentBranch.pointOfSale} | Cajero: {currentUser.fullName}
          </span>
        </div>

        {/* Schedule and Shift Selector Banner */}
        <div className="bg-[#f0f4f8] border-b border-[#c4c6cf] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-[#002046]">
            <Clock className="w-3.5 h-3.5 text-[#002046]" />
            <span className="font-bold">Horarios de Atención:</span>
            <span className="text-[#44474e]">
              Lun-Sáb 08:00-13:30 / 18:00-22:00 | Dom 08:00-13:30
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#002046]">Turno a Cerrar:</span>
            <select
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              className="h-[24px] px-2 bg-white border border-[#74777f] font-bold text-[#002046] text-[11px] focus:outline-none cursor-pointer"
            >
              <option value="TURNO MAÑANA">Turno Mañana (08:00 a 13:30)</option>
              {!shiftStatus.isSunday && (
                <option value="TURNO TARDE">Turno Tarde / Noche (18:00 a 22:00)</option>
              )}
              <option value="JORNADA COMPLETA">Jornada Completa</option>
            </select>
          </div>
        </div>

        <div className="p-3 flex flex-col gap-2.5 text-[12px]">
          {/* SECTION 1: MINITARJETAS DE MEDIOS DE PAGO Y FACTURACIÓN */}
          <div className="bg-[#f7fafe] p-2.5 border border-[#c4c6cf] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-[#002046] flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#002046]" />
                1. RESUMEN DE VENTAS POR MEDIO DE PAGO (TURNO EN CURSO):
              </span>
              <span className="text-[10px] text-[#44474e] font-mono">
                {branchSales.length} comprobantes emitidos
              </span>
            </div>

            {/* Minitarjetas Fila 1: 6 columnas */}
            <div className="grid grid-cols-6 gap-2">
              {/* EFECTIVO */}
              <div className="bg-white p-2 border border-[#c4c6cf] flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between text-[#00522c] mb-1">
                  <span className="text-[10px] font-bold uppercase">EFECTIVO</span>
                  <Banknote className="w-3.5 h-3.5" />
                </div>
                <span className="font-mono font-bold text-[14px] text-[#002046]">
                  {formatCurrency(cashAmount)}
                </span>
              </div>

              {/* QR */}
              <div className="bg-white p-2 border border-[#c4c6cf] flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between text-[#002046] mb-1">
                  <span className="text-[10px] font-bold uppercase">QR (BILLETERAS)</span>
                  <QrCode className="w-3.5 h-3.5 text-[#002046]" />
                </div>
                <span className="font-mono font-bold text-[14px] text-[#002046]">
                  {formatCurrency(qrAmount)}
                </span>
              </div>

              {/* TRANSFERENCIAS */}
              <div className="bg-white p-2 border border-[#c4c6cf] flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between text-[#1b365d] mb-1">
                  <span className="text-[10px] font-bold uppercase">TRANSFERENCIAS</span>
                  <Landmark className="w-3.5 h-3.5" />
                </div>
                <span className="font-mono font-bold text-[14px] text-[#002046]">
                  {formatCurrency(transferAmount)}
                </span>
              </div>

              {/* TARJETAS */}
              <div className="bg-white p-2 border border-[#c4c6cf] flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between text-[#002046] mb-1">
                  <span className="text-[10px] font-bold uppercase">TARJETAS</span>
                  <CreditCard className="w-3.5 h-3.5" />
                </div>
                <span className="font-mono font-bold text-[14px] text-[#002046]">
                  {formatCurrency(cardAmount)}
                </span>
              </div>

              {/* CTA CTE */}
              <div className="bg-white p-2 border border-[#c4c6cf] flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between text-[#aa3531] mb-1">
                  <span className="text-[10px] font-bold uppercase">CTA. CTE. (FIADOS)</span>
                  <Users className="w-3.5 h-3.5" />
                </div>
                <span className="font-mono font-bold text-[14px] text-[#aa3531]">
                  {formatCurrency(currentAccountAmount)}
                </span>
              </div>

              {/* COBRANZAS CTA CTE */}
              <div className="bg-[#fef9f8] p-2 border border-[#f3baba] flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between text-[#d93025] mb-1">
                  <span className="text-[10px] font-bold uppercase">COBROS CTA. CTE.</span>
                  <Users className="w-3.5 h-3.5" />
                </div>
                <span className="font-mono font-bold text-[14px] text-[#d93025]">
                  {formatCurrency(collectionTotal)}
                </span>
              </div>
            </div>

            {/* Minitarjetas Fila 2: 5 columnas */}
            <div className="grid grid-cols-5 gap-2 pt-2">
              {/* COMBINADO */}
              <div className="bg-white p-2 border border-[#c4c6cf] flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between text-[#44474e] mb-1">
                  <span className="text-[10px] font-bold uppercase">COMBINADOS</span>
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <span className="font-mono font-bold text-[14px] text-[#002046]">
                  {formatCurrency(combinedSalesTotal)}
                </span>
              </div>

              {/* Facturas A */}
              <div className="bg-white p-2 border border-[#c4c6cf] flex flex-col justify-between shadow-xs">
                <span className="text-[10px] text-[#44474e] block uppercase font-semibold">FACTURAS "A"</span>
                <span className="font-mono font-bold text-[14px] text-[#002046]">
                  {formatCurrency(invoicesA)}
                </span>
              </div>
              
              {/* Facturas B */}
              <div className="bg-white p-2 border border-[#c4c6cf] flex flex-col justify-between shadow-xs">
                <span className="text-[10px] text-[#44474e] block uppercase font-semibold">FACTURAS "B"</span>
                <span className="font-mono font-bold text-[14px] text-[#002046]">
                  {formatCurrency(invoicesB)}
                </span>
              </div>
              
              {/* Recibos */}
              <div className="bg-white p-2 border border-[#c4c6cf] flex flex-col justify-between shadow-xs">
                <span className="text-[10px] text-[#44474e] block uppercase font-semibold">RECIBOS</span>
                <span className="font-mono font-bold text-[14px] text-[#181c1f]">
                  {formatCurrency(commonReceipts)}
                </span>
              </div>

              {/* TOTAL GENERAL */}
              <div className="bg-[#002046] p-2 flex flex-col justify-between shadow-xs">
                <span className="text-[10px] text-white block uppercase font-semibold">TOTAL GENERAL</span>
                <span className="font-mono font-bold text-[14px] text-white">
                  {formatCurrency(totalCombined)}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 2: ARQUEO DE EFECTIVO FÍSICO EN CAJA (ÚNICO INGRESO REQUERIDO) */}
          <div className="bg-[#f7fafe] p-2.5 border-2 border-[#002046] shadow-xs">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-[#00522c]" />
                <span className="text-[12px] font-bold uppercase text-[#002046]">
                  2. Arqueo de Efectivo Físico en Caja (Recuento Real):
                </span>
              </div>
              <span className="text-[10px] text-[#44474e] font-mono">
                Fondo (${formatCurrency(initialFund)}) + Ventas Ef. (${formatCurrency(cashAmount)}) + Entradas (${formatCurrency(entries)}) - Retiros/Gastos (${formatCurrency(withdrawals + expenses)})
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="bg-[#e0e3e7] p-2 border border-[#74777f] flex flex-col justify-center">
                <span className="text-[10px] font-bold uppercase text-[#44474e]">
                  Efectivo Teórico Esperado:
                </span>
                <span className="font-mono text-[16px] font-black text-[#002046]">
                  {formatCurrency(expectedCash)}
                </span>
              </div>

              <div className="bg-white p-2 border-2 border-[#002046] flex flex-col justify-between">
                <div className="flex items-center justify-between mb-0.5">
                  <label className="font-bold text-[#002046] text-[11px] block uppercase">
                    EFECTIVO REAL CONTADO EN CAJA ($):
                  </label>
                  {expectedCash > 0 && (
                    <button
                      type="button"
                      onClick={() => setActualCash(String(expectedCash))}
                      className="text-[9px] bg-[#d6e3ff] hover:bg-[#b5ccf8] text-[#002046] font-bold px-1.5 py-0.5 border border-[#74777f]/40 cursor-pointer"
                      title="Copiar importe teórico esperado"
                    >
                      Copiar Teórico
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  placeholder="0,00"
                  className="w-full h-[30px] px-2 bg-white border border-[#74777f] font-mono text-[16px] font-black text-[#002046] focus:outline-none focus:border-[#002046]"
                  autoFocus
                />
              </div>

              <div
                className={`p-2 border flex flex-col justify-center ${
                  Math.abs(cashDifference) < 1
                    ? 'bg-[#d6e3ff] border-[#002046] text-[#002046]'
                    : cashDifference > 0
                    ? 'bg-[#e6f4ea] border-[#00522c] text-[#00522c]'
                    : 'bg-[#ffdad6] border-[#aa3531] text-[#aa3531]'
                }`}
              >
                <span className="text-[10px] font-bold uppercase">Diferencia Efectivo:</span>
                <span className="font-mono text-[15px] font-black">
                  {cashDifference === 0
                    ? '$ 0,00 (CAJA CUADRADA)'
                    : cashDifference > 0
                    ? `+${formatCurrency(cashDifference)} (SOBRANTE)`
                    : `${formatCurrency(cashDifference)} (FALTANTE)`}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 3: SALIDAS POR CUENTA CORRIENTE (FIADOS DEL TURNO) */}
          <div className="bg-[#f7fafe] p-2.5 border border-[#c4c6cf]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#002046]" />
                <span className="text-[11px] font-bold uppercase text-[#002046]">
                  3. Salidas por Cuenta Corriente (Fiados del Turno):
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-[#002046] text-[12px]">
                  Total a Cobrar: {formatCurrency(currentAccountAmount)} ({currentAccountDetails.length} comprobantes)
                </span>
                {currentAccountDetails.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCurrentAccountList(!showCurrentAccountList)}
                    className="text-[10px] bg-[#d6e3ff] hover:bg-[#b5ccf8] text-[#002046] px-2 py-0.5 font-bold border border-[#74777f]/40 flex items-center gap-1 cursor-pointer"
                  >
                    <span>{showCurrentAccountList ? 'Ocultar Detalle' : 'Ver Detalle de Clientes'}</span>
                    {showCurrentAccountList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>

            {/* Collapsible Customer Account List */}
            {showCurrentAccountList && currentAccountDetails.length > 0 && (
              <div className="mt-2 max-h-[140px] overflow-y-auto border border-[#74777f] bg-white">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-[#002046] text-white sticky top-0 text-[10px]">
                    <tr>
                      <th className="p-1 border-r border-[#1b365d]">Ticket</th>
                      <th className="p-1 border-r border-[#1b365d]">Hora</th>
                      <th className="p-1 border-r border-[#1b365d]">Cliente / Razón Social</th>
                      <th className="p-1 text-right">Importe Cta. Cte.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentAccountDetails.map((cad, idx) => (
                      <tr key={idx} className="border-b border-[#ebeef2] hover:bg-[#f1f4f8]">
                        <td className="p-1 font-mono text-[10px] border-r border-[#ebeef2]">{cad.ticketNumber || '-'}</td>
                        <td className="p-1 font-mono text-[10px] border-r border-[#ebeef2]">{cad.time || '-'}</td>
                        <td className="p-1 font-semibold text-[#002046] border-r border-[#ebeef2]">{cad.customerName}</td>
                        <td className="p-1 text-right font-mono font-bold text-[#aa3531]">
                          {formatCurrency(cad.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SECTION 6: VALES Y ADELANTOS DE PERSONAL (EGRESOS DEL TURNO) */}
          <div className="bg-[#f7fafe] p-2.5 border border-[#c4c6cf]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#002046]" />
                <span className="text-[11px] font-bold uppercase text-[#002046]">
                  6. Vales y Adelantos de Personal (Egresos del Turno):
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-[#aa3531] text-[12px]">
                  Total Vales Entregados: {formatCurrency(totalEmployeeValesAmount)} ({employeeValesMovements.length} vales)
                </span>
              </div>
            </div>

            {employeeValesMovements.length > 0 ? (
              <div className="mt-2 max-h-[140px] overflow-y-auto border border-[#74777f] bg-white">
                <table className="w-full text-left text-[11px] border-collapse bg-white">
                  <thead className="bg-[#002046] text-white sticky top-0 text-[10px]">
                    <tr>
                      <th className="p-1 border-r border-[#1b365d]">Comprobante / Vale</th>
                      <th className="p-1 border-r border-[#1b365d]">Hora</th>
                      <th className="p-1 border-r border-[#1b365d]">Detalle / Concepto</th>
                      <th className="p-1 text-right">Importe Vale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeValesMovements.map((ev, idx) => (
                      <tr key={idx} className="border-b border-[#ebeef2] hover:bg-[#f1f4f8]">
                        <td className="p-1 font-mono text-[10px] border-r border-[#ebeef2]">{ev.voucher || '-'}</td>
                        <td className="p-1 font-mono text-[10px] border-r border-[#ebeef2]">{ev.time || '-'}</td>
                        <td className="p-1 font-semibold text-[#002046] border-r border-[#ebeef2]">{ev.concept}</td>
                        <td className="p-1 text-right font-mono font-bold text-[#aa3531]">
                          {formatCurrency(Math.abs(ev.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-[11px] text-gray-500 italic mt-1.5 pl-5">
                No se registraron vales ni adelantos de efectivo a empleados en este turno.
              </div>
            )}
          </div>

          {/* SECTION 5: NOTES & OBSERVATIONS */}
          <div>
            <label className="font-bold text-[#181c1f] text-[11px] block mb-0.5">
              Observaciones de Cierre / Acta de Turno:
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ingrese comentarios sobre discrepancias, billetes falsos, cupones anulados, o novedades del turno..."
              className="w-full p-1.5 bg-white border border-[#74777f] text-[11px] focus:outline-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[#c4c6cf]">
            <button
              type="button"
              onClick={onCancel}
              className="h-[30px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a Ventas</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  printSummaryXTicket(
                    {
                      branchName: currentBranch.name || currentBranch.id,
                      register: `${currentBranch.pointOfSale} (POS Principal)`,
                      operator: currentUser.fullName,
                      shift: selectedShift,
                      totalSales,
                      invoicesA,
                      invoicesB,
                      commonReceipts,
                      cashAmount,
                      cardAmount,
                      qrAmount,
                      transferAmount,
                      currentAccountAmount,
                      combinedSalesTotal,
                      currentAccountCount: currentAccountDetails.length,
                      initialFund,
                      entries,
                      withdrawals,
                      expenses,
                      expectedCash,
                      actualCash: actualCashNum,
                      difference: cashDifference,
                      currentAccountDetails,
                      notes,
                    },
                    currentBranch
                  );
                }}
                className="h-[30px] px-3 bg-[#ebeef2] hover:bg-[#d6e3ff] border border-[#74777f] text-[#181c1f] text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="Imprimir informe preliminar X en la impresora térmica de 80mm"
              >
                <Printer className="w-3.5 h-3.5 text-[#002046]" />
                <span>Imprimir Resumen X (80mm)</span>
              </button>

              <button
                type="button"
                onClick={handleExecuteZ}
                className="h-[32px] px-5 bg-[#aa3531] hover:bg-[#891c1d] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>REALIZAR CIERRE Z DEFINITIVO [F12]</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
