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
  const codeLower = code.toLowerCase();

  // 1. Check if it matches an explicit commercial barcode (pistola lectora) on a product
  const exactBarcodeMatch = productList.find(
    (p) => p.barcode && p.barcode.trim().toLowerCase() === codeLower
  );
  if (exactBarcodeMatch) {
    return {
      product: exactBarcodeMatch,
      quantity: 1,
      unitPrice: exactBarcodeMatch.price,
      subtotal: exactBarcodeMatch.price,
      isScaleLabel: false,
      rawCode: code,
    };
  }

  // 2. Check if it's an EAN-13 butcher scale barcode (13 digits starting with scalePrefix, e.g. '20')
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

  // 3. Check if it's an exact product code or PLU match
  const exactCodeMatch = productList.find(
    (p) =>
      p.code.trim().toLowerCase() === codeLower ||
      p.code.padStart(5, '0') === code.padStart(5, '0') ||
      (p.scalePlu && p.scalePlu.trim().toLowerCase() === codeLower)
  );

  // 4. Fallback to partial barcode or description match
  const match =
    exactCodeMatch ||
    productList.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase().includes(codeLower)) ||
        p.description.toLowerCase().includes(codeLower)
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

const STORE_RUBRO_KEYWORDS = [
  'almacen',
  'bebida',
  'gaseosa',
  'despensa',
  'aderezo',
  'lacteo',
  'panaderia',
  'limpieza',
  'kiosco',
  'carbon',
  'lena',
  'vino',
  'cerveza',
  'agua',
  'jugo',
  'galletita',
  'fideo',
  'arroz',
  'aceite',
  'envase',
  'congelado',
  'otros',
  'varios',
  'verduler',
  'fiambreria (unid)',
];

export const MEAT_KEYWORDS = [
  'asado',
  'vacio',
  'matambre',
  'nalga',
  'peceto',
  'cuadril',
  'colita',
  'colita de cuadril',
  'picana',
  'picanha',
  'tapa de picana',
  'tapa de asado',
  'tapa de nalga',
  'tapa de cuadril',
  'tapa de bife',
  'tapa de pecho',
  'tapa de costilla',
  'marucha',
  'azotillo',
  'cogote',
  'quijada',
  'bola de lomo',
  'cuadrada',
  'bife',
  'bife angosto',
  'bife ancho',
  'bife de chorizo',
  'ojo de bife',
  'lomo',
  'entraña',
  'entrana',
  'falda',
  'aguja',
  'roast beef',
  'roast',
  'tortuguita',
  'paleta',
  'palomita',
  'carnaza',
  'osobuco',
  'ossobuco',
  'picada',
  'molida',
  'costilla',
  'costillita',
  'pechito',
  'bondiola',
  'carre',
  'solomillo',
  'chorizo',
  'morcilla',
  'salchicha parrillera',
  'salchicha',
  'chinchulin',
  'molleja',
  'riñon',
  'rinon',
  'higado',
  'lengua',
  'mondongo',
  'rabo',
  'pollo',
  'suprema',
  'pata y muslo',
  'alita',
  'menudo',
  'milanesa',
  'vaca',
  'novillito',
  'novillo',
  'ternera',
  'vaquillona',
  'cerdo',
  'porcino',
  'cordero',
  'lechón',
  'lechon',
  'carne',
  'vacun',
  'hueso',
  'grasa',
  'churrasco',
  'entrecot',
  'carne picada',
  'albondiga',
  'hamburguesa',
];

const STORE_DESC_REGEX =
  /\b(\d+([.,]\d+)?\s*(cc|ml|lt|lts|litro|litros|gr|grs|gramos|unid|unidades|pack|paq|lata|botella|caja|sobre|frasco|pote|docena|maple)|coca|pepsi|fanta|sprite|manaos|schwe?ppes|7up|paso de los toros|gaseosa|agua|soda|jugo|cepita|baggio|citric|levite|aquarius|vino|cerveza|quilmes|brahma|stella|heineken|corona|patagonia|fernet|gancia|sidra|mayonesa|hellmanns|natura|fanacoa|danica|ketchup|mostaza|salsa|tomate|pur[eé]|aceite|vinagre|aceto|sal\b|celusal|azucar|yerba|cafe|mate cocido|fideo|tallarin|tirabuzon|moñito|mostachol|spaghetti|raviol|ñoqui|noqui|tapas?\s*(de\s*)?(empanada|pascualina|tarta)s?|empanadas?\b|pascualinas?\b|arroz|harina|polenta|pan rallado|rebozador|galletita|pan\b|lactal|huevo|leche|manteca|margarina|crema|dulce de leche|yogur|queso rallado|carbon|carbón|leña|lena|briqueta|fosforo|encendedor|servilleta|rollo|papel|detergente|lavandina|jabon|esponja|bolsa|chimichurri|provenzal|oregano|aji|pimenton|comino|pimienta|laurel|condimento|caldo|sopa|arveja|choclo|lenteja|garbanzo|poroto|atun|caballa|sardina|durazno|aceituna|mermelada|miel|alfajor|chocolate|papas fritas|snack|mani)\b/i;

export function isStoreUnitProduct(p: {
  description?: string;
  rubro?: string;
  category?: string;
  unitType?: string;
}): boolean {
  const norm = (s?: string) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const rubroNorm = norm(p.rubro);
  const catNorm = norm(p.category);
  const descNorm = norm(p.description);

  const hasMeatKeyword = MEAT_KEYWORDS.some(
    (mk) => descNorm.includes(mk) || catNorm.includes(mk) || rubroNorm.includes(mk)
  );
  if (hasMeatKeyword) return false;

  // 1. Si el producto tiene explícitamente rubro o categoría CÁRNICA (vacuno, vaca, cerdo, pollo, etc.):
  // NUNCA es producto de almacén si su venta es por Kg o no forzado a unidad no cárnica.
  const isMeatRubCat =
    rubroNorm.includes('carne') ||
    rubroNorm.includes('vacun') ||
    rubroNorm.includes('cerdo') ||
    rubroNorm.includes('porcin') ||
    rubroNorm.includes('pollo') ||
    rubroNorm.includes('granja') ||
    rubroNorm.includes('achura') ||
    rubroNorm.includes('embutid') ||
    catNorm.includes('vaca') ||
    catNorm.includes('novill') ||
    catNorm.includes('terner') ||
    catNorm.includes('vaquillon') ||
    catNorm.includes('cerdo') ||
    catNorm.includes('porcin') ||
    catNorm.includes('pollo') ||
    catNorm.includes('achura') ||
    catNorm.includes('embutid');

  if (isMeatRubCat && p.unitType !== 'Unid') {
    return false;
  }

  // 2. Si es venta por unidad explícita y no es rubro cárnico, es artículo de almacén
  if (p.unitType === 'Unid') return true;

  // 3. Si rubro o categoría coincide con palabras clave de almacén/bebidas/limpieza
  if (
    STORE_RUBRO_KEYWORDS.some(
      (kw) => rubroNorm.includes(kw) || catNorm.includes(kw)
    )
  ) {
    return true;
  }

  // 4. Si la descripción coincide con productos típicos de almacén
  if (STORE_DESC_REGEX.test(descNorm)) {
    const isExplicitMeat = MEAT_KEYWORDS.some((mk) => descNorm.includes(mk));
    if (!isExplicitMeat) {
      return true;
    }
  }

  return false;
}

