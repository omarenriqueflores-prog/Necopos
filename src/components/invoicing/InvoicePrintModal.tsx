import React, { useState, useEffect, useMemo } from 'react';
import {
  Printer,
  FileText,
  Receipt,
  X,
  Building,
} from 'lucide-react';
import { ElectronicInvoice, BranchConfig } from '../../types/pos';
import { WindowsModal } from '../common/WindowsModal';
import { generateTicketHtml, printTicket, TicketData } from '../../utils/ticketGenerator';
import { resolveBranchForInvoice } from '../../utils/branchHelper';

interface InvoicePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: ElectronicInvoice | null;
  branch: BranchConfig;
  branches?: BranchConfig[];
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  isOpen,
  onClose,
  invoice,
  branch,
  branches,
}) => {
  // Resolve issuing branch directly from invoice metadata (point of sale / branchId)
  const effectiveBranch = useMemo(() => {
    return resolveBranchForInvoice(invoice, branches, branch);
  }, [invoice, branch, branches]);

  const [printFormat, setPrintFormat] = useState<'A4' | 'TICKET_80MM'>(
    effectiveBranch.ticketPrinter === 'A4' ? 'A4' : 'TICKET_80MM'
  );

  // Sync format if branch preference changes
  useEffect(() => {
    if (effectiveBranch.ticketPrinter === 'A4') {
      setPrintFormat('A4');
    }
  }, [effectiveBranch.ticketPrinter]);

  // Keyboard shortcut: Ctrl+P to print
  useEffect(() => {
    if (!isOpen || !invoice) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        handlePrint();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, invoice, printFormat, effectiveBranch]);

  if (!isOpen || !invoice) return null;

  const ticketData: TicketData = {
    items: invoice.items.map((i, idx) => ({
      code: i.productCode || String(idx + 1).padStart(4, '0'),
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      subtotal: i.totalAmount,
      totalAmount: i.totalAmount,
      unitType: i.unitType,
      vatRate: i.vatRate
    })),
    total: invoice.totalAmount,
    subtotal: invoice.netAmount,
    netAmount: invoice.netAmount,
    vatAmount: (invoice.vatAmount21 || 0) + (invoice.vatAmount105 || 0),
    paymentMethod: 'EFECTIVO / TRANSFERENCIA',
    ticketNumber: invoice.formattedNumber,
    customerName: invoice.customer.name,
    customerDni: invoice.customer.cuitDni,
    customerVatCondition: invoice.customer.vatCondition,
    customerAddress: invoice.customer.address,
    invoiceType: invoice.cbteTipo === 1 ? 'FACTURA_A' : 
                 invoice.cbteTipo === 6 ? 'FACTURA_B' : 
                 invoice.cbteTipo === 3 ? 'NOTA_CREDITO_A' : 
                 invoice.cbteTipo === 8 ? 'NOTA_CREDITO_B' : 
                 invoice.cbteTipo === 11 ? 'FACTURA_C' : 'FACTURA_B',
    operatorName: invoice.operator,
    employeeDiscountAmount: invoice.employeeDiscountAmount,
    employeeDiscountPercent: invoice.employeeDiscountPercent,
    cae: invoice.cae,
    caeVto: invoice.caeVto,
    qrUrl: invoice.qrUrl,
    createdAt: invoice.date ? `${invoice.date}T${invoice.time || '00:00:00'}` : undefined
  };

  const handlePrint = () => {
    const html = generateTicketHtml(
      ticketData,
      effectiveBranch,
      printFormat === 'A4' ? 'A4' : 'TICKET'
    );
    printTicket(html);
  };

  // Preview HTML for iframe (stripping out auto-print to avoid dialog on modal open)
  const previewHtml = generateTicketHtml(
    ticketData,
    effectiveBranch,
    printFormat === 'A4' ? 'A4' : 'TICKET'
  ).replace(/onload="[^"]*"/g, '');

  return (
    <WindowsModal
      isOpen={isOpen}
      onClose={onClose}
      title={`VISOR DE COMPROBANTE FISCAL ARCA - ${invoice.cbteNombre.toUpperCase()} ${invoice.formattedNumber} [${effectiveBranch.name || effectiveBranch.id}]`}
      maxWidth="max-w-5xl"
    >
      <div className="flex flex-col gap-2 p-1 select-none">
        {/* Top Control Bar */}
        <div className="bg-[#f0f2f5] p-2 border border-[#c4c6cf] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[#002046]">FORMATO DE SALIDA:</span>
            <div className="flex items-center border border-[#74777f] bg-white">
              <button
                type="button"
                onClick={() => setPrintFormat('A4')}
                className={`px-3 py-1 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer ${
                  printFormat === 'A4'
                    ? 'bg-[#002046] text-white'
                    : 'bg-white text-[#181c1f] hover:bg-[#e0e3e7]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Hoja A4 Oficial ARCA</span>
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat('TICKET_80MM')}
                className={`px-3 py-1 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer ${
                  printFormat === 'TICKET_80MM'
                    ? 'bg-[#002046] text-white'
                    : 'bg-white text-[#181c1f] hover:bg-[#e0e3e7]'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Ticket Térmico 80 mm</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="h-[28px] px-4 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Comprobante [Ctrl+P]</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-[28px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-semibold cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* Printable View Container with Live WYSIWYG Iframe */}
        <div className="max-h-[75vh] overflow-y-auto p-3 bg-[#525659] flex justify-center border border-[#74777f]">
          <iframe
            key={printFormat}
            title="Vista Previa Comprobante"
            srcDoc={previewHtml}
            className="bg-white shadow-2xl border border-black"
            style={{
              width: printFormat === 'A4' ? '100%' : '350px',
              maxWidth: printFormat === 'A4' ? '820px' : '350px',
              height: printFormat === 'A4' ? '1120px' : '650px',
            }}
          />
        </div>
      </div>
    </WindowsModal>
  );
};
