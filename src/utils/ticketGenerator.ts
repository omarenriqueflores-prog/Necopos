import { formatCurrency, formatWeight } from './scaleParser';
import { BranchConfig } from '../types/pos';
import QRCode from 'qrcode';

export interface TicketData {
  items: any[];
  total: number;
  subtotal?: number;
  netAmount?: number;
  vatAmount?: number;
  paymentMethod: string;
  ticketNumber: string;
  customerName?: string;
  customerDni?: string;
  customerVatCondition?: string;
  customerAddress?: string;
  invoiceType?: string;
  cashGiven?: number;
  change?: number;
  operatorName?: string;
  createdAt?: string;
  employeeDiscountPercent?: number;
  employeeDiscountAmount?: number;
  combinedPayments?: any[];
  cae?: string;
  caeVto?: string;
  qrUrl?: string;
}

export function generateQrSvg(text: string, size: number = 95): string {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const moduleCount = qr.modules.size;
    const margin = 1;
    const totalSize = moduleCount + margin * 2;
    let paths = '';
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qr.modules.get(r, c)) {
          paths += `M${c + margin},${r + margin}h1v1h-1z `;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${size}" height="${size}" shape-rendering="crispEdges" style="display:block;margin:0 auto;"><rect width="100%" height="100%" fill="#ffffff"/><path d="${paths}" fill="#000000"/></svg>`;
  } catch (e) {
    console.error('Error generating QR SVG:', e);
    return `<div style="width:${size}px;height:${size}px;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:9px;">QR AFIP</div>`;
  }
}

export const generateTicketHtml = (
  sale: TicketData,
  branch: BranchConfig,
  format?: 'TICKET' | 'A4'
) => {
  // Determine format from parameter or branch preference
  const targetFormat = format || (branch.ticketPrinter === 'A4' ? 'A4' : 'TICKET');

  // Normalize invoice type
  const rawType = (sale.invoiceType || '').toUpperCase();
  const isNC = rawType.includes('NOTA_CREDITO') || rawType.includes('NC');
  const isInvoiceA = rawType.includes('_A') || rawType.endsWith(' A') || rawType === 'A';
  const isInvoiceB = rawType.includes('_B') || rawType.endsWith(' B') || rawType === 'B';
  const isInvoiceC = rawType.includes('_C') || rawType.endsWith(' C') || rawType === 'C';
  const isRecibo = rawType.includes('RECIBO') || rawType === '';

  let invoiceLetter = 'B';
  let arcaCode = '006';
  let arcaTipoCmp = 6;
  let invoiceTitle = isNC ? 'NOTA DE CRÉDITO B' : 'FACTURA B';

  if (isRecibo) {
    invoiceLetter = 'X';
    arcaCode = '000';
    arcaTipoCmp = 999;
    invoiceTitle = 'RECIBO INTERNO';
  } else if (isInvoiceA) {
    invoiceLetter = 'A';
    arcaCode = isNC ? '003' : '001';
    arcaTipoCmp = isNC ? 3 : 1;
    invoiceTitle = isNC ? 'NOTA DE CRÉDITO A' : 'FACTURA A';
  } else if (isInvoiceB) {
    invoiceLetter = 'B';
    arcaCode = isNC ? '008' : '006';
    arcaTipoCmp = isNC ? 8 : 6;
    invoiceTitle = isNC ? 'NOTA DE CRÉDITO B' : 'FACTURA B';
  } else if (isInvoiceC) {
    invoiceLetter = 'C';
    arcaCode = isNC ? '013' : '011';
    arcaTipoCmp = isNC ? 13 : 11;
    invoiceTitle = isNC ? 'NOTA DE CRÉDITO C' : 'FACTURA C';
  }

  // Parse Point of Sale and Invoice Number
  const ticketParts = (sale.ticketNumber || '').split('-');
  const ptoVtaStr = ticketParts.length > 1
    ? ticketParts[0].padStart(5, '0')
    : (branch.pointOfSale || '1').toString().padStart(5, '0');
  const nroCmpStr = ticketParts.length > 1
    ? ticketParts[1].padStart(8, '0')
    : (sale.ticketNumber || '1').toString().padStart(8, '0');
  const formattedTicketNumber = `${ptoVtaStr}-${nroCmpStr}`;

  const dateStr = sale.createdAt
    ? new Date(sale.createdAt).toLocaleDateString('es-AR')
    : new Date().toLocaleDateString('es-AR');
  const timeStr = sale.createdAt
    ? new Date(sale.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // QR Code URL & Base64 Payload calculation according to ARCA / AFIP standard
  const qrCuitNum = parseInt(branch.cuit.replace(/\D/g, '') || '20255065166', 10);
  const qrPtoVta = parseInt(ptoVtaStr, 10);
  const qrNroCmp = parseInt(nroCmpStr, 10);
  const isCuitRecipient = (sale.customerDni?.replace(/\D/g, '').length === 11);
  const qrTipoDoc = sale.customerVatCondition?.toLowerCase().includes('inscripto')
    ? 80
    : (isCuitRecipient ? 80 : 96);
  const qrNroDoc = parseInt(sale.customerDni?.replace(/\D/g, '') || '0', 10);
  const qrCaeNum = parseInt(sale.cae?.replace(/\D/g, '') || '0', 10);

  const qrDataObj = {
    ver: 1,
    fecha: sale.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0],
    cuit: qrCuitNum,
    ptoVta: qrPtoVta,
    tipoCmp: arcaTipoCmp,
    nroCmp: qrNroCmp,
    importe: Number(sale.total.toFixed(2)),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: qrTipoDoc,
    nroDocRec: qrNroDoc,
    tipoCodAut: "E",
    codAut: qrCaeNum
  };
  const qrPayloadB64 = btoa(JSON.stringify(qrDataObj));
  const fullQrVerificationUrl = `https://www.afip.gob.ar/fe/qr/?p=${qrPayloadB64}`;

  // Header Title & Legal Name from branch configuration (no hardcoded names)
  // Prominently display Nombre de Fantasía as primary title, and Razón Social as legal titular
  const rawFantasy = (branch.fantasyName || branch.name || '').trim();
  const rawLegal = (branch.businessName || branch.legalName || '').trim();

  const headerTitle = (rawFantasy || rawLegal || '').toUpperCase();
  const headerLegal = rawLegal || rawFantasy || '';

  // Net and VAT amounts calculation
  const totalAmount = sale.total || 0;
  const netAmount = sale.netAmount !== undefined && sale.netAmount > 0
    ? sale.netAmount
    : Number((totalAmount / 1.21).toFixed(2));
  const vatAmount = sale.vatAmount !== undefined && sale.vatAmount > 0
    ? sale.vatAmount
    : Number((totalAmount - netAmount).toFixed(2));

  // ==========================================
  // A4 FORMAT (OFICIAL AFIP / ARCA STANDARDS)
  // ==========================================
  if (targetFormat === 'A4') {
    const itemsRowsHtml = (sale.items || []).map((item, idx) => {
      const qty = item.quantity?.toFixed(2) || item.weight?.toFixed(3) || '1.000';
      const sub = item.subtotal || item.totalAmount || (item.quantity * item.unitPrice) || 0;
      const unit = item.unitType || (item.weight ? 'Kg' : 'Un.');
      const price = item.unitPrice || 0;
      const code = item.code || item.productCode || String(idx + 1).padStart(4, '0');
      const desc = item.description || 'Producto';

      return `
        <tr style="font-size: 10px; height: 22px;">
          <td style="border-right: 1px solid #000; border-bottom: 1px solid #d5d5d5; padding: 4px; text-align: center; font-family: monospace;">${code}</td>
          <td style="border-right: 1px solid #000; border-bottom: 1px solid #d5d5d5; padding: 4px 6px; text-align: left;">${desc}</td>
          <td style="border-right: 1px solid #000; border-bottom: 1px solid #d5d5d5; padding: 4px; text-align: right; font-family: monospace;">${qty}</td>
          <td style="border-right: 1px solid #000; border-bottom: 1px solid #d5d5d5; padding: 4px; text-align: center;">${unit}</td>
          <td style="border-right: 1px solid #000; border-bottom: 1px solid #d5d5d5; padding: 4px 6px; text-align: right; font-family: monospace;">${formatCurrency(price)}</td>
          <td style="border-right: 1px solid #000; border-bottom: 1px solid #d5d5d5; padding: 4px; text-align: center; font-family: monospace;">0,00</td>
          <td style="border-right: ${isInvoiceA ? '1px solid #000' : 'none'}; border-bottom: 1px solid #d5d5d5; padding: 4px 6px; text-align: right; font-family: monospace; font-weight: bold;">${formatCurrency(sub)}</td>
          ${isInvoiceA ? `
            <td style="border-right: 1px solid #000; border-bottom: 1px solid #d5d5d5; padding: 4px; text-align: center; font-family: monospace;">21%</td>
            <td style="border-bottom: 1px solid #d5d5d5; padding: 4px 6px; text-align: right; font-family: monospace; font-weight: bold;">${formatCurrency(sub)}</td>
          ` : ''}
        </tr>
      `;
    }).join('');

    // Fill table with subtle rows to occupy full height smoothly
    const currentItemCount = (sale.items || []).length;
    const minRows = 14;
    const fillerCount = Math.max(0, minRows - currentItemCount);
    let fillerRowsHtml = '';
    for (let i = 0; i < fillerCount; i++) {
      fillerRowsHtml += `
        <tr style="height: 22px;">
          <td style="border-right: 1px solid #000; border-bottom: 1px solid #ebebeb; padding: 2px;">&nbsp;</td>
          <td style="border-right: 1px solid #000; border-bottom: 1px solid #ebebeb; padding: 2px;">&nbsp;</td>
          <td style="border-right: 1px solid #000; border-bottom: 1px solid #ebebeb; padding: 2px;">&nbsp;</td>
          <td style="border-right: 1px solid #000; border-bottom: 1px solid #ebebeb; padding: 2px;">&nbsp;</td>
          <td style="border-right: 1px solid #000; border-bottom: 1px solid #ebebeb; padding: 2px;">&nbsp;</td>
          <td style="border-right: 1px solid #000; border-bottom: 1px solid #ebebeb; padding: 2px;">&nbsp;</td>
          <td style="border-right: ${isInvoiceA ? '1px solid #000' : 'none'}; border-bottom: 1px solid #ebebeb; padding: 2px;">&nbsp;</td>
          ${isInvoiceA ? `
            <td style="border-right: 1px solid #000; border-bottom: 1px solid #ebebeb; padding: 2px;">&nbsp;</td>
            <td style="border-bottom: 1px solid #ebebeb; padding: 2px;">&nbsp;</td>
          ` : ''}
        </tr>
      `;
    }

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${invoiceTitle} ${formattedTicketNumber}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm 8mm 10mm;
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
      height: 100%;
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5px;
      color: #000;
      line-height: 1.25;
    }
    .page-container {
      width: 190mm;
      height: 278mm;
      max-height: 278mm;
      margin: 0 auto;
      padding: 0;
      background: #fff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
      overflow: hidden;
      page-break-inside: avoid;
      page-break-after: avoid;
    }
    .top-section {
      width: 100%;
      flex-shrink: 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    .header-table {
      width: 100%;
      border: 1px solid #000;
      border-collapse: collapse;
      margin-bottom: 5px;
    }
    .header-table td {
      vertical-align: top;
      padding: 5px 10px;
    }
    .client-table {
      width: 100%;
      border: 1px solid #000;
      border-collapse: collapse;
      margin-bottom: 5px;
      background: #fbfbfb;
    }
    .client-table td {
      padding: 5px 8px;
      vertical-align: top;
    }
    .items-section {
      width: 100%;
      flex: 1;
      display: flex;
      flex-direction: column;
      border: 1px solid #000;
      margin-bottom: 5px;
      min-height: 130mm;
    }
    .items-table {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
    }
    .items-table th {
      background-color: #f0f0f0 !important;
      border-bottom: 1px solid #000;
      border-right: 1px solid #000;
      padding: 5px 4px;
      font-size: 9.5px;
      font-weight: bold;
      text-transform: uppercase;
      text-align: center;
    }
    .items-table th:last-child {
      border-right: none;
    }
    .bottom-section {
      width: 100%;
      flex-shrink: 0;
    }
    .totals-wrapper {
      width: 100%;
      margin-bottom: 5px;
    }
    .totals-table {
      width: 100%;
      border: 1px solid #000;
      border-collapse: collapse;
      background: #fdfdfd;
    }
    .totals-table td {
      padding: 4px 8px;
      font-size: 10.5px;
    }
    .footer-table {
      width: 100%;
      border: 1px solid #000;
      border-collapse: collapse;
      background: #fff;
    }
    .footer-table td {
      padding: 6px 10px;
      vertical-align: middle;
    }
    @media print {
      html, body {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: none !important;
      }
      .page-container {
        width: 190mm !important;
        height: 278mm !important;
        max-height: 278mm !important;
        margin: 0 auto !important;
        padding: 0 !important;
        border: none !important;
        box-sizing: border-box !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        page-break-inside: avoid !important;
        page-break-after: avoid !important;
      }
    }
  </style>
</head>
<body onload="setTimeout(() => { window.print(); }, 400)">
  <div class="page-container">
    <!-- TOP SECTION: HEADER AND CLIENT DETAILS -->
    <div class="top-section">
      <!-- Document Copy Marker -->
      <div style="text-align: center; font-weight: bold; font-size: 11px; letter-spacing: 2px; margin-bottom: 2px;">
        ORIGINAL
      </div>

      <!-- MAIN HEADER ENCLOSURE -->
      <table class="header-table">
        <tr>
          <!-- Left Side: Emisor -->
          <td style="width: 45%; border-right: 1px solid #000;">
            <div style="font-size: 16px; font-weight: 900; color: #002046; line-height: 1.1; margin-bottom: 4px;">
              ${headerTitle}
            </div>
            <div style="font-size: 10px; color: #333; margin-bottom: 2px;">
              <strong>Razón Social:</strong> ${headerLegal}
            </div>
            <div style="font-size: 10px; color: #333; margin-bottom: 2px;">
              <strong>Domicilio Comercial:</strong> ${branch.address || ''}
            </div>
            <div style="font-size: 10px; color: #333; margin-bottom: 2px;">
              <strong>Teléfono:</strong> ${branch.phone || '---'}
            </div>
            <div style="font-size: 10.5px; font-weight: bold; margin-top: 4px; color: #000;">
              Condición frente al IVA: IVA RESPONSABLE INSCRIPTO
            </div>
          </td>

          <!-- Center: Letter Box -->
          <td style="width: 10%; border-right: 1px solid #000; text-align: center; padding: 2px; background: #fff; vertical-align: top;">
            <div style="width: 52px; height: 52px; border: 1px solid #000; margin: 0 auto; display: flex; flex-direction: column; justify-content: center; align-items: center; background: #fff;">
              <span style="font-size: 30px; font-weight: 900; line-height: 1; font-family: Arial, sans-serif;">${invoiceLetter}</span>
              <span style="font-size: 8px; font-weight: bold; font-family: monospace;">COD. ${arcaCode}</span>
            </div>
          </td>

          <!-- Right Side: Invoice & Tax Details -->
          <td style="width: 45%; text-align: right;">
            <div style="font-size: 17px; font-weight: 900; letter-spacing: 0.5px; margin-bottom: 3px;">
              ${invoiceTitle}
            </div>
            <div style="font-size: 12px; font-family: monospace; font-weight: bold; margin-bottom: 2px;">
              Nº: <strong>${ptoVtaStr}-${nroCmpStr}</strong>
            </div>
            <div style="font-size: 10.5px; margin-bottom: 3px;">
              <strong>Fecha de Emisión:</strong> ${dateStr}
            </div>
            <div style="border-top: 1px solid #ddd; padding-top: 3px; margin-top: 3px; font-size: 10px; line-height: 1.3;">
              <div><strong>CUIT:</strong> <span style="font-family: monospace;">${branch.cuit}</span></div>
              <div><strong>Ingresos Brutos:</strong> <span style="font-family: monospace;">${branch.iibb || branch.grossIncome || '---'}</span></div>
              <div><strong>Fecha Inicio Actividades:</strong> ${branch.startActivities || '01/09/2015'}</div>
            </div>
          </td>
        </tr>
      </table>

      <!-- CLIENT DETAILS TABLE -->
      <table class="client-table">
        <tr>
          <td style="width: 50%; border-right: 1px solid #e0e0e0;">
            <div style="margin-bottom: 2px;">
              <span style="color: #444;">CUIT / DNI:</span>
              <strong style="font-family: monospace; font-size: 11px; margin-left: 4px;">${sale.customerDni || '00-00000000-0'}</strong>
            </div>
            <div style="margin-bottom: 2px;">
              <span style="color: #444;">Condición frente al IVA:</span>
              <strong style="margin-left: 4px;">${sale.customerVatCondition || 'Consumidor Final'}</strong>
            </div>
            <div>
              <span style="color: #444;">Condición de Venta:</span>
              <strong style="margin-left: 4px;">Contado Efectivo / Transferencia</strong>
            </div>
          </td>
          <td style="width: 50%;">
            <div style="margin-bottom: 2px;">
              <span style="color: #444;">Apellido y Nombre / Razón Social:</span>
              <strong style="margin-left: 4px; font-size: 11px;">${sale.customerName || 'CONSUMIDOR FINAL'}</strong>
            </div>
            <div>
              <span style="color: #444;">Domicilio Comercial:</span>
              <span style="margin-left: 4px;">${sale.customerAddress || 'S/D'}</span>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- MIDDLE SECTION: FULL-HEIGHT ITEMS TABLE -->
    <div class="items-section">
      <table class="items-table">
        <thead>
          <tr style="height: 25px;">
            <th style="width: 10%;">Código</th>
            <th style="width: ${isInvoiceA ? '36%' : '44%'}; text-align: left; padding-left: 6px;">Descripción del Artículo</th>
            <th style="width: 10%; text-align: right; padding-right: 6px;">Cant.</th>
            <th style="width: 7%;">U.M.</th>
            <th style="width: 12%; text-align: right; padding-right: 6px;">Precio Unit.</th>
            <th style="width: 7%;">% Bon.</th>
            <th style="width: ${isInvoiceA ? '11%' : '14%'}; text-align: right; padding-right: 6px;">Subtotal</th>
            ${isInvoiceA ? `
              <th style="width: 7%;">% IVA</th>
              <th style="width: 11%; text-align: right; padding-right: 6px;">Subt. c/IVA</th>
            ` : ''}
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
          ${fillerRowsHtml}
          <!-- Flexible Spacer Row to anchor columns all the way to the bottom -->
          <tr style="height: 100%;">
            <td style="border-right: 1px solid #000;">&nbsp;</td>
            <td style="border-right: 1px solid #000;">&nbsp;</td>
            <td style="border-right: 1px solid #000;">&nbsp;</td>
            <td style="border-right: 1px solid #000;">&nbsp;</td>
            <td style="border-right: 1px solid #000;">&nbsp;</td>
            <td style="border-right: 1px solid #000;">&nbsp;</td>
            <td style="${isInvoiceA ? 'border-right: 1px solid #000;' : ''}">&nbsp;</td>
            ${isInvoiceA ? '<td style="border-right: 1px solid #000;">&nbsp;</td><td>&nbsp;</td>' : ''}
          </tr>
        </tbody>
      </table>
    </div>

    <!-- BOTTOM SECTION: TOTALS & FISCAL CAE/QR FOOTER -->
    <div class="bottom-section">
      <!-- TOTALS SECTION -->
      <div class="totals-wrapper">
        <table class="totals-table">
          <tr>
            <td style="width: 60%; vertical-align: middle; border-right: 1px solid #000;">
              ${isInvoiceA ? `
                <div style="display: flex; gap: 15px; font-size: 10px;">
                  <div><span style="color: #555;">NETO GRAVADO:</span> <strong style="font-family: monospace;">${formatCurrency(netAmount)}</strong></div>
                  <div><span style="color: #555;">IVA 21%:</span> <strong style="font-family: monospace;">${formatCurrency(vatAmount)}</strong></div>
                  <div><span style="color: #555;">IVA 10.5%:</span> <strong style="font-family: monospace;">$ 0,00</strong></div>
                  <div><span style="color: #555;">EXENTO:</span> <strong style="font-family: monospace;">$ 0,00</strong></div>
                </div>
              ` : `
                <div style="font-size: 9.5px; color: #555;">
                  Comprobante emitido a Consumidor Final conforme a la normativa de facturación electrónica de AFIP / ARCA.
                </div>
              `}
            </td>
            <td style="width: 40%; text-align: right;">
              ${sale.employeeDiscountAmount ? `
                <div style="font-size: 10px; margin-bottom: 2px;">
                  <span>Subtotal:</span>
                  <span style="font-family: monospace; margin-left: 6px;">${formatCurrency(totalAmount + sale.employeeDiscountAmount)}</span>
                </div>
                <div style="font-size: 10px; margin-bottom: 2px; color: #b91c1c;">
                  <span>Desc. Empleado (${sale.employeeDiscountPercent}%):</span>
                  <span style="font-family: monospace; margin-left: 6px;">- ${formatCurrency(sale.employeeDiscountAmount)}</span>
                </div>
              ` : ''}
              <div style="font-size: 15px; font-weight: 900; border-top: 1px solid #000; padding-top: 3px; margin-top: 2px;">
                <span>IMPORTE TOTAL:</span>
                <span style="font-family: monospace; margin-left: 8px; color: #002046;">${formatCurrency(totalAmount)}</span>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- FISCAL FOOTER (CAE & QR CODE) -->
      <table class="footer-table">
        <tr>
          <td style="width: 105px; text-align: center; border-right: 1px solid #e0e0e0; vertical-align: middle;">
            ${!isRecibo ? `
              <div style="width: 95px; height: 95px; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
                ${generateQrSvg(fullQrVerificationUrl, 95)}
              </div>
            ` : `
              <div style="font-size: 9px; font-weight: bold; color: #666;">DOCUMENTO NO VÁLIDO COMO FACTURA</div>
            `}
          </td>
          <td style="padding-left: 12px; vertical-align: middle;">
            ${!isRecibo ? `
              <div style="font-size: 11.5px; font-weight: bold; color: #002046; display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                <span style="color: #059669; font-size: 14px;">✔</span>
                <span>COMPROBANTE AUTORIZADO POR ARCA (AFIP)</span>
              </div>
              <div style="font-size: 9.5px; color: #444; margin-bottom: 3px;">
                Régimen Especial de Emisión y Almacenamiento Electrónico de Comprobantes.
              </div>
              <div style="font-size: 8px; color: #666; font-family: monospace; word-break: break-all;">
                Verificación QR: ${fullQrVerificationUrl.slice(0, 75)}...
              </div>
            ` : `
              <div style="font-size: 10px; color: #666;">Control Interno de Mostrador y Caja</div>
            `}
          </td>
          <td style="width: 38%; text-align: right; vertical-align: middle;">
            ${!isRecibo ? `
              <div style="font-size: 12px; margin-bottom: 3px;">
                <strong>C.A.E. N°:</strong>
                <strong style="font-family: monospace; font-size: 14px; margin-left: 4px; color: #000;">${sale.cae || '---'}</strong>
              </div>
              <div style="font-size: 11px; color: #333;">
                <strong>Fecha Vto. de CAE:</strong>
                <span style="font-family: monospace; font-weight: bold; margin-left: 4px;">${sale.caeVto ? new Date(sale.caeVto).toLocaleDateString('es-AR') : '---'}</span>
              </div>
            ` : ''}
          </td>
        </tr>
      </table>
    </div>
  </div>
</body>
</html>`;
  }

  // ==========================================
  // THERMAL TICKET FORMAT (58mm / 80mm)
  // ==========================================
  const ticketItemsHtml = (sale.items || []).map(item => {
    const qtyStr = item.weight ? formatWeight(item.weight) : `${item.quantity || 1} U`;
    const sub = item.subtotal || item.totalAmount || (item.quantity * item.unitPrice) || 0;
    const price = item.unitPrice || 0;
    const desc = item.description || 'Producto';

    return `
      <div style="margin-bottom: 4px;">
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span style="max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${desc}</span>
          <span style="font-family: monospace;">${formatCurrency(sub)}</span>
        </div>
        <div style="font-size: 9.5px; color: #444;">${qtyStr} x ${formatCurrency(price)}</div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${invoiceTitle} ${formattedTicketNumber}</title>
  <style>
    @page {
      margin: 0;
      size: ${branch.ticketPrinter === '58mm' ? '58mm' : '80mm'} auto;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: 'Arial Narrow', Arial, sans-serif;
      width: ${branch.ticketPrinter === '58mm' ? '54mm' : '74mm'};
      padding: 4mm 2mm;
      margin: 0 auto;
      line-height: 1.2;
      font-size: 11px;
      color: #000;
      background: #fff;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .divider { border-bottom: 1px dashed #000; margin: 4px 0; }
    .double-divider { border-bottom: 2px solid #000; margin: 5px 0; }
  </style>
</head>
<body onload="setTimeout(() => { window.print(); }, 300)">
  <div class="text-center">
    <div style="font-size: 15px; font-weight: 900; letter-spacing: 0.5px;">${headerTitle}</div>
    ${headerLegal && headerLegal.toUpperCase() !== headerTitle ? `
    <div style="font-size: 10px; margin-top: 1px;">${headerLegal.toUpperCase()}</div>
    ` : ''}
    <div style="font-size: 9.5px; margin-top: 2px;">${branch.address || ''}</div>
    <div style="font-size: 9.5px;">CUIT: ${branch.cuit} - IIBB: ${branch.iibb || branch.grossIncome || '---'}</div>
    <div style="font-size: 9.5px; font-weight: bold;">IVA RESPONSABLE INSCRIPTO</div>
    <div style="font-size: 9px;">INICIO ACTIV.: ${branch.startActivities || '01/09/2015'}</div>
  </div>

  <div class="divider"></div>

  <!-- Letter Box -->
  <div style="border: 1px solid #000; width: 34px; height: 34px; margin: 3px auto; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
    <span style="font-size: 18px; font-weight: 900; line-height: 1;">${invoiceLetter}</span>
    <span style="font-size: 7px; font-weight: bold;">COD. ${arcaCode}</span>
  </div>

  <div class="text-center bold" style="font-size: 13px;">${invoiceTitle}</div>
  <div class="text-center" style="font-size: 11px; font-family: monospace; font-weight: bold;">N° ${formattedTicketNumber}</div>
  <div class="text-center" style="font-size: 9.5px; color: #333; margin-bottom: 3px;">Fecha: ${dateStr} ${timeStr}</div>

  <div class="divider"></div>

  <div style="font-size: 10px;">
    <div><strong>RECEPTOR:</strong> ${sale.customerName || 'CONSUMIDOR FINAL'}</div>
    <div>CUIT/DNI: <span style="font-family: monospace;">${sale.customerDni || '00-00000000-0'}</span></div>
    <div>COND. IVA: ${sale.customerVatCondition || 'Consumidor Final'}</div>
    <div>COND. VENTA: Contado Efectivo / Transf.</div>
  </div>

  <div class="divider"></div>

  <!-- Items list -->
  <div style="margin: 4px 0;">
    ${ticketItemsHtml}
  </div>

  <div class="divider"></div>

  <!-- Totals -->
  <div style="font-size: 10.5px;">
    ${isInvoiceA ? `
      <div style="display: flex; justify-content: space-between;"><span>NETO GRAV.:</span><span style="font-family: monospace;">${formatCurrency(netAmount)}</span></div>
      <div style="display: flex; justify-content: space-between;"><span>IVA 21%:</span><span style="font-family: monospace;">${formatCurrency(vatAmount)}</span></div>
    ` : ''}
    ${sale.employeeDiscountAmount ? `
      <div style="display: flex; justify-content: space-between;"><span>Subtotal:</span><span style="font-family: monospace;">${formatCurrency(totalAmount + sale.employeeDiscountAmount)}</span></div>
      <div style="display: flex; justify-content: space-between; color: #b91c1c;"><span>Desc. Empl:</span><span style="font-family: monospace;">- ${formatCurrency(sale.employeeDiscountAmount)}</span></div>
    ` : ''}
    <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: 900; margin-top: 3px; border-top: 1px solid #000; padding-top: 3px;">
      <span>TOTAL:</span>
      <span style="font-family: monospace;">${formatCurrency(totalAmount)}</span>
    </div>
  </div>

  ${!isRecibo ? `
    <div class="divider"></div>
    <div style="font-size: 9.5px; line-height: 1.3;">
      <div><strong>CAE:</strong> <span style="font-family: monospace; font-weight: bold;">${sale.cae || '---'}</span></div>
      <div><strong>Vto. CAE:</strong> <span style="font-family: monospace;">${sale.caeVto ? new Date(sale.caeVto).toLocaleDateString('es-AR') : '---'}</span></div>
    </div>
    <div style="text-align: center; margin-top: 8px;">
      <div style="display: inline-block;">
        ${generateQrSvg(fullQrVerificationUrl, 90)}
      </div>
      <div style="font-size: 8px; color: #555; margin-top: 2px;">Comprobante Autorizado por ARCA</div>
    </div>
  ` : ''}

  ${branch.ticketFooter ? `
    <div class="divider"></div>
    <div style="text-align: center; font-size: 9.5px; margin-top: 4px;">${branch.ticketFooter}</div>
  ` : ''}
</body>
</html>`;
};

export const printTicket = (htmlContent: string) => {
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  } else {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.opacity = '0';
    document.body.appendChild(iframe);
    iframe.contentDocument?.open();
    iframe.contentDocument?.write(htmlContent);
    iframe.contentDocument?.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {
          // ignore
        }
      }, 1500);
    }, 400);
  }
};
