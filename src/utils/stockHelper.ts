import { UnitType, StockTransfer, BranchConfig, ANIMAL_CATEGORIES, AnimalCategory, StockMovement } from '../types/pos';

export { ANIMAL_CATEGORIES };
export type { AnimalCategory };

/**
 * Determina si una categoría pertenece de forma positiva y explícita al rubro cárnico.
 * (Vaca, Ternera, Novillito, Novillo Pesado, Vaquillona, Cerdo, Cortes Vacunos, etc.)
 * Los artículos de almacén, bebidas, limpieza, fiambrería o sin clasificar quedan excluidos.
 */
export function isMeatCategory(category: string | undefined | null): boolean {
  if (!category) return false;
  const cat = category.trim().toLowerCase();

  // Exclusiones explícitas de no cárnicos
  if (
    cat.includes('almacén') ||
    cat.includes('almacen') ||
    cat.includes('bebida') ||
    cat.includes('limpieza') ||
    cat.includes('verduleria') ||
    cat.includes('verdulería') ||
    cat.includes('kiosco') ||
    cat.includes('fiambr') ||
    cat.includes('lacteo') ||
    cat.includes('lácteo') ||
    cat.includes('panaderia') ||
    cat.includes('panadería') ||
    cat.includes('bazar')
  ) {
    return false;
  }

  // Criterios positivos explícitos para productos cárnicos oficiales de NECO POS
  const positiveTerms = [
    'vaca',
    'ternera',
    'novillito',
    'novillo',
    'vaquillona',
    'cerdo',
    'porcino',
    'carne',
    'vacun',
    'pollo',
    'granja',
    'embutido',
    'achura',
    'menudencia',
    'subproducto',
    'desposte',
    'media res',
    'canal',
    'carcasa',
    'gancho',
    'hueso',
    'grasa',
    'sebo',
    'picada',
  ];

  return positiveTerms.some((term) => cat.includes(term));
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

// ==========================================
// AUDITORÍA Y CLASIFICACIÓN DE LOTES DE STOCK (Regla D)
// ==========================================

export type BatchStockStatus =
  | 'COMPLETAMENTE_APLICADO'
  | 'PARCIALMENTE_APLICADO'
  | 'NO_APLICADO'
  | 'INVALIDO'
  | 'INCONSISTENTE';

export interface BatchStockClassification {
  status: BatchStockStatus;
  valid: boolean;
  reason?: string;
  existingKeysCount: number;
  totalKeysCount: number;
  validMovements: StockMovement[];
  appliedMovements: StockMovement[];
  missingMovements: StockMovement[];
}

/**
 * Clasifica y audita un lote de movimientos de stock según la idempotencia y validación.
 * Distingue explícitamente entre:
 * - Lote completamente aplicado (todas las claves ya existen de forma compatible).
 * - Lote parcialmente aplicado (algunas claves existen y otras faltan; identifica missingMovements para recuperación sin duplicar).
 * - Lote no aplicado (ninguna clave existe; listo para aplicar).
 * - Lote inválido (datos incompletos, vacíos o cantidades no numéricas / no positivas).
 * - Lote inconsistente (clave de idempotencia existente con datos incompatibles).
 */
export function classifyStockMovementBatch(
  movements: StockMovement[],
  existingIdempotencyKeys:
    | Set<string>
    | string[]
    | Map<string, Partial<StockMovement>> = new Set()
): BatchStockClassification {
  if (!movements || !Array.isArray(movements) || movements.length === 0) {
    return {
      status: 'INVALIDO',
      valid: false,
      reason: 'Lote inválido: el lote de movimientos está vacío.',
      existingKeysCount: 0,
      totalKeysCount: 0,
      validMovements: [],
      appliedMovements: [],
      missingMovements: [],
    };
  }

  const isMap = existingIdempotencyKeys instanceof Map;
  const keysSet = isMap
    ? new Set(existingIdempotencyKeys.keys())
    : existingIdempotencyKeys instanceof Set
    ? existingIdempotencyKeys
    : new Set(existingIdempotencyKeys);

  // 1. Validar integridad de cada movimiento del lote
  for (const m of movements) {
    if (!m || !m.productCode || !m.branchId || !m.id) {
      return {
        status: 'INVALIDO',
        valid: false,
        reason: `Lote inválido: movimiento ${m?.id || 'sin ID'} carece de sucursal, código de producto o ID.`,
        existingKeysCount: 0,
        totalKeysCount: 0,
        validMovements: [],
        appliedMovements: [],
        missingMovements: [],
      };
    }
    const qty = Number(m.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return {
        status: 'INVALIDO',
        valid: false,
        reason: `Lote inválido: movimiento con código "${m.productCode}" tiene cantidad no numérica o menor/igual a cero (${m.quantity}).`,
        existingKeysCount: 0,
        totalKeysCount: 0,
        validMovements: [],
        appliedMovements: [],
        missingMovements: [],
      };
    }
  }

  // 2. Comprobar inconsistencias de datos en claves repetidas si se proporcionó detalle de claves
  if (isMap) {
    const map = existingIdempotencyKeys as Map<string, Partial<StockMovement>>;
    for (const m of movements) {
      if (m.idempotencyKey && map.has(m.idempotencyKey)) {
        const existingData = map.get(m.idempotencyKey)!;
        const diffProd = existingData.productCode && existingData.productCode !== m.productCode;
        const diffBranch = existingData.branchId && existingData.branchId !== m.branchId;
        const diffQty =
          existingData.quantity !== undefined &&
          Math.abs(Number(existingData.quantity) - Number(m.quantity)) > 0.001;
        const diffFactor =
          existingData.factor !== undefined && Number(existingData.factor) !== Number(m.factor);

        if (diffProd || diffBranch || diffQty || diffFactor) {
          return {
            status: 'INCONSISTENTE',
            valid: false,
            reason: `Inconsistencia detectada en clave "${m.idempotencyKey}": los datos del movimiento no coinciden con el registro existente (producto o cantidad incompatible).`,
            existingKeysCount: 1,
            totalKeysCount: movements.length,
            validMovements: [],
            appliedMovements: [],
            missingMovements: [],
          };
        }
      }
    }
  }

  const movementsWithKey = movements.filter((m) => !!m.idempotencyKey);
  const totalKeysCount = movementsWithKey.length;
  const appliedMovements = movements.filter((m) => m.idempotencyKey && keysSet.has(m.idempotencyKey));
  const missingMovements = movements.filter((m) => !m.idempotencyKey || !keysSet.has(m.idempotencyKey));
  const existingKeysCount = appliedMovements.length;

  // 3. Evaluar estado de idempotencia del lote
  if (totalKeysCount > 0) {
    if (existingKeysCount === totalKeysCount) {
      return {
        status: 'COMPLETAMENTE_APLICADO',
        valid: true,
        reason: 'Lote completamente aplicado previamente. No se re-descuenta para evitar duplicación.',
        existingKeysCount,
        totalKeysCount,
        validMovements: movements,
        appliedMovements,
        missingMovements: [],
      };
    }

    if (existingKeysCount > 0 && existingKeysCount < totalKeysCount) {
      return {
        status: 'PARCIALMENTE_APLICADO',
        valid: false, // No considerar exitosa una operación incompleta
        reason: `Lote parcialmente aplicado detectado (${existingKeysCount} de ${totalKeysCount} claves ya registradas). Se recuperan únicamente los ${missingMovements.length} movimientos faltantes.`,
        existingKeysCount,
        totalKeysCount,
        validMovements: movements,
        appliedMovements,
        missingMovements,
      };
    }
  }

  return {
    status: 'NO_APLICADO',
    valid: true,
    reason: 'Lote no aplicado previamente; listo para procesamiento atómico.',
    existingKeysCount: 0,
    totalKeysCount,
    validMovements: movements,
    appliedMovements: [],
    missingMovements: movements,
  };
}

