import React, { useState, useMemo } from 'react';
import { useFirebase } from '../../context/FirebaseContext';
import {
  TrendingUp,
  History,
  LogOut,
  DollarSign,
  Building,
  CreditCard,
  QrCode,
  Wallet,
  Users,
  ChevronRight,
  X,
  FileText,
  Calendar,
  Clock,
  Briefcase,
  RefreshCw
} from 'lucide-react';
import { CashClosure } from '../../types/pos';

interface OwnerMobileDashboardProps {
  activeUser: any;
  logout: () => void;
}

export function OwnerMobileDashboard({ activeUser, logout }: OwnerMobileDashboardProps) {
  const { sales, cashClosures, cashMovements } = useFirebase();
  const [activeTab, setActiveTab] = useState<'VIGENTE' | 'HISTORIAL'>('VIGENTE');
  const [selectedBranch, setSelectedBranch] = useState<'TODAS' | 'NECO 1' | 'NECO 2'>('TODAS');
  const [selectedClosure, setSelectedClosure] = useState<CashClosure | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  // Parse es-AR date strings and ISO dates consistently
  const parseLocalesDate = (dateStr: string | any): Date => {
    if (!dateStr) return new Date(0);
    if (dateStr instanceof Date) return dateStr;
    const clean = String(dateStr).replace(/,/g, '').trim();
    if (clean.includes('T')) {
      const parsed = new Date(clean);
      return isNaN(parsed.getTime()) ? new Date(0) : parsed;
    }

    const isPM = /p\.?\s*m\.?/i.test(clean);
    const isAM = /a\.?\s*m\.?/i.test(clean);

    const parts = clean.split(' ');
    const dateParts = parts[0].split('/');
    if (dateParts.length === 3) {
      const day = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1;
      const year = parseInt(dateParts[2], 10);
      let hours = 0, minutes = 0, seconds = 0;
      if (parts[1]) {
        const timeParts = parts[1].split(':');
        hours = parseInt(timeParts[0], 10) || 0;
        minutes = parseInt(timeParts[1], 10) || 0;
        seconds = parseInt(timeParts[2], 10) || 0;
      }

      if (isPM && hours < 12) {
        hours += 12;
      } else if (isAM && hours === 12) {
        hours = 0;
      } else if (!isPM && !isAM && hours > 0 && hours < 8) {
        hours += 12;
      }

      return new Date(year, month, day, hours, minutes, seconds);
    }
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date(0) : parsed;
  };

  const getSaleTimestamp = (s: any) => {
    if (s.createdAt) {
      const t = new Date(s.createdAt).getTime();
      if (!isNaN(t)) return t;
    }
    if (s.date) {
      const t = new Date(s.date).getTime();
      if (!isNaN(t)) return t;
    }
    if (s.id && s.id.startsWith('SALE-')) {
      const ts = parseInt(s.id.split('-')[1], 10);
      if (!isNaN(ts)) return ts;
    }
    return 0;
  };

  const getMovementTimestamp = (m: any) => {
    if (m.id && m.id.startsWith('CM-')) {
      const ts = parseInt(m.id.split('-')[1], 10);
      if (!isNaN(ts)) return ts;
    }
    if (m.createdAt) {
      const t = new Date(m.createdAt).getTime();
      if (!isNaN(t)) return t;
    }
    return 0;
  };

  // 1. Calculate active shifts, boundaries & stats dynamically
  const activeShiftData = useMemo(() => {
    // Helper to extract shift-specific calculations
    const getBranchShiftStats = (branchId: 'NECO 1' | 'NECO 2') => {
      // Find the last closure for this branch
      const lastClosure = (cashClosures || [])
        .filter((c: any) => c.branch === branchId || c.branchId === branchId)
        .sort((a: any, b: any) => {
          const timeA = a.createdAt || parseLocalesDate(a.date).getTime();
          const timeB = b.createdAt || parseLocalesDate(b.date).getTime();
          return timeB - timeA;
        })[0];

      const lastClosureDate = lastClosure
        ? (lastClosure.createdAt || parseLocalesDate(lastClosure.date).getTime())
        : 0;

      // Filter shift movements for manual entries, withdrawals and opening funds
      const branchMovements = (cashMovements || []).filter((m: any) => {
        const mBranch = m.branchId || (m.ticketNumber?.startsWith('0018') || m.concept?.includes('0018') || m.concept?.includes('NECO 2') ? 'NECO 2' : 'NECO 1');
        if (mBranch !== branchId) return false;
        const mTimestamp = getMovementTimestamp(m);
        return mTimestamp > lastClosureDate;
      });

      // Filter sales belonging to this branch's current shift
      const branchSales = (sales || []).filter((s: any) => {
        const sBranch = s.branchId || (s.pointOfSale === '0018' || s.ticketNumber?.startsWith('0018') ? 'NECO 2' : 'NECO 1');
        if (sBranch !== branchId) return false;
        const saleDate = getSaleTimestamp(s);
        return saleDate > lastClosureDate;
      });

      // Find initial fund
      const initialFund = branchMovements
        .filter((m) => m.type === 'FONDO')
        .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

      // Manual deposits (not count as sales or opening or cta cte payments)
      const manualEntries = branchMovements
        .filter((m) => m.type === 'INGRESO' && !m.concept?.includes('Venta POS') && !m.concept?.includes('Cobro Cta Cte'))
        .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

      // Manual withdrawals (expenses / extractions)
      const manualExtractions = branchMovements
        .filter((m) => m.type === 'RETIRO' || m.type === 'EGRESO')
        .reduce((sum, m) => sum + Math.abs(Number(m.amount) || 0), 0);

      // Payment breakdowns
      let cashTotal = 0;
      let cardTotal = 0;
      let qrTotal = 0;
      let ccTotal = 0;

      branchSales.forEach((sale) => {
        const payment = sale.paymentMethod;
        const total = sale.total || 0;

        if (payment === 'EFECTIVO') {
          cashTotal += total;
        } else if (payment === 'TARJETA' || payment === 'TARJETA_DEBITO' || payment === 'TARJETA_CREDITO') {
          cardTotal += total;
        } else if (payment === 'QR' || payment === 'TRANSFERENCIA') {
          qrTotal += total;
        } else if (payment === 'CUENTA_CORRIENTE') {
          ccTotal += total;
        }
      });

      // Cobros Cta Cte during shift count towards cash/transfer
      const ccPayments = branchMovements
        .filter((m) => m.type === 'INGRESO' && m.concept && m.concept.includes('Cobro Cta Cte'))
        .reduce((sum, m) => sum + (m.amount || 0), 0);

      const totalSalesRevenue = cashTotal + cardTotal + qrTotal + ccTotal;

      return {
        branchId,
        salesCount: branchSales.length,
        totalSalesRevenue,
        cashTotal: cashTotal + ccPayments, // Cash from sales + manual cta cte payments
        cardTotal,
        qrTotal,
        ccTotal,
        initialFund,
        manualEntries,
        manualExtractions,
        netCashExpected: initialFund + (cashTotal + ccPayments) + manualEntries - manualExtractions,
        lastClosureTime: lastClosureDate > 0 ? new Date(lastClosureDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'
      };
    };

    const neco1Stats = getBranchShiftStats('NECO 1');
    const neco2Stats = getBranchShiftStats('NECO 2');

    return {
      'NECO 1': neco1Stats,
      'NECO 2': neco2Stats,
    };
  }, [sales, cashClosures, cashMovements]);

  // Aggregate stats based on current selected branch filter
  const displayStats = useMemo(() => {
    const n1 = activeShiftData['NECO 1'];
    const n2 = activeShiftData['NECO 2'];

    if (selectedBranch === 'NECO 1') return n1;
    if (selectedBranch === 'NECO 2') return n2;

    // "TODAS" Combined Stats
    return {
      branchId: 'AMBAS SUCURSALES' as any,
      salesCount: n1.salesCount + n2.salesCount,
      totalSalesRevenue: n1.totalSalesRevenue + n2.totalSalesRevenue,
      cashTotal: n1.cashTotal + n2.cashTotal,
      cardTotal: n1.cardTotal + n2.cardTotal,
      qrTotal: n1.qrTotal + n2.qrTotal,
      ccTotal: n1.ccTotal + n2.ccTotal,
      initialFund: n1.initialFund + n2.initialFund,
      manualEntries: n1.manualEntries + n2.manualEntries,
      manualExtractions: n1.manualExtractions + n2.manualExtractions,
      netCashExpected: n1.netCashExpected + n2.netCashExpected,
      lastClosureTime: `N1: ${n1.lastClosureTime} | N2: ${n2.lastClosureTime}`
    };
  }, [activeShiftData, selectedBranch]);

  // Sort cash closures newest first
  const sortedClosures = useMemo(() => {
    return [...(cashClosures || [])].sort((a, b) => {
      const timeA = a.createdAt || parseLocalesDate(a.date).getTime();
      const timeB = b.createdAt || parseLocalesDate(b.date).getTime();
      return timeB - timeA;
    });
  }, [cashClosures]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2
    }).format(val);
  };

  return (
    <div className="w-full h-screen bg-[#ebeef2] text-[#181c1f] flex flex-col font-sans select-none overflow-hidden max-w-[480px] mx-auto border-x border-[#c4c6cf] shadow-2xl relative">
      
      {/* HEADER */}
      <header className="bg-[#002046] text-white py-3 px-4 flex items-center justify-between shadow-md shrink-0">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <Building className="w-4 h-4 text-[#aec7f7]" />
            <h1 className="text-[14px] font-black tracking-tight uppercase">NECO POS • Panel</h1>
          </div>
          <span className="text-[10px] text-[#aec7f7] font-medium">Control en Vivo de Sucursales</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-col text-right">
            <span className="text-[11px] font-bold text-white max-w-[120px] truncate">{activeUser.fullName}</span>
          </div>
          <button
            onClick={handleRefresh}
            aria-label="Actualizar Datos"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white active:scale-95 transition-transform"
            title="Actualizar Datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={logout}
            aria-label="Cerrar Sesión"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white active:scale-95 transition-transform"
            title="Cerrar Sesión"
          >
            <LogOut className="w-4 h-4 text-rose-300" />
          </button>
        </div>
      </header>

      {/* QUICK SELECT SUCURSAL PILLS (Only on Active Shift view) */}
      {activeTab === 'VIGENTE' && (
        <div className="bg-white border-b border-[#c4c6cf] px-4 py-2 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-bold text-[#44474e] uppercase">Sucursal:</span>
          <div className="flex bg-[#ebeef2] p-0.5 rounded-lg gap-0.5 border border-[#c4c6cf]">
            {(['TODAS', 'NECO 1', 'NECO 2'] as const).map((branch) => (
              <button
                key={branch}
                onClick={() => setSelectedBranch(branch)}
                className={`px-3 py-1 text-[10px] font-extrabold rounded-md uppercase transition-all duration-200 cursor-pointer ${
                  selectedBranch === branch
                    ? 'bg-[#002046] text-white shadow-sm'
                    : 'text-[#44474e] hover:text-[#181c1f]'
                }`}
              >
                {branch === 'TODAS' ? 'Todas' : branch}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MAIN VIEWPORT */}
      <main className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {activeTab === 'VIGENTE' ? (
          <div className="space-y-4">
            
            {/* Live Indicator Eye Catcher */}
            <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">
                  Turno Activo en Vivo
                </span>
              </div>
              <span className="text-[10px] text-emerald-700 font-bold">
                {displayStats.salesCount} Tickets Cobrados
              </span>
            </div>

            {/* Total Sales Revenue Main Display */}
            <div className="bg-white border border-[#c4c6cf] p-4 rounded-xl shadow-xs space-y-2 relative overflow-hidden">
              <div className="absolute right-0 top-0 w-24 h-24 bg-[#002046]/5 rounded-full -mr-6 -mt-6"></div>
              <span className="text-[11px] font-bold text-[#44474e] uppercase tracking-wider block">
                Total Facturado (Ventas del Turno)
              </span>
              <div className="text-[28px] font-black text-[#002046] tracking-tight">
                {formatCurrency(displayStats.totalSalesRevenue)}
              </div>
              <div className="text-[10px] text-[#44474e] font-semibold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#002046]" />
                Inicio desde último cierre de caja
              </div>
            </div>

            {/* If Combined (TODAS) - Show Mini Breakdown per sucursal */}
            {selectedBranch === 'TODAS' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-[#c4c6cf] p-3 rounded-xl flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-[#44474e] uppercase">NECO 1 (Central)</span>
                  <span className="text-[15px] font-black text-[#002046]">
                    {formatCurrency(activeShiftData['NECO 1'].totalSalesRevenue)}
                  </span>
                  <span className="text-[9px] text-[#74777f]">
                    {activeShiftData['NECO 1'].salesCount} ventas • Cierre: {activeShiftData['NECO 1'].lastClosureTime}
                  </span>
                </div>
                <div className="bg-white border border-[#c4c6cf] p-3 rounded-xl flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-[#44474e] uppercase">NECO 2 (Villa S.)</span>
                  <span className="text-[15px] font-black text-[#002046]">
                    {formatCurrency(activeShiftData['NECO 2'].totalSalesRevenue)}
                  </span>
                  <span className="text-[9px] text-[#74777f]">
                    {activeShiftData['NECO 2'].salesCount} ventas • Cierre: {activeShiftData['NECO 2'].lastClosureTime}
                  </span>
                </div>
              </div>
            )}

            {/* PAYMENT METHOD BREAKDOWN CARD */}
            <div className="bg-white border border-[#c4c6cf] rounded-xl shadow-xs overflow-hidden">
              <div className="bg-[#f1f4f8] border-b border-[#c4c6cf] py-2 px-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-[#002046]" />
                <span className="text-[11px] font-black text-[#002046] uppercase">Medios de Cobro (Ventas)</span>
              </div>
              <div className="p-3.5 space-y-3">
                
                {/* Cash */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 font-bold text-[#181c1f]">
                      <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Efectivo</span>
                    </div>
                    <span className="font-mono font-black text-[#181c1f]">
                      {formatCurrency(displayStats.cashTotal)}
                    </span>
                  </div>
                  <div className="w-full bg-[#ebeef2] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full"
                      style={{
                        width: `${
                          displayStats.totalSalesRevenue > 0
                            ? Math.min(100, (displayStats.cashTotal / displayStats.totalSalesRevenue) * 100)
                            : 0
                        }%`,
                      }}
                    ></div>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 font-bold text-[#181c1f]">
                      <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                      <span>Tarjetas</span>
                    </div>
                    <span className="font-mono font-black text-[#181c1f]">
                      {formatCurrency(displayStats.cardTotal)}
                    </span>
                  </div>
                  <div className="w-full bg-[#ebeef2] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-500 h-full rounded-full"
                      style={{
                        width: `${
                          displayStats.totalSalesRevenue > 0
                            ? Math.min(100, (displayStats.cardTotal / displayStats.totalSalesRevenue) * 100)
                            : 0
                        }%`,
                      }}
                    ></div>
                  </div>
                </div>

                {/* QR / Transfers */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 font-bold text-[#181c1f]">
                      <QrCode className="w-3.5 h-3.5 text-purple-600" />
                      <span>QR / Transferencias</span>
                    </div>
                    <span className="font-mono font-black text-[#181c1f]">
                      {formatCurrency(displayStats.qrTotal)}
                    </span>
                  </div>
                  <div className="w-full bg-[#ebeef2] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-500 h-full rounded-full"
                      style={{
                        width: `${
                          displayStats.totalSalesRevenue > 0
                            ? Math.min(100, (displayStats.qrTotal / displayStats.totalSalesRevenue) * 100)
                            : 0
                        }%`,
                      }}
                    ></div>
                  </div>
                </div>

                {/* Cuenta Corriente */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 font-bold text-[#181c1f]">
                      <Users className="w-3.5 h-3.5 text-amber-600" />
                      <span>Cta Corriente (Fiado)</span>
                    </div>
                    <span className="font-mono font-black text-[#181c1f]">
                      {formatCurrency(displayStats.ccTotal)}
                    </span>
                  </div>
                  <div className="w-full bg-[#ebeef2] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full rounded-full"
                      style={{
                        width: `${
                          displayStats.totalSalesRevenue > 0
                            ? Math.min(100, (displayStats.ccTotal / displayStats.totalSalesRevenue) * 100)
                            : 0
                        }%`,
                      }}
                    ></div>
                  </div>
                </div>

              </div>
            </div>

            {/* CASH BOX RECONCILIATION CARD (Caja Física Estimada) */}
            <div className="bg-white border border-[#c4c6cf] rounded-xl shadow-xs overflow-hidden">
              <div className="bg-[#f1f4f8] border-b border-[#c4c6cf] py-2 px-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-[#002046]" />
                  <span className="text-[11px] font-black text-[#002046] uppercase">Caja Física Estimada</span>
                </div>
              </div>
              <div className="p-3.5 space-y-2 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#44474e]">Fondo de Apertura:</span>
                  <span className="font-mono font-bold text-[#181c1f]">
                    {formatCurrency(displayStats.initialFund)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#44474e]">+ Cobros de Efectivo (Ventas y Cta Cte):</span>
                  <span className="font-mono font-bold text-[#181c1f]">
                    {formatCurrency(displayStats.cashTotal)}
                  </span>
                </div>
                {displayStats.manualEntries > 0 && (
                  <div className="flex items-center justify-between text-emerald-700 font-medium">
                    <span>+ Entradas de Efectivo Manuales:</span>
                    <span className="font-mono font-bold">
                      {formatCurrency(displayStats.manualEntries)}
                    </span>
                  </div>
                )}
                {displayStats.manualExtractions > 0 && (
                  <div className="flex items-center justify-between text-rose-700 font-medium">
                    <span>- Salidas / Gastos del Turno:</span>
                    <span className="font-mono font-bold">
                      -{formatCurrency(displayStats.manualExtractions)}
                    </span>
                  </div>
                )}
                <div className="border-t border-[#ebeef2] pt-2 mt-2 flex items-center justify-between text-[#002046] font-extrabold text-[13px]">
                  <span>Total Efectivo Estimado:</span>
                  <span className="font-mono bg-[#002046]/5 px-2 py-0.5 rounded text-[14px]">
                    {formatCurrency(displayStats.netCashExpected)}
                  </span>
                </div>
              </div>
            </div>

          </div>
        ) : (
          /* HISTORICAL VIEW */
          <div className="space-y-3">
            <div className="text-[11px] font-bold text-[#44474e] uppercase px-1">
              Últimos Cierres Definitivos (Z)
            </div>

            {sortedClosures.length === 0 ? (
              <div className="bg-white border border-[#c4c6cf] p-8 text-center text-[#74777f] rounded-xl">
                No se encontraron cierres cargados en la base de datos.
              </div>
            ) : (
              <div className="space-y-2.5">
                {sortedClosures.map((closure) => {
                  const dateStr = closure.date;
                  const totalClosureRevenue = (closure.cashAmount || 0) + (closure.cardAmount || 0) + (closure.transferAmount || 0) + (closure.currentAccountAmount || 0);
                  const isDifference = closure.difference !== 0;

                  return (
                    <button
                      key={closure.id}
                      onClick={() => setSelectedClosure(closure)}
                      className="w-full text-left bg-white border border-[#c4c6cf] hover:border-[#002046] active:bg-[#f1f4f8] p-3 rounded-xl flex items-center justify-between shadow-xs transition-colors cursor-pointer"
                    >
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 bg-[#002046] text-white text-[9px] font-extrabold rounded uppercase tracking-wider">
                            {closure.branchId || 'N/A'}
                          </span>
                          <span className="text-[12px] font-bold text-[#181c1f]">
                            {dateStr}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-[#44474e]">
                          <Clock className="w-3 h-3" />
                          <span>Turno: {closure.shift || 'N/A'}</span>
                        </div>
                        {isDifference && (
                          <div className="text-[10px] font-bold text-rose-600">
                            Dif: {formatCurrency(closure.difference)}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <div className="flex flex-col text-right">
                          <span className="text-[13px] font-black text-[#002046]">
                            {formatCurrency(totalClosureRevenue)}
                          </span>
                          <span className="text-[9px] text-emerald-700 font-bold uppercase">
                            Arqueado
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#74777f]" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* BOTTOM NAVIGATION BAR */}
      <nav className="bg-white border-t border-[#c4c6cf] h-[58px] flex items-center justify-around shrink-0 pb-safe shadow-lg z-10">
        <button
          onClick={() => setActiveTab('VIGENTE')}
          className={`flex flex-col items-center justify-center gap-1 w-full h-full text-[10px] font-bold transition-colors cursor-pointer ${
            activeTab === 'VIGENTE' ? 'text-[#002046]' : 'text-[#74777f] hover:text-[#181c1f]'
          }`}
        >
          <TrendingUp className={`w-5 h-5 ${activeTab === 'VIGENTE' ? 'text-[#002046]' : 'text-[#74777f]'}`} />
          <span>Turno Vigente</span>
        </button>

        <button
          onClick={() => setActiveTab('HISTORIAL')}
          className={`flex flex-col items-center justify-center gap-1 w-full h-full text-[10px] font-bold transition-colors cursor-pointer ${
            activeTab === 'HISTORIAL' ? 'text-[#002046]' : 'text-[#74777f] hover:text-[#181c1f]'
          }`}
        >
          <History className={`w-5 h-5 ${activeTab === 'HISTORIAL' ? 'text-[#002046]' : 'text-[#74777f]'}`} />
          <span>Historial Z</span>
        </button>
      </nav>

      {/* DETAIL MODAL / BOTTOM SHEET FOR Z CLOSURE */}
      {selectedClosure && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center transition-opacity duration-300">
          <div className="bg-white w-full max-w-[480px] rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh] animate-slide-up">
            
            {/* Modal Header */}
            <div className="bg-[#002046] text-white py-3 px-4 flex items-center justify-between rounded-t-2xl shrink-0">
              <div className="flex flex-col">
                <span className="text-[9px] text-[#aec7f7] uppercase font-bold tracking-widest">Detalle de Cierre Z</span>
                <span className="text-[13px] font-bold">
                  {selectedClosure.branchId || 'N/A'} — {selectedClosure.date}
                </span>
              </div>
              <button
                onClick={() => setSelectedClosure(null)}
                className="w-7 h-7 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[12px]">
              
              {/* General Summary Card */}
              <div className="bg-[#f1f4f8] p-3 rounded-xl border border-[#c4c6cf] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[#44474e]">Operador:</span>
                  <span className="font-bold text-[#181c1f]">{selectedClosure.operator || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#44474e]">Turno:</span>
                  <span className="font-bold text-[#181c1f]">{selectedClosure.shift || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#44474e]">Estado del Cierre:</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                    selectedClosure.status === 'CONCILIADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {selectedClosure.status}
                  </span>
                </div>
              </div>

              {/* Financial Reconciliation Tables */}
              <div className="space-y-2">
                <h3 className="font-black text-[#002046] text-[11px] uppercase tracking-wide">Desglose de Caja</h3>
                <div className="border border-[#c4c6cf] rounded-xl overflow-hidden divide-y divide-[#ebeef2]">
                  
                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-[#44474e] flex items-center gap-1">
                      <Wallet className="w-3.5 h-3.5 text-emerald-600" /> Efectivo Registrado (Arqueo):
                    </span>
                    <span className="font-mono font-bold text-[#181c1f]">
                      {formatCurrency(selectedClosure.cashAmount || 0)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-[#44474e] flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-blue-600" /> Tarjeta Registrado:
                    </span>
                    <span className="font-mono font-bold text-[#181c1f]">
                      {formatCurrency(selectedClosure.cardAmount || 0)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-[#44474e] flex items-center gap-1">
                      <QrCode className="w-3.5 h-3.5 text-purple-600" /> QR / Transf Registrado:
                    </span>
                    <span className="font-mono font-bold text-[#181c1f]">
                      {formatCurrency(selectedClosure.transferAmount || (selectedClosure as any).qrAmount || 0)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-[#44474e] flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-amber-600" /> Cta Corriente Registrado:
                    </span>
                    <span className="font-mono font-bold text-[#181c1f]">
                      {formatCurrency(selectedClosure.currentAccountAmount || 0)}
                    </span>
                  </div>

                </div>
              </div>

              {/* Cash Reconciliation Details */}
              <div className="space-y-2">
                <h3 className="font-black text-[#002046] text-[11px] uppercase tracking-wide">Resultado Arqueo de Caja</h3>
                <div className="bg-amber-50/50 border border-amber-200 p-3 rounded-xl space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#44474e]">Fondo Inicial:</span>
                    <span className="font-mono">{formatCurrency(selectedClosure.initialFund || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#44474e]">Efectivo Esperado:</span>
                    <span className="font-mono">{formatCurrency(selectedClosure.expectedCash || 0)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-[#181c1f]">
                    <span className="text-[#44474e]">Efectivo Real Contado:</span>
                    <span className="font-mono">{formatCurrency(selectedClosure.actualCash || 0)}</span>
                  </div>
                  <div className={`border-t border-amber-200 pt-1.5 mt-1.5 flex justify-between font-black text-[13px] ${
                    selectedClosure.difference >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}>
                    <span>Diferencia de Caja:</span>
                    <span className="font-mono">{formatCurrency(selectedClosure.difference || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Cajero Notes */}
              {selectedClosure.notes && (
                <div className="bg-[#ebeef2] p-3 rounded-xl border border-[#c4c6cf]">
                  <span className="block font-bold text-[#002046] text-[10px] uppercase mb-1">Notas del Cajero:</span>
                  <p className="text-[#181c1f] italic text-[11px] leading-normal">{selectedClosure.notes}</p>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#c4c6cf] shrink-0">
              <button
                onClick={() => setSelectedClosure(null)}
                className="w-full h-[40px] bg-[#002046] hover:bg-[#1b365d] active:scale-[0.98] transition-transform text-white font-bold text-[12px] uppercase rounded-xl cursor-pointer"
              >
                Cerrar Detalle
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
