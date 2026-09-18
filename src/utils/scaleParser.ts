import { Product } from '../types/pos';

export interface ParsedBarcodeResult {
  product: Product | null;
  weight?: number;
  quantity?: number;
  unitPrice: number;
  subtotal: number;
  isScaleLabel: boolean;
  rawCode: string;
}

export function parseBarcodeInput(
  rawInput: string,
  productList: Product[],
  scalePrefix: string = '20'
): ParsedBarcodeResult | null {
  const code = rawInput.trim();
  if (!code) return null;

  // Check if it's an EAN-13 scale barcode (13 digits starting with scalePrefix)
  if (code.length === 13 && code.startsWith(scalePrefix)) {
    // Standard Argentine Butcher Scale EAN-13 (20 + 5 digits PLU + 5 digits weight in grams + 1 check digit)
    const pluRaw = code.substring(2, 7); // e.g. "00125"
    const weightRaw = code.substring(7, 12); // e.g. "02350" -> 2.350 kg
    const weightKg = parseInt(weightRaw, 10) / 1000;

    // Find product by scalePlu or matching code
    const foundProduct = productList.find(
      (p) =>
        p.scalePlu === pluRaw ||
        p.code === pluRaw ||
        p.code.padStart(5, '0') === pluRaw ||
        p.scalePlu?.padStart(5, '0') === pluRaw
    );

    if (foundProduct) {
      const unitPrice = foundProduct.price;
      const subtotal = Math.round(weightKg * unitPrice);
      return {
        product: foundProduct,
        weight: weightKg,
        quantity: undefined,
        unitPrice,
        subtotal,
        isScaleLabel: true,
        rawCode: code,
      };
    }
  }

  // Check if it's a direct product code or PLU
  const match = productList.find(
    (p) =>
      p.code.toLowerCase() === code.toLowerCase() ||
      p.code.padStart(5, '0') === code.padStart(5, '0') ||
      p.scalePlu === code ||
      p.description.toLowerCase().includes(code.toLowerCase())
  );

  if (match) {
    if (match.unitType === 'Kg') {
      // Default 1.000 kg if not from scale label, can be modified via keyboard
      return {
        product: match,
        weight: 1.0,
        unitPrice: match.price,
        subtotal: match.price,
        isScaleLabel: false,
        rawCode: code,
      };
    } else {
      return {
        product: match,
        quantity: 1,
        unitPrice: match.price,
        subtotal: match.price,
        isScaleLabel: false,
        rawCode: code,
      };
    }
  }

  return null;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace('ARS', '$');
}

export function formatWeight(kg: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(kg) + ' kg';
}
