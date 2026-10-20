import { MeatReception, CarcassUnit, BranchConfig } from '../types/pos';
import { formatKg, formatCurrency } from './stockHelper';

/** Etiqueta visible de una media res. Usa la guardada o, si no existe (datos antiguos), la posición. */
export function carcassLabel(c: { label?: string }, index: number): string {
  return c.label?.trim() || `MR-${String(index + 1).padStart(3, '0')}`;
}

/** Siguiente número correlativo disponible dentro de una recepción. */
export function nextCarcassNumber(list: { label?: string }[]): number {
  let max = 0;
  list.forEach((c, i) => {
    const m = /^MR-(\d+)$/.exec(carcassLabel(c, i));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max + 1;
}

export function formatCarcassLabel(n: number): string {
  return `MR-${String(n).padStart(3, '0')}`;
}

/**
 * Genera el HTML de impresión oficial para el Remito / Acta de Recepción de Medias Reses en Cámara
 */
export function generateReceptionVoucherHtml(
  reception: MeatReception,
  branchConfig?: BranchConfig | null
): string {
  const branchName = branchConfig?.name || `Carnicerías Neco - Sucursal ${reception.branchId}`;
  const address = branchConfig?.address || 'Av. 24 de Septiembre 681, Tartagal, Salta';
  const cuit = branchConfig?.cuit || '20-25506516-6';

  const rowsHtml = reception.carcasses
    .map(
      (c, idx) => `
      <tr style="border-bottom: 1px solid #ccc; font-size: 11px;">
        <td style="padding: 4px 6px; text-align: center; font-weight: bold;">${idx + 1}</td>
        <td style="padding: 4px 6px; font-family: monospace; font-weight: bold;">${carcassLabel(c, idx)}</td>
        <td style="padding: 4px 6px;">${c.tagNumber || 'S/N'}</td>
        <td style="padding: 4px 6px; text-align: right; font-weight: bold;">${formatKg(c.weightKg)}</td>
        <td style="padding: 4px 6px; text-align: right;">${formatCurrency(reception.pricePerKg)}</td>
        <td style="padding: 4px 6px; text-align: right; font-weight: bold;">${formatCurrency(c.cost)}</td>
        <td style="padding: 4px 6px; font-size: 10px; color: #555;">${c.notes || '-'}</td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Acta de Recepción - ${reception.code}</title>
  <style>
    @media print {
      body { margin: 0; padding: 10mm; font-size: 11px; }
      @page { size: A4 portrait; margin: 10mm; }
    }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #111; line-height: 1.3; }
    .header { border-bottom: 2px solid #002046; padding-bottom: 8px; margin-bottom: 12px; }
    .title { font-size: 16px; font-weight: bold; color: #002046; text-transform: uppercase; }
    .subtitle { font-size: 11px; color: #555; }
    .box { border: 1px solid #999; padding: 8px; background: #fdfdfd; margin-bottom: 10px; border-radius: 3px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #002046; color: white; padding: 5px 6px; font-size: 11px; text-align: left; }
    .total-box { background: #f0f4f8; border: 1.5px solid #002046; padding: 8px; margin-top: 10px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 10px; }
    .sig-line { width: 42%; border-top: 1px solid #444; text-align: center; font-size: 11px; padding-top: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <div class="title">${branchName}</div>
        <div class="subtitle">${address} | CUIT: ${cuit}</div>
        <div class="subtitle">SISTEMA NECO POS — GESTIÓN FRIGORÍFICA & TRAZABILIDAD CÁRNICA</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 14px; font-weight: bold; color: #b91c1c;">COMPROBANTE DE RECEPCIÓN</div>
        <div style="font-size: 16px; font-weight: bold; font-family: monospace;">${reception.code}</div>
        <div style="font-size: 10px; color: #666;">Fecha: ${reception.date} ${reception.time}</div>
        <div style="font-size: 10px; font-weight: bold; color: ${reception.status === 'CONFIRMADO' ? '#15803d' : '#b45309'};">
          ESTADO: ${reception.status}
        </div>
      </div>
    </div>
  </div>

  <div class="box">
    <div style="font-weight: bold; font-size: 11px; color: #002046; margin-bottom: 6px; text-transform: uppercase;">
      1. DATOS DE ORIGEN, PROVEEDOR & GUÍA SENASA
    </div>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; font-size: 11px;">
      <div><strong>Proveedor:</strong><br>${reception.supplier}</div>
      <div><strong>N° Tropa SENASA:</strong><br><span style="font-family: monospace; font-weight: bold; color: #1e3a8a;">${reception.tropaNumber}</span></div>
      <div><strong>Especie / Categoría:</strong><br>${reception.species} - ${reception.category}</div>
      <div><strong>Destino:</strong><br>${reception.branchId} (${reception.chamber})</div>
      <div><strong>N° Factura:</strong><br>${reception.invoiceNumber || 'S/F'}</div>
      <div><strong>N° Remito:</strong><br>${reception.deliveryNoteNumber || 'S/R'}</div>
      <div><strong>DTE / Guía Tránsito:</strong><br>${reception.dteGuideNumber || 'S/DTE'}</div>
      <div><strong>Receptor / Operador:</strong><br>${reception.operator}</div>
    </div>
  </div>

  <div class="box">
    <div style="font-weight: bold; font-size: 11px; color: #002046; margin-bottom: 4px; text-transform: uppercase;">
      2. DETALLE INDIVIDUAL DE MEDIAS RESES INGRESADAS AL GANCHO
    </div>
    <table>
      <thead>
        <tr>
          <th style="width: 30px; text-align: center;">N°</th>
          <th style="width: 80px;">Identificador</th>
          <th>Garfa / Precinto SENASA</th>
          <th style="width: 90px; text-align: right;">Peso Real</th>
          <th style="width: 90px; text-align: right;">Precio $/Kg</th>
          <th style="width: 100px; text-align: right;">Costo Subtotal</th>
          <th>Observaciones</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>

  <div class="total-box">
    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
      <div>
        <strong>Cantidad de Medias Reses:</strong> <span style="font-size: 15px; font-weight: bold;">${reception.totalQuantity}</span> unidades
      </div>
      <div>
        <strong>Peso Bruto Total al Gancho:</strong> <span style="font-size: 16px; font-weight: bold; color: #b91c1c;">${formatKg(reception.totalWeightKg)}</span>
      </div>
      <div>
        <strong>Precio Pactado $/Kg:</strong> <span style="font-size: 14px; font-weight: bold;">${formatCurrency(reception.pricePerKg)}</span>
      </div>
      <div>
        <strong>IMPORTE TOTAL:</strong> <span style="font-size: 18px; font-weight: bold; color: #15803d;">${formatCurrency(reception.totalCost)}</span>
      </div>
    </div>
  </div>

  ${
    reception.notes
      ? `
  <div style="margin-top: 8px; font-size: 11px; color: #444; background: #fffbe8; border: 1px solid #fde047; padding: 6px;">
    <strong>Observaciones de Cámara / Calidad:</strong> ${reception.notes}
  </div>
  `
      : ''
  }

  <div class="signatures">
    <div class="sig-line">
      <strong>ENTREGÓ (Transportista / Frigorífico)</strong><br>
      Firma, Aclaración y DNI
    </div>
    <div class="sig-line">
      <strong>RECIBIÓ CONFORME (NECO POS)</strong><br>
      Encargado de Cámara / Sucursal: ${reception.operator}
    </div>
  </div>
</body>
</html>
`;
}
