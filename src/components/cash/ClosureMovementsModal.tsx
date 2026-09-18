import React, { useState, useMemo } from 'react';
import {
  FileText,
  Receipt,
  Users,
  Banknote,
  Search,
  Printer,
  Download,
  Eye,
  X,
  CreditCard,
  QrCode,
  Landmark,
  ArrowDownRight,
  ArrowUpRight,
  Layers,
  ChevronRight,
  Clock,
  User,
  ShoppingBag,
} from 'lucide-react';
import { CashClosure, BranchConfig } from '../../types/pos';
import { formatCurrency } from '../../utils/scaleParser';
import {
  ClosureResolvedData,
  ClosureSaleItem,
  ClosureMovementItem,
  ClosureCurrentAccountItem,
  getClosureTransactions,
} from '../../utils/closureTransactionsHelper';
import { printTicket, generateTicketHtml } from '../../utils/ticketGenerator';
import { formatCleanOperatorName } from '../../utils/closureTicketGenerator';

interface ClosureMovementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  closure: CashClosure | null;
  allClosures?: CashClosure[];
  allSales?: any[];
  allCashMovements?: any[];
  allElectronicInvoices?: any[];
  currentBranch?: BranchConfig;
}

type TabKey = 'TODOS' | 'RECIBOS' | 'FACTURAS' | 'CTA_CTE' | 'MOVIMIENTOS';

export const ClosureMovementsModal: React.FC<ClosureMovementsModalProps> = ({
  isOpen,
  onClose,
  closure,
  allClosures = [],
  allSales = [],
  allCashMovements = [],
  allElectronicInvoices = [],
  currentBranch,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('TODOS');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<string>('TODOS');
  const [inspectingSale, setInspectingSale] = useState<ClosureSaleItem | null>(null);

  const resolvedData: ClosureResolvedData | null = useMemo(() => {
    if (!closure) return null;
    return getClosureTransactions({
      closure,
      allClosures,
      allSales,
      allCashMovements,
      allElectronicInvoices,
    });
  }, [closure, allClosures, allSales, allCashMovements, allElectronicInvoices]);

  if (!isOpen || !closure || !resolvedData) return null;

  const branchName = closure.branch || closure.branchId || currentBranch?.id || 'NECO 1';
  const branchSubtitle = branchName === 'NECO 1' ? 'Sucursal Central (Neco 24 de Septiembre)' : 'Sucursal N° 2 (Villa Saavedra)';
  const pointOfSale = closure.register || (branchName === 'NECO 1' ? '0017 (POS Principal)' : '0018 (POS Principal)');

  // Filter Sales
  const filteredSales = resolvedData.allSales.filter((s) => {
    if (activeTab === 'RECIBOS' && (s.invoiceType === 'FACTURA_A' || s.invoiceType === 'FACTURA_B')) {
      return false;
    }
    if (activeTab === 'FACTURAS' && (s.invoiceType !== 'FACTURA_A' && s.invoiceType !== 'FACTURA_B')) {
      return false;
    }

    if (selectedMethod !== 'TODOS') {
      const pm = (s.paymentMethod || '').toUpperCase();
      if (selectedMethod === 'EFECTIVO' && !pm.includes('EFECTIVO')) return false;
      if (selectedMethod === 'TARJETA' && !pm.includes('TARJETA')) return false;
      if (selectedMethod === 'QR' && !pm.includes('QR')) return false;
      if (selectedMethod === 'TRANSFERENCIA' && !pm.includes('TRANSFERENCIA')) return false;
      if (selectedMethod === 'CUENTA_CORRIENTE' && !pm.includes('CUENTA_CORRIENTE')) return false;
    }

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (s.ticketNumber && s.ticketNumber.toLowerCase().includes(term)) ||
      (s.customerName && s.customerName.toLowerCase().includes(term)) ||
      (s.customerDni && s.customerDni.toLowerCase().includes(term)) ||
      (s.paymentMethod && s.paymentMethod.toLowerCase().includes(term)) ||
      (s.invoiceType && s.invoiceType.toLowerCase().includes(term)) ||
      (s.items && s.items.some((it) => (it.name || it.description || '').toLowerCase().includes(term)))
    );
  });

  // Filter Movements
  const filteredMovements = resolvedData.cashMovements.filter((m) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      m.concept.toLowerCase().includes(term) ||
      m.type.toLowerCase().includes(term) ||
      (m.voucher && m.voucher.toLowerCase().includes(term)) ||
      (m.user && m.user.toLowerCase().includes(term))
    );
  });

  // Filter Cta Cte
  const filteredCtaCte = resolvedData.ctaCteItems.filter((c) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.customerName.toLowerCase().includes(term) ||
      (c.ticketNumber && c.ticketNumber.toLowerCase().includes(term)) ||
      (c.concept && c.concept.toLowerCase().includes(term))
    );
  });

  // Print individual ticket
  const handlePrintSaleTicket = (saleItem: ClosureSaleItem) => {
    const branchCfg: BranchConfig = currentBranch || {
      id: (closure.branch || 'NECO 1') as any,
      name: branchName === 'NECO 1' ? 'NECO 24 DE SEPTIEMBRE' : 'NECO VILLA SAAVEDRA',
      subtitle: branchSubtitle,
      address: branchName === 'NECO 1' ? '24 de Septiembre 850' : 'Av. Libertad 1200',
      phone: '3873-421500',
      cuit: '20-28491029-7',
      grossIncome: '20-28491029-7',
      pointOfSale: closure.register.replace(/\D/g, '') || '0017',
      scaleModel: 'SYSTEL_CUORA',
      scalePort: 'COM1',
      scaleBaud: 9600,
      scaleEanPrefix: '20',
      printerModel: 'HASAR_80',
      printerPort: 'COM2',
    };

    const ticketHtml = generateTicketHtml(
      {
        ticketNumber: saleItem.ticketNumber || 'TKT-0000',
        total: saleItem.total,
        paymentMethod: saleItem.paymentMethod || 'EFECTIVO',
        items: saleItem.items && saleItem.items.length > 0 ? saleItem.items : [
          {
            name: 'VENTA GENERAL CARNICERÍA',
            quantity: 1,
            unitType: 'UNIDAD',
            price: saleItem.total,
            subtotal: saleItem.total,
          },
        ],
        customerName: saleItem.customerName,
        customerDni: saleItem.customerDni,
        invoiceType: saleItem.invoiceType,
        cae: saleItem.cae,
        caeVto: saleItem.caeVto,
        operatorName: formatCleanOperatorName(closure.operator),
        createdAt: saleItem.date || closure.date,
        combinedPayments: saleItem.combinedPayments,
      },
      branchCfg
    );

    printTicket(ticketHtml);
  };

  // Export full closure details to CSV
  const handleExportCSV = () => {
    const rows: string[][] = [
      ['CARNICERIAS NECO - DETALLE CONSOLIDADO DE CIERRE Z'],
      ['Comprobante Cierre Z', closure.id],
      ['Fecha / Hora', closure.date],
      ['Sucursal', branchName],
      ['Caja / Registradora', pointOfSale],
      ['Operador / Cajero', formatCleanOperatorName(closure.operator)],
      ['Turno', closure.shift],
      [''],
      ['1. VENTAS Y COMPROBANTES FACTURADOS'],
      ['Ticket', 'Fecha/Hora', 'Tipo Comprobante', 'Cliente', 'CUIT/DNI', 'Medio de Pago', 'Total ($)'],
    ];

    resolvedData.allSales.forEach((s) => {
      rows.push([
        s.ticketNumber || '-',
        `${s.date || ''} ${s.time || ''}`.trim(),
        s.invoiceType || 'RECIBO_COMUN',
        `"${s.customerName || 'Consumidor Final'}"`,
        s.customerDni || '-',
        s.paymentMethod || 'EFECTIVO',
        String(s.total),
      ]);
    });

    rows.push(['']);
    rows.push(['2. SALIDAS EN CUENTA CORRIENTE (FIADOS Y COBROS)']);
    rows.push(['Ticket / Vale', 'Fecha/Hora', 'Tipo', 'Cliente', 'Concepto', 'Importe ($)']);
    resolvedData.ctaCteItems.forEach((c) => {
      rows.push([
        c.ticketNumber || '-',
        `${c.date || ''} ${c.time || ''}`.trim(),
        c.type,
        `"${c.customerName}"`,
        `"${c.concept || ''}"`,
        String(c.amount),
      ]);
    });

    rows.push(['']);
    rows.push(['3. MOVIMIENTOS DE GAVETA DE EFECTIVO']);
    rows.push(['ID Movimiento', 'Hora', 'Tipo', 'Concepto / Motivo', 'Comprobante', 'Operador', 'Importe ($)']);
    resolvedData.cashMovements.forEach((m) => {
      rows.push([
        m.id,
        m.time || '-',
        m.type,
        `"${m.concept}"`,
        m.voucher || '-',
        m.user || closure.operator,
        String(m.amount),
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map((e) => e.join(';')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Cierre_${closure.id}_Movimientos.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 select-none animate-in fade-in duration-150">
      <div className="flex flex-col w-full max-w-6xl h-[94vh] bg-[#f4f6f9] border-2 border-[#002046] shadow-2xl overflow-hidden">
        {/* Title Bar (Classic POS / Windows Navy Style) */}
        <div className="bg-[#002046] text-white px-3 py-2 flex items-center justify-between select-none shadow-sm flex-shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#aec7f7]" />
            <span className="font-bold text-[13px] tracking-wide uppercase">
              Comprobantes y Movimientos del Cierre Z — {closure.id}
            </span>
            <span className="bg-[#1b365d] text-[#d6e3ff] text-[10px] font-mono px-2 py-0.5 border border-[#aec7f7]/30">
              {closure.branch}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportCSV}
              className="h-[24px] px-2 bg-[#2e7d32] hover:bg-[#1b5e20] text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
              title="Descargar listado completo en formato Excel CSV"
            >
              <Download className="w-3 h-3" />
              <span>Exportar Excel</span>
            </button>
            <button
              onClick={onClose}
              className="w-6 h-6 bg-[#ba1a1a] hover:bg-[#93000a] text-white flex items-center justify-center font-bold text-[12px] cursor-pointer"
              title="Cerrar ventana [Esc]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Header Information Strip */}
        <div className="bg-white border-b border-[#c4c6cf] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] shadow-xs flex-shrink-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#181c1f]">
            <div>
              <span className="font-bold text-[#44474e] uppercase mr-1">Fecha Cierre:</span>
              <span className="font-semibold">{closure.date}</span>
            </div>
            <div>
              <span className="font-bold text-[#44474e] uppercase mr-1">Turno:</span>
              <span className="font-bold text-[#002046]">{closure.shift}</span>
            </div>
            <div>
              <span className="font-bold text-[#44474e] uppercase mr-1">Cajero/Operador:</span>
              <span className="font-bold text-[#002046]">{formatCleanOperatorName(closure.operator)}</span>
            </div>
            <div>
              <span className="font-bold text-[#44474e] uppercase mr-1">Caja:</span>
              <span className="font-mono text-[#002046]">{pointOfSale}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#44474e] uppercase font-bold">Estado Arqueo:</span>
            <span
              className={`px-2 py-0.5 text-[10px] font-bold ${
                closure.status === 'CONCILIADO'
                  ? 'bg-[#d6e3ff] text-[#002046] border border-[#aec7f7]'
                  : 'bg-[#ffdad6] text-[#aa3531] border border-[#ba1a1a]'
              }`}
            >
              {closure.status === 'CONCILIADO' ? 'CONCILIADO (SIN DIFERENCIA)' : `DIFERENCIA: ${formatCurrency(closure.difference)}`}
            </span>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 p-2 bg-[#ebeef2] border-b border-[#c4c6cf] flex-shrink-0 text-[#181c1f]">
          {/* Recibos */}
          <div className="bg-white p-2 border border-[#c4c6cf] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#44474e]">
              <span className="text-[10px] font-bold uppercase">Recibos Comunes</span>
              <Receipt className="w-3.5 h-3.5 text-[#002046]" />
            </div>
            <span className="font-mono font-bold text-[14px] text-[#002046]">
              {formatCurrency(resolvedData.totals.totalRecibos)}
            </span>
            <span className="text-[9px] text-[#74777f]">
              {resolvedData.recibos.length} comprobante(s)
            </span>
          </div>

          {/* Facturas A */}
          <div className="bg-white p-2 border border-[#c4c6cf] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#44474e]">
              <span className="text-[10px] font-bold uppercase">Facturas "A"</span>
              <FileText className="w-3.5 h-3.5 text-[#002046]" />
            </div>
            <span className="font-mono font-bold text-[14px] text-[#002046]">
              {formatCurrency(resolvedData.totals.totalFacturasA)}
            </span>
            <span className="text-[9px] text-[#74777f]">
              {resolvedData.facturasA.length} comprobante(s)
            </span>
          </div>

          {/* Facturas B */}
          <div className="bg-white p-2 border border-[#c4c6cf] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#44474e]">
              <span className="text-[10px] font-bold uppercase">Facturas "B"</span>
              <FileText className="w-3.5 h-3.5 text-[#002046]" />
            </div>
            <span className="font-mono font-bold text-[14px] text-[#002046]">
              {formatCurrency(resolvedData.totals.totalFacturasB)}
            </span>
            <span className="text-[9px] text-[#74777f]">
              {resolvedData.facturasB.length} comprobante(s)
            </span>
          </div>

          {/* Cuentas Corrientes */}
          <div className="bg-white p-2 border border-[#c4c6cf] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#aa3531]">
              <span className="text-[10px] font-bold uppercase">Cta. Cte. (Fiados)</span>
              <Users className="w-3.5 h-3.5" />
            </div>
            <span className="font-mono font-bold text-[14px] text-[#aa3531]">
              {formatCurrency(resolvedData.totals.totalCtaCte)}
            </span>
            <span className="text-[9px] text-[#74777f]">
              {resolvedData.ctaCteItems.length} registro(s)
            </span>
          </div>

          {/* Movimientos Gaveta */}
          <div className="bg-white p-2 border border-[#c4c6cf] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-[#44474e]">
              <span className="text-[10px] font-bold uppercase">Gaveta Efectivo</span>
              <Banknote className="w-3.5 h-3.5 text-[#00522c]" />
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[10px] text-[#00522c] font-bold">
                +{formatCurrency(resolvedData.totals.totalEntradas)}
              </span>
              <span className="text-[10px] text-[#aa3531] font-bold">
                -{formatCurrency(resolvedData.totals.totalSalidas)}
              </span>
            </div>
            <span className="text-[9px] text-[#74777f]">
              Fondo: {formatCurrency(resolvedData.initialFund)}
            </span>
          </div>

          {/* TOTAL FACTURADO */}
          <div className="bg-[#002046] p-2 text-white shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase text-[#aec7f7]">Total Ventas Turno</span>
            <span className="font-mono font-black text-[16px] text-white">
              {formatCurrency(resolvedData.totals.totalSales)}
            </span>
            <span className="text-[9px] text-[#aec7f7]">
              {resolvedData.allSales.length} comprobante(s) totales
            </span>
          </div>
        </div>

        {/* Tab & Filter Bar */}
        <div className="bg-white border-b border-[#c4c6cf] px-2 py-1.5 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
          {/* Tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('TODOS')}
              className={`h-[28px] px-3 text-[11px] font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                activeTab === 'TODOS'
                  ? 'bg-[#002046] text-white border-[#002046]'
                  : 'bg-white text-[#44474e] border-[#c4c6cf] hover:bg-[#f1f4f8]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Todos ({resolvedData.allSales.length + resolvedData.cashMovements.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('RECIBOS')}
              className={`h-[28px] px-3 text-[11px] font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                activeTab === 'RECIBOS'
                  ? 'bg-[#002046] text-white border-[#002046]'
                  : 'bg-white text-[#44474e] border-[#c4c6cf] hover:bg-[#f1f4f8]'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Recibos Mostrador ({resolvedData.recibos.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('FACTURAS')}
              className={`h-[28px] px-3 text-[11px] font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                activeTab === 'FACTURAS'
                  ? 'bg-[#002046] text-white border-[#002046]'
                  : 'bg-white text-[#44474e] border-[#c4c6cf] hover:bg-[#f1f4f8]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Facturas Fiscales ({resolvedData.facturasA.length + resolvedData.facturasB.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('CTA_CTE')}
              className={`h-[28px] px-3 text-[11px] font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                activeTab === 'CTA_CTE'
                  ? 'bg-[#002046] text-white border-[#002046]'
                  : 'bg-white text-[#44474e] border-[#c4c6cf] hover:bg-[#f1f4f8]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Cta. Cte. / Fiados ({resolvedData.ctaCteItems.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('MOVIMIENTOS')}
              className={`h-[28px] px-3 text-[11px] font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                activeTab === 'MOVIMIENTOS'
                  ? 'bg-[#002046] text-white border-[#002046]'
                  : 'bg-white text-[#44474e] border-[#c4c6cf] hover:bg-[#f1f4f8]'
              }`}
            >
              <Banknote className="w-3.5 h-3.5" />
              <span>Movimientos de Caja ({resolvedData.cashMovements.length})</span>
            </button>
          </div>

          {/* Search and Filters */}
          <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
            {(activeTab === 'TODOS' || activeTab === 'RECIBOS' || activeTab === 'FACTURAS') && (
              <select
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(e.target.value)}
                className="h-[26px] px-2 bg-white border border-[#74777f] text-[11px] font-bold text-[#002046] cursor-pointer"
              >
                <option value="TODOS">Todos los Medios</option>
                <option value="EFECTIVO">💵 Solo Efectivo</option>
                <option value="TARJETA">💳 Tarjetas</option>
                <option value="QR">📱 QR / Billeteras</option>
                <option value="TRANSFERENCIA">🏦 Transferencia</option>
                <option value="CUENTA_CORRIENTE">👤 Cta. Cte.</option>
              </select>
            )}

            <div className="relative flex-1 min-w-[160px]">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar comprobante, cliente..."
                className="w-full h-[26px] pl-2 pr-6 bg-[#f7fafe] border border-[#74777f] text-[11px] text-[#002046] font-medium focus:bg-white focus:outline-none"
              />
              <Search className="w-3 h-3 text-[#74777f] absolute right-2 top-2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Content Table Area */}
        <div className="flex-1 overflow-auto bg-white p-1">
          {activeTab === 'MOVIMIENTOS' ? (
            /* CASH MOVEMENTS TABLE */
            <table className="w-full text-left text-[11px] border-collapse bg-white">
              <thead className="bg-[#002046] text-white sticky top-0 text-[10px] uppercase font-bold tracking-wider z-10 shadow-xs">
                <tr>
                  <th className="p-1.5 border-r border-[#1b365d]">ID / Hora</th>
                  <th className="p-1.5 border-r border-[#1b365d]">Tipo Movimiento</th>
                  <th className="p-1.5 border-r border-[#1b365d]">Concepto / Detalle</th>
                  <th className="p-1.5 border-r border-[#1b365d]">Comprobante / Vale</th>
                  <th className="p-1.5 border-r border-[#1b365d]">Usuario / Operador</th>
                  <th className="p-1.5 text-right">Importe ($)</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-[#74777f] italic bg-white">
                      No se registraron movimientos de caja manuales en este cierre.
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map((m, idx) => {
                    const isPositive = m.type === 'FONDO' || m.type === 'INGRESO';
                    return (
                      <tr
                        key={idx}
                        className={`border-b border-[#ebeef2] hover:bg-[#f1f4f8] transition-colors ${
                          idx % 2 === 1 ? 'bg-[#fafbfc]' : 'bg-white'
                        }`}
                      >
                        <td className="p-1.5 font-mono text-[10px] text-[#44474e] border-r border-[#ebeef2]">
                          {m.time || m.id}
                        </td>
                        <td className="p-1.5 border-r border-[#ebeef2]">
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-bold ${
                              m.type === 'FONDO'
                                ? 'bg-[#d6e3ff] text-[#002046]'
                                : m.type === 'INGRESO'
                                ? 'bg-[#c4eed0] text-[#00522c]'
                                : m.type === 'RETIRO'
                                ? 'bg-[#ffdad6] text-[#aa3531]'
                                : 'bg-[#fbe0c3] text-[#783900]'
                            }`}
                          >
                            {m.type}
                          </span>
                        </td>
                        <td className="p-1.5 font-medium text-[#181c1f] border-r border-[#ebeef2]">
                          {m.concept}
                        </td>
                        <td className="p-1.5 font-mono text-[10px] text-[#44474e] border-r border-[#ebeef2]">
                          {m.voucher || '-'}
                        </td>
                        <td className="p-1.5 text-[#44474e] border-r border-[#ebeef2]">
                          {formatCleanOperatorName(m.user || closure.operator)}
                        </td>
                        <td
                          className={`p-1.5 text-right font-mono font-bold text-[12px] ${
                            isPositive ? 'text-[#00522c]' : 'text-[#aa3531]'
                          }`}
                        >
                          {isPositive ? '+' : '-'}
                          {formatCurrency(Math.abs(m.amount))}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : activeTab === 'CTA_CTE' ? (
            /* CURRENT ACCOUNT DETAILS TABLE */
            <table className="w-full text-left text-[11px] border-collapse bg-white">
              <thead className="bg-[#002046] text-white sticky top-0 text-[10px] uppercase font-bold tracking-wider z-10 shadow-xs">
                <tr>
                  <th className="p-1.5 border-r border-[#1b365d]">Ticket / Vale</th>
                  <th className="p-1.5 border-r border-[#1b365d]">Hora</th>
                  <th className="p-1.5 border-r border-[#1b365d]">Tipo Operación</th>
                  <th className="p-1.5 border-r border-[#1b365d]">Cliente / Razón Social</th>
                  <th className="p-1.5 border-r border-[#1b365d]">Detalle / Concepto</th>
                  <th className="p-1.5 text-right">Importe Cta. Cte. ($)</th>
                </tr>
              </thead>
              <tbody>
                {filteredCtaCte.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-[#74777f] italic bg-white">
                      No se registraron ventas al fiado ni cobros de cuenta corriente en este turno.
                    </td>
                  </tr>
                ) : (
                  filteredCtaCte.map((c, idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-[#ebeef2] hover:bg-[#f1f4f8] transition-colors ${
                        idx % 2 === 1 ? 'bg-[#fafbfc]' : 'bg-white'
                      }`}
                    >
                      <td className="p-1.5 font-mono text-[10px] font-bold text-[#002046] border-r border-[#ebeef2]">
                        {c.ticketNumber || '-'}
                      </td>
                      <td className="p-1.5 font-mono text-[10px] text-[#44474e] border-r border-[#ebeef2]">
                        {c.time || '-'}
                      </td>
                      <td className="p-1.5 border-r border-[#ebeef2]">
                        <span
                          className={`px-1.5 py-0.5 text-[9px] font-bold ${
                            c.type === 'FIADO_VENTA'
                              ? 'bg-[#ffdad6] text-[#aa3531]'
                              : 'bg-[#c4eed0] text-[#00522c]'
                          }`}
                        >
                          {c.type === 'FIADO_VENTA' ? 'VENTA FIADA (DEBE)' : 'COBRO CUOTA (PAGÓ)'}
                        </span>
                      </td>
                      <td className="p-1.5 font-bold text-[#002046] border-r border-[#ebeef2]">
                        {c.customerName}
                      </td>
                      <td className="p-1.5 text-[#44474e] border-r border-[#ebeef2]">
                        {c.concept || 'Venta registrada en mostrador'}
                      </td>
                      <td className="p-1.5 text-right font-mono font-bold text-[12px] text-[#aa3531]">
                        {formatCurrency(c.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            /* SALES & INVOICES (TODOS / RECIBOS / FACTURAS) */
            <table className="w-full text-left text-[11px] border-collapse bg-white">
              <thead className="bg-[#002046] text-white sticky top-0 text-[10px] uppercase font-bold tracking-wider z-10 shadow-xs">
                <tr>
                  <th className="p-1.5 border-r border-[#1b365d] w-[90px]">N° Ticket</th>
                  <th className="p-1.5 border-r border-[#1b365d] w-[70px]">Hora</th>
                  <th className="p-1.5 border-r border-[#1b365d] w-[110px]">Tipo Comprobante</th>
                  <th className="p-1.5 border-r border-[#1b365d]">Cliente / Razón Social</th>
                  <th className="p-1.5 border-r border-[#1b365d] w-[130px]">Medio de Pago</th>
                  <th className="p-1.5 border-r border-[#1b365d] text-center w-[60px]">Items</th>
                  <th className="p-1.5 text-right border-r border-[#1b365d] w-[100px]">Total ($)</th>
                  <th className="p-1.5 text-center w-[120px]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-[#74777f] italic bg-white">
                      No se encontraron ventas ni comprobantes con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((sale, idx) => {
                    const invType = (sale.invoiceType || 'RECIBO_COMUN').toUpperCase();
                    const isFacturaA = invType === 'FACTURA_A';
                    const isFacturaB = invType === 'FACTURA_B';

                    return (
                      <tr
                        key={idx}
                        onClick={() => setInspectingSale(sale)}
                        className={`border-b border-[#ebeef2] hover:bg-[#e8effd] cursor-pointer transition-colors ${
                          idx % 2 === 1 ? 'bg-[#fafbfc]' : 'bg-white'
                        }`}
                      >
                        <td className="p-1.5 font-mono font-bold text-[#002046] text-[11px] border-r border-[#ebeef2] whitespace-nowrap">
                          {sale.ticketNumber || 'TKT-0000'}
                        </td>
                        <td className="p-1.5 font-mono text-[10px] text-[#44474e] border-r border-[#ebeef2] whitespace-nowrap">
                          {sale.time || '-'}
                        </td>
                        <td className="p-1.5 border-r border-[#ebeef2] whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-bold ${
                              isFacturaA
                                ? 'bg-[#002046] text-white'
                                : isFacturaB
                                ? 'bg-[#1b365d] text-white'
                                : 'bg-[#e0e3e7] text-[#181c1f]'
                            }`}
                          >
                            {isFacturaA ? 'FACTURA A' : isFacturaB ? 'FACTURA B' : 'RECIBO COMÚN'}
                          </span>
                        </td>
                        <td className="p-1.5 border-r border-[#ebeef2] font-semibold text-[#181c1f]">
                          <div className="flex flex-col">
                            <span className="truncate max-w-[280px]">
                              {sale.customerName || 'Consumidor Final'}
                            </span>
                            {sale.customerDni && (
                              <span className="text-[9px] text-[#74777f] font-mono">
                                CUIT/DNI: {sale.customerDni}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-1.5 border-r border-[#ebeef2] whitespace-nowrap">
                          <span className="text-[10px] font-bold text-[#44474e]">
                            {sale.paymentMethod || 'EFECTIVO'}
                          </span>
                        </td>
                        <td className="p-1.5 text-center font-mono text-[10px] text-[#44474e] border-r border-[#ebeef2]">
                          {sale.itemsCount || (sale.items ? sale.items.length : 1)}
                        </td>
                        <td className="p-1.5 text-right font-mono font-bold text-[12px] text-[#002046] border-r border-[#ebeef2] whitespace-nowrap">
                          {formatCurrency(sale.total)}
                        </td>
                        <td className="p-1.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInspectingSale(sale);
                              }}
                              className="px-1.5 py-0.5 bg-[#ebeef2] hover:bg-[#d6e3ff] text-[#002046] border border-[#74777f] text-[9px] font-bold flex items-center gap-1 cursor-pointer"
                              title="Ver detalle de artículos vendidos"
                            >
                              <Eye className="w-2.5 h-2.5" />
                              <span>Ver Items</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePrintSaleTicket(sale);
                              }}
                              className="px-1.5 py-0.5 bg-[#2e7d32] hover:bg-[#1b5e20] text-white text-[9px] font-bold flex items-center gap-1 cursor-pointer"
                              title="Reimprimir ticket de 80mm"
                            >
                              <Printer className="w-2.5 h-2.5" />
                              <span>Imprimir</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-white px-3 py-2 border-t border-[#c4c6cf] flex items-center justify-between text-[11px] flex-shrink-0 shadow-xs">
          <div className="flex items-center gap-4 text-[#44474e]">
            <span>
              Mostrando: <strong>{filteredSales.length}</strong> ventas/comprobantes
            </span>
            <span>
              Movimientos de Gaveta: <strong>{filteredMovements.length}</strong>
            </span>
            <span>
              Registros Cta Cte: <strong>{filteredCtaCte.length}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-[28px] px-5 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>Volver al Historial</span>
            </button>
          </div>
        </div>

        {/* SUB-MODAL: INSPECT ITEMS OF A SALE */}
        {inspectingSale && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white border-2 border-[#002046] shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-100">
              <div className="bg-[#002046] text-white px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-[#aec7f7]" />
                  <span className="font-bold text-[12px] uppercase">
                    Detalle del Comprobante {inspectingSale.ticketNumber}
                  </span>
                </div>
                <button
                  onClick={() => setInspectingSale(null)}
                  className="w-5 h-5 bg-[#ba1a1a] hover:bg-[#93000a] text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              <div className="p-3 bg-[#f7fafe] border-b border-[#c4c6cf] text-[11px] flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-[#44474e] font-bold">Cliente:</span>
                  <span className="font-semibold text-[#002046]">{inspectingSale.customerName || 'Consumidor Final'}</span>
                </div>
                {inspectingSale.customerDni && (
                  <div className="flex justify-between">
                    <span className="text-[#44474e] font-bold">CUIT / DNI:</span>
                    <span className="font-mono">{inspectingSale.customerDni}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#44474e] font-bold">Tipo:</span>
                  <span className="font-bold text-[#002046]">{inspectingSale.invoiceType || 'RECIBO COMÚN'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#44474e] font-bold">Medio de Pago:</span>
                  <span className="font-bold">{inspectingSale.paymentMethod || 'EFECTIVO'}</span>
                </div>
                {inspectingSale.cae && (
                  <div className="flex justify-between bg-green-50 p-1 border border-green-200">
                    <span className="text-green-800 font-bold">CAE AFIP/ARCA:</span>
                    <span className="font-mono font-bold text-green-900">{inspectingSale.cae}</span>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="flex-1 overflow-y-auto p-2">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-[#ebeef2] text-[#002046] sticky top-0 text-[10px] font-bold uppercase border-b border-[#c4c6cf]">
                    <tr>
                      <th className="p-1.5">Artículo / Producto</th>
                      <th className="p-1.5 text-center">Cant.</th>
                      <th className="p-1.5 text-right">Precio Unit.</th>
                      <th className="p-1.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!inspectingSale.items || inspectingSale.items.length === 0 ? (
                      <tr>
                        <td className="p-2 font-medium">Venta General de Carnicería</td>
                        <td className="p-2 text-center font-mono">1</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(inspectingSale.total)}</td>
                        <td className="p-2 text-right font-mono font-bold">{formatCurrency(inspectingSale.total)}</td>
                      </tr>
                    ) : (
                      inspectingSale.items.map((it, idx) => (
                        <tr key={idx} className="border-b border-[#ebeef2]">
                          <td className="p-1.5 font-medium">
                            <div>{it.name || it.description || 'Producto'}</div>
                            {it.code && <div className="text-[9px] text-[#74777f] font-mono">Cód: {it.code}</div>}
                          </td>
                          <td className="p-1.5 text-center font-mono">
                            {it.quantity} {it.unitType === 'KG' ? 'kg' : 'un'}
                          </td>
                          <td className="p-1.5 text-right font-mono">
                            {formatCurrency(it.price || it.unitPrice || 0)}
                          </td>
                          <td className="p-1.5 text-right font-mono font-bold text-[#002046]">
                            {formatCurrency(it.subtotal || (it.quantity * (it.price || 0)))}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-3 bg-[#f7fafe] border-t border-[#c4c6cf] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handlePrintSaleTicket(inspectingSale)}
                    className="h-[28px] px-3 bg-[#2e7d32] hover:bg-[#1b5e20] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimir Ticket (80mm)</span>
                  </button>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase text-[#44474e] mr-2">TOTAL COMPROBANTE:</span>
                  <span className="font-mono font-black text-[15px] text-[#002046]">
                    {formatCurrency(inspectingSale.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
