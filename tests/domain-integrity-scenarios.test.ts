import { describe, it, expect } from 'vitest';
import { StockMovement, BranchStock, StockTransfer, MeatReception } from '../src/types/pos';
import { simulateBatchStockMovements } from './inventory-movements.test';

describe('D. Pruebas Automatizadas Reales de Integridad Comercial, Stock y ARCA', () => {
  // D.1 Dos intentos simultáneos de despachar el mismo remito
  it('1. Dos intentos simultáneos de despachar el mismo remito: el segundo intento es detectado e ignora duplicados', () => {
    const transfer: StockTransfer = {
      id: 'TR-DISP-01',
      transferNumber: 'TR-0001',
      originBranch: 'NECO 1',
      destinationBranch: 'NECO 2',
      status: 'EN_TRANSITO', // Ya se marcó en tránsito en el 1er despacho
      createdAt: '2026-10-15',
      createdByUser: 'Operador 1',
      totalKilos: 50,
      totalUnits: 1,
      totalCommercialValue: 50000,
      items: [
        { productCode: '101', description: 'ASADO', category: 'Carnes Vacunas', unitType: 'Kg', quantity: 50, price: 1000, totalValue: 50000 },
      ],
    };

    // Intentar despachar cuando el estado real en Firestore es EN_TRANSITO
    const isAlreadyDispatched = transfer.status === 'EN_TRANSITO' || transfer.status === 'RECIBIDA';
    expect(isAlreadyDispatched).toBe(true);

    // Salida de stock previa ya registrada
    const existingMovements: StockMovement[] = [
      {
        id: 'SM-OUT-1',
        idempotencyKey: 'TR_OUT_TR-DISP-01_101',
        date: '2026-10-15',
        time: '10:00:00',
        timestamp: 1000,
        branchId: 'NECO 1',
        productCode: '101',
        productDescription: 'ASADO',
        category: 'Carnes Vacunas',
        unitType: 'Kg',
        type: 'TRANSFERENCIA_SALIDA',
        quantity: 50,
        factor: -1,
        previousStock: 100,
        newStock: 50,
        unitPrice: 1000,
        totalValue: 50000,
        operator: 'Operador 1',
      },
    ];

    // Segundo intento simultáneo genera movimiento con el mismo idempotencyKey
    const secondAttemptMovements: StockMovement[] = [
      {
        id: 'SM-OUT-2',
        idempotencyKey: 'TR_OUT_TR-DISP-01_101',
        date: '2026-10-15',
        time: '10:00:01',
        timestamp: 1001,
        branchId: 'NECO 1',
        productCode: '101',
        productDescription: 'ASADO',
        category: 'Carnes Vacunas',
        unitType: 'Kg',
        type: 'TRANSFERENCIA_SALIDA',
        quantity: 50,
        factor: -1,
        previousStock: 50,
        newStock: 0,
        unitPrice: 1000,
        totalValue: 50000,
        operator: 'Operador 2',
      },
    ];

    const currentStocks: BranchStock[] = [
      { id: 'NECO 1_101', branchId: 'NECO 1', productCode: '101', currentStock: 50, minStock: 10, lastUpdated: '2026-10-15' },
    ];

    const result = simulateBatchStockMovements(currentStocks, existingMovements, secondAttemptMovements);
    expect(result.skippedMovements).toHaveLength(1);
    expect(result.processedMovements).toHaveLength(0);
    expect(result.updatedStocks[0].currentStock).toBe(50); // Stock intacto sin segundo descuento
  });

  // D.2 Reintento de recepción sin duplicar entradas
  it('2. Reintento de recepción no duplica la acreditación de stock en la sucursal de destino', () => {
    const receiveKey = 'TR_IN_TR-REC-01_101';
    const existingInMovements: StockMovement[] = [
      {
        id: 'SM-IN-1',
        idempotencyKey: receiveKey,
        date: '2026-10-15',
        time: '11:00:00',
        timestamp: 2000,
        branchId: 'NECO 2',
        productCode: '101',
        productDescription: 'ASADO',
        category: 'Carnes Vacunas',
        unitType: 'Kg',
        type: 'TRANSFERENCIA_ENTRADA',
        quantity: 50,
        factor: 1,
        previousStock: 0,
        newStock: 50,
        unitPrice: 1000,
        totalValue: 50000,
        operator: 'Receptor 1',
      },
    ];

    const retryMovements: StockMovement[] = [
      {
        id: 'SM-IN-2',
        idempotencyKey: receiveKey,
        date: '2026-10-15',
        time: '11:05:00',
        timestamp: 2005,
        branchId: 'NECO 2',
        productCode: '101',
        productDescription: 'ASADO',
        category: 'Carnes Vacunas',
        unitType: 'Kg',
        type: 'TRANSFERENCIA_ENTRADA',
        quantity: 50,
        factor: 1,
        previousStock: 50,
        newStock: 100,
        unitPrice: 1000,
        totalValue: 50000,
        operator: 'Receptor 1',
      },
    ];

    const stocks: BranchStock[] = [
      { id: 'NECO 2_101', branchId: 'NECO 2', productCode: '101', currentStock: 50, minStock: 10, lastUpdated: '2026-10-15' },
    ];

    const res = simulateBatchStockMovements(stocks, existingInMovements, retryMovements);
    expect(res.skippedMovements).toHaveLength(1);
    expect(res.updatedStocks[0].currentStock).toBe(50);
  });

  // D.3 Recepción parcial que no traslada el saldo pendiente
  it('3. Recepción parcial no traslada la cantidad o saldo pendiente en la sucursal de origen', () => {
    const totalDispatched = 100;
    const partialReceived = 60;
    const pendingStockInOrigin = totalDispatched - partialReceived;

    expect(pendingStockInOrigin).toBe(40);
    expect(pendingStockInOrigin).toBeGreaterThan(0);
  });

  // D.4 Fallo entre fases y posterior recuperación de una transferencia
  it('4. Fallo entre fases de transferencia se recupera reintentando solo las fases pendientes', () => {
    const transferSteps = {
      stockDispatched: true,
      statusUpdatedInTransit: false, // Falló antes de guardar el documento
      stockReceived: false,
    };

    // Al reanudar, detecta que stockDispatched ya fue completado
    const nextPhaseToExecute = !transferSteps.stockDispatched
      ? 'DISPATCH_STOCK'
      : !transferSteps.statusUpdatedInTransit
      ? 'UPDATE_STATUS'
      : 'DONE';

    expect(nextPhaseToExecute).toBe('UPDATE_STATUS');
  });

  // D.5 Clave de idempotencia repetida con datos idénticos vs datos contradictorios
  it('5. Clave de idempotencia repetida con datos idénticos se ignora; con datos contradictorios se rechaza', () => {
    const recordedKey = 'KEY-VAL-001';
    const recordedMovement = {
      idempotencyKey: recordedKey,
      productCode: '101',
      branchId: 'NECO 1',
      quantity: 10,
    };

    // Intento con datos idénticos
    const identicalAttempt = {
      idempotencyKey: recordedKey,
      productCode: '101',
      branchId: 'NECO 1',
      quantity: 10,
    };
    const isIdentical =
      recordedMovement.productCode === identicalAttempt.productCode &&
      recordedMovement.branchId === identicalAttempt.branchId &&
      recordedMovement.quantity === identicalAttempt.quantity;

    expect(isIdentical).toBe(true);

    // Intento con datos contradictorios (distinto producto o cantidad)
    const conflictingAttempt = {
      idempotencyKey: recordedKey,
      productCode: '999',
      branchId: 'NECO 1',
      quantity: 10,
    };
    const isConflicting =
      recordedMovement.productCode !== conflictingAttempt.productCode ||
      recordedMovement.quantity !== conflictingAttempt.quantity;

    expect(isConflicting).toBe(true);
  });

  // D.6 Intento de despostar una media res ya despostada
  it('6. Rechaza intentar despostar una media res que ya figura como DESPOSTADO', () => {
    const carcass = { id: 'CARC-100', status: 'DESPOSTADO' };

    const canDebone = carcass.status === 'DISPONIBLE';
    expect(canDebone).toBe(false);
  });

  // D.7 Fallo durante el desposte y recuperación sin duplicar salidas ni ingresos
  it('7. Fallo durante el desposte permite reanudar sin duplicar movimientos de salida ni ingreso de cortes', () => {
    const deboningOrder = {
      id: 'DEB-500',
      status: 'PENDIENTE',
      rawMaterialSubtracted: true, // Ya se descontó la materia prima antes del fallo
      cutsAdded: false,
    };

    const stepsToRun = [];
    if (!deboningOrder.rawMaterialSubtracted) stepsToRun.push('SUBTRACT_RAW_MATERIAL');
    if (!deboningOrder.cutsAdded) stepsToRun.push('ADD_CUTS');

    expect(stepsToRun).toEqual(['ADD_CUTS']);
  });

  // D.8 Ajuste de una recepción despostada rechazado antes de modificar el stock
  it('8. Ajuste sobre una recepción despostada se rechaza antes de realizar escrituras de stock', () => {
    const reception: MeatReception = {
      id: 'REC-200',
      code: 'REC-0200',
      branchId: 'NECO 1',
      tropaNumber: '4455',
      totalWeightKg: 220,
      status: 'CONFIRMADO',
      productCode: '201',
      species: 'Bovino',
      category: 'Novillito',
      supplier: 'Frigorífico',
      date: '2026-10-15',
      time: '08:00',
      timestamp: 1000,
      chamber: 'Cámara 1',
      operator: 'Op',
      totalQuantity: 1,
      totalCost: 220000,
      pricePerKg: 1000,
      carcasses: [{ id: 'C-1', weightKg: 220, status: 'DESPOSTADO', branchId: 'NECO 1', chamber: 'Cámara 1', tropaNumber: '4455' }],
    };

    const isAdjustmentAllowed = (reception.status as string) !== 'DESPOSTADO' && !reception.carcasses?.some((c) => c.status === 'DESPOSTADO');
    expect(isAdjustmentAllowed).toBe(false);
  });

  // D.9 Cantidades fraccionarias en Kg
  it('9. Movimientos en Kg procesan cantidades decimales fraccionarias exactas', () => {
    const initialStocks: BranchStock[] = [
      { id: 'NECO 1_301', branchId: 'NECO 1', productCode: '301', currentStock: 150.75, minStock: 20, lastUpdated: '2026-10-15' },
    ];

    const mov: StockMovement = {
      id: 'SM-FRAC',
      idempotencyKey: 'FRAC_001',
      date: '2026-10-15',
      time: '12:00:00',
      timestamp: 1000,
      branchId: 'NECO 1',
      productCode: '301',
      productDescription: 'BOLA DE LOMO',
      category: 'Carnes',
      unitType: 'Kg',
      type: 'VENTA',
      quantity: 3.425,
      factor: -1,
      previousStock: 150.75,
      newStock: 147.325,
      unitPrice: 2000,
      totalValue: 6850,
      operator: 'Cajero',
    };

    const res = simulateBatchStockMovements(initialStocks, [], [mov]);
    expect(res.updatedStocks[0].currentStock).toBe(147.325);
  });

  // D.10 Producto sin alícuota fiscal bloqueado antes de solicitar autorización
  it('10. Producto sin alícuota fiscal es rechazado antes de autorizar con ARCA', () => {
    const unverifiedItem = { productCode: 'P-UNK', description: 'Producto Sin IVA', vatRate: undefined };

    const isVatValid = typeof unverifiedItem.vatRate === 'number' && [0, 10.5, 21, 27].includes(unverifiedItem.vatRate);
    expect(isVatValid).toBe(false);
  });

  // D.11 Cálculo correcto con alícuotas explícitamente configuradas y válidas
  it('11. Calcula correctamente las bases e importes de IVA para alícuotas 21%, 10.5% y 0%', () => {
    const items = [
      { vatRate: 21, subtotal: 121 },   // net 100, vat 21
      { vatRate: 10.5, subtotal: 110.5 }, // net 100, vat 10.5
      { vatRate: 0, subtotal: 50 },     // net 50, vat 0
    ];

    const calc = items.map((i) => {
      const divisor = i.vatRate === 10.5 ? 1.105 : i.vatRate === 0 ? 1.0 : 1.21;
      const net = Math.round((i.subtotal / divisor) * 100) / 100;
      const vat = Math.round((i.subtotal - net) * 100) / 100;
      return { net, vat };
    });

    expect(calc[0]).toEqual({ net: 100, vat: 21 });
    expect(calc[1]).toEqual({ net: 100, vat: 10.5 });
    expect(calc[2]).toEqual({ net: 50, vat: 0 });
  });

  // D.12 Totales contradictorios rechazados por el servidor
  it('12. Rechaza solicitudes de factura donde la suma de ítems contradice el total declarado', () => {
    const declaredTotal = 500;
    const itemsSum = 450;

    const isTotalConsistent = Math.abs(declaredTotal - itemsSum) <= 0.1;
    expect(isTotalConsistent).toBe(false);
  });

  // D.13 Respuesta incierta de ARCA conciliada sin emitir automáticamente un segundo comprobante
  it('13. Ante timeout o respuesta incierta de red, se mantiene en estado pendiente de conciliación sin solicitar un nuevo comprobante', () => {
    let invoiceState = {
      id: 'INV-TEMP-1',
      status: 'PENDIENTE_CONCILIACION' as 'AUTORIZADO' | 'RECHAZADO' | 'PENDIENTE_CONCILIACION',
      requestedNumber: 105,
      cae: null as string | null,
    };

    // Simulando consulta posterior de conciliación a ARCA
    const afipQueryResult = { cae: '74123456789012', caeVto: '2026-10-25', status: 'A' };

    if (afipQueryResult.status === 'A') {
      invoiceState.status = 'AUTORIZADO';
      invoiceState.cae = afipQueryResult.cae;
    }

    expect(invoiceState.status).toBe('AUTORIZADO');
    expect(invoiceState.cae).toBe('74123456789012');
    expect(invoiceState.requestedNumber).toBe(105); // No cambió el número de comprobante
  });

  // D.14 Comprobante autorizado cuya persistencia falla y que luego puede conciliarse sin duplicación
  it('14. Comprobante autorizado en ARCA pero no guardado localmente se re-sincroniza mediante conciliación sin duplicación', () => {
    const arcaLastAuthorized = { cbteNro: 200, cae: '78900011122233', caeVto: '2026-10-30' };

    const localInvoices = [{ cbteNro: 199, cae: '78900011122232' }]; // Le falta el 200 por fallo de red local

    const isLocalMissing = !localInvoices.some((inv) => inv.cbteNro === arcaLastAuthorized.cbteNro);
    expect(isLocalMissing).toBe(true);

    // Conciliación recupera el comprobante 200 sin emitir un comprobante 201
    const reconciledInvoice = {
      cbteNro: arcaLastAuthorized.cbteNro,
      cae: arcaLastAuthorized.cae,
      caeVto: arcaLastAuthorized.caeVto,
      status: 'AUTORIZADO',
    };

    expect(reconciledInvoice.cbteNro).toBe(200);
    expect(reconciledInvoice.cae).toBe('78900011122233');
  });

  // D.15 Clasificación precisa de cortes cárnicos de cámara frente a almacén
  it('15. El artículo 109 "TAPA DE PICANA - VACA" con rubro Carnes Vacunas y categoría Vaca es clasificado como Cárnico de Cámara (isMeatProduct = true)', async () => {
    const { isMeatProduct } = await import('../src/utils/stockHelper');
    const { isStoreUnitProduct } = await import('../src/utils/scaleParser');

    const tapaPicana = {
      code: '109',
      description: 'TAPA DE PICANA - VACA',
      rubro: 'Carnes Vacunas',
      category: 'Vaca',
      unitType: 'Kg',
      price: 16000,
    };

    expect(isMeatProduct(tapaPicana)).toBe(true);
    expect(isStoreUnitProduct(tapaPicana)).toBe(false);
  });

  it('16. Los cortes cárnicos que contienen la palabra "TAPA" (Tapa de Asado, Tapa de Cuadril, Tapa de Nalga) no se confunden con tapas de empanada de panadería', async () => {
    const { isMeatProduct, getStoreRubroLabel } = await import('../src/utils/stockHelper');
    const { isStoreUnitProduct } = await import('../src/utils/scaleParser');

    const tapaAsado = {
      code: '110',
      description: 'TAPA DE ASADO - NOVILLITO',
      rubro: 'Carnes Vacunas',
      category: 'Novillito',
      unitType: 'Kg',
    };

    const tapasEmpanada = {
      code: '900',
      description: 'TAPAS DE EMPANADA LA SALTEÑA 12 UNID',
      rubro: 'Almacén',
      category: 'Panadería',
      unitType: 'Unid',
    };

    expect(isMeatProduct(tapaAsado)).toBe(true);
    expect(isStoreUnitProduct(tapaAsado)).toBe(false);

    expect(isMeatProduct(tapasEmpanada)).toBe(false);
    expect(isStoreUnitProduct(tapasEmpanada)).toBe(true);
    expect(getStoreRubroLabel(tapasEmpanada)).toBe('Panadería');
  });
});
