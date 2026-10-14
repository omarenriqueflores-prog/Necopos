import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart3,
  Calendar,
  Download,
  Printer,
  Scale,
  CreditCard,
  Building,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Award,
} from 'lucide-react';
import { formatCurrency, formatWeight } from '../../utils/scaleParser';
import { useFirebase } from '../../context/FirebaseContext';
import { useDialog } from '../../context/DialogContext';

import { UserAccount } from '../../types/pos';
import { ShieldAlert, Lock } from 'lucide-react';

interface ReportsScreenProps {
  currentUser?: UserAccount;
}

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const ReportsScreen: React.FC<ReportsScreenProps> = ({ currentUser }) => {
  const { sales } = useFirebase();
  const { showAlert } = useDialog();

  // Date range picker states
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });
  const [rangeType, setRangeType] = useState<'HOY' | 'SEMANA' | 'MES' | 'PERSONALIZADO'>('HOY');
  const [rankingBranchFilter, setRankingBranchFilter] = useState<'TODAS' | 'NECO 1' | 'NECO 2'>('TODAS');

  // Calendar popover states
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);

  const canViewReports =
    !currentUser ||
    currentUser.role === 'SUPERADMIN' ||
    currentUser.role === 'ADMIN' ||
    currentUser.permissions?.canViewReports !== false;

  if (!canViewReports) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] bg-[#ebeef2] p-4 text-center">
        <div className="bg-white border-2 border-[#aa3531] p-8 max-w-md shadow-lg rounded-xs flex flex-col items-center gap-3">
          <ShieldAlert className="w-12 h-12 text-[#aa3531]" />
          <h2 className="text-[16px] font-bold text-[#002046] uppercase">
            Acceso Restringido
          </h2>
          <p className="text-[13px] text-[#44474e]">
            Su usuario (<strong>{currentUser?.fullName}</strong> - Rol:{' '}
            <strong>{currentUser?.role}</strong>) no posee permisos para acceder al
            módulo de Reportes, Auditoría y Estadísticas.
          </p>
          <div className="mt-2 text-[11px] text-[#74777f] font-mono bg-[#f1f4f8] p-2 border border-[#c4c6cf] w-full">
            Contacte a un Administrador para modificar la matriz de permisos.
          </div>
        </div>
      </div>
    );
  }

  // Get timestamp from sale using robust detection
  const getSaleTime = (sale: any) => {
    if (sale.createdAt) {
      const t = new Date(sale.createdAt).getTime();
      if (!isNaN(t)) return t;
    }
    if (sale.date) {
      const t = new Date(sale.date).getTime();
      if (!isNaN(t)) return t;
    }
    if (sale.id && sale.id.startsWith('SALE-')) {
      const ts = parseInt(sale.id.split('-')[1], 10);
      if (!isNaN(ts)) return ts;
    }
    return 0;
  };

  // Filter sales based on custom date range
  const filteredSales = (sales || []).filter((sale) => {
    const saleTime = getSaleTime(sale);
    if (saleTime === 0) return false;
    
    const endLimit = endDate ? endDate.getTime() : (startDate.getTime() + 24 * 60 * 60 * 1000 - 1);
    return saleTime >= startDate.getTime() && saleTime <= endLimit;
  });

  // Calculate dynamic stats for NECO 1 and NECO 2
  const neco1Sales = filteredSales.filter((s) => s.branchId === 'NECO 1');
  const neco2Sales = filteredSales.filter((s) => s.branchId === 'NECO 2');

  const getBranchStats = (branchSales: any[]) => {
    let salesSum = 0;
    let kilosSum = 0;
    let unitsSum = 0;
    const tickets = branchSales.length;

    branchSales.forEach((sale) => {
      salesSum += sale.total || 0;
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach((item: any) => {
          const unitT = item.unitType || item.unit || '';
          if (unitT.toLowerCase() === 'kg' || unitT === 'Kg') {
            kilosSum += item.weight || item.quantity || 0;
          } else {
            unitsSum += item.quantity || 0;
          }
        });
      }
    });

    return {
      sales: salesSum,
      kilos: kilosSum,
      units: unitsSum,
      tickets,
    };
  };

  const dataNeco1 = getBranchStats(neco1Sales);
  const dataNeco2 = getBranchStats(neco2Sales);

  const consolidatedSales = dataNeco1.sales + dataNeco2.sales;
  const consolidatedKilos = dataNeco1.kilos + dataNeco2.kilos;

  // Calculate payment breakdowns
  let cashTotal = 0, cashCount = 0;
  let cardTotal = 0, cardCount = 0;
  let qrTotal = 0, qrCount = 0;
  let ccTotal = 0, ccCount = 0;

  filteredSales.forEach((sale) => {
    const payment = sale.paymentMethod;
    const total = sale.total || 0;
    if (payment === 'EFECTIVO') {
      cashTotal += total;
      cashCount++;
    } else if (payment === 'TARJETA' || payment === 'TARJETA_DEBITO' || payment === 'TARJETA_CREDITO') {
      cardTotal += total;
      cardCount++;
    } else if (payment === 'QR' || payment === 'TRANSFERENCIA') {
      qrTotal += total;
      qrCount++;
    } else if (payment === 'CUENTA_CORRIENTE') {
      ccTotal += total;
      ccCount++;
    } else {
      // Default / fallback
      cashTotal += total;
      cashCount++;
    }
  });

  const totalBreakdownAmount = cashTotal + cardTotal + qrTotal + ccTotal;
  const getPercent = (amount: number) => {
    if (totalBreakdownAmount === 0) return 0;
    return Number(((amount / totalBreakdownAmount) * 100).toFixed(1));
  };

  const paymentBreakdown = [
    { method: 'EFECTIVO', amount: cashTotal, percent: getPercent(cashTotal), count: cashCount },
    { method: 'TARJETAS (DÉBITO / CRÉDITO)', amount: cardTotal, percent: getPercent(cardTotal), count: cardCount },
    { method: 'TRANSFERENCIAS BANCARIAS / QR', amount: qrTotal, percent: getPercent(qrTotal), count: qrCount },
    { method: 'CUENTAS CORRIENTES (FIADO)', amount: ccTotal, percent: getPercent(ccTotal), count: ccCount },
  ];

  // Percent participations
  const neco1Percent = consolidatedSales === 0 ? 0 : Number(((dataNeco1.sales / consolidatedSales) * 100).toFixed(1));
  const neco2Percent = consolidatedSales === 0 ? 0 : Number(((dataNeco2.sales / consolidatedSales) * 100).toFixed(1));

  const neco1PercentString = consolidatedSales === 0 ? '0%' : `${neco1Percent}%`;
  const neco2PercentString = consolidatedSales === 0 ? '0%' : `${neco2Percent}%`;

  // Calculate product ranking from filteredSales
  const productRanking = useMemo(() => {
    const map: Record<string, {
      code: string;
      description: string;
      unitType: string;
      quantity: number;
      revenue: number;
      salesCount: number;
    }> = {};

    filteredSales.forEach((sale) => {
      // Filter by branch
      if (rankingBranchFilter !== 'TODAS' && sale.branchId !== rankingBranchFilter) {
        return;
      }

      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach((item: any) => {
          const code = item.code || item.productCode || 'GENERIC';
          const desc = item.description || 'Producto sin descripción';
          const unitType = item.unitType || item.unit || 'Unid';
          
          const qty = (unitType.toLowerCase() === 'kg' || unitType === 'Kg')
            ? (Number(item.weight) || Number(item.quantity) || 0)
            : (Number(item.quantity) || 0);
          
          const subtotal = Number(item.subtotal) || Number(item.totalAmount) || ((Number(item.unitPrice) || 0) * qty);

          if (!map[code]) {
            map[code] = {
              code,
              description: desc,
              unitType,
              quantity: 0,
              revenue: 0,
              salesCount: 0
            };
          }

          map[code].quantity += qty;
          map[code].revenue += subtotal;
          map[code].salesCount += 1;
        });
      }
    });

    return Object.values(map)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
  }, [filteredSales, rankingBranchFilter]);

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredSales);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Informes");
    XLSX.writeFile(wb, "Informe_Ventas.xlsx");
  };

  const handlePrint = () => {
    window.print();
  };

  // Calendar logic and helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 is Sunday, 1 is Monday...
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const days: (Date | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  };

  const handleDateClick = (day: Date) => {
    if (rangeType !== 'PERSONALIZADO' || !startDate || (startDate && endDate)) {
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      setStartDate(start);
      setEndDate(null as any);
      setRangeType('PERSONALIZADO');
    } else {
      if (day.getTime() >= startDate.getTime()) {
        const end = new Date(day);
        end.setHours(23, 59, 59, 999);
        setEndDate(end);
        setRangeType('PERSONALIZADO');
        setIsCalendarOpen(false); // auto-close
      } else {
        const start = new Date(day);
        start.setHours(0, 0, 0, 0);
        setStartDate(start);
        setEndDate(null as any);
      }
    }
  };

  const isSelected = (day: Date) => {
    if (startDate && !endDate) {
      return day.toDateString() === startDate.toDateString();
    }
    if (startDate && endDate) {
      return day.toDateString() === startDate.toDateString() || day.toDateString() === endDate.toDateString();
    }
    return false;
  };

  const isInRange = (day: Date) => {
    if (startDate && endDate) {
      return day.getTime() > startDate.getTime() && day.getTime() < endDate.getTime();
    }
    if (startDate && !endDate && hoveredDate) {
      return day.getTime() > startDate.getTime() && day.getTime() <= hoveredDate.getTime();
    }
    return false;
  };

  const applyPreset = (preset: 'HOY' | 'AYER' | 'SEMANA' | 'MES' | 'AÑO') => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    
    if (preset === 'HOY') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      setRangeType('HOY');
    } else if (preset === 'AYER') {
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      setRangeType('PERSONALIZADO');
    } else if (preset === 'SEMANA') {
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      setRangeType('SEMANA');
    } else if (preset === 'MES') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      setRangeType('MES');
    } else if (preset === 'AÑO') {
      start = new Date(now.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      setRangeType('PERSONALIZADO');
    }
    
    setStartDate(start);
    setEndDate(end);
    setIsCalendarOpen(false);
  };

  const nextMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
  };
  
  const prevMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
  };

  const formatDateStr = (d: Date | null) => {
    if (!d) return '--/--/----';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-80px)] select-none bg-[#ebeef2] text-[#181c1f] font-sans p-1">
      {/* Top Header & Range Bar */}
      <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#002046]" />
          <span className="font-bold text-[#002046] text-[13px]">
            INFORMES ESTADÍSTICOS, AUDITORÍA Y VENTAS COMPARATIVAS (DATOS REALES)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Custom Date Range Picker Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsCalendarOpen(!isCalendarOpen)}
              className="h-[28px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-bold flex items-center gap-2 cursor-pointer transition-all shadow-sm"
            >
              <Calendar className="w-3.5 h-3.5 text-[#002046]" />
              <span>{formatDateStr(startDate)} - {formatDateStr(endDate)}</span>
              <ChevronDown className="w-3 h-3 text-[#44474e]" />
            </button>

            {isCalendarOpen && (
              <div className="absolute right-0 top-[32px] z-50 bg-white border border-[#74777f] shadow-2xl p-3 flex flex-col w-[320px] rounded-xs select-none">
                {/* Presets Row */}
                <div className="flex gap-1 border-b border-[#ebeef2] pb-2 mb-2 overflow-x-auto whitespace-nowrap">
                  <button
                    onClick={() => applyPreset('HOY')}
                    className={`px-2 py-1 text-[10px] font-bold cursor-pointer rounded-xs transition-colors ${
                      rangeType === 'HOY' ? 'bg-[#002046] text-white' : 'bg-[#ebeef2] text-[#44474e] hover:bg-[#c4c6cf]'
                    }`}
                  >
                    Hoy
                  </button>
                  <button
                    onClick={() => applyPreset('AYER')}
                    className="px-2 py-1 text-[10px] font-bold cursor-pointer rounded-xs transition-colors bg-[#ebeef2] text-[#44474e] hover:bg-[#c4c6cf]"
                  >
                    Ayer
                  </button>
                  <button
                    onClick={() => applyPreset('SEMANA')}
                    className={`px-2 py-1 text-[10px] font-bold cursor-pointer rounded-xs transition-colors ${
                      rangeType === 'SEMANA' ? 'bg-[#002046] text-white' : 'bg-[#ebeef2] text-[#44474e] hover:bg-[#c4c6cf]'
                    }`}
                  >
                    7 Días
                  </button>
                  <button
                    onClick={() => applyPreset('MES')}
                    className={`px-2 py-1 text-[10px] font-bold cursor-pointer rounded-xs transition-colors ${
                      rangeType === 'MES' ? 'bg-[#002046] text-white' : 'bg-[#ebeef2] text-[#44474e] hover:bg-[#c4c6cf]'
                    }`}
                  >
                    Este Mes
                  </button>
                  <button
                    onClick={() => applyPreset('AÑO')}
                    className="px-2 py-1 text-[10px] font-bold cursor-pointer rounded-xs transition-colors bg-[#ebeef2] text-[#44474e] hover:bg-[#c4c6cf]"
                  >
                    Este Año
                  </button>
                </div>

                {/* Calendar Month Selector Header */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <button
                    onClick={prevMonth}
                    className="p-1 hover:bg-[#ebeef2] rounded-full transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 text-[#44474e]" />
                  </button>
                  <span className="font-bold text-[#002046] text-[12px]">
                    {MONTHS_ES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                  </span>
                  <button
                    onClick={nextMonth}
                    className="p-1 hover:bg-[#ebeef2] rounded-full transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4 text-[#44474e]" />
                  </button>
                </div>

                {/* Weekdays Grid Header */}
                <div className="grid grid-cols-7 gap-1 text-center font-bold text-[#74777f] text-[10px] mb-1">
                  <span>Do</span>
                  <span>Lu</span>
                  <span>Ma</span>
                  <span>Mi</span>
                  <span>Ju</span>
                  <span>Vi</span>
                  <span>Sa</span>
                </div>

                {/* Days Grid Panel */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {getDaysInMonth(calendarMonth).map((day, idx) => {
                    if (!day) {
                      return <div key={`empty-${idx}`} className="h-7 w-7" />;
                    }

                    const isBoundary = isSelected(day);
                    const isBetween = isInRange(day);
                    const isToday = day.toDateString() === new Date().toDateString();

                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => handleDateClick(day)}
                        onMouseEnter={() => setHoveredDate(day)}
                        onMouseLeave={() => setHoveredDate(null)}
                        className={`h-7 w-7 text-[11px] font-medium rounded-xs transition-all cursor-pointer flex items-center justify-center relative ${
                          isBoundary
                            ? 'bg-[#002046] text-white font-bold'
                            : isBetween
                            ? 'bg-[#e2eafd] text-[#002046]'
                            : isToday
                            ? 'border border-[#002046] text-[#002046] font-semibold'
                            : 'hover:bg-[#ebeef2] text-[#181c1f]'
                        }`}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleExportExcel}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Download className="w-3 h-3 text-[#44474e]" />
            <span>Exportar Excel</span>
          </button>
          <button
            onClick={handlePrint}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Printer className="w-3 h-3 text-[#44474e]" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Main Analytical Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-1 flex-1 overflow-y-auto">
        {/* Module 1: Comparative NECO 1 vs NECO 2 */}
        <div className="bg-white border border-[#74777f] shadow-sm flex flex-col">
          <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
            <div className="flex items-center gap-2">
              <Building className="w-3.5 h-3.5 text-[#aec7f7]" />
              <span>COMPARATIVA INTER-SUCURSAL: NECO 1 (CENTRAL) VS NECO 2 (VILLA SAAVEDRA)</span>
            </div>
          </div>

          <div className="p-3 flex flex-col gap-3 text-[12px]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* NECO 1 */}
              <div className="bg-[#f7fafe] p-2.5 border border-[#c4c6cf] flex flex-col gap-1.5">
                <span className="font-bold text-[#002046] text-[13px] border-b border-[#c4c6cf] pb-1">
                  NECO 1 - Casa Central
                </span>
                <div className="flex justify-between">
                  <span className="text-[#44474e]">Total Recaudado:</span>
                  <span className="font-mono font-bold text-[#002046]">
                    {formatCurrency(dataNeco1.sales)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#44474e]">Kilos Carne Despachados:</span>
                  <span className="font-mono font-bold text-[#181c1f]">
                    {formatWeight(dataNeco1.kilos)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#44474e]">Unidades Almacén/Bebidas:</span>
                  <span className="font-mono font-bold text-[#181c1f]">{dataNeco1.units} un</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#44474e]">Cantidad de Tickets:</span>
                  <span className="font-mono font-bold text-[#181c1f]">
                    {dataNeco1.tickets} operaciones
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-[#44474e] pt-1 border-t border-[#ebeef2]">
                  <span>Ticket Promedio:</span>
                  <span className="font-mono font-bold text-[#002046]">
                    {formatCurrency(dataNeco1.tickets === 0 ? 0 : dataNeco1.sales / dataNeco1.tickets)}
                  </span>
                </div>
              </div>

              {/* NECO 2 */}
              <div className="bg-[#f7fafe] p-2.5 border border-[#c4c6cf] flex flex-col gap-1.5">
                <span className="font-bold text-[#002046] text-[13px] border-b border-[#c4c6cf] pb-1">
                  NECO 2 - Sucursal Villa Saavedra
                </span>
                <div className="flex justify-between">
                  <span className="text-[#44474e]">Total Recaudado:</span>
                  <span className="font-mono font-bold text-[#002046]">
                    {formatCurrency(dataNeco2.sales)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#44474e]">Kilos Carne Despachados:</span>
                  <span className="font-mono font-bold text-[#181c1f]">
                    {formatWeight(dataNeco2.kilos)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#44474e]">Unidades Almacén/Bebidas:</span>
                  <span className="font-mono font-bold text-[#181c1f]">{dataNeco2.units} un</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#44474e]">Cantidad de Tickets:</span>
                  <span className="font-mono font-bold text-[#181c1f]">
                    {dataNeco2.tickets} operaciones
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-[#44474e] pt-1 border-t border-[#ebeef2]">
                  <span>Ticket Promedio:</span>
                  <span className="font-mono font-bold text-[#002046]">
                    {formatCurrency(dataNeco2.tickets === 0 ? 0 : dataNeco2.sales / dataNeco2.tickets)}
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Ratio Bar */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-bold text-[#002046]">Participación NECO 1: {neco1PercentString}</span>
                <span className="font-bold text-[#1b365d]">Participación NECO 2: {neco2PercentString}</span>
              </div>
              <div className="h-[20px] w-full bg-[#e0e3e7] border border-[#74777f] flex">
                <div className="h-full bg-[#002046] flex items-center justify-center text-white text-[10px] font-mono font-bold transition-all duration-300" style={{ width: consolidatedSales === 0 ? '50%' : neco1PercentString }}>
                  NECO 1
                </div>
                <div className="h-full bg-[#1b365d] flex items-center justify-center text-white text-[10px] font-mono font-bold transition-all duration-300" style={{ width: consolidatedSales === 0 ? '50%' : neco2PercentString }}>
                  NECO 2
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Module 2: Sales by Payment Method */}
        <div className="bg-white border border-[#74777f] shadow-sm flex flex-col">
          <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
            <div className="flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5 text-[#aec7f7]" />
              <span>DISTRIBUCIÓN POR MEDIO DE COBRO Y FORMA DE PAGO</span>
            </div>
          </div>

          <div className="p-3 flex flex-col gap-2">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead className="bg-[#e5e8ec] text-[#181c1f] font-bold text-[11px] border-b border-[#74777f]">
                <tr className="h-[24px]">
                  <th className="px-2 border-r border-[#c4c6cf]">MEDIO DE PAGO</th>
                  <th className="w-[80px] px-2 text-center border-r border-[#c4c6cf]">TICKETS</th>
                  <th className="w-[120px] px-2 text-right border-r border-[#c4c6cf]">TOTAL ($)</th>
                  <th className="w-[80px] px-2 text-center">% PARTICIPACIÓN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ebeef2]">
                {paymentBreakdown.map((pb, idx) => (
                  <tr key={`pb-${pb.method}-${idx}`} className="h-[26px]">
                    <td className="px-2 font-semibold border-r border-[#c4c6cf]">{pb.method}</td>
                    <td className="px-2 text-center font-mono border-r border-[#c4c6cf]">{pb.count}</td>
                    <td className="px-2 text-right font-mono font-bold text-[12px] border-r border-[#c4c6cf] text-[#002046]">
                      {formatCurrency(pb.amount)}
                    </td>
                    <td className="px-2 text-center font-mono font-bold">{pb.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Visual breakdown bar */}
            <div className="mt-2 flex flex-col gap-1">
              <span className="text-[10px] font-bold text-[#44474e] uppercase">
                Proporción de Liquidez Inmediata vs Crédito:
              </span>
              <div className="h-[20px] w-full bg-[#e0e3e7] border border-[#74777f] flex">
                <div className="h-full bg-[#002046] text-white text-[9px] font-bold flex items-center justify-center transition-all duration-300" style={{ width: totalBreakdownAmount === 0 ? '25%' : `${getPercent(cashTotal)}%` }} title={`Efectivo: ${getPercent(cashTotal)}%`}>
                  {cashTotal > 0 || totalBreakdownAmount === 0 ? 'Efectivo' : ''}
                </div>
                <div className="h-full bg-[#1b365d] text-white text-[9px] font-bold flex items-center justify-center transition-all duration-300" style={{ width: totalBreakdownAmount === 0 ? '25%' : `${getPercent(cardTotal)}%` }} title={`Tarjetas: ${getPercent(cardTotal)}%`}>
                  {cardTotal > 0 || totalBreakdownAmount === 0 ? 'Tarjetas' : ''}
                </div>
                <div className="h-full bg-[#284877] text-white text-[9px] font-bold flex items-center justify-center transition-all duration-300" style={{ width: totalBreakdownAmount === 0 ? '25%' : `${getPercent(qrTotal)}%` }} title={`QR/Transf: ${getPercent(qrTotal)}%`}>
                  {qrTotal > 0 || totalBreakdownAmount === 0 ? 'QR/Transf' : ''}
                </div>
                <div className="h-full bg-[#aa3531] text-white text-[9px] font-bold flex items-center justify-center transition-all duration-300" style={{ width: totalBreakdownAmount === 0 ? '25%' : `${getPercent(ccTotal)}%` }} title={`Cta Cte: ${getPercent(ccTotal)}%`}>
                  {ccTotal > 0 || totalBreakdownAmount === 0 ? 'Cta Cte' : ''}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Module 3: Top Selling Products */}
        <div className="bg-white border border-[#74777f] shadow-sm flex flex-col">
          <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
            <div className="flex items-center gap-2">
              <Award className="w-3.5 h-3.5 text-[#aec7f7]" />
              <span>RANKING DE PRODUCTOS MÁS VENDIDOS (TOP 10)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#aec7f7] font-semibold uppercase">Sucursal:</span>
              <select
                value={rankingBranchFilter}
                onChange={(e) => setRankingBranchFilter(e.target.value as any)}
                className="bg-[#1b365d] text-white text-[10px] font-bold h-[18px] px-1 border border-[#74777f] rounded-xs cursor-pointer focus:outline-none focus:border-[#aec7f7]"
              >
                <option value="TODAS">TODAS</option>
                <option value="NECO 1">NECO 1</option>
                <option value="NECO 2">NECO 2</option>
              </select>
            </div>
          </div>

          <div className="p-3 flex flex-col flex-1 overflow-y-auto">
            {productRanking.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-[#74777f] gap-1 flex-1">
                <span className="text-[12px] font-semibold">Sin movimientos registrados</span>
                <span className="text-[10px]">No se encontraron ventas para el período seleccionado.</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-[12px]">
                <thead className="bg-[#e5e8ec] text-[#181c1f] font-bold text-[11px] border-b border-[#74777f]">
                  <tr className="h-[24px]">
                    <th className="w-[40px] px-2 text-center border-r border-[#c4c6cf]">POS</th>
                    <th className="px-2 border-r border-[#c4c6cf]">PRODUCTO</th>
                    <th className="w-[90px] px-2 text-right border-r border-[#c4c6cf]">CANTIDAD</th>
                    <th className="w-[100px] px-2 text-right">TOTAL ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebeef2]">
                  {productRanking.map((p, idx) => {
                    const position = idx + 1;
                    const isTop3 = position <= 3;
                    const posBg = position === 1 ? 'bg-[#ffeb3b] text-[#5d4037]' : position === 2 ? 'bg-[#cfd8dc] text-[#37474f]' : position === 3 ? 'bg-[#ffe0b2] text-[#e65100]' : 'bg-[#ebeef2] text-[#181c1f]';

                    return (
                      <tr key={p.code} className="h-[26px] hover:bg-[#f5f7fa] transition-colors">
                        <td className="px-1 text-center border-r border-[#c4c6cf]">
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${posBg}`}>
                            {position}
                          </span>
                        </td>
                        <td className="px-2 border-r border-[#c4c6cf] truncate max-w-[120px]" title={p.description}>
                          <span className="font-semibold text-[#181c1f] block leading-tight">{p.description}</span>
                          <span className="text-[9px] text-[#74777f] block font-mono">Cód: {p.code}</span>
                        </td>
                        <td className="px-2 text-right font-mono border-r border-[#c4c6cf] text-[#181c1f]">
                          {p.unitType.toLowerCase() === 'kg' || p.unitType === 'Kg' 
                            ? formatWeight(p.quantity)
                            : `${p.quantity} un`
                          }
                        </td>
                        <td className="px-2 text-right font-mono font-bold text-[#002046]">
                          {formatCurrency(p.revenue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
