import { describe, it, expect } from 'vitest';
import { createYieldTemplateFromDeboning } from '../utils/deboningHelper';
import { MeatDeboning } from '../types/pos';

describe('Cálculo de Plantillas de Rendimiento', () => {
  it('debe calcular correctamente los coeficientes', () => {
    const mockDeboning: MeatDeboning = {
      id: 'D-123',
      initialWeightKg: 80,
      animalCategory: 'Novillito',
      carcassType: 'MEDIA_RES',
      cuts: [
        { productCode: '101', description: 'ASADO', weightKg: 10, cutType: 'CORTE_UTIL', pricePerKg: 100 },
        { productCode: '103', description: 'VACÍO', weightKg: 8, cutType: 'CORTE_UTIL', pricePerKg: 100 },
        { productCode: '102', description: 'BIFE', weightKg: 6, cutType: 'CORTE_UTIL', pricePerKg: 100 },
      ],
    } as any;

    const template = createYieldTemplateFromDeboning(mockDeboning, 'Plantilla Prueba', 'VACUNO', 'NOVILLITO', 'MEDIA_RES');
    
    expect(template.items.find(i => i.productCode === '101')?.coefficient).toBe(0.125);
    expect(template.items.find(i => i.productCode === '103')?.coefficient).toBe(0.1);
    expect(template.items.find(i => i.productCode === '102')?.coefficient).toBe(0.075);
  });
});
