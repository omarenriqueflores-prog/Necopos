import React, { useState, useMemo } from 'react';
import {
  Scale,
  Calendar,
  Building2,
  Filter,
  Search,
  Download,
  Printer,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Layers,
  ArrowRightLeft,
  DollarSign,
  ShoppingCart,
  Boxes,
  FileCheck,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useFirebase } from '../../context/FirebaseContext';
import { Product, StockMovement, UnitType, ANIMAL_CATEGORIES } from '../../types/pos';
import { isMeatCategory, formatKg, formatCurrency } from '../../utils/stockHelper';

type DateFilter = 'TODAY' | 'WEEK' | 'MONTH' | 'ALL';

export const MeatReconciliationTab: React.FC = () => {
  const {
    products,
    branchStock,
    stockMovements,
    sales,
    branchConfigs,
    localUser,
    user,
    recordStockMovement,
  } = useFirebase();

  const operatorName = localUser?.fullName || user?.displayName || localUser?.username || 'Encargado de Control';

  const [selectedBranch, setSelectedBranch] = useState<'NECO 1' | 'NECO 2'>('NECO 1');
  const [dateFilter, setDateFilter] = useState<DateFilter>('WEEK');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DISCREPANCY' | 'MATCH'>('ALL');

  // Modal para regularizar desvío
  const [adjustingItem, setAdjustingItem] = useState<{
    product: Product;
    difference: number;
    theoretical: number;
    physical: number;
  } | null>(null);
  const [adjustNotes, setAdjustNotes] = useState('');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

  // Fechas de filtro
  const { startDateStr, todayStr } = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    let start = today;
    if (dateFilter === 'WEEK') {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      start = past.toISOString().slice(0, 10);
    } else if (dateFilter === 'MONTH') {
      const past = new Date(now.getFullYear(), now.getMonth(), 1);
      start = past.toISOString().slice(0, 10);
    } else if (dateFilter === 'ALL') {
      start = '2020-01-01';
    }

    return { startDateStr: start, todayStr: today };
  }, [dateFilter]);

  // Movimientos filtrados por sucursal y rango de fecha
  const relevantMovements = useMemo(() => {
    return stockMovements.filter((m) => {
      if (m.branchId !== selectedBranch) return false;
      if (m.date < startDateStr) return false;
      return true;
    });
  }, [stockMovements, selectedBranch, startDateStr]);

  // Productos cárnicos
  const meatProducts = useMemo(() => {
    return products.filter((p) => isMeatCategory(p.category));
  }, [products]);

  // Categorías de cortes con las categorías animales oficiales primero
  const categories = useMemo(() => {
    const customCats = new Set<string>();
    meatProducts.forEach((p) => {
      if (p.category) customCats.add(p.category);
    });
    return Array.from(new Set([...ANIMAL_CATEGORIES, ...Array.from(customCats)]));
  }, [meatProducts]);

  // Tabla consolidada de conciliación por producto
  const reconciliationData = useMemo(() => {
    // 1. Agrupar movimientos por código de producto
    const movByCode = new Map<string, StockMovement[]>();
    relevantMovements.forEach((m) => {
      const list = movByCode.get(m.productCode) || [];
      list.push(m);
      movByCode.set(m.productCode, list);
    });

    // 2. Map de stock actual en cámara
    const stockMap = new Map<string, number>();
    branchStock.forEach((bs) => {
      if (bs.branchId === selectedBranch) {
        stockMap.set(bs.productCode, Number(bs.currentStock) || 0);
      }
    });

    return meatProducts.map((p) => {
      const movs = movByCode.get(p.code) || [];

      // Saldo inicial del período (movimientos registrados previos a startDateStr en esta sucursal)
      const prevMovs = stockMovements.filter(
        (m) => m.branchId === selectedBranch && m.productCode === p.code && m.date < startDateStr
      );
      const initialPeriodStock = Number(
        prevMovs.reduce((sum, m) => sum + (Number(m.quantity) || 0) * (m.factor || 1), 0).toFixed(3)
      );

      let producedKg = 0; // Desposte / Producción
      let initialOrEntryKg = 0; // Stock inicial u otros ingresos dentro del período
      let transferInKg = 0; // Traslados recibidos
      let soldKg = 0; // Ventas mostrador
      let wasteKg = 0; // Mermas
      let transferOutKg = 0; // Traslados enviados
      let adjustmentsPositiveKg = 0; // Ajustes +
      let adjustmentsNegativeKg = 0; // Ajustes -

      movs.forEach((m) => {
        const qty = Math.abs(Number(m.quantity) || 0);
        if (m.type === 'PRODUCCION' || m.type === 'DESPOSTE_INGRESO') {
          producedKg += qty;
        } else if (m.type === 'VENTA') {
          soldKg += qty;
        } else if (m.type === 'MERMA') {
          wasteKg += qty;
        } else if (m.type === 'TRANSFERENCIA_SALIDA') {
          transferOutKg += qty;
        } else if (m.type === 'TRANSFERENCIA_ENTRADA') {
          transferInKg += qty;
        } else if (m.type === 'STOCK_INICIAL') {
          initialOrEntryKg += qty;
        } else if (m.type === 'AJUSTE_POSITIVO' || m.type === 'DEVOLUCION') {
          adjustmentsPositiveKg += qty;
        } else if (m.type === 'AJUSTE_NEGATIVO') {
          adjustmentsNegativeKg += qty;
        } else if (m.type === 'ENTRADA') {
          initialOrEntryKg += qty;
        }
      });

      // Total bruto ingresado en el período
      const grossAvailableKg = Number(
        (producedKg + initialOrEntryKg + transferInKg + adjustmentsPositiveKg).toFixed(3)
      );

      // Total salidas contables (ventas, mermas, traslados out, ajustes negativos)
      const totalOutflowKg = Number(
        (soldKg + wasteKg + transferOutKg + adjustmentsNegativeKg).toFixed(3)
      );

      // Stock físico actual en la cámara
      const currentPhysicalStock = Number((stockMap.get(p.code) || 0).toFixed(3));

      // Saldo teórico de cierre independiente: Saldo Inicial + Entradas - Salidas
      // (Bajo ninguna circunstancia se fuerza a cero si el físico es cero para no ocultar faltantes)
      const theoreticalStock = Number((initialPeriodStock + grossAvailableKg - totalOutflowKg).toFixed(3));

      // Stock disponible actual en cámara
      const totalAvailableKg = currentPhysicalStock;

      // Desvío = Físico - Teórico
      const differenceKg = Number((currentPhysicalStock - theoreticalStock).toFixed(3));
      const differenceValue = Number((differenceKg * p.price).toFixed(2));

      // % de Venta sobre lo producido/disponible bruto
      const salesRatioPercent =
        grossAvailableKg > 0 ? Number(((soldKg / grossAvailableKg) * 100).toFixed(1)) : 0;

      // Estado del desvío
      let status: 'CONCILIADO' | 'FALTANTE' | 'SOBRANTE' = 'CONCILIADO';
      if (differenceKg < -0.5) {
        status = 'FALTANTE';
      } else if (differenceKg > 0.5) {
        status = 'SOBRANTE';
      }

      return {
        product: p,
        initialPeriodStock,
        producedKg: Number(producedKg.toFixed(3)),
        initialOrEntryKg: Number(initialOrEntryKg.toFixed(3)),
        transferInKg: Number(transferInKg.toFixed(3)),
        grossAvailableKg,
        totalAvailableKg,
        soldKg: Number(soldKg.toFixed(3)),
        wasteKg: Number(wasteKg.toFixed(3)),
        transferOutKg: Number(transferOutKg.toFixed(3)),
        totalOutflowKg,
        theoreticalStock,
        currentPhysicalStock: Number(currentPhysicalStock.toFixed(3)),
        differenceKg,
        differenceValue,
        salesRatioPercent,
        status,
      };
    });
  }, [relevantMovements, meatProducts, branchStock, selectedBranch, stockMovements, startDateStr]);

  // Filtrado final para grilla
  const filteredData = useMemo(() => {
    return reconciliationData.filter((item) => {
      // Categoría
      if (selectedCategory !== 'ALL' && item.product.category !== selectedCategory) {
        return false;
      }

      // Estado
      if (statusFilter === 'DISCREPANCY' && item.status === 'CONCILIADO') {
        return false;
      }
      if (statusFilter === 'MATCH' && item.status !== 'CONCILIADO') {
        return false;
      }

      // Buscador
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = item.product.code.toLowerCase().includes(q);
        const matchDesc = item.product.description.toLowerCase().includes(q);
        if (!matchCode && !matchDesc) return false;
      }

      return true;
    });
  }, [reconciliationData, selectedCategory, statusFilter, searchQuery]);

  // KPIs Totales del tablero
  const totals = useMemo(() => {
    let sumProduced = 0;
    let sumSold = 0;
    let sumWaste = 0;
    let sumPhysical = 0;
    let sumTheoretical = 0;
    let sumDiffValue = 0;
    let countDiscrepancies = 0;

    filteredData.forEach((d) => {
      sumProduced += d.producedKg;
      sumSold += d.soldKg;
      sumWaste += d.wasteKg;
      sumPhysical += d.currentPhysicalStock;
      sumTheoretical += d.theoreticalStock;
      sumDiffValue += d.differenceValue;
      if (d.status !== 'CONCILIADO') countDiscrepancies++;
    });

    const netDeviationKg = Number((sumPhysical - sumTheoretical).toFixed(3));
    const realizationRatio = sumProduced > 0 ? Number(((sumSold / sumProduced) * 100).toFixed(1)) : 0;

    return {
      sumProduced: Number(sumProduced.toFixed(3)),
      sumSold: Number(sumSold.toFixed(3)),
      sumWaste: Number(sumWaste.toFixed(3)),
      sumPhysical: Number(sumPhysical.toFixed(3)),
      sumTheoretical: Number(sumTheoretical.toFixed(3)),
      netDeviationKg,
      sumDiffValue: Number(sumDiffValue.toFixed(2)),
      countDiscrepancies,
      realizationRatio,
    };
  }, [filteredData]);

  // Aplicar ajuste rápido para regularizar un corte
  const handleApplyAdjustment = async () => {
    if (!adjustingItem) return;
    try {
      setIsSubmittingAdjust(true);
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const diff = adjustingItem.difference;
      const isPositive = diff > 0;
      const absDiff = Math.abs(diff);

      const mov: StockMovement = {
        id: `SM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        date: dateStr,
        time: timeStr,
        timestamp: Date.now(),
        branchId: selectedBranch,
        chamber: selectedBranch === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2',
        productId: adjustingItem.product.id,
        productCode: adjustingItem.product.code,
        productDescription: adjustingItem.product.description,
        category: adjustingItem.product.category,
        unitType: adjustingItem.product.unitType,
        type: isPositive ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
        quantity: absDiff,
        factor: isPositive ? 1 : -1,
        previousStock: adjustingItem.theoretical,
        newStock: adjustingItem.physical,
        unitPrice: adjustingItem.product.price,
        totalValue: Number((absDiff * adjustingItem.product.price).toFixed(2)),
        referenceDoc: 'CONCIL-PROD-VTA',
        operator: operatorName,
        reason: 'Ajuste por Conciliación de Producción vs Ventas Mostrador',
        notes: adjustNotes.trim() || `Regularización de desvío de ${formatKg(diff)} detectado en auditoría`,
      };

      await recordStockMovement(mov);
      setAdjustingItem(null);
      setAdjustNotes('');
    } catch (err: any) {
      console.error('Error applying reconciliation adjustment:', err);
      alert('Error al aplicar el ajuste: ' + err.message);
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  // Exportar a Excel
  const handleExportExcel = () => {
    const data = filteredData.map((d) => ({
      'PLU': d.product.scalePlu || d.product.code,
      'Código': d.product.code,
      'Descripción': d.product.description,
      'Categoría': d.product.category,
      'Precio Venta ($)': d.product.price,
      'Desposte/Producción (Kg)': d.producedKg,
      'Otros Ingresos (Kg)': d.initialOrEntryKg,
      'Traslados Recibidos (Kg)': d.transferInKg,
      'Total Disponible (Kg)': d.totalAvailableKg,
      'Ventas Mostrador (Kg)': d.soldKg,
      'Mermas Registradas (Kg)': d.wasteKg,
      'Traslados Enviados (Kg)': d.transferOutKg,
      'Stock Teórico Kardex (Kg)': d.theoreticalStock,
      'Stock Físico Real Cámara (Kg)': d.currentPhysicalStock,
      'Desvío Neto (Kg)': d.differenceKg,
      'Desvío Valorado ($)': d.differenceValue,
      '% Realización Ventas': d.salesRatioPercent,
      'Estado Conciliación': d.status,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Conciliación ${selectedBranch}`);
    XLSX.writeFile(wb, `NECO_POS_Conciliacion_Carnica_${selectedBranch}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Imprimir Acta de Conciliación
  const handlePrint = () => {
    const branchConfig = branchConfigs ? branchConfigs[selectedBranch] : null;
    const branchName = branchConfig?.name || `Carnicerías Neco (${selectedBranch})`;

    const rows = filteredData
      .map(
        (d) => `
      <tr>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; font-family: monospace;">${d.product.code}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; font-weight: bold;">${d.product.description}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right;">${formatKg(d.producedKg)}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right;">${formatKg(d.totalAvailableKg)}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right; color: #002046; font-weight: bold;">${formatKg(d.soldKg)}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right; color: #b00;">${formatKg(d.wasteKg)}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right;">${formatKg(d.theoreticalStock)}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold;">${formatKg(d.currentPhysicalStock)}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold; color: ${
          d.status === 'CONCILIADO' ? '#0b6623' : d.status === 'FALTANTE' ? '#b00' : '#004494'
        };">
          ${formatKg(d.differenceKg)}
        </td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: right;">${formatCurrency(d.differenceValue)}</td>
        <td style="padding: 4px; border-bottom: 1px solid #ddd; text-align: center; font-weight: bold; font-size: 9px;">${d.status}</td>
      </tr>
    `
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Acta de Conciliación Cárnica - ${selectedBranch}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #111; margin: 0; padding: 0; }
            .header { border-bottom: 2px solid #002046; padding-bottom: 6px; margin-bottom: 10px; }
            .title { font-size: 16px; font-weight: bold; color: #002046; margin: 0; }
            .kpi-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 10px; }
            .kpi-card { background: #eef2f7; border: 1px solid #b8c4d6; padding: 5px; text-align: center; }
            .kpi-val { font-size: 13px; font-weight: bold; color: #002046; }
            .kpi-lbl { font-size: 8px; text-transform: uppercase; color: #666; margin-top: 1px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 9.5px; }
            th { background: #002046; color: white; padding: 4px; text-align: left; font-size: 9.5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div style="display: flex; justify-content: space-between;">
              <div>
                <h1 class="title">NECO POS — ACTA DE CONCILIACIÓN CÁRNICA (PRODUCCIÓN VS VENTAS)</h1>
                <div>${branchName} | Auditoría: ${dateFilter} (Desde ${startDateStr} hasta ${todayStr})</div>
              </div>
              <div style="text-align: right;">
                <strong>Operador:</strong> ${operatorName}<br/>
                <span style="font-size: 9px; color: #666;">Emisión: ${new Date().toLocaleString('es-AR')}</span>
              </div>
            </div>
          </div>

          <div class="kpi-row">
            <div class="kpi-card"><div class="kpi-val">${formatKg(totals.sumProduced)}</div><div class="kpi-lbl">Total Producido</div></div>
            <div class="kpi-card"><div class="kpi-val">${formatKg(totals.sumSold)}</div><div class="kpi-lbl">Vendido Mostrador</div></div>
            <div class="kpi-card"><div class="kpi-val">${formatKg(totals.sumWaste)}</div><div class="kpi-lbl">Mermas Técnicas</div></div>
            <div class="kpi-card"><div class="kpi-val">${formatKg(totals.sumTheoretical)}</div><div class="kpi-lbl">Stock Teórico</div></div>
            <div class="kpi-card"><div class="kpi-val">${formatKg(totals.sumPhysical)}</div><div class="kpi-lbl">Stock Físico Real</div></div>
            <div class="kpi-card">
              <div class="kpi-val" style="color: ${totals.netDeviationKg < 0 ? '#b00' : '#0b6623'};">
                ${formatKg(totals.netDeviationKg)} (${formatCurrency(totals.sumDiffValue)})
              </div>
              <div class="kpi-lbl">Desvío Neto Global</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Cód</th>
                <th>Corte Cárnico</th>
                <th style="text-align: right;">Producido</th>
                <th style="text-align: right;">Disponible</th>
                <th style="text-align: right;">Ventas POS</th>
                <th style="text-align: right;">Mermas</th>
                <th style="text-align: right;">Teórico</th>
                <th style="text-align: right;">Físico</th>
                <th style="text-align: right;">Desvío Kg</th>
                <th style="text-align: right;">Desvío $</th>
                <th style="text-align: center;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <div style="margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px;">
            <div style="border-top: 1px dashed #333; text-align: center; padding-top: 5px;">
              Firma Encargado de Sucursal
            </div>
            <div style="border-top: 1px dashed #333; text-align: center; padding-top: 5px;">
              Firma Auditor de Control y Calidad Neco
            </div>
          </div>
        </body>
      </html>
    `;

    const win = window.open('', '_blank', 'width=1000,height=750');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => {
        win.print();
      }, 350);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f1f4f8] space-y-2 select-none overflow-hidden p-2 text-xs">
      {/* TARJETAS RESUMEN KPIS */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 shrink-0">
        <div className="bg-white border border-[#c4c6cf] p-2 rounded shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-semibold flex items-center justify-between">
            <span>Producido / Desposte</span>
            <Scale className="w-3.5 h-3.5 text-blue-800" />
          </div>
          <div className="text-lg font-bold text-[#002046] mt-0.5">{formatKg(totals.sumProduced)}</div>
          <div className="text-[10px] text-gray-500 font-semibold">En período seleccionado</div>
        </div>

        <div className="bg-white border border-[#c4c6cf] p-2 rounded shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-semibold flex items-center justify-between">
            <span>Ventas Mostrador</span>
            <ShoppingCart className="w-3.5 h-3.5 text-indigo-700" />
          </div>
          <div className="text-lg font-bold text-indigo-900 mt-0.5">{formatKg(totals.sumSold)}</div>
          <div className="text-[10px] text-indigo-700 font-semibold">{totals.realizationRatio}% de salida comercial</div>
        </div>

        <div className="bg-white border border-[#c4c6cf] p-2 rounded shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-semibold flex items-center justify-between">
            <span>Mermas Declaradas</span>
            <TrendingDown className="w-3.5 h-3.5 text-amber-700" />
          </div>
          <div className="text-lg font-bold text-amber-900 mt-0.5">{formatKg(totals.sumWaste)}</div>
          <div className="text-[10px] text-gray-500 font-semibold">Oreo y recortes registrados</div>
        </div>

        <div className="bg-white border border-[#c4c6cf] p-2 rounded shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-semibold flex items-center justify-between">
            <span>Stock Teórico</span>
            <Boxes className="w-3.5 h-3.5 text-gray-600" />
          </div>
          <div className="text-lg font-bold text-gray-800 mt-0.5">{formatKg(totals.sumTheoretical)}</div>
          <div className="text-[10px] text-gray-500 font-semibold">Kardex contable</div>
        </div>

        <div className="bg-white border border-[#c4c6cf] p-2 rounded shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-semibold flex items-center justify-between">
            <span>Stock Físico Real</span>
            <FileCheck className="w-3.5 h-3.5 text-green-700" />
          </div>
          <div className="text-lg font-bold text-green-800 mt-0.5">{formatKg(totals.sumPhysical)}</div>
          <div className="text-[10px] text-green-700 font-semibold">En cámara frigorífica</div>
        </div>

        <div className="bg-white border border-[#c4c6cf] p-2 rounded shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-semibold flex items-center justify-between">
            <span>Desvío Neto</span>
            <AlertTriangle className={`w-3.5 h-3.5 ${totals.netDeviationKg < 0 ? 'text-red-600' : 'text-green-600'}`} />
          </div>
          <div className={`text-lg font-bold mt-0.5 ${totals.netDeviationKg < 0 ? 'text-red-700' : 'text-green-800'}`}>
            {formatKg(totals.netDeviationKg)}
          </div>
          <div className="text-[10px] font-semibold text-gray-600">
            {formatCurrency(totals.sumDiffValue)} ({totals.countDiscrepancies} discrepancias)
          </div>
        </div>
      </div>

      {/* BARRA DE HERRAMIENTAS Y FILTROS */}
      <div className="bg-white border border-[#c4c6cf] p-2 flex flex-wrap items-center justify-between gap-2 shadow-sm shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* Sucursal */}
          <div className="flex items-center space-x-1 border border-gray-300 rounded px-1.5 py-0.5 bg-[#f8f9fa]">
            <Building2 className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value as any)}
              className="bg-transparent border-none text-xs font-bold text-[#002046] focus:outline-none cursor-pointer"
            >
              <option value="NECO 1">NECO 1 (Cámara Central)</option>
              <option value="NECO 2">NECO 2 (Cámara Villa Saavedra)</option>
            </select>
          </div>

          {/* Rango de Fechas */}
          <div className="flex items-center space-x-1 border border-gray-300 rounded px-1.5 py-0.5 bg-[#f8f9fa]">
            <Calendar className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="bg-transparent border-none text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="TODAY">Hoy</option>
              <option value="WEEK">Últimos 7 Días</option>
              <option value="MONTH">Mes Actual</option>
              <option value="ALL">Todo el Historial</option>
            </select>
          </div>

          {/* Categoría */}
          <div className="flex items-center space-x-1 border border-gray-300 rounded px-1.5 py-0.5 bg-[#f8f9fa]">
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent border-none text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todas las Categorías</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Estado de Desvío */}
          <div className="flex items-center space-x-1 border border-gray-300 rounded px-1.5 py-0.5 bg-[#f8f9fa]">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-transparent border-none text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todos los Ítems</option>
              <option value="DISCREPANCY">Solo Desvíos (Faltante / Sobrante)</option>
              <option value="MATCH">Solo Conciliados (Exactos)</option>
            </select>
          </div>

          {/* Buscador */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Buscar corte cárnico..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 py-1 bg-white border border-gray-300 rounded text-xs w-48 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handlePrint}
            className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-300 rounded font-semibold text-gray-700 flex items-center space-x-1 shadow-sm text-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-blue-700" />
            <span>Imprimir Acta</span>
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-300 rounded font-semibold text-gray-700 flex items-center space-x-1 shadow-sm text-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-green-700" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE CONCILIACIÓN */}
      <div className="flex-1 bg-white border border-[#c4c6cf] overflow-hidden shadow-sm flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-[#002046] text-white sticky top-0 z-10 text-[10px]">
              <tr>
                <th className="p-2 text-left w-14">Cód</th>
                <th className="p-2 text-left">Corte Cárnico</th>
                <th className="p-2 text-left w-28">Categoría</th>
                <th className="p-2 text-right w-24 bg-gray-700">Stock Inicial (Kg)</th>
                <th className="p-2 text-right w-24 bg-blue-900/80">Producido (Kg)</th>
                <th className="p-2 text-right w-24">Otros In (Kg)</th>
                <th className="p-2 text-right w-24 bg-blue-950 font-bold">Disponible (Kg)</th>
                <th className="p-2 text-right w-24 bg-indigo-900/80">Ventas POS (Kg)</th>
                <th className="p-2 text-right w-20 bg-amber-900/80">Mermas (Kg)</th>
                <th className="p-2 text-right w-24 bg-gray-800">Teórico (Kg)</th>
                <th className="p-2 text-right w-24 bg-green-900 font-bold">Físico Real (Kg)</th>
                <th className="p-2 text-right w-24 font-bold">Desvío (Kg)</th>
                <th className="p-2 text-right w-24">Desvío ($)</th>
                <th className="p-2 text-center w-24">Estado</th>
                <th className="p-2 text-center w-20">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-[11px]">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={15} className="p-8 text-center text-gray-500">
                    No se encontraron productos cárnicos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredData.map((item) => (
                  <tr
                    key={item.product.code}
                    className={`hover:bg-blue-50/70 transition-colors ${
                      item.status === 'FALTANTE'
                        ? 'bg-red-50/40'
                        : item.status === 'SOBRANTE'
                        ? 'bg-blue-50/30'
                        : ''
                    }`}
                  >
                    <td className="p-2 font-mono font-bold text-gray-700">
                      {item.product.code}
                    </td>
                    <td className="p-2 font-bold text-black">
                      {item.product.description}
                    </td>
                    <td className="p-2 text-gray-600 text-[10px]">
                      {item.product.category}
                    </td>
                    <td className="p-2 text-right font-medium text-gray-700 bg-gray-50/70">
                      {formatKg(item.initialPeriodStock)}
                    </td>
                    <td className="p-2 text-right font-semibold text-blue-900 bg-blue-50/50">
                      {formatKg(item.producedKg)}
                    </td>
                    <td className="p-2 text-right text-gray-600">
                      {formatKg(item.initialOrEntryKg + item.transferInKg)}
                    </td>
                    <td className="p-2 text-right font-bold text-[#002046] bg-blue-50">
                      {formatKg(item.totalAvailableKg)}
                    </td>
                    <td className="p-2 text-right font-bold text-indigo-900 bg-indigo-50/50">
                      {formatKg(item.soldKg)}
                    </td>
                    <td className="p-2 text-right text-amber-900 font-semibold bg-amber-50/40">
                      {formatKg(item.wasteKg)}
                    </td>
                    <td className="p-2 text-right font-semibold text-gray-800 bg-gray-50">
                      {formatKg(item.theoreticalStock)}
                    </td>
                    <td className="p-2 text-right font-bold text-green-900 bg-green-50/50">
                      {formatKg(item.currentPhysicalStock)}
                    </td>
                    <td
                      className={`p-2 text-right font-bold ${
                        item.status === 'CONCILIADO'
                          ? 'text-green-700'
                          : item.status === 'FALTANTE'
                          ? 'text-red-700'
                          : 'text-blue-700'
                      }`}
                    >
                      {item.differenceKg > 0 ? `+${formatKg(item.differenceKg)}` : formatKg(item.differenceKg)}
                    </td>
                    <td
                      className={`p-2 text-right font-semibold ${
                        item.differenceValue < 0 ? 'text-red-700' : 'text-gray-700'
                      }`}
                    >
                      {formatCurrency(item.differenceValue)}
                    </td>
                    <td className="p-2 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          item.status === 'CONCILIADO'
                            ? 'bg-green-100 text-green-800'
                            : item.status === 'FALTANTE'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      {item.status !== 'CONCILIADO' && (
                        <button
                          type="button"
                          onClick={() =>
                            setAdjustingItem({
                              product: item.product,
                              difference: item.differenceKg,
                              theoretical: item.theoreticalStock,
                              physical: item.currentPhysicalStock,
                            })
                          }
                          className="px-1.5 py-0.5 bg-white hover:bg-gray-100 border border-gray-300 rounded text-[10px] font-bold text-gray-700 shadow-sm"
                          title="Ajustar desvío contable"
                        >
                          Ajustar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PIE DE TABLA */}
        <div className="bg-[#f0f2f5] border-t border-gray-300 p-2 flex justify-between items-center text-[11px] text-gray-700">
          <div>
            Mostrando <strong>{filteredData.length}</strong> cortes cárnicos ({totals.countDiscrepancies} con desvío detectado)
          </div>
          <div className="space-x-4">
            <span>Producido: <strong>{formatKg(totals.sumProduced)}</strong></span>
            <span>Vendido: <strong>{formatKg(totals.sumSold)}</strong></span>
            <span>Físico Cámara: <strong>{formatKg(totals.sumPhysical)}</strong></span>
            <span>
              Desvío Neto: <strong className={totals.netDeviationKg < 0 ? 'text-red-700' : 'text-green-700'}>{formatKg(totals.netDeviationKg)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* MODAL PARA APLICAR AJUSTE DE CONCILIACIÓN */}
      {adjustingItem && (
        <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4">
          <div className="win-panel bg-[#d4d0c8] max-w-md w-full p-4 border-2 border-white shadow-2xl space-y-3">
            <div className="font-bold text-sm text-[#002046] flex items-center space-x-2 border-b border-gray-400 pb-2">
              <RefreshCw className="w-4 h-4 text-blue-700" />
              <span>Ajuste por Conciliación — {adjustingItem.product.description}</span>
            </div>

            <div className="bg-white p-3 border border-gray-300 text-xs space-y-1.5">
              <div>
                <strong>Corte:</strong> [{adjustingItem.product.code}] {adjustingItem.product.description}
              </div>
              <div className="flex justify-between">
                <span>Stock Teórico Kardex:</span>
                <strong>{formatKg(adjustingItem.theoretical)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Stock Físico Real Cámara:</span>
                <strong className="text-blue-900">{formatKg(adjustingItem.physical)}</strong>
              </div>
              <div className="flex justify-between pt-1 border-t border-gray-200">
                <span>Variación a Registrar:</span>
                <strong className={adjustingItem.difference < 0 ? 'text-red-700' : 'text-green-700'}>
                  {adjustingItem.difference > 0 ? `+${formatKg(adjustingItem.difference)}` : formatKg(adjustingItem.difference)}
                </strong>
              </div>
            </div>

            <div>
              <label className="font-bold text-[10px] text-gray-700 block mb-1">
                Motivo / Justificación del Ajuste:
              </label>
              <input
                type="text"
                placeholder="Ej: Diferencia por oreo y recorte en mostrador"
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
                className="w-full bg-white border border-gray-400 px-2 py-1 text-xs"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-gray-300">
              <button
                type="button"
                onClick={() => setAdjustingItem(null)}
                disabled={isSubmittingAdjust}
                className="px-3 py-1 bg-white hover:bg-gray-100 border border-gray-400 text-black font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplyAdjustment}
                disabled={isSubmittingAdjust}
                className="px-4 py-1 bg-[#002046] hover:bg-blue-900 text-white font-bold text-xs flex items-center space-x-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-green-300" />
                <span>{isSubmittingAdjust ? 'Registrando...' : 'Confirmar Ajuste en Kardex'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
