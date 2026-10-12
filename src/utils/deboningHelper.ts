import {
  MeatDeboning,
  DeboningCutItem,
  DeboningCarcassType,
  Product,
  BranchConfig,
} from '../types/pos';
import { formatKg, formatCurrency } from './stockHelper';

/**
 * Plantilla de corte base para despiece cárnico argentino
 */
export interface DeboningTemplateItem {
  code: string;
  name: string;
  category: string;
  defaultPercent: number; // Porcentaje típico orientativo
  cutType: 'CORTE_UTIL' | 'PICADA_RECORTES' | 'GRASA' | 'HUESO';
}

/**
 * Plantillas predeterminadas de desposte para carnicerías argentinas
 */
export const DEBONING_TEMPLATES: Record<
  DeboningCarcassType,
  { title: string; defaultWeight: number; items: DeboningTemplateItem[] }
> = {
  MEDIA_RES: {
    title: 'Media Res Vacuna Completa (Novillito / Vaquillona)',
    defaultWeight: 120.0,
    items: [
      { code: '101', name: 'ASADO DE TIRA SUPERIOR', category: 'CARNES VACUNAS', defaultPercent: 9.5, cutType: 'CORTE_UTIL' },
      { code: '103', name: 'VACÍO CORTE ESPECIAL', category: 'CARNES VACUNAS', defaultPercent: 4.2, cutType: 'CORTE_UTIL' },
      { code: '109', name: 'MATAMBRE VACUNO SELECCIONADO', category: 'CARNES VACUNAS', defaultPercent: 3.2, cutType: 'CORTE_UTIL' },
      { code: '113', name: 'ENTRAÑA FINA ESPECIAL', category: 'CARNES VACUNAS', defaultPercent: 1.2, cutType: 'CORTE_UTIL' },
      { code: '102', name: 'BIFE DE CHORIZO PREMIUM', category: 'CARNES VACUNAS', defaultPercent: 5.5, cutType: 'CORTE_UTIL' },
      { code: '114', name: 'BIFE ANCHO / OJO DE BIFE', category: 'CARNES VACUNAS', defaultPercent: 4.8, cutType: 'CORTE_UTIL' },
      { code: '115', name: 'LOMO VACUNO SELECCIONADO', category: 'CARNES VACUNAS', defaultPercent: 2.1, cutType: 'CORTE_UTIL' },
      { code: '110', name: 'BOLA DE LOMO / NALGA ENTERA', category: 'CARNES VACUNAS', defaultPercent: 9.8, cutType: 'CORTE_UTIL' },
      { code: '116', name: 'CUADRIL PREMIUM CON COLITA', category: 'CARNES VACUNAS', defaultPercent: 4.5, cutType: 'CORTE_UTIL' },
      { code: '117', name: 'CUADRADA / PECETO CORTE FINO', category: 'CARNES VACUNAS', defaultPercent: 6.2, cutType: 'CORTE_UTIL' },
      { code: '118', name: 'PALETA VACUNA ENTERA', category: 'CARNES VACUNAS', defaultPercent: 8.5, cutType: 'CORTE_UTIL' },
      { code: '119', name: 'ROAST BEEF SELECCIONADO', category: 'CARNES VACUNAS', defaultPercent: 7.8, cutType: 'CORTE_UTIL' },
      { code: '120', name: 'TORTUGUITA / MARUCHA', category: 'CARNES VACUNAS', defaultPercent: 3.5, cutType: 'CORTE_UTIL' },
      { code: '121', name: 'FALDA PARRILERA PARRILLA', category: 'CARNES VACUNAS', defaultPercent: 4.5, cutType: 'CORTE_UTIL' },
      { code: '122', name: 'OSOBUCO CORTADO ESPECIAL', category: 'CARNES VACUNAS', defaultPercent: 4.2, cutType: 'CORTE_UTIL' },
      { code: '108', name: 'CARNE PICADA ESPECIAL', category: 'CARNES VACUNAS', defaultPercent: 9.5, cutType: 'PICADA_RECORTES' },
      { code: '123', name: 'GRASA DE PELLA / SEBO DE MANTA', category: 'SUBPRODUCTOS', defaultPercent: 4.8, cutType: 'GRASA' },
      { code: '124', name: 'HUESO CON CARNE / ASERRÍN', category: 'SUBPRODUCTOS', defaultPercent: 8.8, cutType: 'HUESO' },
    ],
  },
  CUARTO_DELANTERO: {
    title: 'Cuarto Delantero Vacuno (Paleta, Pecho y Asado)',
    defaultWeight: 58.0,
    items: [
      { code: '101', name: 'ASADO DE TIRA SUPERIOR', category: 'CARNES VACUNAS', defaultPercent: 18.0, cutType: 'CORTE_UTIL' },
      { code: '118', name: 'PALETA VACUNA ENTERA', category: 'CARNES VACUNAS', defaultPercent: 17.5, cutType: 'CORTE_UTIL' },
      { code: '119', name: 'ROAST BEEF SELECCIONADO', category: 'CARNES VACUNAS', defaultPercent: 16.0, cutType: 'CORTE_UTIL' },
      { code: '109', name: 'MATAMBRE VACUNO SELECCIONADO', category: 'CARNES VACUNAS', defaultPercent: 6.5, cutType: 'CORTE_UTIL' },
      { code: '121', name: 'FALDA PARRILERA PARRILLA', category: 'CARNES VACUNAS', defaultPercent: 9.0, cutType: 'CORTE_UTIL' },
      { code: '122', name: 'OSOBUCO CORTADO ESPECIAL', category: 'CARNES VACUNAS', defaultPercent: 8.5, cutType: 'CORTE_UTIL' },
      { code: '108', name: 'CARNE PICADA ESPECIAL', category: 'CARNES VACUNAS', defaultPercent: 10.5, cutType: 'PICADA_RECORTES' },
      { code: '123', name: 'GRASA DE PELLA / SEBO DE MANTA', category: 'SUBPRODUCTOS', defaultPercent: 4.0, cutType: 'GRASA' },
      { code: '124', name: 'HUESO CON CARNE / ASERRÍN', category: 'SUBPRODUCTOS', defaultPercent: 8.5, cutType: 'HUESO' },
    ],
  },
  CUARTO_TRASERO: {
    title: 'Cuarto Trasero Vacuno (Pistola y Rueda)',
    defaultWeight: 62.0,
    items: [
      { code: '103', name: 'VACÍO CORTE ESPECIAL', category: 'CARNES VACUNAS', defaultPercent: 8.2, cutType: 'CORTE_UTIL' },
      { code: '113', name: 'ENTRAÑA FINA ESPECIAL', category: 'CARNES VACUNAS', defaultPercent: 2.4, cutType: 'CORTE_UTIL' },
      { code: '102', name: 'BIFE DE CHORIZO PREMIUM', category: 'CARNES VACUNAS', defaultPercent: 10.5, cutType: 'CORTE_UTIL' },
      { code: '114', name: 'BIFE ANCHO / OJO DE BIFE', category: 'CARNES VACUNAS', defaultPercent: 9.0, cutType: 'CORTE_UTIL' },
      { code: '115', name: 'LOMO VACUNO SELECCIONADO', category: 'CARNES VACUNAS', defaultPercent: 4.0, cutType: 'CORTE_UTIL' },
      { code: '110', name: 'BOLA DE LOMO / NALGA ENTERA', category: 'CARNES VACUNAS', defaultPercent: 19.0, cutType: 'CORTE_UTIL' },
      { code: '116', name: 'CUADRIL PREMIUM CON COLITA', category: 'CARNES VACUNAS', defaultPercent: 8.8, cutType: 'CORTE_UTIL' },
      { code: '117', name: 'CUADRADA / PECETO CORTE FINO', category: 'CARNES VACUNAS', defaultPercent: 12.0, cutType: 'CORTE_UTIL' },
      { code: '120', name: 'TORTUGUITA / MARUCHA', category: 'CARNES VACUNAS', defaultPercent: 6.8, cutType: 'CORTE_UTIL' },
      { code: '108', name: 'CARNE PICADA ESPECIAL', category: 'CARNES VACUNAS', defaultPercent: 7.5, cutType: 'PICADA_RECORTES' },
      { code: '123', name: 'GRASA DE PELLA / SEBO DE MANTA', category: 'SUBPRODUCTOS', defaultPercent: 4.5, cutType: 'GRASA' },
      { code: '124', name: 'HUESO CON CARNE / ASERRÍN', category: 'SUBPRODUCTOS', defaultPercent: 6.0, cutType: 'HUESO' },
    ],
  },
  RES_ENTERA: {
    title: 'Res Vacuna Entera (Dos Medias Reses)',
    defaultWeight: 240.0,
    items: [
      { code: '101', name: 'ASADO DE TIRA SUPERIOR', category: 'CARNES VACUNAS', defaultPercent: 9.5, cutType: 'CORTE_UTIL' },
      { code: '103', name: 'VACÍO CORTE ESPECIAL', category: 'CARNES VACUNAS', defaultPercent: 4.2, cutType: 'CORTE_UTIL' },
      { code: '109', name: 'MATAMBRE VACUNO SELECCIONADO', category: 'CARNES VACUNAS', defaultPercent: 3.2, cutType: 'CORTE_UTIL' },
      { code: '113', name: 'ENTRAÑA FINA ESPECIAL', category: 'CARNES VACUNAS', defaultPercent: 1.2, cutType: 'CORTE_UTIL' },
      { code: '102', name: 'BIFE DE CHORIZO PREMIUM', category: 'CARNES VACUNAS', defaultPercent: 5.5, cutType: 'CORTE_UTIL' },
      { code: '114', name: 'BIFE ANCHO / OJO DE BIFE', category: 'CARNES VACUNAS', defaultPercent: 4.8, cutType: 'CORTE_UTIL' },
      { code: '115', name: 'LOMO VACUNO SELECCIONADO', category: 'CARNES VACUNAS', defaultPercent: 2.1, cutType: 'CORTE_UTIL' },
      { code: '110', name: 'BOLA DE LOMO / NALGA ENTERA', category: 'CARNES VACUNAS', defaultPercent: 9.8, cutType: 'CORTE_UTIL' },
      { code: '116', name: 'CUADRIL PREMIUM CON COLITA', category: 'CARNES VACUNAS', defaultPercent: 4.5, cutType: 'CORTE_UTIL' },
      { code: '117', name: 'CUADRADA / PECETO CORTE FINO', category: 'CARNES VACUNAS', defaultPercent: 6.2, cutType: 'CORTE_UTIL' },
      { code: '118', name: 'PALETA VACUNA ENTERA', category: 'CARNES VACUNAS', defaultPercent: 8.5, cutType: 'CORTE_UTIL' },
      { code: '119', name: 'ROAST BEEF SELECCIONADO', category: 'CARNES VACUNAS', defaultPercent: 7.8, cutType: 'CORTE_UTIL' },
      { code: '120', name: 'TORTUGUITA / MARUCHA', category: 'CARNES VACUNAS', defaultPercent: 3.5, cutType: 'CORTE_UTIL' },
      { code: '121', name: 'FALDA PARRILERA PARRILLA', category: 'CARNES VACUNAS', defaultPercent: 4.5, cutType: 'CORTE_UTIL' },
      { code: '122', name: 'OSOBUCO CORTADO ESPECIAL', category: 'CARNES VACUNAS', defaultPercent: 4.2, cutType: 'CORTE_UTIL' },
      { code: '108', name: 'CARNE PICADA ESPECIAL', category: 'CARNES VACUNAS', defaultPercent: 9.5, cutType: 'PICADA_RECORTES' },
      { code: '123', name: 'GRASA DE PELLA / SEBO DE MANTA', category: 'SUBPRODUCTOS', defaultPercent: 4.8, cutType: 'GRASA' },
      { code: '124', name: 'HUESO CON CARNE / ASERRÍN', category: 'SUBPRODUCTOS', defaultPercent: 8.8, cutType: 'HUESO' },
    ],
  },
  CERDO_ENTERO: {
    title: 'Media Res Porcina / Cerdo Entero',
    defaultWeight: 85.0,
    items: [
      { code: '111', name: 'PECHITO DE CERDO CON MANTA', category: 'CERDO', defaultPercent: 16.5, cutType: 'CORTE_UTIL' },
      { code: '125', name: 'COSTILLITA DE CERDO CORTE AMERICANO', category: 'CERDO', defaultPercent: 14.0, cutType: 'CORTE_UTIL' },
      { code: '126', name: 'BONDIOLA DE CERDO FRESCA', category: 'CERDO', defaultPercent: 7.5, cutType: 'CORTE_UTIL' },
      { code: '127', name: 'JAMÓN CUADRIL DE CERDO', category: 'CERDO', defaultPercent: 22.0, cutType: 'CORTE_UTIL' },
      { code: '128', name: 'PALETA DE CERDO ENTERA', category: 'CERDO', defaultPercent: 16.0, cutType: 'CORTE_UTIL' },
      { code: '129', name: 'MATAMBRITO DE CERDO ESPECIAL', category: 'CERDO', defaultPercent: 3.5, cutType: 'CORTE_UTIL' },
      { code: '130', name: 'PANCETA DE CERDO CON CUERO', category: 'CERDO', defaultPercent: 5.5, cutType: 'CORTE_UTIL' },
      { code: '106', name: 'CHORIZO BOMBÓN DE CERDO (PICADA BASE)', category: 'EMBUTIDOS', defaultPercent: 6.0, cutType: 'PICADA_RECORTES' },
      { code: '131', name: 'TOCINO / GRASA PURA DE CERDO', category: 'SUBPRODUCTOS', defaultPercent: 4.5, cutType: 'GRASA' },
      { code: '132', name: 'HUESO PELADO Y PATITAS', category: 'SUBPRODUCTOS', defaultPercent: 3.5, cutType: 'HUESO' },
    ],
  },
};

/**
 * Calcula el balance de masa completo y los rendimientos cárnicos
 */
export function calculateDeboningMassBalance(
  initialWeightKg: number,
  cuts: DeboningCutItem[]
): {
  totalOutputWeightKg: number;
  netMeatWeightKg: number;
  boneWeightKg: number;
  fatWeightKg: number;
  scrapWeightKg: number;
  shrinkageWeightKg: number;
  shrinkagePercent: number;
  netMeatYieldPercent: number;
  totalYieldPercent: number;
} {
  const initial = Math.max(0.001, initialWeightKg || 0);

  let totalOutput = 0;
  let netMeat = 0;
  let bone = 0;
  let fat = 0;
  let scrap = 0;

  cuts.forEach((cut) => {
    const w = Math.max(0, Number(cut.weightKg) || 0);
    totalOutput += w;

    const desc = (cut.description || '').toLowerCase();
    const cat = (cut.category || '').toLowerCase();

    if (cut.cutType === 'HUESO' || desc.includes('hueso')) {
      bone += w;
    } else if (cut.cutType === 'GRASA' || desc.includes('grasa') || desc.includes('sebo') || desc.includes('tocino')) {
      fat += w;
    } else if (cut.cutType === 'PICADA_RECORTES' || desc.includes('picada') || desc.includes('recorte')) {
      scrap += w;
    } else {
      netMeat += w;
    }
  });

  const totalOutputRounded = Number(totalOutput.toFixed(3));
  const shrinkageWeightKg = Number(Math.max(0, initial - totalOutputRounded).toFixed(3));
  const shrinkagePercent = Number(((shrinkageWeightKg / initial) * 100).toFixed(2));
  const netMeatYieldPercent = Number(((netMeat / initial) * 100).toFixed(2));
  const totalYieldPercent = Number(((totalOutputRounded / initial) * 100).toFixed(2));

  return {
    totalOutputWeightKg: totalOutputRounded,
    netMeatWeightKg: Number(netMeat.toFixed(3)),
    boneWeightKg: Number(bone.toFixed(3)),
    fatWeightKg: Number(fat.toFixed(3)),
    scrapWeightKg: Number(scrap.toFixed(3)),
    shrinkageWeightKg,
    shrinkagePercent,
    netMeatYieldPercent,
    totalYieldPercent,
  };
}

/**
 * Asigna los costos a cada corte mediante el Método del Valor Relativo de Realización Comercial
 * (Principio contable de producción conjunta cárnica: el costo de compra de la res se distribuye
 * según el peso relativo del valor de venta de cada corte, de manera que la suma de los costos
 * de los cortes resultantes sea EXACTAMENTE igual al costo de adquisición de la media res).
 */
export function allocateDeboningCosts(
  initialCostTotal: number,
  cuts: DeboningCutItem[]
): DeboningCutItem[] {
  // 1. Calcular el valor de venta total
  let totalSaleValue = 0;
  cuts.forEach((cut) => {
    const w = Math.max(0, Number(cut.weightKg) || 0);
    const p = Math.max(0, Number(cut.currentSalePrice) || 0);
    totalSaleValue += w * p;
  });

  // Si no hay ventas valorizadas, distribuir por proporción de kilos
  const totalWeight = cuts.reduce((acc, c) => acc + (Number(c.weightKg) || 0), 0);

  return cuts.map((cut) => {
    const w = Math.max(0, Number(cut.weightKg) || 0);
    const p = Math.max(0, Number(cut.currentSalePrice) || 0);
    const saleVal = Number((w * p).toFixed(2));

    let allocatedCost = 0;
    if (totalSaleValue > 0) {
      // Ponderación por valor comercial
      const share = saleVal / totalSaleValue;
      allocatedCost = Number((initialCostTotal * share).toFixed(2));
    } else if (totalWeight > 0) {
      // Ponderación uniforme por kilos
      const share = w / totalWeight;
      allocatedCost = Number((initialCostTotal * share).toFixed(2));
    }

    const allocatedCostPerKg = w > 0 ? Number((allocatedCost / w).toFixed(2)) : 0;
    const projectedMargin = saleVal > 0 ? Number((((saleVal - allocatedCost) / saleVal) * 100).toFixed(2)) : 0;

    return {
      ...cut,
      totalSaleValue: saleVal,
      allocatedCostPerKg,
      totalAllocatedCost: allocatedCost,
      projectedMarginPercent: projectedMargin,
    };
  });
}

/**
 * Calcula métricas económicas globales
 */
export function calculateDeboningEconomics(
  initialCostTotal: number,
  cuts: DeboningCutItem[],
  netMeatWeightKg: number
): {
  totalCommercialValue: number;
  grossMarginTotal: number;
  grossMarginPercent: number;
  multiplicationFactor: number;
  breakEvenPricePerKg: number;
} {
  let totalCommercialValue = 0;
  cuts.forEach((cut) => {
    totalCommercialValue += Number(cut.totalSaleValue) || 0;
  });
  totalCommercialValue = Number(totalCommercialValue.toFixed(2));

  const grossMarginTotal = Number((totalCommercialValue - initialCostTotal).toFixed(2));
  const grossMarginPercent =
    totalCommercialValue > 0 ? Number(((grossMarginTotal / totalCommercialValue) * 100).toFixed(2)) : 0;
  const multiplicationFactor =
    initialCostTotal > 0 ? Number((totalCommercialValue / initialCostTotal).toFixed(2)) : 1;
  const breakEvenPricePerKg =
    netMeatWeightKg > 0 ? Number((initialCostTotal / netMeatWeightKg).toFixed(2)) : 0;

  return {
    totalCommercialValue,
    grossMarginTotal,
    grossMarginPercent,
    multiplicationFactor,
    breakEvenPricePerKg,
  };
}

/**
 * Genera el documento HTML imprimible del Acta de Desposte Cárnico
 */
export function generateDeboningVoucherHtml(
  deboning: MeatDeboning,
  branchConfig?: BranchConfig | null
): string {
  const branchName = branchConfig?.name || `Carnicerías Neco (${deboning.branchId})`;
  const branchAddress = branchConfig?.address || 'Av. 24 de Septiembre 681, Tartagal';
  const cuit = branchConfig?.cuit || '20-25506516-6';

  const rows = deboning.cuts
    .map(
      (c) => `
      <tr>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; font-family: monospace;">${c.productCode}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; font-weight: bold;">${c.description}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; font-size: 10px; color: #555;">${c.category}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold;">${formatKg(c.weightKg)}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right; color: #004494;">${c.yieldPercent.toFixed(2)}%</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right;">${formatCurrency(c.allocatedCostPerKg)}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right;">${formatCurrency(c.currentSalePrice)}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold;">${formatCurrency(c.totalSaleValue)}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right; color: ${c.projectedMarginPercent >= 0 ? '#0b6623' : '#b00'};">
          ${c.projectedMarginPercent.toFixed(1)}%
        </td>
      </tr>
    `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Acta de Desposte - ${deboning.code}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 0; }
          .header { border-bottom: 2px solid #002046; padding-bottom: 8px; margin-bottom: 12px; }
          .title { font-size: 18px; font-weight: bold; color: #002046; margin: 0; }
          .subtitle { font-size: 12px; color: #444; margin-top: 2px; }
          .grid-info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #f4f6f9; padding: 10px; border: 1px solid #ccc; margin-bottom: 12px; font-size: 11px; }
          .kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 12px; }
          .kpi-card { background: #eef2f7; border: 1px solid #b8c4d6; padding: 6px; text-align: center; border-radius: 3px; }
          .kpi-val { font-size: 14px; font-weight: bold; color: #002046; }
          .kpi-lbl { font-size: 9px; text-transform: uppercase; color: #666; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
          th { background: #002046; color: white; padding: 5px; text-align: left; font-size: 10px; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; }
          .sign-box { border-top: 1px dashed #333; text-align: center; padding-top: 5px; font-size: 11px; }
          @media print {
            .no-print { display: none !important; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h1 class="title">NECO POS — ACTA DE DESPOSTE & RENDIMIENTO CÁRNICO</h1>
              <div class="subtitle">${branchName} | CUIT: ${cuit} — ${branchAddress}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 16px; font-weight: bold; color: #a00;">${deboning.code}</div>
              <div style="font-size: 10px; color: #666;">Fecha: ${deboning.date} ${deboning.time}</div>
              <div style="font-size: 10px; font-weight: bold; color: #0b6623;">ESTADO: ${deboning.status}</div>
            </div>
          </div>
        </div>

        <div class="grid-info">
          <div>
            <strong>Sucursal / Cámara:</strong> ${deboning.branchId} — ${deboning.chamber}<br/>
            <strong>Operador:</strong> ${deboning.operator}<br/>
            <strong>Maestro Despostador:</strong> ${deboning.butcherMaster || 'Personal Especializado'}
          </div>
          <div>
            <strong>Tropa SENASA:</strong> ${deboning.tropaNumber}<br/>
            <strong>Proveedor:</strong> ${deboning.supplier}<br/>
            <strong>DTE / Guía:</strong> ${deboning.dteGuideNumber || 'N/A'}
          </div>
          <div>
            <strong>Categoría:</strong> ${deboning.animalCategory}<br/>
            <strong>Tipo Carcasa:</strong> ${deboning.carcassType.replace('_', ' ')}<br/>
            <strong>Peso al Gancho:</strong> <span style="font-weight: bold; color: #002046;">${formatKg(deboning.initialWeightKg)}</span>
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-val">${formatCurrency(deboning.totalInitialCost)}</div>
            <div class="kpi-lbl">Costo Compra (${formatCurrency(deboning.costPerKgInitial)}/kg)</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val">${formatCurrency(deboning.totalCommercialValue)}</div>
            <div class="kpi-lbl">Valor Venta Estimado</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val" style="color: #0b6623;">${formatCurrency(deboning.grossMarginTotal)} (${deboning.grossMarginPercent}%)</div>
            <div class="kpi-lbl">Margen Bruto Proyectado</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val">${deboning.netMeatYieldPercent}% (${formatKg(deboning.netMeatWeightKg)})</div>
            <div class="kpi-lbl">Rendimiento Carne Útil</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-val" style="color: ${deboning.shrinkagePercent > 2.5 ? '#b00' : '#444'};">
              ${deboning.shrinkagePercent}% (${formatKg(deboning.shrinkageWeightKg)})
            </div>
            <div class="kpi-lbl">Merma Despiece / Oreo</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 50px;">Cód</th>
              <th>Descripción del Corte</th>
              <th>Categoría</th>
              <th style="text-align: right;">Kilos Reales</th>
              <th style="text-align: right;">Rend %</th>
              <th style="text-align: right;">Costo $/Kg</th>
              <th style="text-align: right;">Venta $/Kg</th>
              <th style="text-align: right;">Total Venta</th>
              <th style="text-align: right;">Margen %</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot>
            <tr style="background: #eef2f7; font-weight: bold; border-top: 2px solid #002046;">
              <td colspan="3" style="padding: 5px;">TOTALES DESPIECE / BALANCE:</td>
              <td style="text-align: right; padding: 5px;">${formatKg(deboning.totalOutputWeightKg)}</td>
              <td style="text-align: right; padding: 5px; color: #004494;">${deboning.totalYieldPercent}%</td>
              <td colspan="2" style="text-align: right; padding: 5px;">Costo Equilibrio Carne: ${formatCurrency(deboning.breakEvenPricePerKg)}/Kg</td>
              <td style="text-align: right; padding: 5px; color: #002046;">${formatCurrency(deboning.totalCommercialValue)}</td>
              <td style="text-align: right; padding: 5px; color: #0b6623;">${deboning.grossMarginPercent}%</td>
            </tr>
          </tfoot>
        </table>

        <div style="background: #fff8e1; border: 1px solid #ffd54f; padding: 6px; font-size: 10px; margin-bottom: 15px;">
          <strong>Desglose Subproductos:</strong>
          Carne Útil Mostrador: <strong>${formatKg(deboning.netMeatWeightKg)} (${deboning.netMeatYieldPercent}%)</strong> |
          Recortes Picada: <strong>${formatKg(deboning.scrapWeightKg)}</strong> |
          Grasa de Pella: <strong>${formatKg(deboning.fatWeightKg)}</strong> |
          Hueso / Aserrín: <strong>${formatKg(deboning.boneWeightKg)}</strong> |
          Factor Comercial: <strong>${deboning.multiplicationFactor}x</strong>
        </div>

        ${deboning.notes ? `<div style="font-size: 10px; color: #444; margin-bottom: 20px;"><strong>Observaciones:</strong> ${deboning.notes}</div>` : ''}

        <div class="signatures">
          <div class="sign-box">
            Firma Maestro Despostador / Balancero<br/>
            <span style="font-size: 9px; color: #666;">Acreditación de pesaje y cortes</span>
          </div>
          <div class="sign-box">
            Firma Encargado de Sucursal / Gerencia NECO<br/>
            <span style="font-size: 9px; color: #666;">Conformidad de ingreso a stock de cámara</span>
          </div>
        </div>

        <div style="text-align: center; margin-top: 25px; font-size: 9px; color: #888;">
          Documento interno de trazabilidad y rendimiento cárnico — NECO POS Frigorífico Multi-Sucursal
        </div>
      </body>
    </html>
  `;
}
