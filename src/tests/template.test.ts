import { describe, it, expect } from 'vitest';
import { createYieldTemplateFromDeboning } from '../utils/deboningHelper';
import { MeatDeboning } from '../types/pos';

describe('Cálculo de Plantillas de Rendimiento', () => {
  it('debe calcular correctamente los coeficientes', () => {
    const mockDeboning: MeatDeboning = {
      id: 'D-123',
      code: 'DESP-1',
      date: '2026-10-12',
      time: '12:00:00',
      branchId: 'NECO 1',
      chamber: 'Camara 1',
      tropaNumber: '12345',
      supplier: 'Proveedor A',
      initialWeightKg: 80,
      animalCategory: 'Novillito',
      carcassType: 'MEDIA_RES',
      totalOutputWeightKg: 72,
      netMeatWeightKg: 65,
      netMeatYieldPercent: 81.25,
      shrinkageWeightKg: 8,
      shrinkagePercent: 10,
      totalInitialCost: 40000,
      totalCommercialValue: 60000,
      grossMarginTotal: 20000,
      grossMarginPercent: 33.33,
      multiplicationFactor: 1.5,
      status: 'FINALIZADO',
      operator: 'Admin',
      cuts: [
        { productCode: '101', description: 'ASADO', weightKg: 10, cutType: 'CORTE_UTIL', currentSalePrice: 1000 },
        { productCode: '103', description: 'VACÍO', weightKg: 8, cutType: 'CORTE_UTIL', currentSalePrice: 1000 },
        { productCode: '102', description: 'BIFE', weightKg: 6, cutType: 'CORTE_UTIL', currentSalePrice: 1000 },
      ],
    } as any;

    const template = createYieldTemplateFromDeboning(mockDeboning, 'Plantilla Prueba', 1);
    
    expect(template.items.find(i => i.productCode === '101')?.coefficient).toBe(0.125);
    expect(template.items.find(i => i.productCode === '103')?.coefficient).toBe(0.1);
    expect(template.items.find(i => i.productCode === '102')?.coefficient).toBe(0.075);
  });
});
