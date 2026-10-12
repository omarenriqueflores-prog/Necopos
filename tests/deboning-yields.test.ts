import { describe, it, expect } from 'vitest';
import {
  calculateDeboningMassBalance,
  allocateDeboningCosts,
  createYieldTemplateFromDeboning,
  applyYieldTemplateToCarcass,
} from '../src/utils/deboningHelper';
import { DeboningCutItem, MeatDeboning } from '../src/types/pos';

describe('15.3 y 15.4 Auditoría de Desposte, Balance de Masas y Coeficientes por Lote', () => {
  it('Balance de masas con res de 80 kg (60 kg cortes útiles, 15 kg huesos/grasa, 5 kg merma): el balance es exacto', () => {
    const cuts: DeboningCutItem[] = [
      {
        productCode: '101',
        description: 'ASADO DE TIRA',
        category: 'CARNES VACUNAS',
        unitType: 'Kg',
        weightKg: 25.0,
        yieldPercent: 0,
        cutType: 'CORTE_UTIL',
        currentSalePrice: 6000,
        totalSaleValue: 150000,
        allocatedCostPerKg: 0,
        totalAllocatedCost: 0,
        projectedMarginPercent: 0,
      },
      {
        productCode: '103',
        description: 'VACÍO CORTE ESPECIAL',
        category: 'CARNES VACUNAS',
        unitType: 'Kg',
        weightKg: 15.0,
        yieldPercent: 0,
        cutType: 'CORTE_UTIL',
        currentSalePrice: 7000,
        totalSaleValue: 105000,
        allocatedCostPerKg: 0,
        totalAllocatedCost: 0,
        projectedMarginPercent: 0,
      },
      {
        productCode: '110',
        description: 'BOLA DE LOMO / NALGA',
        category: 'CARNES VACUNAS',
        unitType: 'Kg',
        weightKg: 20.0,
        yieldPercent: 0,
        cutType: 'CORTE_UTIL',
        currentSalePrice: 6500,
        totalSaleValue: 130000,
        allocatedCostPerKg: 0,
        totalAllocatedCost: 0,
        projectedMarginPercent: 0,
      },
      {
        productCode: '124',
        description: 'HUESO CON CARNE / ASERRÍN',
        category: 'SUBPRODUCTOS',
        unitType: 'Kg',
        weightKg: 10.0,
        yieldPercent: 0,
        cutType: 'HUESO',
        currentSalePrice: 800,
        totalSaleValue: 8000,
        allocatedCostPerKg: 0,
        totalAllocatedCost: 0,
        projectedMarginPercent: 0,
      },
      {
        productCode: '123',
        description: 'GRASA DE PELLA',
        category: 'SUBPRODUCTOS',
        unitType: 'Kg',
        weightKg: 5.0,
        yieldPercent: 0,
        cutType: 'GRASA',
        currentSalePrice: 1000,
        totalSaleValue: 5000,
        allocatedCostPerKg: 0,
        totalAllocatedCost: 0,
        projectedMarginPercent: 0,
      },
    ];

    const initialWeightKg = 80.0;
    const balance = calculateDeboningMassBalance(initialWeightKg, cuts);

    // Suma de salidas: 25 + 15 + 20 + 10 + 5 = 75 kg
    expect(balance.totalOutputWeightKg).toBe(75.0);
    expect(balance.netMeatWeightKg).toBe(60.0);
    expect(balance.boneWeightKg).toBe(10.0);
    expect(balance.fatWeightKg).toBe(5.0);
    // Merma no recuperable: 80 - 75 = 5 kg (6.25%)
    expect(balance.shrinkageWeightKg).toBe(5.0);
    expect(balance.shrinkagePercent).toBe(6.25);
    expect(balance.isImpossibleBalance).toBe(false);
    expect(balance.impossibleOverweightKg).toBe(0);
  });

  it('Balance imposible: salidas de 82 kg sobre entrada de 80 kg es rechazado y detecta el sobrepeso exacto', () => {
    const impossibleCuts: DeboningCutItem[] = [
      {
        productCode: '101',
        description: 'ASADO DE TIRA',
        category: 'CARNES VACUNAS',
        unitType: 'Kg',
        weightKg: 50.0,
        yieldPercent: 0,
        cutType: 'CORTE_UTIL',
        currentSalePrice: 6000,
        totalSaleValue: 300000,
        allocatedCostPerKg: 0,
        totalAllocatedCost: 0,
        projectedMarginPercent: 0,
      },
      {
        productCode: '103',
        description: 'VACÍO CORTE ESPECIAL',
        category: 'CARNES VACUNAS',
        unitType: 'Kg',
        weightKg: 32.0,
        yieldPercent: 0,
        cutType: 'CORTE_UTIL',
        currentSalePrice: 7000,
        totalSaleValue: 224000,
        allocatedCostPerKg: 0,
        totalAllocatedCost: 0,
        projectedMarginPercent: 0,
      },
    ];

    const initialWeightKg = 80.0;
    const balance = calculateDeboningMassBalance(initialWeightKg, impossibleCuts);

    expect(balance.totalOutputWeightKg).toBe(82.0);
    expect(balance.isImpossibleBalance).toBe(true);
    expect(balance.impossibleOverweightKg).toBe(2.0);
    expect(balance.shrinkageWeightKg).toBe(0);
  });

  it('Plantilla real por lote: calcula coeficiente de 0.125 (10 kg / 80 kg) y estima exactamente 10.750 kg en res de 86 kg', () => {
    const referenceDeboning: MeatDeboning = {
      id: 'DEB-REF-1',
      code: 'DESP-REF-1',
      date: '2026-10-12',
      time: '10:00:00',
      timestamp: 1000,
      branchId: 'NECO 1',
      chamber: 'Cámara 1',
      status: 'FINALIZADO',
      operator: 'Maestro Despostador',
      tropaNumber: 'TR-7721',
      supplier: 'Frigorífico Central',
      carcassType: 'MEDIA_RES',
      animalCategory: 'Novillito',
      initialWeightKg: 80.0, // Peso inicial real de la media res de referencia
      costPerKgInitial: 4000,
      totalInitialCost: 320000,
      cuts: [
        {
          productCode: 'CORTE_A',
          description: 'CORTE A (LOMO SELECCIONADO)',
          category: 'CARNES VACUNAS',
          unitType: 'Kg',
          weightKg: 10.0, // 10 kg reales pesados
          yieldPercent: 12.5,
          cutType: 'CORTE_UTIL',
          currentSalePrice: 10000,
          totalSaleValue: 100000,
          allocatedCostPerKg: 0,
          totalAllocatedCost: 0,
          projectedMarginPercent: 0,
        },
        {
          productCode: 'CORTE_B',
          description: 'CORTE B (ASADO)',
          category: 'CARNES VACUNAS',
          unitType: 'Kg',
          weightKg: 30.0,
          yieldPercent: 37.5,
          cutType: 'CORTE_UTIL',
          currentSalePrice: 6000,
          totalSaleValue: 180000,
          allocatedCostPerKg: 0,
          totalAllocatedCost: 0,
          projectedMarginPercent: 0,
        },
      ],
      totalOutputWeightKg: 40.0,
      netMeatWeightKg: 40.0,
      boneWeightKg: 0,
      fatWeightKg: 0,
      scrapWeightKg: 0,
      shrinkageWeightKg: 40.0,
      shrinkagePercent: 50.0,
      netMeatYieldPercent: 50.0,
      totalYieldPercent: 50.0,
      totalCommercialValue: 280000,
      grossMarginTotal: -40000,
      grossMarginPercent: -14.29,
      multiplicationFactor: 0.88,
      breakEvenPricePerKg: 8000,
      selectedCarcassIds: ['REC-MR-001'],
    };

    // 1. Crear plantilla a partir de la media res real de 80 kg
    const template = createYieldTemplateFromDeboning(referenceDeboning, 'Plantilla Lote TR-7721', 1);

    const corteAItem = template.items.find((it) => it.productCode === 'CORTE_A');
    expect(corteAItem).toBeDefined();
    // Coeficiente esperado = 10 / 80 = 0.125
    expect(corteAItem?.coefficient).toBe(0.125);
    expect(corteAItem?.yieldPercent).toBe(12.5);

    // 2. Aplicar plantilla a una media res pendiente del mismo lote que pesa 86 kg
    const targetCarcassWeightKg = 86.0;
    const estimatedCuts = applyYieldTemplateToCarcass(template, targetCarcassWeightKg, []);

    const corteAEstimated = estimatedCuts.find((c) => c.productCode === 'CORTE_A');
    expect(corteAEstimated).toBeDefined();
    // Estimación esperada = 0.125 * 86 = 10.750 kg
    expect(corteAEstimated?.weightKg).toBe(10.750);

    const corteBEstimated = estimatedCuts.find((c) => c.productCode === 'CORTE_B');
    // Coeficiente CORTE_B = 30 / 80 = 0.375 -> 0.375 * 86 = 32.250 kg
    expect(corteBEstimated?.weightKg).toBe(32.250);
  });
});
