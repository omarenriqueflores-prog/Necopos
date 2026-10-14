import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  Download,
  Printer,
  PieChart,
  ShieldAlert,
  Layers,
  Building2,
  Store,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useFirebase } from '../../context/FirebaseContext';
import { isMeatCategory, isMeatProduct, getStoreRubroLabel, formatKg, formatCurrency } from '../../utils/stockHelper';

export const StockValorizationTab: React.FC = () => {
  const { products, branchStock, branchConfigs, meatReceptions } = useFirebase();

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showNonMeatSection, setShowNonMeatSection] = useState<boolean>(false);

  // Map de stock: `${branchId}_${productCode}` -> currentStock
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    branchStock.forEach((bs) => {
      map.set(`${bs.branchId}_${bs.productCode}`, Number(bs.currentStock) || 0);
    });
    return map;
  }, [branchStock]);

  // Artículos cárnicos procesados (estrictamente carnes de cámara frigorífica)
  const meatItems = useMemo(() => {
    const list = products
      .filter((p) => isMeatProduct(p))
      .map((p) => {
        const neco1Stock = stockMap.get(`NECO 1_${p.code}`) || 0;
        const neco2Stock = stockMap.get(`NECO 2_${p.code}`) || 0;
        const totalStock = Number((neco1Stock + neco2Stock).toFixed(3));
        const neco1Value = Number((neco1Stock * p.price).toFixed(2));
        const neco2Value = Number((neco2Stock * p.price).toFixed(2));
        const totalValue = Number((totalStock * p.price).toFixed(2));

        return {
          code: p.code,
          description: p.description,
          category: p.category || 'Carnes Vacunas',
          unitType: p.unitType,
          price: p.price,
          neco1Stock,
          neco2Stock,
          totalStock,
          neco1Value,
          neco2Value,
          totalValue,
        };
      });

    // Incorporar medias reses o artículos cárnicos presentes en stock de cámara que no estén en el catálogo
    const productCodes = new Set(products.map((p) => p.code));
    branchStock.forEach((bs) => {
      if (!productCodes.has(bs.productCode) && (bs.productCode === 'MEDIA_RES' || isMeatCategory(bs.productCode) || bs.productCode.includes('RES'))) {
        const matchingRec = meatReceptions.find((r) => r.productCode === bs.productCode || bs.productCode === 'MEDIA_RES');
        const price = matchingRec?.pricePerKg || 4200;
        const neco1Stock = stockMap.get(`NECO 1_${bs.productCode}`) || 0;
        const neco2Stock = stockMap.get(`NECO 2_${bs.productCode}`) || 0;
        const totalStock = Number((neco1Stock + neco2Stock).toFixed(3));

        if (!list.some((it) => it.code === bs.productCode)) {
          list.push({
            code: bs.productCode,
            description: matchingRec?.productDescription || `MEDIA RES AL GANCHO (${matchingRec?.species || 'Vacuno'})`,
            category: matchingRec?.category || 'Novillito',
            unitType: 'Kg',
            price,
            neco1Stock,
            neco2Stock,
            totalStock,
            neco1Value: Number((neco1Stock * price).toFixed(2)),
            neco2Value: Number((neco2Stock * price).toFixed(2)),
            totalValue: Number((totalStock * price).toFixed(2)),
          });
        }
      }
    });

    return list;
  }, [products, stockMap, branchStock, meatReceptions]);

  // Artículos no cárnicos (Almacén, bebidas, limpieza, carbón, huevos, fideos, etc.) - separados de cámara
  const nonMeatItems = useMemo(() => {
    return products
      .filter((p) => !isMeatProduct(p))
      .map((p) => {
        const neco1Stock = Math.round(stockMap.get(`NECO 1_${p.code}`) || 0);
        const neco2Stock = Math.round(stockMap.get(`NECO 2_${p.code}`) || 0);
        const totalStock = Math.round(neco1Stock + neco2Stock);
        const totalValue = Number((totalStock * p.price).toFixed(2));
        return {
          code: p.code,
          description: p.description,
          category: getStoreRubroLabel(p),
          unitType: p.unitType,
          price: p.price,
          neco1Stock,
          neco2Stock,
          totalStock,
          totalValue,
        };
      });
  }, [products, stockMap]);

  // Agrupamiento por categorías cárnicas
  const categorySummary = useMemo(() => {
    const map = new Map<
      string,
      {
        category: string;
        neco1Kilos: number;
        neco1Value: number;
        neco2Kilos: number;
        neco2Value: number;
        totalKilos: number;
        totalValue: number;
        itemsCount: number;
        cuts: typeof meatItems;
      }
    >();

    meatItems.forEach((it) => {
      const cat = it.category;
      const current = map.get(cat) || {
        category: cat,
        neco1Kilos: 0,
        neco1Value: 0,
        neco2Kilos: 0,
        neco2Value: 0,
        totalKilos: 0,
        totalValue: 0,
        itemsCount: 0,
        cuts: [],
      };

      current.neco1Kilos += it.neco1Stock;
      current.neco1Value += it.neco1Value;
      current.neco2Kilos += it.neco2Stock;
      current.neco2Value += it.neco2Value;
      current.totalKilos += it.totalStock;
      current.totalValue += it.totalValue;
      current.itemsCount += 1;
      current.cuts.push(it);

      map.set(cat, current);
    });

    return Array.from(map.values()).sort((a, b) => b.totalValue - a.totalValue);
  }, [meatItems]);

  // Totales generales cárnicos
  const grandTotals = useMemo(() => {
    let neco1Kilos = 0;
    let neco1Value = 0;
    let neco2Kilos = 0;
    let neco2Value = 0;
    let totalKilos = 0;
    let totalValue = 0;

    categorySummary.forEach((cat) => {
      neco1Kilos += cat.neco1Kilos;
      neco1Value += cat.neco1Value;
      neco2Kilos += cat.neco2Kilos;
      neco2Value += cat.neco2Value;
      totalKilos += cat.totalKilos;
      totalValue += cat.totalValue;
    });

    return {
      neco1Kilos: Number(neco1Kilos.toFixed(3)),
      neco1Value: Number(neco1Value.toFixed(2)),
      neco2Kilos: Number(neco2Kilos.toFixed(3)),
      neco2Value: Number(neco2Value.toFixed(2)),
      totalKilos: Number(totalKilos.toFixed(3)),
      totalValue: Number(totalValue.toFixed(2)),
    };
  }, [categorySummary]);

  const toggleCategory = (catName: string) => {
    setExpandedCategory(expandedCategory === catName ? null : catName);
  };

  const exportValorizationExcel = () => {
    const rows: any[] = [];

    // Detalle de cortes cárnicos
    meatItems.forEach((it) => {
      rows.push({
        'Rubro': 'Cárnico',
        'Categoría': it.category,
        'Código': it.code,
        'Descripción del Corte': it.description,
        'Unidad': it.unitType,
        'Precio Venta Vigente ($)': it.price,
        'Stock NECO 1': it.neco1Stock,
        'Valor NECO 1 ($)': it.neco1Value,
        'Stock NECO 2': it.neco2Stock,
        'Valor NECO 2 ($)': it.neco2Value,
        'Stock Total': it.totalStock,
        'Valor Total Comercial ($)': it.totalValue,
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Valorizacion_Carnica');
    XLSX.writeFile(wb, `NECO_Valorizacion_Stock_Carnico_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const printValorizationSheet = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=950');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Informe Gerencial - Valorización de Stock Cárnico</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 11px; margin: 20mm; color: #111; }
            .header { border-bottom: 2px solid #002046; padding-bottom: 10px; margin-bottom: 15px; }
            h1 { color: #002046; font-size: 18px; margin: 0 0 5px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; }
            th { background: #002046; color: white; padding: 6px; text-align: left; font-size: 10px; }
            td { padding: 5px; border-bottom: 1px solid #ddd; font-size: 10px; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .totals { background-color: #f1f4f8; font-weight: bold; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>NECO CARNICERÍAS — VALORIZACIÓN DE STOCK CÁRNICO EN CÁMARAS</h1>
            <div>Fecha de emisión: ${new Date().toLocaleString('es-AR')}</div>
            <div>Criterio contable: <strong>Stock Físico Real × Precio de Venta Vigente al Público</strong></div>
            <div style="font-size: 10px; color: #666; margin-top: 4px;">* Excluye estrictamente productos de almacén, bebidas y fiambrería.</div>
          </div>

          <h3>1. RESUMEN EJECUTIVO CONSOLIDADO</h3>
          <table>
            <thead>
              <tr>
                <th>SUCURSAL / CÁMARA</th>
                <th class="text-right">KILOGRAMOS EN CÁMARA</th>
                <th class="text-right">VALORIZACIÓN COMERCIAL</th>
                <th class="text-right">% PARTICIPACIÓN</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>NECO 1 (Casa Central)</strong></td>
                <td class="text-right">${formatKg(grandTotals.neco1Kilos)}</td>
                <td class="text-right font-bold">${formatCurrency(grandTotals.neco1Value)}</td>
                <td class="text-right">${grandTotals.totalValue > 0 ? ((grandTotals.neco1Value / grandTotals.totalValue) * 100).toFixed(1) : '0'} %</td>
              </tr>
              <tr>
                <td><strong>NECO 2 (Sucursal)</strong></td>
                <td class="text-right">${formatKg(grandTotals.neco2Kilos)}</td>
                <td class="text-right font-bold">${formatCurrency(grandTotals.neco2Value)}</td>
                <td class="text-right">${grandTotals.totalValue > 0 ? ((grandTotals.neco2Value / grandTotals.totalValue) * 100).toFixed(1) : '0'} %</td>
              </tr>
              <tr class="totals">
                <td>TOTAL CONSOLIDADO EN CÁMARAS:</td>
                <td class="text-right">${formatKg(grandTotals.totalKilos)}</td>
                <td class="text-right">${formatCurrency(grandTotals.totalValue)}</td>
                <td class="text-right">100.0 %</td>
              </tr>
            </tbody>
          </table>

          <h3>2. DESGLOSE POR CATEGORÍA CÁRNICA</h3>
          <table>
            <thead>
              <tr>
                <th>RUBRO / CATEGORÍA</th>
                <th class="text-right">CORTES</th>
                <th class="text-right">KG NECO 1</th>
                <th class="text-right">VALOR NECO 1</th>
                <th class="text-right">KG NECO 2</th>
                <th class="text-right">VALOR NECO 2</th>
                <th class="text-right">TOTAL KILOS</th>
                <th class="text-right">VALOR TOTAL ($)</th>
              </tr>
            </thead>
            <tbody>
              ${categorySummary
                .map(
                  (c) => `
                <tr>
                  <td><strong>${c.category}</strong></td>
                  <td class="text-right">${c.itemsCount}</td>
                  <td class="text-right">${formatKg(c.neco1Kilos)}</td>
                  <td class="text-right">${formatCurrency(c.neco1Value)}</td>
                  <td class="text-right">${formatKg(c.neco2Kilos)}</td>
                  <td class="text-right">${formatCurrency(c.neco2Value)}</td>
                  <td class="text-right font-bold">${formatKg(c.totalKilos)}</td>
                  <td class="text-right font-bold">${formatCurrency(c.totalValue)}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* KPI CARDS GERENCIALES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="win-panel p-3 border-l-4 border-l-blue-800 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 font-bold uppercase">Kilos Cárnicos Totales</span>
            <Layers className="w-4 h-4 text-blue-700" />
          </div>
          <div className="text-2xl font-bold font-mono text-gray-900 mt-1">{formatKg(grandTotals.totalKilos)}</div>
          <div className="text-[11px] text-gray-600 mt-0.5">Sumatoria cámaras 1 y 2</div>
        </div>

        <div className="win-panel p-3 border-l-4 border-l-blue-600 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs text-blue-700 font-bold uppercase">Valor Stock NECO 1 (Central)</span>
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-blue-900 mt-1">
            {formatCurrency(grandTotals.neco1Value)}
          </div>
          <div className="text-[11px] text-gray-600 mt-0.5">
            {formatKg(grandTotals.neco1Kilos)} en Cámara Central
          </div>
        </div>

        <div className="win-panel p-3 border-l-4 border-l-purple-600 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-700 font-bold uppercase">Valor Stock NECO 2 (Sucursal)</span>
            <Store className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-purple-900 mt-1">
            {formatCurrency(grandTotals.neco2Value)}
          </div>
          <div className="text-[11px] text-gray-600 mt-0.5">
            {formatKg(grandTotals.neco2Kilos)} en Cámara Frigorífica
          </div>
        </div>

        <div className="win-panel p-3 border-l-4 border-l-green-600 bg-green-50/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-green-900 font-bold uppercase">VALOR TOTAL GENERAL CÁRNICO</span>
            <DollarSign className="w-5 h-5 text-green-700" />
          </div>
          <div className="text-2xl font-bold font-mono text-green-950 mt-1">
            {formatCurrency(grandTotals.totalValue)}
          </div>
          <div className="text-[11px] text-green-800 font-medium mt-0.5">
            100% valorizado a Precio Venta Vigente
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="win-toolbar p-2 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <PieChart className="w-4 h-4 text-blue-800" />
          <span className="font-bold text-gray-800">
            Informe de Capital de Trabajo Invertido en Carnes
          </span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-600 italic">
            Fórmula: Stock Actual × Precio de Venta Vigente (Artículos de almacén excluidos)
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={printValorizationSheet}
            className="win-button py-1 px-2.5 flex items-center space-x-1 font-bold text-gray-800"
          >
            <Printer className="w-3.5 h-3.5 text-blue-700" />
            <span>Imprimir Informe</span>
          </button>
          <button
            onClick={exportValorizationExcel}
            className="win-button py-1 px-2.5 flex items-center space-x-1 text-gray-800"
          >
            <Download className="w-3.5 h-3.5 text-green-700" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* TABLA PRINCIPAL POR CATEGORÍA CÁRNICA */}
      <div className="win-panel flex-1 overflow-auto bg-white">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-[#002046] text-white sticky top-0 z-10 select-none">
            <tr>
              <th className="p-2 border border-[#00152e] w-8"></th>
              <th className="p-2 border border-[#00152e]">CATEGORÍA CÁRNICA</th>
              <th className="p-2 border border-[#00152e] w-20 text-center">CORTES</th>
              <th className="p-2 border border-[#00152e] w-28 text-right bg-[#002c61]">KG NECO 1</th>
              <th className="p-2 border border-[#00152e] w-32 text-right bg-[#002c61]">VALOR NECO 1</th>
              <th className="p-2 border border-[#00152e] w-28 text-right bg-[#002c61]">KG NECO 2</th>
              <th className="p-2 border border-[#00152e] w-32 text-right bg-[#002c61]">VALOR NECO 2</th>
              <th className="p-2 border border-[#00152e] w-32 text-right bg-[#001e42]">TOTAL KILOS</th>
              <th className="p-2 border border-[#00152e] w-36 text-right bg-[#001e42]">VALOR TOTAL ($)</th>
              <th className="p-2 border border-[#00152e] w-24 text-center">% PARTICIP.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 font-sans">
            {categorySummary.map((cat, idx) => {
              const isExpanded = expandedCategory === cat.category;
              const percent =
                grandTotals.totalValue > 0
                  ? ((cat.totalValue / grandTotals.totalValue) * 100).toFixed(1)
                  : '0.0';

              return (
                <React.Fragment key={cat.category}>
                  <tr
                    onClick={() => toggleCategory(cat.category)}
                    className="hover:bg-blue-50 cursor-pointer font-bold bg-white transition-colors"
                  >
                    <td className="p-2 text-center text-gray-500 border border-gray-200">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 mx-auto text-blue-700" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 mx-auto text-gray-400" />
                      )}
                    </td>
                    <td className="p-2 border border-gray-200 text-gray-900">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                        <span>{cat.category}</span>
                      </div>
                    </td>
                    <td className="p-2 border border-gray-200 text-center text-gray-600 font-normal">
                      {cat.itemsCount}
                    </td>
                    <td className="p-2 border border-gray-200 text-right font-mono text-gray-800">
                      {formatKg(cat.neco1Kilos)}
                    </td>
                    <td className="p-2 border border-gray-200 text-right font-mono text-blue-900">
                      {formatCurrency(cat.neco1Value)}
                    </td>
                    <td className="p-2 border border-gray-200 text-right font-mono text-gray-800">
                      {formatKg(cat.neco2Kilos)}
                    </td>
                    <td className="p-2 border border-gray-200 text-right font-mono text-purple-900">
                      {formatCurrency(cat.neco2Value)}
                    </td>
                    <td className="p-2 border border-gray-200 text-right font-mono font-bold text-gray-900">
                      {formatKg(cat.totalKilos)}
                    </td>
                    <td className="p-2 border border-gray-200 text-right font-mono font-bold text-green-900">
                      {formatCurrency(cat.totalValue)}
                    </td>
                    <td className="p-2 border border-gray-200 text-center font-mono text-gray-700">
                      {percent} %
                    </td>
                  </tr>

                  {/* Detalle expandido de cortes dentro de esta categoría */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={10} className="p-0 border border-gray-300 bg-gray-50">
                        <div className="p-3 pl-8">
                          <div className="font-bold text-[11px] text-gray-700 mb-2">
                            Detalle de cortes en {cat.category}:
                          </div>
                          <table className="w-full text-xs border border-gray-300 bg-white">
                            <thead className="bg-gray-100 text-gray-700">
                              <tr>
                                <th className="p-1.5 border border-gray-300">CÓDIGO</th>
                                <th className="p-1.5 border border-gray-300">DESCRIPCIÓN</th>
                                <th className="p-1.5 border border-gray-300 text-right">PRECIO VIGENTE</th>
                                <th className="p-1.5 border border-gray-300 text-right">KG NECO 1</th>
                                <th className="p-1.5 border border-gray-300 text-right">VALOR NECO 1</th>
                                <th className="p-1.5 border border-gray-300 text-right">KG NECO 2</th>
                                <th className="p-1.5 border border-gray-300 text-right">VALOR NECO 2</th>
                                <th className="p-1.5 border border-gray-300 text-right">TOTAL KILOS</th>
                                <th className="p-1.5 border border-gray-300 text-right">VALOR TOTAL</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cat.cuts.map((cut) => (
                                <tr key={cut.code} className="hover:bg-gray-50 font-normal">
                                  <td className="p-1.5 border border-gray-200 font-mono text-center">
                                    {cut.code}
                                  </td>
                                  <td className="p-1.5 border border-gray-200 font-bold text-gray-900">
                                    {cut.description}
                                  </td>
                                  <td className="p-1.5 border border-gray-200 text-right font-mono text-gray-600">
                                    {formatCurrency(cut.price)}
                                  </td>
                                  <td className="p-1.5 border border-gray-200 text-right font-mono">
                                    {formatKg(cut.neco1Stock)}
                                  </td>
                                  <td className="p-1.5 border border-gray-200 text-right font-mono text-blue-900">
                                    {formatCurrency(cut.neco1Value)}
                                  </td>
                                  <td className="p-1.5 border border-gray-200 text-right font-mono">
                                    {formatKg(cut.neco2Stock)}
                                  </td>
                                  <td className="p-1.5 border border-gray-200 text-right font-mono text-purple-900">
                                    {formatCurrency(cut.neco2Value)}
                                  </td>
                                  <td className="p-1.5 border border-gray-200 text-right font-mono font-bold">
                                    {formatKg(cut.totalStock)}
                                  </td>
                                  <td className="p-1.5 border border-gray-200 text-right font-mono font-bold text-green-900">
                                    {formatCurrency(cut.totalValue)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot className="bg-[#f1f4f8] font-bold sticky bottom-0 border-t-2 border-gray-400">
            <tr>
              <td colSpan={3} className="p-2.5 text-right font-bold text-gray-900">
                TOTAL GENERAL CÁRNICO CONSOLIDADO:
              </td>
              <td className="p-2.5 text-right font-mono text-blue-900">
                {formatKg(grandTotals.neco1Kilos)}
              </td>
              <td className="p-2.5 text-right font-mono text-blue-900">
                {formatCurrency(grandTotals.neco1Value)}
              </td>
              <td className="p-2.5 text-right font-mono text-purple-900">
                {formatKg(grandTotals.neco2Kilos)}
              </td>
              <td className="p-2.5 text-right font-mono text-purple-900">
                {formatCurrency(grandTotals.neco2Value)}
              </td>
              <td className="p-2.5 text-right font-mono font-bold text-gray-900">
                {formatKg(grandTotals.totalKilos)}
              </td>
              <td className="p-2.5 text-right font-mono font-bold text-green-900 text-sm">
                {formatCurrency(grandTotals.totalValue)}
              </td>
              <td className="p-2.5 text-center font-mono">100.0 %</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* SECCIÓN INFORMATIVA DE ALMACÉN (COLAPSABLE) */}
      <div className="win-panel p-2 bg-gray-100 border border-gray-300">
        <button
          onClick={() => setShowNonMeatSection(!showNonMeatSection)}
          className="w-full flex items-center justify-between text-xs font-bold text-gray-700"
        >
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-gray-500" />
            <span>
              Ver Artículos de Almacén / No Cárnicos (Excluidos de la valorización cárnica) — {nonMeatItems.length} artículos
            </span>
          </div>
          <span className="text-[11px] text-blue-700">{showNonMeatSection ? 'Ocultar' : 'Mostrar'}</span>
        </button>

        {showNonMeatSection && (
          <div className="mt-2 pt-2 border-t border-gray-300 max-h-48 overflow-auto bg-white">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-gray-200 text-gray-700">
                <tr>
                  <th className="p-1.5 border border-gray-300">CÓDIGO</th>
                  <th className="p-1.5 border border-gray-300">DESCRIPCIÓN</th>
                  <th className="p-1.5 border border-gray-300">CATEGORÍA</th>
                  <th className="p-1.5 border border-gray-300 text-right">STOCK TOTAL</th>
                  <th className="p-1.5 border border-gray-300 text-right">PRECIO ($)</th>
                  <th className="p-1.5 border border-gray-300 text-right">VALOR INFORMATIVO</th>
                </tr>
              </thead>
              <tbody>
                {nonMeatItems.map((item) => (
                  <tr key={item.code} className="hover:bg-gray-50">
                    <td className="p-1.5 border border-gray-200 font-mono text-center">{item.code}</td>
                    <td className="p-1.5 border border-gray-200 font-bold text-gray-800">{item.description}</td>
                    <td className="p-1.5 border border-gray-200 text-gray-600">{item.category}</td>
                    <td className="p-1.5 border border-gray-200 text-right font-mono font-bold">
                      {item.totalStock} {item.unitType}
                    </td>
                    <td className="p-1.5 border border-gray-200 text-right font-mono text-gray-700">
                      {formatCurrency(item.price)}
                    </td>
                    <td className="p-1.5 border border-gray-200 text-right font-mono text-gray-700">
                      {formatCurrency(item.totalValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
