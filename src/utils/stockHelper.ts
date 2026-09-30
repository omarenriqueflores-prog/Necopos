import { UnitType, StockTransfer, BranchConfig } from '../types/pos';

/**
 * Determina si una categoría pertenece al rubro cárnico (Vacuna, Cerdo, Pollo, Embutidos, Achuras).
 * Las categorías de almacén, bebidas y fiambrería NO son consideradas para la valorización de stock cárnico.
 */
export function isMeatCategory(category: string | undefined | null): boolean {
  if (!category) return true; // Por defecto en carnicería Neco se asume cárnico
  const cat = category.trim().toLowerCase();

  // Exclusiones explícitas de almacén y no cárnicos
  if (
    cat.includes('almacén') ||
    cat.includes('almacen') ||
    cat.includes('bebida') ||
    cat.includes('limpieza') ||
    cat.includes('verduleria') ||
    cat.includes('kiosco')
  ) {
    return false;
  }

  // Inclusiones cárnicas
  if (
    cat.includes('carne') ||
    cat.includes('vacun') ||
    cat.includes('ternera') ||
    cat.includes('novillo') ||
    cat.includes('vaca') ||
    cat.includes('pollo') ||
    cat.includes('granja') ||
    cat.includes('porcino') ||
    cat.includes('cerdo') ||
    cat.includes('embutido') ||
    cat.includes('achura') ||
    cat.includes('menudencia')
  ) {
    return true;
  }

  // Por defecto, si el producto se vende por Kg es considerado cárnico
  return true;
}

/**
 * Formatea kilogramos con 3 decimales reglamentarios para balanza (ej: 12,350 Kg)
 */
export function formatKg(val: number | null | undefined): string {
  const num = Number(val) || 0;
  return `${num.toLocaleString('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} Kg`;
}

/**
 * Formatea cantidad según su unidad (Kg o Unid)
 */
export function formatQuantity(val: number | null | undefined, unitType: UnitType): string {
  const num = Number(val) || 0;
  if (unitType === 'Kg') {
    return formatKg(num);
  }
  return `${Math.round(num).toLocaleString('es-AR')} Unid`;
}

/**
 * Formatea moneda argentina ($ 12.500,00)
 */
export function formatCurrency(amount: number | null | undefined): string {
  const num = Number(amount) || 0;
  return `$ ${num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Genera el documento HTML del Remito de Transferencia de Cámara para impresión
 */
export function generateTransferRemitoHtml(
  transfer: StockTransfer,
  branches?: Record<'NECO 1' | 'NECO 2', BranchConfig> | null
): string {
  const origin = branches ? branches[transfer.originBranch] : null;
  const dest = branches ? branches[transfer.destinationBranch] : null;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Remito de Transferencia - ${transfer.transferNumber}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          body {
            font-family: Arial, sans-serif;
            font-size: 12px;
            color: #111;
            margin: 0;
            padding: 0;
          }
          .header {
            border: 2px solid #002046;
            padding: 12px;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
          }
          .title {
            font-size: 18px;
            font-weight: bold;
            color: #002046;
          }
          .meta-box {
            border: 1px solid #777;
            padding: 8px;
            margin-bottom: 12px;
            background-color: #f8f9fa;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
          }
          th {
            background-color: #002046;
            color: white;
            padding: 6px;
            text-align: left;
            font-size: 11px;
            border: 1px solid #002046;
          }
          td {
            padding: 6px;
            border: 1px solid #ccc;
            font-size: 11px;
          }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .font-mono { font-family: monospace; }
          .signatures {
            margin-top: 40px;
            display: flex;
            justify-content: space-between;
          }
          .sign-box {
            width: 45%;
            border-top: 1px solid #000;
            padding-top: 5px;
            text-align: center;
            font-size: 11px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">NECO CARNICERÍAS</div>
            <div>Control de Traslado y Despacho de Cámaras Frigoríficas</div>
            <div style="font-size: 10px; color: #555; margin-top: 4px;">Documento de control interno no válido como factura</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: bold; color: #ba1a1a;">${transfer.transferNumber}</div>
            <div>Fecha: ${transfer.createdAt}</div>
            <div>Estado: <strong>${transfer.status}</strong></div>
          </div>
        </div>

        <div class="meta-box">
          <table style="margin: 0; border: none;">
            <tr style="border: none;">
              <td style="border: none; width: 50%;">
                <strong>ORIGEN (Despacho de Cámara):</strong><br>
                ${transfer.originBranch} - ${origin?.name || 'Casa Central'}<br>
                ${origin?.address || ''}<br>
                Despachado por: <strong>${transfer.createdByUser}</strong> ${transfer.sentAt ? `(${transfer.sentAt})` : ''}
              </td>
              <td style="border: none; width: 50%;">
                <strong>DESTINO (Recepción en Cámara):</strong><br>
                ${transfer.destinationBranch} - ${dest?.name || 'Sucursal'}<br>
                ${dest?.address || ''}<br>
                Recibido por: <strong>${transfer.receivedByUser || 'Pendiente'}</strong> ${transfer.receivedAt ? `(${transfer.receivedAt})` : ''}
              </td>
            </tr>
          </table>
          ${
            transfer.driverName || transfer.vehiclePlate || transfer.notes
              ? `<div style="margin-top: 8px; font-size: 11px; border-top: 1px dashed #bbb; padding-top: 4px;">
                  ${transfer.driverName ? `<strong>Chofer/Transportista:</strong> ${transfer.driverName} | ` : ''}
                  ${transfer.vehiclePlate ? `<strong>Vehículo/Patente:</strong> ${transfer.vehiclePlate} | ` : ''}
                  ${transfer.notes ? `<strong>Observaciones:</strong> ${transfer.notes}` : ''}
                </div>`
              : ''
          }
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 50px;">CÓDIGO</th>
              <th>DESCRIPCIÓN DEL CORTE / ARTÍCULO</th>
              <th style="width: 120px;">CATEGORÍA</th>
              <th style="width: 60px;" class="text-center">UNIDAD</th>
              <th style="width: 90px;" class="text-right">CANTIDAD</th>
              <th style="width: 90px;" class="text-right">PRECIO VIG.</th>
              <th style="width: 110px;" class="text-right">VALOR COMERCIAL</th>
            </tr>
          </thead>
          <tbody>
            ${transfer.items
              .map(
                (item) => `
              <tr>
                <td class="font-mono text-center">${item.productCode}</td>
                <td><strong>${item.description}</strong></td>
                <td>${item.category}</td>
                <td class="text-center">${item.unitType}</td>
                <td class="text-right font-mono font-bold">${formatQuantity(item.quantity, item.unitType)}</td>
                <td class="text-right font-mono">${formatCurrency(item.price)}</td>
                <td class="text-right font-mono font-bold">${formatCurrency(item.totalValue)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
          <tfoot>
            <tr style="background-color: #f1f4f8; font-weight: bold;">
              <td colspan="4" class="text-right">TOTALES DESPACHADOS:</td>
              <td class="text-right font-mono" style="color: #002046;">${formatKg(transfer.totalKilos)}</td>
              <td></td>
              <td class="text-right font-mono" style="color: #002046;">${formatCurrency(transfer.totalCommercialValue)}</td>
            </tr>
          </tfoot>
        </table>

        <div class="signatures">
          <div class="sign-box">
            Firma y Aclaración Responsable Despacho<br>
            <strong>${transfer.originBranch}</strong>
          </div>
          <div class="sign-box">
            Firma y Aclaración Responsable Recepción<br>
            <strong>${transfer.destinationBranch}</strong>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Imprime el remito de transferencia de forma limpia en el navegador
 */
export function printTransferRemito(
  transfer: StockTransfer,
  branches?: Record<'NECO 1' | 'NECO 2', BranchConfig> | null
) {
  const html = generateTransferRemitoHtml(transfer, branches);
  const printWindow = window.open('', '_blank', 'width=850,height=900');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  }
}
