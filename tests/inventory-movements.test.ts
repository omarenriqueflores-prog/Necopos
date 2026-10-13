import { describe, it, expect } from 'vitest';
import { StockMovement, BranchStock } from '../src/types/pos';
import { classifyStockMovementBatch } from '../src/utils/stockHelper';

/**
 * Función pura que modela la lógica de consolidación y cálculo continuo de kardex
 * idéntica a la implementada en recordStockMovementsBatch en FirebaseContext.
 */
export function simulateBatchStockMovements(
  initialStocks: BranchStock[],
  existingMovements: StockMovement[],
  newMovements: StockMovement[]
): {
  updatedStocks: BranchStock[];
  processedMovements: StockMovement[];
  skippedMovements: StockMovement[];
} {
  const recordedKeys = new Set(existingMovements.map((m) => m.idempotencyKey).filter(Boolean));
  const validMovements: StockMovement[] = [];
  const skippedMovements: StockMovement[] = [];

  for (const mov of newMovements) {
    if (!mov || !mov.productCode || !mov.branchId) {
      skippedMovements.push(mov);
      continue;
    }
    const qty = Number(mov.quantity);
    if (isNaN(qty) || !isFinite(qty) || qty <= 0) {
      skippedMovements.push(mov);
      continue;
    }
    if (mov.idempotencyKey && recordedKeys.has(mov.idempotencyKey)) {
      skippedMovements.push(mov);
      continue;
    }
    validMovements.push(mov);
  }

  const groups = new Map<string, StockMovement[]>();
  for (const mov of validMovements) {
    const key = `${mov.branchId}_${mov.productCode}`;
    const list = groups.get(key) || [];
    list.push(mov);
    groups.set(key, list);
  }

  const processedMovements: StockMovement[] = [];
  const stockMap = new Map<string, BranchStock>();
  initialStocks.forEach((s) => stockMap.set(s.id, { ...s }));

  for (const [key, groupMovs] of groups.entries()) {
    const existing = stockMap.get(key);
    let runningStock = existing ? Number(existing.currentStock) || 0 : 0;
    const [branchIdStr, ...codeParts] = key.split('_');
    const branchId = branchIdStr as 'NECO 1' | 'NECO 2';
    const productCode = codeParts.join('_');

    for (const mov of groupMovs) {
      const qty = Number(mov.quantity) || 0;
      const factor = mov.factor || 1;
      const prev = runningStock;
      runningStock = Number((runningStock + qty * factor).toFixed(3));

      processedMovements.push({
        ...mov,
        previousStock: prev,
        newStock: runningStock,
      });
    }

    stockMap.set(key, {
      id: key,
      branchId,
      productCode,
      currentStock: runningStock,
      minStock: existing?.minStock ?? 20,
      lastUpdated: new Date().toISOString(),
      chamberName: existing?.chamberName || 'Cámara Central NECO 1',
    });
  }

  return {
    updatedStocks: Array.from(stockMap.values()),
    processedMovements,
    skippedMovements,
  };
}

describe('15.1 y 15.5 Auditoría de Movimientos de Stock y Ventas', () => {
  it('Caso A: dos salidas del mismo producto en un mismo lote descuentan de forma continua y no se sobrescriben', () => {
    const initialStocks: BranchStock[] = [
      {
        id: 'NECO 1_101',
        branchId: 'NECO 1',
        productCode: '101',
        currentStock: 20.0,
        minStock: 10,
        lastUpdated: '2026-10-12',
      },
    ];

    const newMovements: StockMovement[] = [
      {
        id: 'SM-1',
        date: '2026-10-12',
        time: '10:00:00',
        timestamp: 1000,
        branchId: 'NECO 1',
        productCode: '101',
        productDescription: 'ASADO DE TIRA',
        category: 'CARNES VACUNAS',
        unitType: 'Kg',
        type: 'VENTA',
        quantity: 2.0,
        factor: -1,
        previousStock: 0,
        newStock: 0,
        unitPrice: 5000,
        totalValue: 10000,
        operator: 'Cajero 1',
      },
      {
        id: 'SM-2',
        date: '2026-10-12',
        time: '10:00:01',
        timestamp: 1001,
        branchId: 'NECO 1',
        productCode: '101',
        productDescription: 'ASADO DE TIRA',
        category: 'CARNES VACUNAS',
        unitType: 'Kg',
        type: 'VENTA',
        quantity: 3.0,
        factor: -1,
        previousStock: 0,
        newStock: 0,
        unitPrice: 5000,
        totalValue: 15000,
        operator: 'Cajero 1',
      },
    ];

    const result = simulateBatchStockMovements(initialStocks, [], newMovements);

    expect(result.processedMovements).toHaveLength(2);
    // Movimiento 1: parte de 20 y deja 18
    expect(result.processedMovements[0].previousStock).toBe(20.0);
    expect(result.processedMovements[0].newStock).toBe(18.0);

    // Movimiento 2: parte de 18 y deja 15
    expect(result.processedMovements[1].previousStock).toBe(18.0);
    expect(result.processedMovements[1].newStock).toBe(15.0);

    // Saldo final en la cámara debe ser exactamente 15 kg
    const finalStock = result.updatedStocks.find((s) => s.id === 'NECO 1_101');
    expect(finalStock).toBeDefined();
    expect(finalStock?.currentStock).toBe(15.0);
  });

  it('Caso B: reintento de la misma operación (idempotencia) no duplica el descuento de inventario', () => {
    const existingMovement: StockMovement = {
      id: 'SM-EXISTING',
      date: '2026-10-12',
      time: '09:00:00',
      timestamp: 500,
      branchId: 'NECO 1',
      productCode: '101',
      productDescription: 'ASADO DE TIRA',
      category: 'CARNES VACUNAS',
      unitType: 'Kg',
      type: 'VENTA',
      quantity: 5.0,
      factor: -1,
      previousStock: 20.0,
      newStock: 15.0,
      unitPrice: 5000,
      totalValue: 25000,
      idempotencyKey: 'SALE_TICKET_0001_101_0',
      operator: 'Cajero 1',
    };

    const initialStocks: BranchStock[] = [
      {
        id: 'NECO 1_101',
        branchId: 'NECO 1',
        productCode: '101',
        currentStock: 15.0,
        minStock: 10,
        lastUpdated: '2026-10-12',
      },
    ];

    // Reintento idéntico con la misma idempotencyKey
    const duplicateMovement: StockMovement = {
      ...existingMovement,
      id: 'SM-RETRY-1',
    };

    const result = simulateBatchStockMovements(initialStocks, [existingMovement], [duplicateMovement]);

    expect(result.processedMovements).toHaveLength(0);
    expect(result.skippedMovements).toHaveLength(1);
    const currentStock = result.updatedStocks.find((s) => s.id === 'NECO 1_101');
    // El stock se mantiene inalterado en 15 kg
    expect(currentStock?.currentStock).toBe(15.0);
  });

  it('Caso C: Venta con múltiples renglones del mismo corte (2kg + 3kg) descontando un total de 5kg exactos', () => {
    const initialStocks: BranchStock[] = [
      {
        id: 'NECO 1_103',
        branchId: 'NECO 1',
        productCode: '103',
        currentStock: 20.0,
        minStock: 10,
        lastUpdated: '2026-10-12',
      },
    ];

    const saleItemsMovements: StockMovement[] = [
      {
        id: 'SM-SALE-ITEM-1',
        date: '2026-10-12',
        time: '11:00:00',
        timestamp: 2000,
        branchId: 'NECO 1',
        productCode: '103',
        productDescription: 'VACÍO CORTE ESPECIAL',
        category: 'CARNES VACUNAS',
        unitType: 'Kg',
        type: 'VENTA',
        quantity: 2.0,
        factor: -1,
        previousStock: 0,
        newStock: 0,
        unitPrice: 6500,
        totalValue: 13000,
        idempotencyKey: 'SALE_TK_999_103_0',
        operator: 'Cajero 1',
      },
      {
        id: 'SM-SALE-ITEM-2',
        date: '2026-10-12',
        time: '11:00:00',
        timestamp: 2001,
        branchId: 'NECO 1',
        productCode: '103',
        productDescription: 'VACÍO CORTE ESPECIAL',
        category: 'CARNES VACUNAS',
        unitType: 'Kg',
        type: 'VENTA',
        quantity: 3.0,
        factor: -1,
        previousStock: 0,
        newStock: 0,
        unitPrice: 6500,
        totalValue: 19500,
        idempotencyKey: 'SALE_TK_999_103_1',
        operator: 'Cajero 1',
      },
    ];

    const result = simulateBatchStockMovements(initialStocks, [], saleItemsMovements);

    expect(result.processedMovements).toHaveLength(2);
    const finalStock = result.updatedStocks.find((s) => s.id === 'NECO 1_103');
    expect(finalStock?.currentStock).toBe(15.0);

    const totalDeducted = result.processedMovements.reduce((acc, m) => acc + m.quantity, 0);
    expect(totalDeducted).toBe(5.0);
  });

  it('Caso D: Validación estricta rechaza movimientos con cantidades inválidas o no numéricas (NaN, <=0)', () => {
    const initialStocks: BranchStock[] = [
      {
        id: 'NECO 1_101',
        branchId: 'NECO 1',
        productCode: '101',
        currentStock: 20.0,
        minStock: 10,
        lastUpdated: '2026-10-12',
      },
    ];

    const invalidMovements: StockMovement[] = [
      {
        id: 'SM-INVALID-1',
        date: '2026-10-12',
        time: '12:00:00',
        timestamp: 3000,
        branchId: 'NECO 1',
        productCode: '101',
        productDescription: 'ASADO',
        category: 'CARNES',
        unitType: 'Kg',
        type: 'VENTA',
        quantity: -5.0, // Inválido (debe ser cantidad positiva con factor -1)
        factor: -1,
        previousStock: 0,
        newStock: 0,
        unitPrice: 5000,
        totalValue: 0,
        operator: 'Cajero 1',
      },
      {
        id: 'SM-INVALID-2',
        date: '2026-10-12',
        time: '12:00:00',
        timestamp: 3001,
        branchId: 'NECO 1',
        productCode: '101',
        productDescription: 'ASADO',
        category: 'CARNES',
        unitType: 'Kg',
        type: 'VENTA',
        quantity: NaN, // Inválido
        factor: -1,
        previousStock: 0,
        newStock: 0,
        unitPrice: 5000,
        totalValue: 0,
        operator: 'Cajero 1',
      },
    ];

    const result = simulateBatchStockMovements(initialStocks, [], invalidMovements);
    expect(result.processedMovements).toHaveLength(0);
    expect(result.skippedMovements).toHaveLength(2);
    // Stock no fue alterado
    expect(result.updatedStocks.find((s) => s.id === 'NECO 1_101')?.currentStock).toBe(20.0);
  });

  describe('Regla 3: Auditoría y Clasificación de Idempotencia en Lotes de Stock', () => {
    const validBatch: StockMovement[] = [
      {
        id: 'SM-101',
        date: '2026-10-12',
        time: '12:00:00',
        timestamp: 1000,
        branchId: 'NECO 1',
        productCode: '101',
        productDescription: 'ASADO',
        category: 'CARNES',
        unitType: 'Kg',
        type: 'VENTA',
        quantity: 2.5,
        factor: -1,
        previousStock: 10,
        newStock: 7.5,
        unitPrice: 5000,
        totalValue: 12500,
        idempotencyKey: 'IDEMP_KEY_1',
        operator: 'Admin',
      },
      {
        id: 'SM-102',
        date: '2026-10-12',
        time: '12:00:01',
        timestamp: 1001,
        branchId: 'NECO 1',
        productCode: '103',
        productDescription: 'VACÍO',
        category: 'CARNES',
        unitType: 'Kg',
        type: 'VENTA',
        quantity: 1.5,
        factor: -1,
        previousStock: 15,
        newStock: 13.5,
        unitPrice: 6000,
        totalValue: 9000,
        idempotencyKey: 'IDEMP_KEY_2',
        operator: 'Admin',
      },
    ];

    it('Lote no aplicado: todas las claves son nuevas, se clasifica como NO_APLICADO y es válido', () => {
      const classification = classifyStockMovementBatch(validBatch, new Set());
      expect(classification.status).toBe('NO_APLICADO');
      expect(classification.valid).toBe(true);
      expect(classification.existingKeysCount).toBe(0);
      expect(classification.totalKeysCount).toBe(2);
    });

    it('Lote completamente aplicado: todas las claves ya existen, se clasifica como COMPLETAMENTE_APLICADO sin re-descontar', () => {
      const existingKeys = new Set(['IDEMP_KEY_1', 'IDEMP_KEY_2']);
      const classification = classifyStockMovementBatch(validBatch, existingKeys);
      expect(classification.status).toBe('COMPLETAMENTE_APLICADO');
      expect(classification.valid).toBe(true);
      expect(classification.existingKeysCount).toBe(2);
      expect(classification.totalKeysCount).toBe(2);
    });

    it('Lote parcialmente aplicado: solo 1 de 2 claves existe, se clasifica como PARCIALMENTE_APLICADO y se rechaza la operación incompleta', () => {
      const existingKeys = new Set(['IDEMP_KEY_1']); // Solo 1 de 2 existe
      const classification = classifyStockMovementBatch(validBatch, existingKeys);
      expect(classification.status).toBe('PARCIALMENTE_APLICADO');
      expect(classification.valid).toBe(false); // No considerar exitosa una operación incompleta
      expect(classification.existingKeysCount).toBe(1);
      expect(classification.totalKeysCount).toBe(2);
      expect(classification.reason).toContain('parcialmente aplicado');
    });

    it('Lote inválido: lote vacío o con cantidades negativas/NaN se clasifica como INVALIDO', () => {
      const emptyClassification = classifyStockMovementBatch([], new Set());
      expect(emptyClassification.status).toBe('INVALIDO');
      expect(emptyClassification.valid).toBe(false);

      const invalidBatch: StockMovement[] = [
        {
          id: 'SM-INV',
          date: '2026-10-12',
          time: '12:00:00',
          timestamp: 1000,
          branchId: 'NECO 1',
          productCode: '101',
          productDescription: 'ASADO',
          category: 'CARNES',
          unitType: 'Kg',
          type: 'VENTA',
          quantity: -10, // Cantidad inválida
          factor: -1,
          previousStock: 0,
          newStock: 0,
          unitPrice: 5000,
          totalValue: 0,
          operator: 'Admin',
        },
      ];
      const invClassification = classifyStockMovementBatch(invalidBatch, new Set());
      expect(invClassification.status).toBe('INVALIDO');
      expect(invClassification.valid).toBe(false);
    });
  });
});
