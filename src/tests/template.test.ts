import { describe, it, expect } from 'vitest';
import { createYieldTemplateFromDeboning, prepareNextTemplateVersion } from '../utils/deboningHelper';
import { MeatDeboning, DeboningYieldTemplate } from '../types/pos';

describe('Cálculo de Plantillas de Rendimiento', () => {
  const mockDeboning: MeatDeboning = {
    id: 'D-123',
    code: 'DESP-1',
    date: '2026-10-12',
    time: '12:00:00',
    timestamp: 1760270400000,
    branchId: 'NECO 1',
    chamber: 'Camara 1',
    tropaNumber: '12345',
    supplier: 'Proveedor A',
    initialWeightKg: 80,
    costPerKgInitial: 500,
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
    appliedAt: '2026-10-12T12:30:00.000Z',
    operator: 'Admin',
    cuts: [
      { productCode: '101', description: 'ASADO', weightKg: 10, cutType: 'CORTE_UTIL', currentSalePrice: 1000 },
      { productCode: '103', description: 'VACÍO', weightKg: 8, cutType: 'CORTE_UTIL', currentSalePrice: 1000 },
      { productCode: '102', description: 'BIFE', weightKg: 6, cutType: 'CORTE_UTIL', currentSalePrice: 1000 },
    ],
  } as any;

  it('debe calcular correctamente los coeficientes', () => {
    const template = createYieldTemplateFromDeboning(mockDeboning, 'Plantilla Prueba', 1);
    
    expect(template.items.find(i => i.productCode === '101')?.coefficient).toBe(0.125);
    expect(template.items.find(i => i.productCode === '103')?.coefficient).toBe(0.1);
    expect(template.items.find(i => i.productCode === '102')?.coefficient).toBe(0.075);
  });

  describe('Regla 1: Bloqueo de planillas no finalizadas y estimaciones', () => {
    it('debe rechazar la creación de planilla si el desposte está en estado BORRADOR', () => {
      const draftDeboning = { ...mockDeboning, status: 'BORRADOR' as const };
      expect(() => {
        createYieldTemplateFromDeboning(draftDeboning, 'Plantilla Invalida');
      }).toThrow(/BORRADOR/);
    });

    it('debe rechazar la creación de planilla si el desposte está ANULADO', () => {
      const cancelledDeboning = { ...mockDeboning, status: 'ANULADO' as const };
      expect(() => {
        createYieldTemplateFromDeboning(cancelledDeboning, 'Plantilla Anulada');
      }).toThrow(/anulada/);
    });

    it('debe rechazar la creación de planilla si proviene de estimaciones', () => {
      const estimatedDeboning = { ...mockDeboning, isEstimated: true };
      expect(() => {
        createYieldTemplateFromDeboning(estimatedDeboning, 'Plantilla Estimada');
      }).toThrow(/estimaciones/);
    });

    it('debe rechazar la creación de planilla si algún corte tiene peso no positivo o inválido', () => {
      const invalidCutsDeboning = {
        ...mockDeboning,
        cuts: [
          { productCode: '101', description: 'ASADO', weightKg: 0, cutType: 'CORTE_UTIL' },
        ],
      } as any;
      expect(() => {
        createYieldTemplateFromDeboning(invalidCutsDeboning, 'Plantilla Con Peso 0');
      }).toThrow(/pesaje real positivo válido/);
    });
  });

  describe('Regla 2: Preservación de historial de versiones (3 versiones sucesivas)', () => {
    it('debe registrar 3 versiones sucesivas de una planilla y permitir consultar las 3', () => {
      // 1. Versión 1 inicial creada a partir de desposte con 80 kg
      const v1Initial = createYieldTemplateFromDeboning(mockDeboning, 'Rendimiento Novillito Premium', 1);
      v1Initial.id = 'YIELD-TEST-001';
      const savedV1 = prepareNextTemplateVersion(null, v1Initial);

      expect(savedV1.version).toBe(1);
      expect(savedV1.versionHistory).toHaveLength(0);

      // 2. Versión 2: Modificamos cortes (por ejemplo, res de 85 kg con rendimientos medidos)
      const deboningV2: MeatDeboning = {
        ...mockDeboning,
        initialWeightKg: 85,
        cuts: [
          { productCode: '101', description: 'ASADO', weightKg: 11, cutType: 'CORTE_UTIL', currentSalePrice: 1000 },
          { productCode: '103', description: 'VACÍO', weightKg: 9, cutType: 'CORTE_UTIL', currentSalePrice: 1000 },
          { productCode: '102', description: 'BIFE', weightKg: 7, cutType: 'CORTE_UTIL', currentSalePrice: 1000 },
        ],
      } as any;
      const v2Data = createYieldTemplateFromDeboning(deboningV2, 'Rendimiento Novillito Premium', 2, savedV1.id);
      // Supongamos que un formulario envía versionHistory vacío por error
      v2Data.versionHistory = [];
      const savedV2 = prepareNextTemplateVersion(savedV1, v2Data);

      expect(savedV2.id).toBe('YIELD-TEST-001');
      expect(savedV2.version).toBe(2);
      expect(savedV2.versionHistory).toHaveLength(1);
      expect(savedV2.versionHistory![0].version).toBe(1);
      expect(savedV2.versionHistory![0].referenceInitialWeightKg).toBe(80);

      // 3. Versión 3: Tercer desposte medido (90 kg)
      const deboningV3: MeatDeboning = {
        ...mockDeboning,
        initialWeightKg: 90,
        cuts: [
          { productCode: '101', description: 'ASADO', weightKg: 12, cutType: 'CORTE_UTIL', currentSalePrice: 1000 },
          { productCode: '103', description: 'VACÍO', weightKg: 10, cutType: 'CORTE_UTIL', currentSalePrice: 1000 },
          { productCode: '102', description: 'BIFE', weightKg: 8, cutType: 'CORTE_UTIL', currentSalePrice: 1000 },
        ],
      } as any;
      const v3Data = createYieldTemplateFromDeboning(deboningV3, 'Rendimiento Novillito Premium', 3, savedV2.id);
      const savedV3 = prepareNextTemplateVersion(savedV2, v3Data);

      expect(savedV3.id).toBe('YIELD-TEST-001');
      expect(savedV3.version).toBe(3);
      // Debe conservar las 2 versiones anteriores en el historial
      expect(savedV3.versionHistory).toHaveLength(2);
      expect(savedV3.versionHistory![0].version).toBe(1);
      expect(savedV3.versionHistory![1].version).toBe(2);
      expect(savedV3.versionHistory![1].referenceInitialWeightKg).toBe(85);

      // Comprobación de que las tres versiones pueden consultarse:
      // Versión 1 en historial:
      const queryV1 = savedV3.versionHistory!.find(v => v.version === 1);
      expect(queryV1).toBeDefined();
      expect(queryV1?.referenceInitialWeightKg).toBe(80);
      expect(queryV1?.items.find(i => i.productCode === '101')?.weightKg).toBe(10);

      // Versión 2 en historial:
      const queryV2 = savedV3.versionHistory!.find(v => v.version === 2);
      expect(queryV2).toBeDefined();
      expect(queryV2?.referenceInitialWeightKg).toBe(85);
      expect(queryV2?.items.find(i => i.productCode === '101')?.weightKg).toBe(11);

      // Versión 3 activa:
      expect(savedV3.version).toBe(3);
      expect(savedV3.referenceInitialWeightKg).toBe(90);
      expect(savedV3.items.find(i => i.productCode === '101')?.weightKg).toBe(12);
    });

    it('no debe duplicar versiones en el historial si se vuelve a procesar la misma versión', () => {
      const templateV1 = createYieldTemplateFromDeboning(mockDeboning, 'Plantilla Sin Duplicados', 1);
      templateV1.id = 'YIELD-DUP-01';
      const savedV1 = prepareNextTemplateVersion(null, templateV1);

      const savedV2 = prepareNextTemplateVersion(savedV1, { ...savedV1, notes: 'Modificación 1' });
      expect(savedV2.versionHistory).toHaveLength(1);

      // Intentar forzar con la misma versión en history
      const savedV2Duplicate = prepareNextTemplateVersion(savedV1, { ...savedV1, notes: 'Modificación 2' });
      expect(savedV2Duplicate.versionHistory).toHaveLength(1);
    });
  });
});

