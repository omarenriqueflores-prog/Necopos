import { describe, it, expect } from 'vitest';
import { allocateDeboningCosts } from '../src/utils/deboningHelper';
import { isMeatCategory } from '../src/utils/stockHelper';
import { DeboningCutItem } from '../src/types/pos';

export function calculateTheoreticalReconciliation(
  initialPeriodStock: number,
  entriesKg: number,
  outflowsKg: number,
  currentPhysicalStock: number,
  unitPrice: number
): {
  theoreticalStock: number;
  physicalStock: number;
  differenceKg: number;
  differenceValue: number;
  status: 'CONCILIADO' | 'FALTANTE' | 'SOBRANTE';
} {
  // Saldo teórico = Saldo Inicial + Entradas - Salidas
  // (No se fuerza a cero si el físico es cero)
  const theoreticalStock = Number((initialPeriodStock + entriesKg - outflowsKg).toFixed(3));
  const differenceKg = Number((currentPhysicalStock - theoreticalStock).toFixed(3));
  const differenceValue = Number((differenceKg * unitPrice).toFixed(2));

  let status: 'CONCILIADO' | 'FALTANTE' | 'SOBRANTE' = 'CONCILIADO';
  if (differenceKg < -0.5) {
    status = 'FALTANTE';
  } else if (differenceKg > 0.5) {
    status = 'SOBRANTE';
  }

  return {
    theoreticalStock,
    physicalStock: currentPhysicalStock,
    differenceKg,
    differenceValue,
    status,
  };
}

describe('15.7 y 15.8 Auditoría de Conciliación, Valoración Comercial y Asignación de Costos', () => {
  it('Conciliación Caso 1: Saldo inicial 100 kg + entradas 20 kg - salidas 30 kg = 90 kg teórico. Físico 90 kg -> Desvío 0 kg (CONCILIADO)', () => {
    const res = calculateTheoreticalReconciliation(100.0, 20.0, 30.0, 90.0, 5000);

    expect(res.theoreticalStock).toBe(90.0);
    expect(res.physicalStock).toBe(90.0);
    expect(res.differenceKg).toBe(0.0);
    expect(res.differenceValue).toBe(0.0);
    expect(res.status).toBe('CONCILIADO');
  });

  it('Conciliación Caso 2: Saldo teórico 15 kg y stock físico 0 kg -> Muestra Faltante de 15 kg (NO lo oculta ni fuerza a cero)', () => {
    // 0 inicial + 20 entradas - 5 salidas = 15 kg teórico. Físico contado en cámara = 0 kg.
    const res = calculateTheoreticalReconciliation(0.0, 20.0, 5.0, 0.0, 6000);

    expect(res.theoreticalStock).toBe(15.0);
    expect(res.physicalStock).toBe(0.0);
    // El desvío real es FÍSICO (0) - TEÓRICO (15) = -15 kg
    expect(res.differenceKg).toBe(-15.0);
    expect(res.differenceValue).toBe(-90000);
    expect(res.status).toBe('FALTANTE');
  });

  it('Clasificación positiva de productos cárnicos excluye almacén, bebidas y limpieza de la valorización cárnica', () => {
    // Cárnicos oficiales
    expect(isMeatCategory('Carnes Vacunas')).toBe(true);
    expect(isMeatCategory('Novillito')).toBe(true);
    expect(isMeatCategory('Vaca')).toBe(true);
    expect(isMeatCategory('Cerdo')).toBe(true);
    expect(isMeatCategory('Subproductos Cárnicos')).toBe(true);
    expect(isMeatCategory('Media Res')).toBe(true);

    // No cárnicos que deben estar excluidos
    expect(isMeatCategory('Bebidas con alcohol')).toBe(false);
    expect(isMeatCategory('Almacén seco')).toBe(false);
    expect(isMeatCategory('Limpieza y químicos')).toBe(false);
    expect(isMeatCategory('Verdulería')).toBe(false);
    expect(isMeatCategory(undefined)).toBe(false);
  });

  it('Distribución de costos de desposte absorbe residuos de centavos para que la suma de costos sea idéntica al costo inicial de la res', () => {
    // Costo inicial de res con centavos: $ 333.333,33
    const initialCostTotal = 333333.33;

    const cuts: DeboningCutItem[] = [
      {
        productCode: '101',
        description: 'CORTE 1',
        category: 'CARNES',
        unitType: 'Kg',
        weightKg: 33.333,
        yieldPercent: 33.33,
        cutType: 'CORTE_UTIL',
        currentSalePrice: 5000,
        totalSaleValue: 166665,
        allocatedCostPerKg: 0,
        totalAllocatedCost: 0,
        projectedMarginPercent: 0,
      },
      {
        productCode: '102',
        description: 'CORTE 2',
        category: 'CARNES',
        unitType: 'Kg',
        weightKg: 33.333,
        yieldPercent: 33.33,
        cutType: 'CORTE_UTIL',
        currentSalePrice: 6000,
        totalSaleValue: 199998,
        allocatedCostPerKg: 0,
        totalAllocatedCost: 0,
        projectedMarginPercent: 0,
      },
      {
        productCode: '103',
        description: 'CORTE 3',
        category: 'CARNES',
        unitType: 'Kg',
        weightKg: 33.334,
        yieldPercent: 33.34,
        cutType: 'CORTE_UTIL',
        currentSalePrice: 4500,
        totalSaleValue: 150003,
        allocatedCostPerKg: 0,
        totalAllocatedCost: 0,
        projectedMarginPercent: 0,
      },
    ];

    const allocated = allocateDeboningCosts(initialCostTotal, cuts);

    const sumAllocated = Number(
      allocated.reduce((sum, c) => sum + (c.totalAllocatedCost || 0), 0).toFixed(2)
    );

    // La suma de los costos distribuidos a cada corte debe ser EXACTAMENTE igual al costo inicial
    expect(sumAllocated).toBe(initialCostTotal);
  });
});
