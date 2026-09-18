import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Printer,
  Download,
  Filter,
  Calendar,
  Building,
  FileText,
  Search,
  CheckCircle,
  FileMinus,
} from 'lucide-react';
import { ElectronicInvoice, BranchConfig } from '../../types/pos';
import { formatCurrency } from '../../utils/scaleParser';

interface LibroIvaVentasScreenProps {
  invoices: ElectronicInvoice[];
  branches: BranchConfig[];
  currentBranch: BranchConfig;
}

export const LibroIvaVentasScreen: React.FC<LibroIvaVentasScreenProps> = ({
  invoices,
  branches,
  currentBranch,
}) => {
  // Filters
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  const [dateFrom, setDateFrom] = useState<string>(firstDay);
  const [dateTo, setDateTo] = useState<string>(today);
  const [filterBranch, setFilterBranch] = useState<string>('TODAS');

  const availablePvs = useMemo(() => {
    const set = new Set<string>();
    branches.forEach((b) => {
      if (b.pointOfSale) set.add(b.pointOfSale);
    });
    invoices.forEach((inv) => {
      if (inv.pointOfSale) set.add(inv.pointOfSale);
    });
    return Array.from(set).sort();
  }, [branches, invoices]);
  const [filterPv, setFilterPv] = useState<string>('TODOS');
  const [filterType, setFilterType] = useState<string>('TODOS');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Date filter
      if (dateFrom && inv.date < dateFrom) return false;
      if (dateTo && inv.date > dateTo) return false;

      // Branch filter
      if (filterBranch !== 'TODAS' && inv.branchId !== filterBranch) return false;

      // Point of Sale filter
      if (filterPv !== 'TODOS' && inv.pointOfSale !== filterPv) return false;

      // Comprobante Type filter
      if (filterType !== 'TODOS' && inv.cbteNombre !== filterType) return false;

      // Search query (customer or CUIT)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesClient = inv.customer.name.toLowerCase().includes(q);
        const matchesCuit = inv.customer.cuitDni.includes(q);
        const matchesNum = inv.formattedNumber.includes(q);
        if (!matchesClient && !matchesCuit && !matchesNum) return false;
      }

      return true;
    });
  }, [invoices, dateFrom, dateTo, filterBranch, filterPv, filterType, searchQuery]);

  // Totals calculations (Credit notes subtract!)
  const totals = useMemo(() => {
    let netoTotal = 0;
    let iva21Total = 0;
    let iva105Total = 0;
    let exentoTotal = 0;
    let generalTotal = 0;

    let facACount = 0;
    let facATotal = 0;
    let facBCount = 0;
    let facBTotal = 0;
    let ncACount = 0;
    let ncATotal = 0;
    let ncBCount = 0;
    let ncBTotal = 0;

    filteredInvoices.forEach((inv) => {
      const isNc = inv.cbteTipo === 3 || inv.cbteTipo === 8;
      const factor = isNc ? -1 : 1;

      netoTotal += inv.netAmount * factor;
      iva21Total += inv.vatAmount21 * factor;
      iva105Total += (inv.vatAmount105 || 0) * factor;
      exentoTotal += (inv.exemptAmount || 0) * factor;
      generalTotal += inv.totalAmount * factor;

      if (inv.cbteTipo === 1) {
        facACount++;
        facATotal += inv.totalAmount;
      } else if (inv.cbteTipo === 6) {
        facBCount++;
        facBTotal += inv.totalAmount;
      } else if (inv.cbteTipo === 3) {
        ncACount++;
        ncATotal += inv.totalAmount;
      } else if (inv.cbteTipo === 8) {
        ncBCount++;
        ncBTotal += inv.totalAmount;
      }
    });

    return {
      netoTotal,
      iva21Total,
      iva105Total,
      exentoTotal,
      generalTotal,
      facACount,
      facATotal,
      facBCount,
      facBTotal,
      ncACount,
      ncATotal,
      ncBCount,
      ncBTotal,
    };
  }, [filteredInvoices]);

  const handleExportCSV = () => {
    const headers = [
      'Fecha',
      'Tipo Comprobante',
      'Punto de Venta',
      'Numero',
      'Doc Receptor',
      'Razon Social / Cliente',
      'Condicion IVA',
      'Neto Gravado',
      'Debito Fiscal IVA 21%',
      'Debito Fiscal IVA 10.5%',
      'Exento',
      'Total Facturado',
      'CAE',
    ];

    const rows = filteredInvoices.map((inv) => {
      const isNc = inv.cbteTipo === 3 || inv.cbteTipo === 8;
      const factor = isNc ? -1 : 1;
      return [
        inv.date,
        inv.cbteNombre,
        inv.pointOfSale,
        inv.cbteNumero,
        inv.customer.cuitDni,
        `"${inv.customer.name.replace(/"/g, '""')}"`,
        inv.customer.vatCondition,
        (inv.netAmount * factor).toFixed(2),
        (inv.vatAmount21 * factor).toFixed(2),
        ((inv.vatAmount105 || 0) * factor).toFixed(2),
        ((inv.exemptAmount || 0) * factor).toFixed(2),
        (inv.totalAmount * factor).toFixed(2),
        inv.cae,
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `LIBRO_IVA_VENTAS_ARCA_${dateFrom}_al_${dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col w-full h-full select-none bg-[#ebeef2] text-[#181c1f] font-sans p-1">
      {/* Top Header */}
      <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-[#002046]" />
          <span className="font-bold text-[#002046] text-[13px]">
            LIBRO IVA VENTAS DIGITAL — RÉGIMEN FISCAL ARCA (AFIP)
          </span>
          <span className="text-[11px] text-[#44474e]">
            {filteredInvoices.length} Comprobantes Registrados
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleExportCSV}
            className="h-[26px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#002046] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV / Excel</span>
          </button>
          <button
            onClick={handlePrint}
            className="h-[26px] px-3 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Libro [Ctrl+P]</span>
          </button>
        </div>
      </div>

      {/* Filters Strip */}
      <div className="bg-[#f7fafe] p-2 border border-[#74777f] shadow-sm mb-1 text-[12px] flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="font-bold text-[#002046] text-[11px]">Desde:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-[24px] px-1 bg-white border border-[#74777f] text-[11px] font-mono"
            />
          </div>

          <div className="flex items-center gap-1">
            <span className="font-bold text-[#002046] text-[11px]">Hasta:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-[24px] px-1 bg-white border border-[#74777f] text-[11px] font-mono"
            />
          </div>

          <div className="flex items-center gap-1">
            <span className="font-bold text-[#181c1f] text-[11px]">Sucursal:</span>
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              className="h-[24px] px-1 bg-white border border-[#74777f] text-[11px] font-bold"
            >
              <option value="TODAS">Todas las Sucursales</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} ({b.subtitle || b.name} - PV {b.pointOfSale})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span className="font-bold text-[#181c1f] text-[11px]">Pto. Venta:</span>
            <select
              value={filterPv}
              onChange={(e) => setFilterPv(e.target.value)}
              className="h-[24px] px-1 bg-white border border-[#74777f] text-[11px] font-mono"
            >
              <option value="TODOS">Todos los PV</option>
              {availablePvs.map((pv) => (
                <option key={pv} value={pv}>
                  PV {pv}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span className="font-bold text-[#181c1f] text-[11px]">Tipo:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="h-[24px] px-1 bg-white border border-[#74777f] text-[11px]"
            >
              <option value="TODOS">Todos los comprobantes</option>
              <option value="Factura A">Factura A</option>
              <option value="Factura B">Factura B</option>
              <option value="Nota de Crédito A">Nota de Crédito A</option>
              <option value="Nota de Crédito B">Nota de Crédito B</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Search className="w-3.5 h-3.5 text-[#74777f]" />
          <input
            type="text"
            placeholder="Buscar por cliente, CUIT o N°..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-[24px] px-2 w-[220px] bg-white border border-[#74777f] text-[11px]"
          />
        </div>
      </div>

      {/* Official Table */}
      <div className="bg-white border border-[#74777f] shadow-sm flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-max text-left border-collapse text-[11px] select-none whitespace-nowrap">
            <thead className="sticky top-0 bg-[#002046] text-white font-bold border-b border-[#74777f]">
              <tr className="h-[28px] whitespace-nowrap">
                <th className="px-3 border-r border-[#1b365d] whitespace-nowrap">FECHA</th>
                <th className="px-3 border-r border-[#1b365d] whitespace-nowrap">TIPO</th>
                <th className="px-2 border-r border-[#1b365d] text-center whitespace-nowrap">PV</th>
                <th className="px-3 border-r border-[#1b365d] text-center whitespace-nowrap">NÚMERO</th>
                <th className="px-3 border-r border-[#1b365d] whitespace-nowrap">CUIT / DNI</th>
                <th className="px-3 border-r border-[#1b365d] whitespace-nowrap">RAZÓN SOCIAL / CLIENTE</th>
                <th className="px-3 border-r border-[#1b365d] whitespace-nowrap">COND. IVA</th>
                <th className="px-3 border-r border-[#1b365d] text-right whitespace-nowrap">NETO GRAV.</th>
                <th className="px-3 border-r border-[#1b365d] text-right whitespace-nowrap">IVA (21%)</th>
                <th className="px-3 border-r border-[#1b365d] text-right whitespace-nowrap">IVA (10.5%)</th>
                <th className="px-3 border-r border-[#1b365d] text-right whitespace-nowrap">EXENTO</th>
                <th className="px-3 border-r border-[#1b365d] text-right whitespace-nowrap bg-[#001733]">
                  TOTAL
                </th>
                <th className="px-3 text-center whitespace-nowrap">C.A.E.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ebeef2]">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-10 text-gray-500 italic">
                    No se encontraron comprobantes fiscales emitidos para el rango seleccionado.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const isNc = inv.cbteTipo === 3 || inv.cbteTipo === 8;
                  const factor = isNc ? -1 : 1;

                  return (
                    <tr
                      key={inv.id}
                      className={`h-[28px] hover:bg-[#f1f4f8] whitespace-nowrap ${
                        isNc ? 'bg-[#fff5f5] text-[#aa3531]' : ''
                      }`}
                    >
                      <td className="px-3 font-mono border-r border-[#c4c6cf] whitespace-nowrap">{inv.date}</td>
                      <td className="px-3 border-r border-[#c4c6cf] font-bold whitespace-nowrap">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          {isNc && <FileMinus className="w-3.5 h-3.5 text-[#aa3531] shrink-0" />}
                          <span className="whitespace-nowrap">{inv.cbteNombre}</span>
                        </div>
                      </td>
                      <td className="px-2 text-center font-mono border-r border-[#c4c6cf] whitespace-nowrap">
                        {inv.pointOfSale}
                      </td>
                      <td className="px-3 text-center font-mono font-bold border-r border-[#c4c6cf] whitespace-nowrap">
                        {String(inv.cbteNumero).padStart(8, '0')}
                      </td>
                      <td className="px-3 font-mono border-r border-[#c4c6cf] whitespace-nowrap">
                        {inv.customer.cuitDni}
                      </td>
                      <td className="px-3 border-r border-[#c4c6cf] font-medium whitespace-nowrap">
                        {inv.customer.name}
                      </td>
                      <td className="px-3 border-r border-[#c4c6cf] text-[10px] whitespace-nowrap">
                        {inv.customer.vatCondition}
                      </td>
                      <td className="px-3 text-right font-mono border-r border-[#c4c6cf] whitespace-nowrap">
                        {formatCurrency(inv.netAmount * factor)}
                      </td>
                      <td className="px-3 text-right font-mono border-r border-[#c4c6cf] whitespace-nowrap">
                        {formatCurrency(inv.vatAmount21 * factor)}
                      </td>
                      <td className="px-3 text-right font-mono border-r border-[#c4c6cf] whitespace-nowrap">
                        {formatCurrency((inv.vatAmount105 || 0) * factor)}
                      </td>
                      <td className="px-3 text-right font-mono border-r border-[#c4c6cf] whitespace-nowrap">
                        {formatCurrency((inv.exemptAmount || 0) * factor)}
                      </td>
                      <td
                        className={`px-3 text-right font-mono font-bold border-r border-[#c4c6cf] whitespace-nowrap ${
                          isNc ? 'text-[#aa3531] bg-[#ffebeb]' : 'bg-[#f7fafe] text-[#002046]'
                        }`}
                      >
                        {formatCurrency(inv.totalAmount * factor)}
                      </td>
                      <td className="px-3 text-center font-mono text-[10px] whitespace-nowrap">{inv.cae}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Totals Breakdown Strip (Rule 32) */}
        <div className="bg-[#e0e3e7] border-t border-[#74777f] p-2 flex flex-col gap-1.5 text-[11px]">
          {/* Subtotals by Comprobante Type */}
          <div className="grid grid-cols-4 gap-2 bg-white p-1.5 border border-[#c4c6cf]">
            <div className="flex justify-between">
              <span className="text-[#44474e]">Facturas A ({totals.facACount}):</span>
              <strong className="font-mono text-[#002046]">{formatCurrency(totals.facATotal)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-[#44474e]">Facturas B ({totals.facBCount}):</span>
              <strong className="font-mono text-[#002046]">{formatCurrency(totals.facBTotal)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-[#aa3531]">Notas de Crédito A ({totals.ncACount}):</span>
              <strong className="font-mono text-[#aa3531]">-{formatCurrency(totals.ncATotal)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-[#aa3531]">Notas de Crédito B ({totals.ncBCount}):</span>
              <strong className="font-mono text-[#aa3531]">-{formatCurrency(totals.ncBTotal)}</strong>
            </div>
          </div>

          {/* Grand Totals */}
          <div className="flex items-center justify-between pt-1 font-bold">
            <div className="flex items-center gap-4 text-[12px]">
              <span>
                TOTAL NETO: <strong className="font-mono">{formatCurrency(totals.netoTotal)}</strong>
              </span>
              <span className="text-[#c4c6cf]">|</span>
              <span>
                TOTAL IVA 21%: <strong className="font-mono">{formatCurrency(totals.iva21Total)}</strong>
              </span>
              <span className="text-[#c4c6cf]">|</span>
              <span>
                TOTAL IVA 10.5%:{' '}
                <strong className="font-mono">{formatCurrency(totals.iva105Total)}</strong>
              </span>
              <span className="text-[#c4c6cf]">|</span>
              <span>
                TOTAL EXENTO:{' '}
                <strong className="font-mono">{formatCurrency(totals.exentoTotal)}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[#002046] text-[13px]">TOTAL GENERAL FACTURADO:</span>
              <span className="bg-[#002046] text-white px-3 py-1 font-mono text-[16px] font-black">
                {formatCurrency(totals.generalTotal)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
