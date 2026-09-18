import React, { useState } from 'react';
import {
  FileMinus,
  AlertTriangle,
  Printer,
  CheckCircle,
  HelpCircle,
  Building,
} from 'lucide-react';
import {
  ElectronicInvoice,
  BranchConfig,
  UserAccount,
  ElectronicInvoiceItem,
  ArcaCbteTipo,
} from '../../types/pos';
import { formatCurrency, formatWeight } from '../../utils/scaleParser';
import { WindowsModal } from '../common/WindowsModal';
import { arcaService } from '../../services/arcaService';
import { useDialog } from '../../context/DialogContext';

interface CreditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: ElectronicInvoice | null;
  existingInvoices: ElectronicInvoice[];
  currentBranch: BranchConfig;
  currentUser: UserAccount;
  onSuccess: (creditNote: ElectronicInvoice) => void;
}

export const CreditNoteModal: React.FC<CreditNoteModalProps> = ({
  isOpen,
  onClose,
  invoice,
  existingInvoices,
  currentBranch,
  currentUser,
  onSuccess,
}) => {
  const { showAlert } = useDialog();

  const [creditType, setCreditType] = useState<'TOTAL' | 'PARCIAL'>('TOTAL');
  const [reason, setReason] = useState<
    | 'Anulación de venta'
    | 'Devolución de productos'
    | 'Error en facturación'
    | 'Diferencia de importe'
    | 'Descuento posterior'
    | 'Otro'
  >('Anulación de venta');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  if (!isOpen || !invoice) return null;

  const alreadyCredited = invoice.creditedAmount || 0;
  const remainingBalance = Math.max(0, invoice.totalAmount - alreadyCredited);

  // Credit note type: Factura A -> NC A (3), Factura B -> NC B (8)
  const ncCbteTipo: ArcaCbteTipo = invoice.cbteTipo === 1 ? 3 : 8;
  const ncNombre = invoice.cbteTipo === 1 ? 'Nota de Crédito A' : 'Nota de Crédito B';
  const ncLetra = invoice.cbteLetra;

  const handleEmitCreditNote = async () => {
    if (remainingBalance <= 0) {
      await showAlert('Esta factura ya fue acreditada o anulada en su totalidad.');
      return;
    }

    let finalAmount = remainingBalance;
    if (creditType === 'PARCIAL') {
      const parsed = parseFloat(customAmount);
      if (isNaN(parsed) || parsed <= 0) {
        await showAlert('Por favor ingrese un importe válido para la Nota de Crédito parcial.');
        return;
      }
      if (parsed > remainingBalance) {
        await showAlert(
          `El importe no puede superar el saldo pendiente de la factura (${formatCurrency(
            remainingBalance
          )}).`
        );
        return;
      }
      finalAmount = parsed;
    }

    setIsProcessing(true);

    try {
      // Calculate net and vat proportions based on original invoice ratio
      const ratio = finalAmount / invoice.totalAmount;
      const net = Math.round(invoice.netAmount * ratio * 100) / 100;
      const vat21 = Math.round(invoice.vatAmount21 * ratio * 100) / 100;
      const vat105 = Math.round(invoice.vatAmount105 * ratio * 100) / 100;

      const nextNum = arcaService.getNextNumber(existingInvoices, invoice.pointOfSale, ncCbteTipo);

      // Call ARCA authorization
      const arcaRes = await arcaService.authorize({
        branchId: invoice.branchId,
        pointOfSale: invoice.pointOfSale,
        cbteTipo: ncCbteTipo,
        cbteNumero: nextNum,
        customer: invoice.customer,
        items: invoice.items.map((i) => ({
          ...i,
          quantity: creditType === 'TOTAL' ? i.quantity : 1,
          netAmount: Math.round(i.netAmount * ratio * 100) / 100,
          vatAmount: Math.round(i.vatAmount * ratio * 100) / 100,
          totalAmount: Math.round(i.totalAmount * ratio * 100) / 100,
        })),
        netAmount: net,
        vatAmount: vat21 + vat105,
        totalAmount: finalAmount,
        associatedInvoice: {
          id: invoice.id,
          number: invoice.formattedNumber,
          cbteNumero: invoice.cbteNumero,
          cbteTipo: invoice.cbteTipo,
          pointOfSale: invoice.pointOfSale,
          date: invoice.date,
        },
        creditNoteReason: reason,
        creditNoteType: creditType,
      });

      if (!arcaRes.success && arcaRes.status === 'RECHAZADO') {
        await showAlert(`ARCA rechazó la Nota de Crédito: ${arcaRes.error}`);
        setIsProcessing(false);
        return;
      }

      const formattedNum = arcaService.formatCbteNumber(invoice.pointOfSale, nextNum);
      const today = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toLocaleTimeString('es-AR');

      const newCreditNote: ElectronicInvoice = {
        id: `NC-${invoice.pointOfSale}-${nextNum}-${Date.now()}`,
        branchId: invoice.branchId,
        pointOfSale: invoice.pointOfSale,
        cbteTipo: ncCbteTipo,
        cbteLetra: ncLetra,
        cbteNombre: ncNombre,
        cbteNumero: nextNum,
        formattedNumber: formattedNum,
        date: today,
        time: timeStr,
        cae: arcaRes.cae || '74109823412034',
        caeVto: arcaRes.caeVto || new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
        qrUrl:
          arcaRes.qrUrl ||
          arcaService.buildArcaQrUrl(
            currentBranch.cuit,
            invoice.pointOfSale,
            ncCbteTipo,
            nextNum,
            finalAmount,
            invoice.customer.docType || 80,
            invoice.customer.cuitDni,
            arcaRes.cae || '74109823412034',
            today
          ),
        customer: invoice.customer,
        items: invoice.items.map((i) => ({
          ...i,
          quantity: creditType === 'TOTAL' ? i.quantity : 1,
          totalAmount: Math.round(i.totalAmount * ratio * 100) / 100,
        })),
        netAmount: net,
        vatAmount21: vat21,
        vatAmount105: vat105,
        exemptAmount: 0,
        totalAmount: finalAmount,
        status: arcaRes.status || 'AUTORIZADO',
        environment: arcaRes.environment || 'homologacion',
        associatedInvoiceId: invoice.id,
        associatedInvoiceNumber: invoice.formattedNumber,
        creditNoteReason: reason,
        creditNoteType: creditType,
        operator: currentUser.fullName,
        createdAt: new Date().toISOString(),
      };

      onSuccess(newCreditNote);
      onClose();
    } catch (err: any) {
      await showAlert(`Error al emitir Nota de Crédito: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <WindowsModal
      isOpen={isOpen}
      onClose={onClose}
      title={`EMISIÓN DE NOTA DE CRÉDITO ARCA - FACTURA ${invoice.formattedNumber}`}
      maxWidth="max-w-xl"
    >
      <div className="flex flex-col gap-3 p-1 text-[12px] select-none font-sans">
        {/* Banner with original invoice info */}
        <div className="bg-[#f7fafe] p-2.5 border border-[#74777f] flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#002046] text-[13px]">
              Comprobante Original: {invoice.cbteNombre} {invoice.formattedNumber}
            </span>
            <span className="bg-[#002046] text-white px-2 py-0.5 font-bold text-[11px]">
              {invoice.pointOfSale} - {invoice.branchId}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-[#c4c6cf]">
            <div>
              <span className="text-[#44474e]">Cliente: </span>
              <strong>{invoice.customer.name}</strong>
            </div>
            <div>
              <span className="text-[#44474e]">CUIT/DNI: </span>
              <strong className="font-mono">{invoice.customer.cuitDni}</strong>
            </div>
            <div>
              <span className="text-[#44474e]">CAE Original: </span>
              <strong className="font-mono">{invoice.cae}</strong>
            </div>
            <div>
              <span className="text-[#44474e]">Total Original: </span>
              <strong className="font-mono">{formatCurrency(invoice.totalAmount)}</strong>
            </div>
          </div>

          <div className="bg-white p-1.5 border border-[#c4c6cf] flex items-center justify-between text-[11px] mt-1">
            <span className="text-[#44474e]">Saldo acreditado previo: {formatCurrency(alreadyCredited)}</span>
            <span className="font-bold text-[#aa3531]">
              Saldo Facturado Disponible: {formatCurrency(remainingBalance)}
            </span>
          </div>
        </div>

        {/* NC Form Controls */}
        <div className="bg-white p-3 border border-[#74777f] flex flex-col gap-3 shadow-sm">
          {/* Credit Note Destination */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-[#002046] block mb-0.5">
                Comprobante ARCA a Emitir:
              </label>
              <div className="p-1.5 bg-[#f0f2f5] border border-[#c4c6cf] font-bold text-[#002046]">
                {ncNombre} (Letra {ncLetra})
              </div>
            </div>

            <div>
              <label className="font-bold text-[#181c1f] block mb-0.5">Tipo de Imputación:</label>
              <select
                value={creditType}
                onChange={(e) => setCreditType(e.target.value as any)}
                className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold"
              >
                <option value="TOTAL">ANULACIÓN TOTAL ({formatCurrency(remainingBalance)})</option>
                <option value="PARCIAL">NOTA DE CRÉDITO PARCIAL</option>
              </select>
            </div>
          </div>

          {/* If Parcial: amount input */}
          {creditType === 'PARCIAL' && (
            <div className="bg-[#f7fafe] p-2 border border-[#c4c6cf]">
              <label className="font-bold text-[#002046] block mb-0.5">
                Importe a Acreditar (Máximo: {formatCurrency(remainingBalance)}):
              </label>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base">$</span>
                <input
                  type="number"
                  step="0.01"
                  max={remainingBalance}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 h-[28px] px-2 bg-white border border-[#74777f] font-mono font-bold text-base text-[#002046]"
                />
              </div>
            </div>
          )}

          {/* Official Reason */}
          <div>
            <label className="font-bold text-[#181c1f] block mb-0.5">Motivo Fiscal Oficial:</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as any)}
              className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
            >
              <option value="Anulación de venta">Anulación de venta</option>
              <option value="Devolución de productos">Devolución de productos</option>
              <option value="Error en facturación">Error en facturación</option>
              <option value="Diferencia de importe">Diferencia de importe</option>
              <option value="Descuento posterior">Descuento posterior</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          <div className="bg-amber-50 p-2 border border-amber-300 text-amber-900 text-[11px] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700 mt-0.5" />
            <span>
              La emisión de la Nota de Crédito será informada inmediatamente a ARCA y deducirá los
              importes netos e IVA del Libro IVA Ventas correspondiente.
            </span>
          </div>
        </div>

        {/* Modal Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-[#c4c6cf]">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="h-[28px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[11px] font-semibold cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleEmitCreditNote}
            disabled={isProcessing || remainingBalance <= 0}
            className="h-[28px] px-5 bg-[#aa3531] hover:bg-[#891c1d] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
          >
            <FileMinus className="w-3.5 h-3.5" />
            <span>
              {isProcessing ? 'Autorizando ante ARCA...' : 'Emitir Nota de Crédito [F12]'}
            </span>
          </button>
        </div>
      </div>
    </WindowsModal>
  );
};
