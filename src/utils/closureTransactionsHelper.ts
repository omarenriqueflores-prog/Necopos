import { CashClosure, CashMovement, ElectronicInvoice, BranchConfig } from '../types/pos';

export interface ClosureSaleItem {
  id?: string;
  ticketNumber?: string;
  date?: string;
  time?: string;
  customerName?: string;
  customerDni?: string;
  invoiceType?: 'FACTURA_A' | 'FACTURA_B' | 'RECIBO_COMUN' | string;
  paymentMethod?: string;
  total: number;
  itemsCount?: number;
  items?: Array<{
    code?: string;
    productCode?: string;
    name?: string;
    description?: string;
    quantity: number;
    price: number;
    unitPrice?: number;
    subtotal: number;
    unitType?: string;
  }>;
  combinedPayments?: Array<{
    method: string;
    amount: number;
  }>;
  cae?: string;
  caeVto?: string;
  branchId?: string;
}

export interface ClosureMovementItem {
  id: string;
  type: 'FONDO' | 'INGRESO' | 'RETIRO' | 'EGRESO';
  concept: string;
  amount: number;
  time?: string;
  date?: string;
  user?: string;
  voucher?: string;
  branchId?: string;
}

export interface ClosureCurrentAccountItem {
  ticketNumber?: string;
  customerName: string;
  amount: number;
  time?: string;
  date?: string;
  type: 'FIADO_VENTA' | 'COBRO_DEUDA';
  concept?: string;
}

export interface ClosureResolvedData {
  closure: CashClosure;
  timeWindowText: string;
  startDateText: string;
  endDateText: string;
  allSales: ClosureSaleItem[];
  recibos: ClosureSaleItem[];
  facturasA: ClosureSaleItem[];
  facturasB: ClosureSaleItem[];
  ctaCteItems: ClosureCurrentAccountItem[];
  cashMovements: ClosureMovementItem[];
  initialFund: number;
  entries: number;
  withdrawals: number;
  expenses: number;
  totals: {
    totalSales: number;
    totalRecibos: number;
    totalFacturasA: number;
    totalFacturasB: number;
    totalCtaCte: number;
    totalEfectivo: number;
    totalTarjetas: number;
    totalQr: number;
    totalTransferencia: number;
    totalEntradas: number;
    totalSalidas: number;
    netCashFlow: number;
  };
}

/**
 * Robust date string parser for es-AR locale and ISO timestamps
 */
export function parseLocalesDate(dateStr: string | any): Date {
  if (!dateStr) return new Date(0);
  if (dateStr instanceof Date) return dateStr;
  if (typeof dateStr === 'number') return new Date(dateStr);

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
    let hours = 0;
    let minutes = 0;
    let seconds = 0;
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
      hours += 12;
    }

    return new Date(year, month, day, hours, minutes, seconds);
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

export function getMovementTimestamp(m: any): number {
  if (m.id && typeof m.id === 'string' && m.id.startsWith('CM-')) {
    const ts = parseInt(m.id.split('-')[1], 10);
    if (!isNaN(ts) && ts > 1000000000) return ts;
  }
  if (m.createdAt) {
    const t = new Date(m.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (m.date) {
    const d = parseLocalesDate(m.date);
    const t = d.getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return 0;
}

export function getSaleTimestamp(s: any): number {
  if (s.createdAt) {
    const t = new Date(s.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (s.id && typeof s.id === 'string' && s.id.startsWith('SALE-')) {
    const ts = parseInt(s.id.split('-')[1], 10);
    if (!isNaN(ts) && ts > 1000000000) return ts;
  }
  if (s.date) {
    const d = parseLocalesDate(s.date);
    const t = d.getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return 0;
}

/**
 * Reconstructs or extracts all sales, invoices, account movements, and cash movements that conform a Cash Closure.
 */
export function getClosureTransactions(params: {
  closure: CashClosure;
  allClosures: CashClosure[];
  allSales: any[];
  allCashMovements: CashMovement[];
  allElectronicInvoices?: ElectronicInvoice[];
}): ClosureResolvedData {
  const { closure, allClosures = [], allSales = [], allCashMovements = [], allElectronicInvoices = [] } = params;

  const branch = closure.branch || closure.branchId || 'NECO 1';

  // 1. Check if closure already has persisted snapshot
  if (
    closure.salesSummary &&
    Array.isArray(closure.salesSummary) &&
    closure.salesSummary.length > 0
  ) {
    const sales = closure.salesSummary as ClosureSaleItem[];
    const movements = (closure.movementsSummary || []) as ClosureMovementItem[];

    return buildResolvedDataFromItems(closure, sales, movements, 'Snapshot archivado del cierre');
  }

  // 2. Dynamic resolution: find the chronological time window for this closure
  const branchClosures = allClosures
    .filter((c) => (c.branch || c.branchId) === branch)
    .sort((a, b) => {
      const tA = a.createdAt || parseLocalesDate(a.date).getTime();
      const tB = b.createdAt || parseLocalesDate(b.date).getTime();
      return tA - tB;
    });

  const closureTime = closure.createdAt || parseLocalesDate(closure.date).getTime();

  // Find previous closure strictly before closureTime
  let prevClosure: CashClosure | null = null;
  for (const c of branchClosures) {
    const cTime = c.createdAt || parseLocalesDate(c.date).getTime();
    if (c.id !== closure.id && cTime < closureTime) {
      if (!prevClosure || cTime > (prevClosure.createdAt || parseLocalesDate(prevClosure.date).getTime())) {
        prevClosure = c;
      }
    }
  }

  const startTime = prevClosure
    ? (prevClosure.createdAt || parseLocalesDate(prevClosure.date).getTime())
    : 0;
  const endTime = closureTime || Date.now();

  const startDateText = prevClosure ? prevClosure.date : 'Inicio de Actividades';
  const endDateText = closure.date;
  const timeWindowText = `${startDateText} ➔ ${endDateText}`;

  // Known ticket numbers from closure.currentAccountDetails
  const knownCtaCteTickets = new Set<string>(
    (closure.currentAccountDetails || [])
      .map((cad) => cad.ticketNumber)
      .filter(Boolean) as string[]
  );

  // Normalize closure date string (YYYY-MM-DD or DD/MM/YYYY)
  const closureDateObj = parseLocalesDate(closure.date);
  const closureDateKey = `${closureDateObj.getFullYear()}-${String(closureDateObj.getMonth() + 1).padStart(2, '0')}-${String(closureDateObj.getDate()).padStart(2, '0')}`;

  // Filter Sales for this branch within window or matching tickets
  const matchedSales = allSales.filter((s: any) => {
    const sBranch = s.branchId || (s.pointOfSale === '0018' || s.ticketNumber?.startsWith('0018') ? 'NECO 2' : 'NECO 1');
    if (sBranch !== branch) return false;

    // Explicit ticket match in Cta Cte
    if (s.ticketNumber && knownCtaCteTickets.has(s.ticketNumber)) return true;

    const sTime = getSaleTimestamp(s);
    if (sTime > 0) {
      if (startTime > 0) {
        return sTime > startTime && sTime <= endTime + 3000;
      } else {
        return sTime <= endTime + 3000;
      }
    }

    // Fallback if sTime is 0: check matching date
    if (s.date) {
      const sDateObj = parseLocalesDate(s.date);
      const sDateKey = `${sDateObj.getFullYear()}-${String(sDateObj.getMonth() + 1).padStart(2, '0')}-${String(sDateObj.getDate()).padStart(2, '0')}`;
      if (sDateKey === closureDateKey) return true;
    }

    return false;
  });

  // Filter Cash Movements for this branch within window
  const matchedMovements = allCashMovements.filter((m: any) => {
    const mBranch = m.branchId || (m.ticketNumber?.startsWith('0018') || m.concept?.includes('0018') || m.concept?.includes('NECO 2') ? 'NECO 2' : 'NECO 1');
    if (mBranch !== branch) return false;

    const mTime = getMovementTimestamp(m);
    if (mTime > 0) {
      if (startTime > 0) {
        return mTime > startTime && mTime <= endTime + 3000;
      } else {
        return mTime <= endTime + 3000;
      }
    }

    if (m.date) {
      const mDateObj = parseLocalesDate(m.date);
      const mDateKey = `${mDateObj.getFullYear()}-${String(mDateObj.getMonth() + 1).padStart(2, '0')}-${String(mDateObj.getDate()).padStart(2, '0')}`;
      if (mDateKey === closureDateKey) return true;
    }

    return false;
  });

  // Match electronic invoices to sales
  const salesItems: ClosureSaleItem[] = matchedSales.map((s: any) => {
    // Check if there is an electronic invoice matching this sale
    // Strict priority:
    // 1. Direct ID match (electronicInvoiceId or saleId)
    // 2. Strict ticket number match respecting invoice type (A vs B) and ignoring credit notes
    const matchingElectronic = allElectronicInvoices.find((inv) => {
      if (s.electronicInvoiceId && inv.id === s.electronicInvoiceId) return true;
      if (inv.saleId && inv.saleId === s.id) return true;

      if (s.ticketNumber && inv.formattedNumber === s.ticketNumber) {
        // Exclude credit notes
        if (inv.creditNoteType || (inv.cbteTipo as number) === 3 || (inv.cbteTipo as number) === 8 || (inv.cbteTipo as number) === 13) {
          return false;
        }
        // Match invoice letter/type
        if (s.invoiceType === 'FACTURA_A' && inv.cbteLetra !== 'A') return false;
        if (s.invoiceType === 'FACTURA_B' && inv.cbteLetra !== 'B') return false;

        // If the sale was to Consumidor Final, do not match a Factura A to a registered company
        const isConsumidorFinal =
          !s.customer ||
          s.customerName?.toLowerCase().includes('consumidor final') ||
          s.invoiceType === 'FACTURA_B' ||
          s.invoiceType === 'RECIBO_COMUN';

        if (isConsumidorFinal && (inv.cbteLetra === 'A' || inv.customer?.docType === 80)) {
          return false;
        }

        return true;
      }

      return false;
    });

    const isFacturaA = matchingElectronic ? matchingElectronic.cbteLetra === 'A' : s.invoiceType === 'FACTURA_A';
    const isFacturaB = matchingElectronic ? matchingElectronic.cbteLetra === 'B' : s.invoiceType === 'FACTURA_B';

    let resolvedCustomerName = s.customerName || s.customer?.name;
    if (!resolvedCustomerName) {
      if (isFacturaA) {
        resolvedCustomerName = matchingElectronic?.customer?.name || 'Cliente Factura A';
      } else {
        resolvedCustomerName = 'Consumidor Final';
      }
    } else if (matchingElectronic?.customer?.name && isFacturaA) {
      resolvedCustomerName = matchingElectronic.customer.name;
    }

    let resolvedCustomerDni: string | undefined = undefined;
    if (isFacturaA) {
      resolvedCustomerDni = s.customer?.cuit || matchingElectronic?.customer?.cuitDni || s.customer?.dni;
    } else {
      // For Factura B or Recibo común, only show DNI if explicitly present and not a company CUIT
      const dni = s.customer?.dni || (matchingElectronic?.customer?.docType !== 80 ? matchingElectronic?.customer?.cuitDni : undefined);
      if (dni && dni !== '00-00000000-0' && dni !== '0') {
        resolvedCustomerDni = dni;
      }
    }

    return {
      id: s.id,
      ticketNumber: s.ticketNumber,
      date: s.date,
      time: s.time || (s.date ? parseLocalesDate(s.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : undefined),
      customerName: resolvedCustomerName,
      customerDni: resolvedCustomerDni,
      invoiceType: isFacturaA ? 'FACTURA_A' : isFacturaB ? 'FACTURA_B' : (s.invoiceType || 'RECIBO_COMUN'),
      paymentMethod: s.paymentMethod,
      total: Number(s.total) || 0,
      itemsCount: Array.isArray(s.items) ? s.items.length : 0,
      items: s.items || [],
      combinedPayments: s.combinedPayments || [],
      cae: s.cae || matchingElectronic?.cae,
      caeVto: s.caeVto || matchingElectronic?.caeVto,
      branchId: s.branchId || branch,
    };
  });

  // If no sales were found by interval (e.g. database was reset or dummy test closure),
  // check if closure itself has totalSales > 0 and reconstruct virtual placeholder items from the closure totals
  if (salesItems.length === 0 && (closure.totalSales > 0 || (closure.currentAccountDetails && closure.currentAccountDetails.length > 0))) {
    // Generate synthesized items from closure header to preserve visual breakdown
    if (closure.invoicesA > 0) {
      salesItems.push({
        ticketNumber: `FAC-A-${closure.register.replace(/\D/g, '') || '0017'}-001`,
        date: closure.date,
        time: '12:00',
        customerName: 'Cliente con Factura A',
        invoiceType: 'FACTURA_A',
        paymentMethod: 'VARIOS',
        total: closure.invoicesA,
        itemsCount: 1,
      });
    }
    if (closure.invoicesB > 0) {
      salesItems.push({
        ticketNumber: `FAC-B-${closure.register.replace(/\D/g, '') || '0017'}-001`,
        date: closure.date,
        time: '12:15',
        customerName: 'Consumidor Final (Factura B)',
        invoiceType: 'FACTURA_B',
        paymentMethod: 'VARIOS',
        total: closure.invoicesB,
        itemsCount: 1,
      });
    }
    if (closure.commonReceipts > 0) {
      salesItems.push({
        ticketNumber: `REC-${closure.register.replace(/\D/g, '') || '0017'}-001`,
        date: closure.date,
        time: '12:30',
        customerName: 'Consumidor Final (Recibo Mostrador)',
        invoiceType: 'RECIBO_COMUN',
        paymentMethod: 'EFECTIVO / OTROS',
        total: closure.commonReceipts,
        itemsCount: 1,
      });
    }
  }

  // Cash movement items
  const movementItems: ClosureMovementItem[] = matchedMovements.map((m: any) => ({
    id: m.id,
    type: m.type,
    concept: m.concept || 'Movimiento de Caja',
    amount: Number(m.amount) || 0,
    time: m.time || (m.date ? parseLocalesDate(m.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : undefined),
    date: m.date,
    user: m.user,
    voucher: m.voucher,
    branchId: m.branchId || branch,
  }));

  // If no movement items found but closure has initialFund, entries or withdrawals, synthesize for visual review
  if (movementItems.length === 0 && (closure.initialFund > 0 || closure.entries > 0 || closure.withdrawals > 0 || closure.expenses > 0)) {
    if (closure.initialFund > 0) {
      movementItems.push({
        id: `FONDO-${closure.id}`,
        type: 'FONDO',
        concept: 'Fondo Inicial de Apertura de Caja',
        amount: closure.initialFund,
        time: '08:00',
        user: closure.operator,
      });
    }
    if (closure.entries > 0) {
      movementItems.push({
        id: `ING-${closure.id}`,
        type: 'INGRESO',
        concept: 'Ingreso Extraordinario de Efectivo',
        amount: closure.entries,
        time: '10:00',
        user: closure.operator,
      });
    }
    if (closure.withdrawals > 0) {
      movementItems.push({
        id: `RET-${closure.id}`,
        type: 'RETIRO',
        concept: 'Retiro Parcial de Caja Fuerte / Remesa',
        amount: -Math.abs(closure.withdrawals),
        time: '13:00',
        user: closure.operator,
      });
    }
    if (closure.expenses > 0) {
      movementItems.push({
        id: `EGR-${closure.id}`,
        type: 'EGRESO',
        concept: 'Gastos Menores de Caja / Varios',
        amount: -Math.abs(closure.expenses),
        time: '11:00',
        user: closure.operator,
      });
    }
  }

  return buildResolvedDataFromItems(closure, salesItems, movementItems, timeWindowText, startDateText, endDateText);
}

function buildResolvedDataFromItems(
  closure: CashClosure,
  sales: ClosureSaleItem[],
  movements: ClosureMovementItem[],
  timeWindowText: string,
  startDateText?: string,
  endDateText?: string
): ClosureResolvedData {
  const recibos: ClosureSaleItem[] = [];
  const facturasA: ClosureSaleItem[] = [];
  const facturasB: ClosureSaleItem[] = [];
  const ctaCteItems: ClosureCurrentAccountItem[] = [];

  let totalSales = 0;
  let totalRecibos = 0;
  let totalFacturasA = 0;
  let totalFacturasB = 0;
  let totalCtaCte = 0;
  let totalEfectivo = 0;
  let totalTarjetas = 0;
  let totalQr = 0;
  let totalTransferencia = 0;

  sales.forEach((s) => {
    const tot = Number(s.total) || 0;
    totalSales += tot;

    const invType = (s.invoiceType || '').toUpperCase();
    if (invType === 'FACTURA_A') {
      facturasA.push(s);
      totalFacturasA += tot;
    } else if (invType === 'FACTURA_B') {
      facturasB.push(s);
      totalFacturasB += tot;
    } else {
      recibos.push(s);
      totalRecibos += tot;
    }

    // Payment methods
    if (s.paymentMethod === 'PAGO_COMBINADO' && Array.isArray(s.combinedPayments)) {
      s.combinedPayments.forEach((cp) => {
        const amt = Number(cp.amount) || 0;
        const m = (cp.method || '').toUpperCase();
        if (m === 'EFECTIVO') totalEfectivo += amt;
        else if (m.includes('TARJETA')) totalTarjetas += amt;
        else if (m === 'QR') totalQr += amt;
        else if (m === 'TRANSFERENCIA') totalTransferencia += amt;
        else if (m === 'CUENTA_CORRIENTE') {
          totalCtaCte += amt;
          ctaCteItems.push({
            ticketNumber: s.ticketNumber,
            customerName: s.customerName || 'Cliente Cta Cte',
            amount: amt,
            time: s.time,
            date: s.date,
            type: 'FIADO_VENTA',
            concept: 'Venta fiada en mostrador (Pago Combinado)',
          });
        }
      });
    } else {
      const m = (s.paymentMethod || '').toUpperCase();
      if (m === 'EFECTIVO') totalEfectivo += tot;
      else if (m.includes('TARJETA')) totalTarjetas += tot;
      else if (m === 'QR') totalQr += tot;
      else if (m === 'TRANSFERENCIA') totalTransferencia += tot;
      else if (m === 'CUENTA_CORRIENTE') {
        totalCtaCte += tot;
        ctaCteItems.push({
          ticketNumber: s.ticketNumber,
          customerName: s.customerName || 'Cliente Cta Cte',
          amount: tot,
          time: s.time,
          date: s.date,
          type: 'FIADO_VENTA',
          concept: 'Venta fiada en mostrador',
        });
      }
    }
  });

  // Also include any specific current account details embedded in the closure that might not be in sales
  if (Array.isArray(closure.currentAccountDetails)) {
    closure.currentAccountDetails.forEach((cad) => {
      const alreadyInList = ctaCteItems.some(
        (ci) => ci.ticketNumber === cad.ticketNumber && ci.customerName === cad.customerName
      );
      if (!alreadyInList) {
        ctaCteItems.push({
          ticketNumber: cad.ticketNumber,
          customerName: cad.customerName,
          amount: cad.amount,
          time: cad.time,
          type: 'FIADO_VENTA',
          concept: 'Venta a Cuenta Corriente registrada en Cierre Z',
        });
      }
    });
  }

  // Include any debt collection movements (Cobro Cta Cte) from movements
  movements.forEach((m) => {
    if (m.type === 'INGRESO' && m.concept && m.concept.toLowerCase().includes('cta cte')) {
      ctaCteItems.push({
        ticketNumber: m.voucher,
        customerName: m.concept.replace(/cobro cta cte:?/i, '').trim() || 'Cliente Cta Cte',
        amount: Math.abs(m.amount),
        time: m.time,
        date: m.date,
        type: 'COBRO_DEUDA',
        concept: m.concept,
      });
    }
  });

  // Movements totals
  let initialFund = 0;
  let entries = 0;
  let withdrawals = 0;
  let expenses = 0;

  movements.forEach((m) => {
    const amt = Math.abs(Number(m.amount) || 0);
    if (m.type === 'FONDO') initialFund += amt;
    else if (m.type === 'INGRESO' && !m.concept?.includes('Venta POS')) entries += amt;
    else if (m.type === 'RETIRO') withdrawals += amt;
    else if (m.type === 'EGRESO') expenses += amt;
  });

  // If movements were empty, fallback to closure header amounts
  if (initialFund === 0 && closure.initialFund > 0) initialFund = closure.initialFund;
  if (entries === 0 && closure.entries > 0) entries = closure.entries;
  if (withdrawals === 0 && closure.withdrawals > 0) withdrawals = closure.withdrawals;
  if (expenses === 0 && closure.expenses > 0) expenses = closure.expenses;

  // Use closure totals if higher or verified
  const finalTotalSales = Math.max(totalSales, closure.totalSales || 0);
  const finalFacturasA = Math.max(totalFacturasA, closure.invoicesA || 0);
  const finalFacturasB = Math.max(totalFacturasB, closure.invoicesB || 0);
  const finalRecibos = Math.max(totalRecibos, closure.commonReceipts || 0);
  const finalCtaCte = Math.max(totalCtaCte, closure.currentAccountAmount || 0);
  const finalEfectivo = Math.max(totalEfectivo, closure.cashAmount || 0);

  return {
    closure,
    timeWindowText,
    startDateText: startDateText || '',
    endDateText: endDateText || closure.date,
    allSales: sales,
    recibos,
    facturasA,
    facturasB,
    ctaCteItems,
    cashMovements: movements,
    initialFund,
    entries,
    withdrawals,
    expenses,
    totals: {
      totalSales: finalTotalSales,
      totalRecibos: finalRecibos,
      totalFacturasA: finalFacturasA,
      totalFacturasB: finalFacturasB,
      totalCtaCte: finalCtaCte,
      totalEfectivo: finalEfectivo,
      totalTarjetas: Math.max(totalTarjetas, closure.cardAmount || 0),
      totalQr: Math.max(totalQr, closure.qrAmount || 0),
      totalTransferencia: Math.max(totalTransferencia, closure.transferAmount || 0),
      totalEntradas: initialFund + entries,
      totalSalidas: withdrawals + expenses,
      netCashFlow: initialFund + finalEfectivo + entries - withdrawals - expenses,
    },
  };
}
