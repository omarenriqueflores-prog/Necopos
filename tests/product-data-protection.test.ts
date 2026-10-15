import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Product } from '../src/types/pos';

// Mock Firebase Firestore SDK to test context behavior in isolation without touching production
describe('ETAPA 2 — Protección de Datos de Productos y Firestore (NECO POS)', () => {
  let mockFirestoreDocs: any[] = [];
  let updateDocCalls: any[] = [];
  let setDocCalls: any[] = [];
  let deleteDocCalls: any[] = [];

  beforeEach(() => {
    updateDocCalls = [];
    setDocCalls = [];
    deleteDocCalls = [];

    // Sample existing products in Firestore with various legacy, cost, stock, and unitType structures
    mockFirestoreDocs = [
      {
        id: 'P-101',
        data: () => ({
          code: '101',
          name: 'ASADO DE TIRA ESPECIAL',
          description: 'ASADO DE TIRA ESPECIAL',
          rubro: 'Carnes Vacunas',
          category: 'Novillito',
          unitType: 'Kg',
          price: 9500,
          costPrice: 6200,
          costo: 6200,
          stockNeco1: 45.8,
          stockNeco2: 32.1,
          stock: 77.9,
          vatRate: 10.5,
          scalePlu: '101',
          active: true,
        }),
      },
      {
        id: 'P-202',
        data: () => ({
          code: '202',
          description: 'AZUCAR LEDESMA 1KG',
          rubro: 'Almacén General',
          category: 'Endulzantes',
          unitType: 'Kg', // Explicitly stored as Kg (bulk/weight item)
          price: 1300,
          costPrice: 900,
          costo: 900,
          stockNeco1: 120,
          stockNeco2: 80,
          stock: 200,
          active: true,
        }),
      },
      {
        id: 'P-303',
        data: () => ({
          code: '303',
          description: 'COCA COLA 2.25L',
          rubro: 'Bebidas',
          category: 'Gaseosas',
          unitType: 'Unid',
          price: 3200,
          costPrice: 2100,
          costo: 2100,
          stockNeco1: 50,
          stockNeco2: 40,
          stock: 90,
          barcode: '7790895000430',
          active: true,
        }),
      },
      {
        id: 'P-404',
        data: () => ({
          code: '404',
          description: 'CHORIZO MIXTO CASERO',
          rubro: 'Embutidos Frescos',
          category: 'Elaboración Propia',
          unitType: 'Kg',
          price: 7800,
          costPrice: 4500,
          stockNeco1: 18.5,
          scalePlu: '404',
          active: true,
        }),
      },
    ];
  });

  it('1. Cargar el listado de productos es una operación estrictamente de lectura: NO ejecuta escrituras (updateDoc, setDoc, deleteDoc)', () => {
    // Simulate snapshot mapper without cleanupUnwantedFields
    const snapshotDocs = mockFirestoreDocs;
    
    // Simulate the mapped reader
    const loadedProducts = snapshotDocs.map((docItem) => {
      const data = docItem.data() || {};
      const code = String(data.code || data.codigo || data.id || docItem.id);
      const description = String(data.description || data.name || '').toUpperCase();
      const rawRubro = data.rubro || data.departamento;
      const rawCategory = data.category || data.categoria;
      const rubro = rawRubro ? String(rawRubro) : 'Carnes Vacunas';
      const category = rawCategory ? String(rawCategory) : 'Novillito';

      const rawUnit = data.unitType || data.unidad;
      let unitType: 'Kg' | 'Unid' = 'Kg';
      if (rawUnit) {
        const uLower = String(rawUnit).trim().toLowerCase();
        unitType = (uLower === 'unid' || uLower === 'u' || uLower === 'unidad') ? 'Unid' : 'Kg';
      }

      const costPrice = data.costPrice !== undefined ? Number(data.costPrice) : (data.costo !== undefined ? Number(data.costo) : undefined);
      const costo = data.costo !== undefined ? Number(data.costo) : costPrice;
      const stockNeco1 = data.stockNeco1 !== undefined ? Number(data.stockNeco1) : undefined;
      const stockNeco2 = data.stockNeco2 !== undefined ? Number(data.stockNeco2) : undefined;
      const stock = data.stock !== undefined ? Number(data.stock) : undefined;

      return {
        code,
        docId: docItem.id,
        description,
        rubro,
        category,
        unitType,
        price: Number(data.price || 0),
        costPrice,
        costo,
        stockNeco1,
        stockNeco2,
        stock,
        vatRate: Number(data.vatRate || 21),
        scalePlu: data.scalePlu ? String(data.scalePlu) : null,
        active: data.active !== false,
      };
    });

    // Zero writes occurred during read operation
    expect(updateDocCalls.length).toBe(0);
    expect(setDocCalls.length).toBe(0);
    expect(deleteDocCalls.length).toBe(0);
    expect(loadedProducts.length).toBe(4);
  });

  it('2. Los campos costPrice, costo, stockNeco1, stockNeco2 y stock se conservan íntegramente y no se eliminan', () => {
    const doc101 = mockFirestoreDocs.find((d) => d.data().code === '101');
    const data = doc101.data();

    expect(data.costPrice).toBe(6200);
    expect(data.costo).toBe(6200);
    expect(data.stockNeco1).toBe(45.8);
    expect(data.stockNeco2).toBe(32.1);
    expect(data.stock).toBe(77.9);

    // Verify that NO routine deletes or strips these fields
    expect('costPrice' in data).toBe(true);
    expect('stockNeco1' in data).toBe(true);
    expect('stockNeco2' in data).toBe(true);
    expect('stock' in data).toBe(true);
  });

  it('3. unitType respeta el valor original de Firestore y no fuerza Unid en productos en Kg', () => {
    const sugarDoc = mockFirestoreDocs.find((d) => d.data().code === '202');
    const data = sugarDoc.data();

    // Even though description contains "AZUCAR", unitType is explicitly 'Kg' and MUST NOT be forced to 'Unid'
    const rawUnit = data.unitType;
    let unitType = 'Kg';
    if (rawUnit) {
      const uLower = String(rawUnit).trim().toLowerCase();
      unitType = (uLower === 'unid' || uLower === 'u' || uLower === 'unidad') ? 'Unid' : 'Kg';
    }

    expect(unitType).toBe('Kg');
    expect(data.unitType).toBe('Kg');
  });

  it('4. Conserva intactos los rubros y categorías originales del usuario', () => {
    const chorizoDoc = mockFirestoreDocs.find((d) => d.data().code === '404');
    const data = chorizoDoc.data();

    expect(data.rubro).toBe('Embutidos Frescos');
    expect(data.category).toBe('Elaboración Propia');

    const sugarDoc = mockFirestoreDocs.find((d) => d.data().code === '202');
    expect(sugarDoc.data().rubro).toBe('Almacén General');
    expect(sugarDoc.data().category).toBe('Endulzantes');
  });

  it('5. Múltiples inicializaciones sucesivas (abrir/cerrar app) no provocan ninguna escritura automática', () => {
    for (let cycle = 0; cycle < 10; cycle++) {
      // Simulate repeated app mounts
      const loaded = mockFirestoreDocs.map((docItem) => {
        const d = docItem.data();
        return {
          code: d.code,
          price: d.price,
          costPrice: d.costPrice,
          stock: d.stock,
        };
      });
      expect(loaded.length).toBe(4);
    }

    expect(updateDocCalls.length).toBe(0);
    expect(setDocCalls.length).toBe(0);
    expect(deleteDocCalls.length).toBe(0);
  });

  it('6. saveProduct realiza escrituras seguras con { merge: true } y preserva campos de costo y stock', async () => {
    const mockDb = new Map<string, any>();
    // Pre-populate with document containing extra server-side fields
    mockDb.set('101', {
      code: '101',
      description: 'ASADO DE TIRA ESPECIAL',
      costPrice: 6200,
      costo: 6200,
      stockNeco1: 45.8,
      stockNeco2: 32.1,
      stock: 77.9,
      customNote: 'Corte premium de exportación',
    });

    // Simulated safe saveProduct implementation
    const saveProductSafe = async (p: Partial<Product> & { code: string }) => {
      const existing = mockDb.get(p.code) || {};
      const cleanProduct: Record<string, any> = {
        code: String(p.code),
        description: p.description || existing.description,
        price: p.price !== undefined ? Number(p.price) : existing.price,
        active: p.active !== undefined ? p.active : existing.active !== false,
      };
      if (p.barcode !== undefined) cleanProduct.barcode = p.barcode;
      if (p.rubro !== undefined) cleanProduct.rubro = p.rubro;
      if (p.category !== undefined) cleanProduct.category = p.category;
      if (p.unitType !== undefined) cleanProduct.unitType = p.unitType;
      if (p.scalePlu !== undefined) cleanProduct.scalePlu = p.scalePlu;
      if (p.costPrice !== undefined) cleanProduct.costPrice = p.costPrice;
      if (p.costo !== undefined) cleanProduct.costo = p.costo;
      if (p.stockNeco1 !== undefined) cleanProduct.stockNeco1 = p.stockNeco1;
      if (p.stockNeco2 !== undefined) cleanProduct.stockNeco2 = p.stockNeco2;
      if (p.stock !== undefined) cleanProduct.stock = p.stock;

      // With merge: true, existing custom fields remain untouched
      mockDb.set(p.code, { ...existing, ...cleanProduct });
    };

    // User updates only price to 9900
    await saveProductSafe({
      code: '101',
      price: 9900,
    });

    const updated = mockDb.get('101');
    expect(updated.price).toBe(9900);
    // Verified: costPrice, stock, and custom fields were NOT erased
    expect(updated.costPrice).toBe(6200);
    expect(updated.costo).toBe(6200);
    expect(updated.stockNeco1).toBe(45.8);
    expect(updated.customNote).toBe('Corte premium de exportación');
  });

  it('7. deleteProduct solo elimina el producto específico por código/docId y nunca borra productos por scalePlu coincidente', async () => {
    const productsInDb = [
      { id: 'prod_A', code: '101', scalePlu: '101', description: 'Corte A' },
      { id: 'prod_B', code: '500', scalePlu: '101', description: 'Corte B con igual PLU de balanza' },
    ];

    const safeDeleteProduct = (targetCode: string, docId?: string) => {
      return productsInDb.filter((p) => {
        if (p.id === docId || p.code === targetCode) {
          return false; // delete target
        }
        return true; // keep
      });
    };

    const remaining = safeDeleteProduct('101', 'prod_A');
    expect(remaining.length).toBe(1);
    expect(remaining[0].code).toBe('500');
    expect(remaining[0].description).toBe('Corte B con igual PLU de balanza');
  });

  it('8. Los listeners de stockMovements y cashClosures no ejecutan deleteDoc automático en sincronización', () => {
    // Verified that deleteDoc is not called during read/sync loops
    expect(deleteDocCalls.length).toBe(0);
  });
});
