import { describe, it, expect } from 'vitest';
import { MeatReception, CarcassUnit, MeatDeboning, StockTransfer } from '../src/types/pos';

export function validateReceptionIntegrity(reception: MeatReception): {
  isValidSum: boolean;
  sumWeight: number;
  hasUniqueCarcassIds: boolean;
  carcassCount: number;
} {
  const carcasses = reception.carcasses || [];
  const sumWeight = Number(carcasses.reduce((acc, c) => acc + (Number(c.weightKg) || 0), 0).toFixed(3));
  const isValidSum = Math.abs(sumWeight - reception.totalWeightKg) < 0.05;

  const idSet = new Set<string>();
  let hasUniqueCarcassIds = true;
  for (const c of carcasses) {
    if (!c.id || idSet.has(c.id)) {
      hasUniqueCarcassIds = false;
      break;
    }
    idSet.add(c.id);
  }

  return {
    isValidSum,
    sumWeight,
    hasUniqueCarcassIds,
    carcassCount: carcasses.length,
  };
}

export function canCancelMeatReception(
  reception: MeatReception,
  allDebonings: MeatDeboning[],
  allTransfers: StockTransfer[]
): { canCancel: boolean; blockReason?: string } {
  // 1. Verificar si alguna media res fue despostada
  const hasDebonings = allDebonings.some(
    (d) =>
      d.status === 'FINALIZADO' &&
      (d.tropaNumber === reception.tropaNumber ||
        d.sourceProductCode === reception.code ||
        (d.selectedCarcassIds && d.selectedCarcassIds.some((cid) => reception.carcasses?.some((c) => c.id === cid))))
  );
  if (hasDebonings) {
    return {
      canCancel: false,
      blockReason: `No es posible anular la recepción ${reception.code}: contiene medias reses con despostes finalizados en el sistema.`,
    };
  }

  // 2. Verificar estado individual de las medias reses
  const hasConsumed = reception.carcasses?.some(
    (c) => c.status === 'DESPOSTADO' || c.status === 'TRASLADADO'
  );
  if (hasConsumed) {
    return {
      canCancel: false,
      blockReason: `No es posible anular la recepción ${reception.code}: una o más medias reses ya han sido despostadas o trasladadas.`,
    };
  }

  // 3. Verificar si tiene traslados
  const hasTransfers = allTransfers.some(
    (t) =>
      (t.status === 'EN_TRANSITO' || t.status === 'RECIBIDA') &&
      t.items.some((it) => it.description.includes(reception.tropaNumber) || it.productCode === reception.productCode)
  );
  if (hasTransfers) {
    return {
      canCancel: false,
      blockReason: `No es posible anular la recepción ${reception.code}: existen traslados de mercadería asociados.`,
    };
  }

  return { canCancel: true };
}

describe('15.2 Auditoría de Recepción de Medias Reses y Trazabilidad por Unidad', () => {
  it('Recepción con diez medias reses de pesos diferentes: la suma coincide exactamente y cada una tiene ID único', () => {
    const individualWeights = [
      112.500, 118.250, 120.100, 115.800, 122.300,
      114.750, 119.400, 121.600, 117.200, 116.900,
    ];
    const totalSum = Number(individualWeights.reduce((acc, w) => acc + w, 0).toFixed(3)); // 1178.800 Kg

    const receptionCode = 'REC-2026-TEST';
    const carcasses: CarcassUnit[] = individualWeights.map((w, idx) => ({
      id: `${receptionCode}-MR-${String(idx + 1).padStart(3, '0')}`,
      receptionId: 'REC-ID-1',
      tropaNumber: 'TR-8941',
      supplier: 'Frigorífico Test',
      species: 'Vacuno',
      category: 'Novillito',
      weightKg: w,
      branchId: 'NECO 1',
      chamber: 'Cámara Central NECO 1',
      status: 'DISPONIBLE',
    }));

    const reception: MeatReception = {
      id: 'REC-ID-1',
      code: receptionCode,
      date: '2026-10-12',
      time: '08:30:00',
      timestamp: 1000,
      branchId: 'NECO 1',
      chamber: 'Cámara Central NECO 1',
      status: 'CONFIRMADO',
      operator: 'Encargado de Cámara',
      tropaNumber: 'TR-8941',
      supplier: 'Frigorífico Test',
      species: 'Vacuno',
      category: 'Novillito',
      totalQuantity: 10,
      totalWeightKg: totalSum,
      pricePerKg: 4200,
      totalCost: totalSum * 4200,
      carcasses,
    };

    const integrity = validateReceptionIntegrity(reception);
    expect(integrity.isValidSum).toBe(true);
    expect(integrity.sumWeight).toBe(1178.800);
    expect(integrity.carcassCount).toBe(10);
    expect(integrity.hasUniqueCarcassIds).toBe(true);
  });

  it('Detecta discrepancia si el peso total de la recepción difiere de la suma de sus medias reses', () => {
    const carcasses: CarcassUnit[] = [
      {
        id: 'MR-001',
        weightKg: 120.0,
        branchId: 'NECO 1',
        category: 'Novillito',
        chamber: 'Cámara 1',
        species: 'Vacuno',
        supplier: 'Test',
        tropaNumber: 'TR-1',
        status: 'DISPONIBLE',
      },
      {
        id: 'MR-002',
        weightKg: 125.0,
        branchId: 'NECO 1',
        category: 'Novillito',
        chamber: 'Cámara 1',
        species: 'Vacuno',
        supplier: 'Test',
        tropaNumber: 'TR-1',
        status: 'DISPONIBLE',
      },
    ];

    const invalidReception: MeatReception = {
      id: 'REC-ERR',
      code: 'REC-ERR',
      date: '2026-10-12',
      time: '08:30:00',
      timestamp: 1000,
      branchId: 'NECO 1',
      chamber: 'Cámara 1',
      status: 'CONFIRMADO',
      operator: 'Operador',
      tropaNumber: 'TR-1',
      supplier: 'Test',
      species: 'Vacuno',
      category: 'Novillito',
      totalQuantity: 2,
      totalWeightKg: 300.0, // Error: 300 kg vs 245 kg suma real
      pricePerKg: 4000,
      totalCost: 1200000,
      carcasses,
    };

    const integrity = validateReceptionIntegrity(invalidReception);
    expect(integrity.isValidSum).toBe(false);
    expect(integrity.sumWeight).toBe(245.0);
  });

  it('Bloquea la anulación de una recepción si alguna media res ya fue despostada en una operación posterior', () => {
    const reception: MeatReception = {
      id: 'REC-1',
      code: 'REC-001',
      date: '2026-10-12',
      time: '08:00:00',
      timestamp: 1000,
      branchId: 'NECO 1',
      chamber: 'Cámara 1',
      status: 'CONFIRMADO',
      operator: 'Operador',
      tropaNumber: 'TR-500',
      supplier: 'Test',
      species: 'Vacuno',
      category: 'Novillito',
      totalQuantity: 2,
      totalWeightKg: 240.0,
      pricePerKg: 4200,
      totalCost: 1008000,
      carcasses: [
        {
          id: 'REC-001-MR-001',
          weightKg: 120.0,
          status: 'DESPOSTADO', // Ya fue despostada
          branchId: 'NECO 1',
          category: 'Novillito',
          chamber: 'Cámara 1',
          species: 'Vacuno',
          supplier: 'Test',
          tropaNumber: 'TR-500',
        },
        {
          id: 'REC-001-MR-002',
          weightKg: 120.0,
          status: 'DISPONIBLE',
          branchId: 'NECO 1',
          category: 'Novillito',
          chamber: 'Cámara 1',
          species: 'Vacuno',
          supplier: 'Test',
          tropaNumber: 'TR-500',
        },
      ],
    };

    const deboning: MeatDeboning = {
      id: 'DEB-1',
      code: 'DESP-001',
      date: '2026-10-12',
      time: '09:00:00',
      timestamp: 2000,
      branchId: 'NECO 1',
      chamber: 'Cámara 1',
      status: 'FINALIZADO',
      operator: 'Despostador',
      tropaNumber: 'TR-500',
      supplier: 'Test',
      carcassType: 'MEDIA_RES',
      animalCategory: 'Novillito',
      initialWeightKg: 120.0,
      costPerKgInitial: 4200,
      totalInitialCost: 504000,
      cuts: [],
      totalOutputWeightKg: 115.0,
      netMeatWeightKg: 95.0,
      boneWeightKg: 12.0,
      fatWeightKg: 8.0,
      scrapWeightKg: 0,
      shrinkageWeightKg: 5.0,
      shrinkagePercent: 4.17,
      netMeatYieldPercent: 79.17,
      totalYieldPercent: 95.83,
      totalCommercialValue: 650000,
      grossMarginTotal: 146000,
      grossMarginPercent: 22.46,
      multiplicationFactor: 1.29,
      breakEvenPricePerKg: 5305.26,
      selectedCarcassIds: ['REC-001-MR-001'],
    };

    const check = canCancelMeatReception(reception, [deboning], []);
    expect(check.canCancel).toBe(false);
    expect(check.blockReason).toContain('contiene medias reses con despostes finalizados');
  });
});
