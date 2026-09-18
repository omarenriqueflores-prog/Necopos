import { CashClosure, BranchConfig } from '../types/pos';
import { formatCurrency } from './scaleParser';
import { printTicket } from './ticketGenerator';

export interface SummaryXData {
  branch?: BranchConfig;
  branchName?: string;
  register?: string;
  operator?: string;
  operatorName?: string;
  shift: string;
  date?: string;
  totalSales: number;
  invoicesA?: number;
  invoicesB?: number;
  commonReceipts?: number;
  cashAmount: number;
  cardAmount: number;
  qrAmount: number;
  transferAmount: number;
  currentAccountAmount: number;
  combinedSalesTotal?: number;
  initialFund?: number;
  entries?: number;
  withdrawals?: number;
  expenses?: number;
  expectedCash?: number;
  actualCash?: number;
  difference?: number;
  currentAccountCount?: number;
  currentAccountDetails?: Array<{
    customerName: string;
    amount: number;
    ticketNumber?: string;
    time?: string;
  }>;
  employeeValesAmount?: number;
  notes?: string;
}

/**
 * Ensures operator name is always displayed as full Name and Surname, never as raw email
 */
export function formatCleanOperatorName(rawName?: string): string {
  if (!rawName || rawName.trim() === '') {
    return 'OMAR ENRIQUE FLORES';
  }
  const clean = rawName.trim();

  if (
    clean.toLowerCase().includes('omarenrique') ||
    clean.toLowerCase().includes('omarenriqueflores') ||
    clean.toLowerCase().includes('omar flores')
  ) {
    return 'OMAR ENRIQUE FLORES';
  }

  if (
    clean.startsWith('Z-AUTO') ||
    clean.includes('AUTOMÁTICO') ||
    clean.includes('[AUTO-SISTEMA]')
  ) {
    return 'SISTEMA AUTOMÁTICO (NECO-POS)';
  }

  if (clean.includes('@')) {
    const prefix = clean.split('@')[0].replace(/[._-]/g, ' ');
    return prefix
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
      .toUpperCase();
  }

  return clean.toUpperCase();
}

/**
 * Generates an 80mm thermal receipt HTML for a Cash Closure (Cierre Z).
 * Designed with high-contrast, highly legible typography specifically for 80mm ESC/POS thermal printers.
 */
export function generateClosureTicketHtml(
  closure: CashClosure,
  branch?: BranchConfig
): string {
  const branchName = branch?.name || closure.branch || 'NECO 1 (Central)';
  const fantasyName = (branch?.fantasyName || 'CARNICERÍAS NECO').toUpperCase();
  const legalName = (branch?.businessName || branch?.legalName || 'CARNICERÍAS NECO S.R.L.').toUpperCase();
  const cuit = branch?.cuit || '20-25506516-6';
  const iibb = branch?.iibb || branch?.grossIncome || '20-25506516-6';
  const address = branch?.address || (closure.branch === 'NECO 2' ? 'Av. Saavedra 450' : 'Av. 24 de Septiembre 1250');
  const phone = branch?.phone || '0387-4315890';
  const ptoVta = branch?.pointOfSale || (closure.branch === 'NECO 2' ? '0018' : '0017');

  const isAuto =
    closure.id.startsWith('Z-AUTO') ||
    closure.operator.includes('AUTOMÁTICO') ||
    (closure.notes && closure.notes.includes('[AUTO-SISTEMA]'));

  const isConciliado = closure.status === 'CONCILIADO' || Math.abs(closure.difference || 0) < 1;
  const operatorName = formatCleanOperatorName(closure.operator);

  const expectedPosnet =
    closure.expectedPosnet ??
    (closure.expectedCard ?? closure.cardAmount ?? 0) + (closure.qrAmount ?? 0);
  const actualPosnet =
    closure.actualPosnet ??
    closure.actualCard ??
    closure.cardAmount ??
    0;
  const posnetDiff = closure.posnetDifference ?? closure.cardDifference ?? 0;

  const expectedTransfer = closure.expectedTransfer ?? closure.transferAmount ?? 0;
  const actualTransfer = closure.actualTransfer ?? closure.transferAmount ?? 0;
  const transferDiff = closure.transferDifference ?? 0;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CIERRE Z ${closure.id}</title>
  <style>
    @page {
      margin: 0;
      size: 80mm auto;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      background: #fff;
      color: #000;
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-size: 11.5px;
      line-height: 1.25;
    }
    .ticket-container {
      width: 74mm;
      max-width: 74mm;
      margin: 0 auto;
      padding: 3mm 2mm 8mm 2mm;
      background: #fff;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .bold { font-weight: 700; }
    .bolder { font-weight: 900; }
    
    /* Clean, highly readable monospaced font for numbers and totals */
    .mono {
      font-family: 'Courier New', Courier, monospace;
      font-weight: 700;
      letter-spacing: -0.2px;
    }

    .divider {
      border-bottom: 1px dashed #000;
      margin: 4px 0;
      width: 100%;
    }
    .divider-solid {
      border-bottom: 1px solid #000;
      margin: 4px 0;
      width: 100%;
    }
    .divider-double {
      border-bottom: 2px solid #000;
      margin: 5px 0;
      width: 100%;
    }

    .row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 2px;
      width: 100%;
      gap: 4px;
    }

    .row-title {
      font-size: 11px;
      color: #000;
      flex: 1 1 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .row-value {
      font-size: 11px;
      text-align: right;
      font-family: 'Courier New', Courier, monospace;
      font-weight: 700;
      flex: 0 1 auto;
      white-space: nowrap;
      letter-spacing: -0.2px;
    }

    .section-title {
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      margin: 4px 0 2px 0;
      letter-spacing: 0.1px;
    }

    .box-operator {
      border: 1.5px solid #000;
      padding: 4px 5px;
      margin: 4px 0;
      background: #fff;
    }

    .box-highlight {
      border: 1.5px solid #000;
      padding: 4px 5px;
      margin: 4px 0;
      background: #fff;
    }

    .badge-auto {
      border: 1px solid #000;
      padding: 2px 4px;
      font-size: 10px;
      font-weight: 900;
      text-align: center;
      margin: 3px 0;
      text-transform: uppercase;
    }

    .signature-box {
      margin-top: 14px;
      padding-top: 4px;
      font-size: 10.5px;
    }

    .signature-line {
      border-bottom: 1px solid #000;
      width: 85%;
      margin: 20px auto 3px auto;
    }

    @media print {
      body {
        width: 74mm !important;
        padding: 0 !important;
        margin: 0 auto !important;
      }
      .ticket-container {
        width: 74mm !important;
        padding: 2mm 1mm 10mm 1mm !important;
      }
    }
  </style>
</head>
<body onload="setTimeout(() => { window.print(); }, 350)">
  <div class="ticket-container">
    
    <!-- HEADER -->
    <div class="text-center">
      <div class="bolder" style="font-size: 15px; letter-spacing: 0.5px;">${fantasyName}</div>
      <div style="font-size: 10.5px; margin-top: 1px;">${legalName}</div>
      <div style="font-size: 9.5px; margin-top: 1px;">${address} | Tel: ${phone}</div>
      <div style="font-size: 9.5px;">CUIT: ${cuit} - IIBB: ${iibb}</div>
      <div style="font-size: 9.5px; font-weight: bold;">IVA RESPONSABLE INSCRIPTO</div>
    </div>

    <div class="divider-double"></div>

    <!-- DOCUMENT TITLE -->
    <div class="text-center">
      <div class="bolder" style="font-size: 13.5px; letter-spacing: 0.5px;">CIERRE FISCAL Z</div>
      <div style="font-size: 10.5px; font-weight: bold;">ARQUEO Y CONCILIACIÓN CONSOLIDADA</div>
      <div class="mono" style="font-size: 10.5px; margin-top: 1px;">COMPROBANTE N°: ${closure.id}</div>
    </div>

    ${isAuto ? `
      <div class="badge-auto">
        🤖 CIERRE AUTOMÁTICO DE JORNADA (SISTEMA)
      </div>
    ` : ''}

    <div class="divider"></div>

    <!-- OPERATOR & TURNO HIGHLIGHT BOX -->
    <div class="box-operator">
      <div style="font-size: 9.5px; font-weight: bold; text-transform: uppercase; color: #333;">RESPONSABLE DE CAJA / CAJERO:</div>
      <div class="bolder" style="font-size: 12.5px; text-transform: uppercase; margin: 1px 0; word-break: break-word;">
        👤 ${operatorName}
      </div>
      <div style="font-size: 10.5px; margin-top: 2px;">
        <strong>TURNO:</strong> ${closure.shift || 'JORNADA COMPLETA'}
      </div>
      <div style="font-size: 10px;">
        <strong>SUCURSAL:</strong> ${branchName} | <strong>PTO. VTA:</strong> ${ptoVta}
      </div>
      <div style="font-size: 10px;">
        <strong>CAJA:</strong> ${closure.register}
      </div>
      <div style="font-size: 10px;">
        <strong>FECHA Y HORA:</strong> <span class="mono">${closure.date}</span>
      </div>
    </div>

    <div class="divider"></div>

    <!-- 1. COMPROBANTES FISCALES -->
    <div class="section-title">1. COMPROBANTES EMITIDOS</div>
    <div class="row">
      <span class="row-title">• FACTURAS "A":</span>
      <span class="row-value">${formatCurrency(closure.invoicesA || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">• FACTURAS "B":</span>
      <span class="row-value">${formatCurrency(closure.invoicesB || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">• RECIBOS / TICKETS X:</span>
      <span class="row-value">${formatCurrency(closure.commonReceipts || 0)}</span>
    </div>

    <div class="divider-solid"></div>

    <div class="row" style="font-weight: 900;">
      <span class="row-title bold" style="font-size: 12px;">TOTAL FACTURADO:</span>
      <span class="row-value mono" style="font-size: 13px;">${formatCurrency(closure.totalSales || 0)}</span>
    </div>

    <div class="divider-double"></div>

    <!-- 2. DESGLOSE POR MEDIO DE PAGO -->
    <div class="section-title">2. VENTAS POR MEDIO DE PAGO</div>
    <div class="row">
      <span class="row-title">• EFECTIVO:</span>
      <span class="row-value">${formatCurrency(closure.cashAmount || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">• QR (BILLETERAS/MP):</span>
      <span class="row-value">${formatCurrency(closure.qrAmount || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">• TRANSFERENCIAS:</span>
      <span class="row-value">${formatCurrency(closure.transferAmount || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">• TARJETAS (DÉB./CRÉD.):</span>
      <span class="row-value">${formatCurrency(closure.cardAmount || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">• CTA. CTE. (FIADOS):</span>
      <span class="row-value">${formatCurrency(closure.currentAccountAmount || 0)}</span>
    </div>
    ${closure.combinedSalesTotal ? `
    <div class="row" style="font-size: 10px; color: #333;">
      <span class="row-title">(Cobros Combinados):</span>
      <span class="row-value">${formatCurrency(closure.combinedSalesTotal)}</span>
    </div>
    ` : ''}

    <div class="divider"></div>

    <!-- 3. ARQUEO DE EFECTIVO EN GAVETA -->
    <div class="section-title">3. ARQUEO DE EFECTIVO EN GAVETA</div>
    <div class="row">
      <span class="row-title">FONDO INICIAL:</span>
      <span class="row-value">${formatCurrency(closure.initialFund || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">(+) VENTAS EFECTIVO:</span>
      <span class="row-value">${formatCurrency(closure.cashAmount || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">(+) INGRESOS DE CAJA:</span>
      <span class="row-value">${formatCurrency(closure.entries || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">(-) RETIROS DE CAJA:</span>
      <span class="row-value">-${formatCurrency(closure.withdrawals || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">(-) GASTOS DE CAJA:</span>
      <span class="row-value">-${formatCurrency(closure.expenses || 0)}</span>
    </div>

    <div class="divider-solid"></div>

    <div class="row">
      <span class="row-title bold">EFECTIVO ESPERADO:</span>
      <span class="row-value">${formatCurrency(closure.expectedCash || 0)}</span>
    </div>
    <div class="row bolder" style="margin-top: 1px;">
      <span class="row-title bold" style="font-size: 11.5px;">EFECTIVO REAL CONTADO:</span>
      <span class="row-value mono" style="font-size: 12.5px;">${formatCurrency(closure.actualCash || 0)}</span>
    </div>

    <!-- DIFERENCIA -->
    <div class="box-highlight">
      <div class="row bolder">
        <span class="row-title bold" style="font-size: 11.5px;">DIFERENCIA EFECTIVO:</span>
        <span class="row-value mono" style="font-size: 12.5px;">
          ${closure.difference === 0 ? '$ 0,00 (EXACTO)' : formatCurrency(closure.difference || 0)}
        </span>
      </div>
      <div style="font-size: 9.5px; text-align: right; font-weight: bold; margin-top: 1px;">
        ${closure.difference === 0
          ? '✔ CAJA BALANCEADA / CONCILIADA'
          : closure.difference > 0
          ? '⚠ SOBRANTE DE EFECTIVO'
          : '⚠ FALTANTE DE EFECTIVO'}
      </div>
    </div>

    <div class="divider"></div>

    <!-- 4. MEDIOS ELECTRÓNICOS Y BANCO -->
    <div class="section-title">4. CIERRE ELECTRÓNICO Y POSNET</div>
    <div class="row">
      <span class="row-title">• LOTE POSNET (TARJ+QR):</span>
      <span class="row-value">${formatCurrency(actualPosnet)}</span>
    </div>
    <div class="row">
      <span class="row-title">• DIFERENCIA POSNET:</span>
      <span class="row-value">${formatCurrency(posnetDiff)}</span>
    </div>
    <div class="row">
      <span class="row-title">• TRANSF. BANCARIAS:</span>
      <span class="row-value">${formatCurrency(actualTransfer)}</span>
    </div>
    <div class="row">
      <span class="row-title">• DIFERENCIA BANCO:</span>
      <span class="row-value">${formatCurrency(transferDiff)}</span>
    </div>

    <!-- 5. CUENTAS CORRIENTES (FIADOS) -->
    ${closure.currentAccountAmount > 0 ? `
      <div class="divider"></div>
      <div class="section-title">5. SALIDAS CTA. CTE. (FIADOS)</div>
      <div class="row bolder">
        <span class="row-title bold">TOTAL FIADOS EN TURNO:</span>
        <span class="row-value">${formatCurrency(closure.currentAccountAmount)}</span>
      </div>
      ${closure.currentAccountDetails && closure.currentAccountDetails.length > 0 ? `
        <div style="font-size: 9px; margin-top: 3px; border: 1px dashed #777; padding: 3px;">
          <div class="bold" style="margin-bottom: 2px;">DETALLE DE CLIENTES (${closure.currentAccountDetails.length}):</div>
          ${closure.currentAccountDetails.map((cad) => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 1px; gap: 4px;">
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 auto;">• ${cad.customerName}</span>
              <span class="mono" style="flex: 0 0 auto;">${formatCurrency(cad.amount)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    ` : ''}

    <!-- 6. OBSERVACIONES -->
    ${closure.notes ? `
      <div class="divider"></div>
      <div class="section-title">6. OBSERVACIONES Y ACTA</div>
      <div style="font-size: 9.5px; font-style: italic; border: 1px solid #999; padding: 4px; background: #fff;">
        ${closure.notes}
      </div>
    ` : ''}

    <div class="divider-double"></div>

    <!-- SIGNATURES SECTION (RESPONSABILIDAD DEL OPERADOR) -->
    <div class="signature-box">
      <div class="signature-line"></div>
      <div class="text-center bold" style="font-size: 10.5px;">FIRMA DEL OPERADOR / CAJERO</div>
      <div class="text-center" style="font-size: 10px;">ACLARACIÓN: <strong>${operatorName}</strong></div>
      <div class="text-center" style="font-size: 9px; color: #444;">DNI / LEGAJO: _________________________</div>

      <div class="signature-line" style="margin-top: 18px;"></div>
      <div class="text-center bold" style="font-size: 10.5px;">FIRMA DEL ENCARGADO / SUPERVISOR</div>
      <div class="text-center" style="font-size: 9px; color: #444;">ACLARACIÓN: _________________________</div>
    </div>

    <div class="divider-dashed" style="border-bottom: 1px dashed #000; margin-top: 12px;"></div>
    <div class="text-center" style="font-size: 8.5px; color: #555; margin-top: 3px;">
      NECO POS Enterprise v4.8 • Documento de Control y Cierre Fiscal
    </div>
    <div style="height: 10mm;"></div>
  </div>
</body>
</html>`;
}

/**
 * Generates an 80mm thermal receipt HTML for an active shift summary (Resumen X).
 */
export function generateSummaryXTicketHtml(data: SummaryXData, branch?: BranchConfig): string {
  const effectiveBranch = branch || data.branch;
  const fantasyName = (effectiveBranch?.fantasyName || 'CARNICERÍAS NECO').toUpperCase();
  const branchName = data.branchName || effectiveBranch?.name || 'NECO 1 (Central)';
  const businessName = effectiveBranch?.businessName || effectiveBranch?.legalName || 'CARNICERÍAS NECO S.R.L.';
  const address = effectiveBranch?.address || 'Av. 24 de Septiembre 1250';
  const phone = effectiveBranch?.phone || '0387-4315890';
  const cuit = effectiveBranch?.cuit || '20-25506516-6';
  const ptoVta = effectiveBranch?.pointOfSale || '0017';
  const operatorName = formatCleanOperatorName(data.operator || data.operatorName);
  const currentDate = data.date || (new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR'));

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RESUMEN X - ${data.shift}</title>
  <style>
    @page {
      margin: 0;
      size: 80mm auto;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      background: #fff;
      color: #000;
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-size: 11.5px;
      line-height: 1.25;
    }
    .ticket-container {
      width: 74mm;
      max-width: 74mm;
      margin: 0 auto;
      padding: 3mm 2mm 8mm 2mm;
      background: #fff;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .bold { font-weight: 700; }
    .bolder { font-weight: 900; }
    .mono {
      font-family: 'Courier New', Courier, monospace;
      font-weight: 700;
      letter-spacing: -0.2px;
    }
    .divider {
      border-bottom: 1px dashed #000;
      margin: 4px 0;
      width: 100%;
    }
    .divider-solid {
      border-bottom: 1px solid #000;
      margin: 4px 0;
      width: 100%;
    }
    .divider-double {
      border-bottom: 2px solid #000;
      margin: 5px 0;
      width: 100%;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 2px;
      width: 100%;
      gap: 4px;
    }
    .row-title {
      font-size: 11px;
      color: #000;
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row-value {
      font-size: 11.5px;
      text-align: right;
      font-family: 'Courier New', Courier, monospace;
      font-weight: 700;
      flex: 0 0 auto;
      white-space: nowrap;
      letter-spacing: -0.2px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      margin: 4px 0 2px 0;
    }
    .box-operator {
      border: 1.5px solid #000;
      padding: 4px 5px;
      margin: 4px 0;
      background: #fff;
    }
    @media print {
      body {
        width: 74mm !important;
        padding: 0 !important;
        margin: 0 auto !important;
      }
      .ticket-container {
        width: 74mm !important;
        padding: 2mm 1mm 10mm 1mm !important;
      }
    }
  </style>
</head>
<body onload="setTimeout(() => { window.print(); }, 350)">
  <div class="ticket-container">
    <div class="text-center">
      <div class="bolder" style="font-size: 15px;">${fantasyName}</div>
      <div style="font-size: 10.5px;">${businessName}</div>
      <div style="font-size: 9.5px;">${address} | Tel: ${phone}</div>
      <div style="font-size: 9.5px;">CUIT: ${cuit}</div>
    </div>

    <div class="divider-double"></div>

    <div class="text-center">
      <div class="bolder" style="font-size: 13.5px;">INFORME DE CONTROL "X"</div>
      <div style="font-size: 10px; font-weight: bold; color: #444;">(ESTADO PARCIAL DE CAJA EN CURSO)</div>
      <div style="font-size: 9px; color: #666;">DOCUMENTO NO VÁLIDO COMO CIERRE Z</div>
    </div>

    <div class="divider"></div>

    <div class="box-operator">
      <div style="font-size: 9.5px; font-weight: bold; text-transform: uppercase;">OPERADOR / CAJERO ACTIVO:</div>
      <div class="bolder" style="font-size: 12.5px; text-transform: uppercase; margin: 1px 0; word-break: break-word;">
        👤 ${operatorName}
      </div>
      <div style="font-size: 10.5px;"><strong>TURNO:</strong> ${data.shift}</div>
      <div style="font-size: 10px;"><strong>SUCURSAL:</strong> ${branchName} | <strong>PTO. VTA:</strong> ${ptoVta}</div>
      <div style="font-size: 10px;"><strong>FECHA Y HORA:</strong> <span class="mono">${currentDate}</span></div>
    </div>

    <div class="divider"></div>

    <div class="section-title">VENTAS PARCIALES FACTURADAS</div>
    <div class="row">
      <span class="row-title">• FACTURAS "A":</span>
      <span class="row-value">${formatCurrency(data.invoicesA || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">• FACTURAS "B":</span>
      <span class="row-value">${formatCurrency(data.invoicesB || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">• RECIBOS COMUNES:</span>
      <span class="row-value">${formatCurrency(data.commonReceipts || 0)}</span>
    </div>

    <div class="divider-solid"></div>

    <div class="row" style="font-weight: 900;">
      <span class="row-title bold" style="font-size: 12px;">TOTAL ACUMULADO:</span>
      <span class="row-value mono" style="font-size: 13px;">${formatCurrency(data.totalSales || 0)}</span>
    </div>

    <div class="divider"></div>

    <div class="section-title">DESGLOSE POR MEDIO DE PAGO</div>
    <div class="row">
      <span class="row-title">• EFECTIVO:</span>
      <span class="row-value">${formatCurrency(data.cashAmount || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">• QR (BILLETERAS):</span>
      <span class="row-value">${formatCurrency(data.qrAmount || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">• TRANSFERENCIAS:</span>
      <span class="row-value">${formatCurrency(data.transferAmount || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">• TARJETAS (DÉB./CRÉD.):</span>
      <span class="row-value">${formatCurrency(data.cardAmount || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">• CTA. CTE. (FIADOS):</span>
      <span class="row-value">${formatCurrency(data.currentAccountAmount || 0)}</span>
    </div>

    <div class="divider"></div>

    <div class="section-title">ESTIMACIÓN EN GAVETA DE EFECTIVO</div>
    <div class="row">
      <span class="row-title">FONDO INICIAL:</span>
      <span class="row-value">${formatCurrency(data.initialFund || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">(+) VENTAS EFECTIVO:</span>
      <span class="row-value">${formatCurrency(data.cashAmount || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">(+) INGRESOS DE CAJA:</span>
      <span class="row-value">${formatCurrency(data.entries || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">(-) RETIROS DE CAJA:</span>
      <span class="row-value">-${formatCurrency(data.withdrawals || 0)}</span>
    </div>
    <div class="row">
      <span class="row-title">(-) GASTOS DE CAJA:</span>
      <span class="row-value">-${formatCurrency(data.expenses || 0)}</span>
    </div>

    <div class="divider-solid"></div>

    <div class="row bolder" style="font-size: 12.5px;">
      <span class="row-title bold" style="font-size: 11.5px;">EFECTIVO ESPERADO:</span>
      <span class="row-value mono" style="font-size: 13px;">${formatCurrency(data.expectedCash || 0)}</span>
    </div>

    <div class="divider-double"></div>

    <div class="text-center" style="font-size: 9px; color: #555; margin-top: 4px;">
      NECO POS Enterprise v4.8 • Arqueo de Control Parcial
    </div>
    <div style="height: 10mm;"></div>
  </div>
</body>
</html>`;
}

/**
 * Triggers printing of an 80mm cash closure receipt
 */
export function printClosureTicket(closure: CashClosure, branch?: BranchConfig) {
  const html = generateClosureTicketHtml(closure, branch);
  printTicket(html);
}

/**
 * Triggers printing of an 80mm summary X receipt
 */
export function printSummaryXTicket(data: SummaryXData, branch?: BranchConfig) {
  const html = generateSummaryXTicketHtml(data, branch);
  printTicket(html);
}

