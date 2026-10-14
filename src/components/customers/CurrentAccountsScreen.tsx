import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  FileText,
  DollarSign,
  Printer,
  Download,
  Eye,
  Plus,
  ArrowLeft,
  UserCheck,
  Building,
  Trash2,
  CheckSquare,
  Square,
  Receipt,
} from 'lucide-react';
import { 
  Customer, 
  Employee, 
  AccountMovement, 
  BranchConfig, 
  UserAccount, 
  ElectronicInvoice,
  ElectronicInvoiceItem,
  ArcaCbteTipo
} from '../../types/pos';
import { formatCurrency } from '../../utils/scaleParser';
import { WindowsModal } from '../common/WindowsModal';
import { TicketPreview } from '../common/TicketPreview';
import { TicketData } from '../../utils/ticketGenerator';
import { useDialog } from '../../context/DialogContext';
import { useFirebase } from '../../context/FirebaseContext';
import { arcaService } from '../../services/arcaService';

interface CurrentAccountsScreenProps {
  customers: Customer[];
  employees: Employee[];
  movements: AccountMovement[];
  initialSelectedCustomer?: Customer | null;
  onAddMovement: (mov: AccountMovement) => void;
  onAddCashMovement?: (mov: any) => void;
  onBackToPOS?: () => void;
  currentBranch: BranchConfig;
  currentUser: UserAccount;
}

export const CurrentAccountsScreen: React.FC<CurrentAccountsScreenProps> = ({
  customers,
  employees,
  movements,
  initialSelectedCustomer,
  onAddMovement,
  onAddCashMovement,
  onBackToPOS,
  currentBranch,
  currentUser,
}) => {
  const { showAlert } = useDialog();
  const fb = useFirebase();
  const { 
    saveElectronicInvoice, 
    addAuditLog, 
    saveCustomer, 
    saveEmployee, 
    deleteAccountMovement,
    cashMovements,
    deleteCashMovement,
    sales,
    cancelSaleRecord
  } = fb;
  const arcaConfig = fb.arcaConfig;
  const pointOfSale = currentBranch.pointOfSale || arcaConfig?.pointsOfSale?.[currentBranch.id as 'NECO 1' | 'NECO 2'] || '0001';
  const [accountType, setAccountType] = useState<'CLIENTE' | 'EMPLEADO'>('CLIENTE');
  const [selectedPartyCode, setSelectedPartyCode] = useState<string>(
    initialSelectedCustomer ? initialSelectedCustomer.code : customers[0]?.code || ''
  );
  
  // Modals and selection state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentConcept, setPaymentConcept] = useState<string>('');
  const [paymentVoucher, setPaymentVoucher] = useState<string>('');

  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState<boolean>(false);
  const [advanceAmount, setAdvanceAmount] = useState<string>('');
  const [advanceConcept, setAdvanceConcept] = useState<string>('');
  const [advanceVoucher, setAdvanceVoucher] = useState<string>('');

  // Delete movement states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [movementToDelete, setMovementToDelete] = useState<AccountMovement | null>(null);

  // Multi-receipt batch invoicing states
  const [selectedMovementIds, setSelectedMovementIds] = useState<string[]>([]);
  const [isBatchInvoiceModalOpen, setIsBatchInvoiceModalOpen] = useState<boolean>(false);
  const [cbteTipo, setCbteTipo] = useState<ArcaCbteTipo>(6);
  const [isBatchSubmitting, setIsBatchSubmitting] = useState<boolean>(false);
  const [printFormat, setPrintFormat] = useState<'A4' | 'TICKET_80MM'>('A4');

  const [selectedSaleForDetail, setSelectedSaleForDetail] = useState<any | null>(null);

  const handleMovementDoubleClick = (mov: AccountMovement) => {
    const matchingSale = (fb.sales || []).find(
      (s: any) => s.ticketNumber === mov.voucher || s.id === mov.voucher
    );
    if (matchingSale) {
      setSelectedSaleForDetail(matchingSale);
    } else {
      showAlert(`No se encontraron detalles de productos en el sistema para el comprobante ${mov.voucher}.`);
    }
  };

  const selectedCustomer = customers.find((c) => c.code === selectedPartyCode);
  const selectedEmployee = employees.find((e) => e.code === selectedPartyCode);

  // Suggest invoice type based on customer
  React.useEffect(() => {
    if (selectedCustomer) {
      const isRespInscripto = selectedCustomer.vatCondition === 'Resp. Inscripto' || (selectedCustomer.vatCondition as any) === 'Responsable Inscripto';
      setCbteTipo(isRespInscripto ? 1 : 6);
    }
  }, [selectedCustomer]);

  const activePartyMovements = movements.filter(
    (m) => m.partyType === accountType && m.partyCode === selectedPartyCode
  );

  const selectedMovementsForInvoice = activePartyMovements.filter(m => selectedMovementIds.includes(m.id));

  const expandedItemsForInvoice = useMemo(() => {
    const result: Array<{
      id: string;
      voucher: string;
      concept: string;
      totalAmount: number;
      netAmount: number;
      vatAmount: number;
    }> = [];

    selectedMovementsForInvoice.forEach((m) => {
      const mVoucherEnd = m.voucher.split('-').pop()?.replace(/^0+/, '');
      const matchingSale = (sales || []).find((s: any) => {
        const sId = (s.ticketNumber || s.id || '').split('-').pop()?.replace(/^0+/, '');
        return (mVoucherEnd && sId && mVoucherEnd === sId) || s.id === m.voucher || s.ticketNumber === m.voucher;
      });

      if (matchingSale && Array.isArray(matchingSale.items) && matchingSale.items.length > 0) {
        matchingSale.items.forEach((item: any, idx: number) => {
          const itemTotal = item.subtotal || ((item.quantity || item.weight || 1) * item.unitPrice) || 0;
          const itemNet = Math.round((itemTotal / 1.21) * 100) / 100;
          const itemVat = Math.round((itemTotal - itemNet) * 100) / 100;

          const qtyStr = item.weight
            ? `${item.weight} Kg`
            : item.quantity
            ? `${item.quantity} Unid`
            : '1 Unid';

          result.push({
            id: `${m.id}-${item.id || idx}`,
            voucher: m.voucher,
            concept: `${item.description} (${qtyStr} x ${formatCurrency(item.unitPrice)})`,
            totalAmount: itemTotal,
            netAmount: itemNet,
            vatAmount: itemVat,
          });
        });
      } else {
        let totalAmt = m.debit > 0 ? m.debit : m.credit;
        
        // Fallback: If it's an employee and we have discount info in concept, recover the full amount
        if (m.concept.includes('[Desc. ')) {
          const match = m.concept.match(/\[Desc\. (\d+)%\]/);
          if (match) {
            const percent = parseInt(match[1]);
            totalAmt = totalAmt / (1 - percent / 100);
          }
        }

        const netAmt = Math.round((totalAmt / 1.21) * 100) / 100;
        const vatAmt = Math.round((totalAmt - netAmt) * 100) / 100;
        result.push({
          id: m.id,
          voucher: m.voucher,
          concept: m.concept,
          totalAmount: totalAmt,
          netAmount: netAmt,
          vatAmount: vatAmt,
        });
      }
    });

    return result;
  }, [selectedMovementsForInvoice, fb.sales]);

  const ticketPreviewData = useMemo(() => {
    if (!isBatchInvoiceModalOpen) return null;
    
    let totalDiscountAmount = 0;
    let maxDiscountPercent = 0;

    selectedMovementsForInvoice.forEach(m => {
      const mVoucherEnd = m.voucher.split('-').pop()?.replace(/^0+/, '');
      const matchingSale = (sales || []).find((s: any) => {
        const sId = (s.ticketNumber || s.id || '').split('-').pop()?.replace(/^0+/, '');
        return (mVoucherEnd && sId && mVoucherEnd === sId) || s.id === m.voucher || s.ticketNumber === m.voucher;
      });
      if (matchingSale) {
        if (matchingSale.employeeDiscountAmount) {
          totalDiscountAmount += matchingSale.employeeDiscountAmount;
        }
        if (matchingSale.employeeDiscountPercent) {
          maxDiscountPercent = Math.max(maxDiscountPercent, matchingSale.employeeDiscountPercent);
        }
      } else if (m.concept.includes('[Desc. ')) {
        // Fallback: parse discount from concept string if matching sale not found
        const match = m.concept.match(/\[Desc\. (\d+)%\]/);
        if (match) {
          const percent = parseInt(match[1]);
          const debit = m.debit || 0;
          const fullAmount = debit / (1 - percent / 100);
          totalDiscountAmount += (fullAmount - debit);
          maxDiscountPercent = Math.max(maxDiscountPercent, percent);
        }
      }
    });

    const totalFromItems = expandedItemsForInvoice.reduce((sum, item) => sum + item.totalAmount, 0);
    const netAmount = expandedItemsForInvoice.reduce((sum, item) => sum + item.netAmount, 0);
    const vatAmount = expandedItemsForInvoice.reduce((sum, item) => sum + item.vatAmount, 0);
    
    // The items in expandedItemsForInvoice are based on matchingSale.items which are FULL prices.
    // So the 'totalFromItems' is the subtotal before the employee discount.
    const finalTotal = totalFromItems - totalDiscountAmount;

    return {
      items: expandedItemsForInvoice.map(item => ({
        description: item.concept,
        quantity: 1,
        unitPrice: item.totalAmount,
        subtotal: item.totalAmount,
        netAmount: item.netAmount,
        vatAmount: item.vatAmount,
        code: item.voucher
      })),
      total: finalTotal,
      subtotal: totalFromItems,
      netAmount: netAmount,
      vatAmount,
      employeeDiscountAmount: totalDiscountAmount,
      employeeDiscountPercent: maxDiscountPercent,
      paymentMethod: 'CTA CTE',
      ticketNumber: `${pointOfSale}-0000XXXX`,
      customerName: selectedCustomer?.name || selectedEmployee?.name,
      customerDni: selectedCustomer?.dniCuit || selectedEmployee?.dni,
      customerVatCondition: selectedCustomer?.vatCondition || 'Cons. Final',
      invoiceType: cbteTipo === 1 ? 'FACTURA_A' : 'FACTURA_B',
      operatorName: currentUser.fullName,
      createdAt: new Date().toISOString()
    } as TicketData;
  }, [isBatchInvoiceModalOpen, expandedItemsForInvoice, selectedMovementsForInvoice, fb.sales, selectedCustomer, selectedEmployee, pointOfSale, cbteTipo, currentUser]);

  const handleRegisterPayment = async () => {
    const amt = parseFloat(paymentAmount) || 0;
    if (amt <= 0) {
      await showAlert('Ingrese un importe de pago válido.');
      return;
    }

    const currentBal =
      accountType === 'CLIENTE'
        ? selectedCustomer?.currentBalance || 0
        : selectedEmployee?.currentBalance || 0;

    const newBal = Math.max(0, currentBal - amt);

    const resolvedVoucher = paymentVoucher || `REC-${Math.floor(100000 + Math.random() * 900000)}`;
    const resolvedConcept = paymentConcept || 'Pago Cuenta Corriente';

    const newMov: AccountMovement = {
      id: `MOV-${Date.now()}`,
      date: new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      voucher: resolvedVoucher,
      concept: resolvedConcept,
      debit: 0,
      credit: amt,
      balance: newBal,
      partyType: accountType,
      partyCode: selectedPartyCode,
    };

    onAddMovement(newMov);
    if (accountType === 'CLIENTE' && selectedCustomer) {
      selectedCustomer.currentBalance = newBal;
      await saveCustomer(selectedCustomer);
    } else if (accountType === 'EMPLEADO' && selectedEmployee) {
      selectedEmployee.currentBalance = newBal;
      await saveEmployee(selectedEmployee);
    }

    if (onAddCashMovement) {
      onAddCashMovement({
        id: `CM-${Date.now()}`,
        time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        type: 'INGRESO',
        concept: `${accountType === 'EMPLEADO' ? 'Cobro Cta Cte Empleado' : 'Cobro Cta Cte Cliente'}: ${selectedCustomer?.name || selectedEmployee?.name}`,
        voucher: resolvedVoucher,
        amount: amt,
        branchId: currentBranch.id,
      });
    }

    setIsPaymentModalOpen(false);
    await showAlert(`Cobranza registrada correctamente: ${formatCurrency(amt)}.`);
  };

  const handleRegisterAdvance = async () => {
    const amt = parseFloat(advanceAmount) || 0;
    if (amt <= 0) {
      await showAlert('Ingrese un importe de adelanto válido.');
      return;
    }

    if (!selectedEmployee) {
      await showAlert('No se ha seleccionado ningún empleado.');
      return;
    }

    const currentBal = selectedEmployee.currentBalance || 0;
    const limit = 1000000; // Límite de $1.000.000,00
    if (currentBal + amt > limit) {
      await showAlert(`El importe supera el límite de anticipo disponible (${formatCurrency(limit - currentBal)}).`);
      return;
    }

    const newBal = currentBal + amt;
    const resolvedVoucher = advanceVoucher || `VAL-${Math.floor(100000 + Math.random() * 900000)}`;
    const resolvedConcept = advanceConcept || 'Vale de Efectivo / Adelanto de Sueldo';

    const newMov: AccountMovement = {
      id: `MOV-${Date.now()}`,
      date: new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      voucher: resolvedVoucher,
      concept: resolvedConcept,
      debit: amt,
      credit: 0,
      balance: newBal,
      partyType: 'EMPLEADO',
      partyCode: selectedPartyCode,
    };

    onAddMovement(newMov);
    selectedEmployee.currentBalance = newBal;
    await saveEmployee(selectedEmployee);

    if (onAddCashMovement) {
      onAddCashMovement({
        id: `CM-${Date.now()}`,
        time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        type: 'EGRESO',
        concept: `Vale Empleado: ${selectedEmployee.name}`,
        voucher: resolvedVoucher,
        amount: -amt,
        branchId: currentBranch.id,
      });
    }

    setIsAdvanceModalOpen(false);
    await showAlert(`Vale/Adelanto de efectivo registrado correctamente: ${formatCurrency(amt)}.`);
  };

  const handleConfirmDeleteMovement = async () => {
    if (deletePassword !== '26635235') {
      await showAlert('Contraseña de autorización gerencial incorrecta.');
      return;
    }

    if (!movementToDelete) {
      await showAlert('No hay ningún movimiento seleccionado para eliminar.');
      return;
    }

    try {
      // Recalculate account balance:
      // If we delete a debit (which increased outstanding debt), we subtract that debit amount
      // If we delete a credit (which decreased outstanding debt), we add that credit amount back
      if (movementToDelete.partyType === 'CLIENTE' && selectedCustomer) {
        const adjustedBal = selectedCustomer.currentBalance - movementToDelete.debit + movementToDelete.credit;
        selectedCustomer.currentBalance = Math.max(0, adjustedBal);
        await saveCustomer(selectedCustomer);
      } else if (movementToDelete.partyType === 'EMPLEADO' && selectedEmployee) {
        const adjustedBal = selectedEmployee.currentBalance - movementToDelete.debit + movementToDelete.credit;
        selectedEmployee.currentBalance = Math.max(0, adjustedBal);
        await saveEmployee(selectedEmployee);
      }

      // Find and delete any linked CashMovement with the same voucher
      const linkedCashMov = (cashMovements || []).find(
        (cm) => cm.voucher === movementToDelete.voucher
      );
      if (linkedCashMov) {
        await deleteCashMovement(linkedCashMov.id);
      }

      // Find and delete any linked POS sale with the same ticketNumber
      const linkedSale = (sales || []).find(
        (s) => s.ticketNumber === movementToDelete.voucher
      );
      if (linkedSale) {
        await cancelSaleRecord(linkedSale, currentUser.fullName);
      }

      await deleteAccountMovement(movementToDelete.id);

      // Save Audit trail
      await addAuditLog({
        id: `LOG-${Date.now()}`,
        date: new Date().toLocaleDateString('es-AR'),
        time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        user: currentUser.fullName,
        branch: currentBranch.id,
        operation: 'Eliminación de Movimiento Cta Cte',
        comprobante: movementToDelete.voucher,
        pointOfSale: currentBranch.pointOfSale ? parseInt(currentBranch.pointOfSale) : 1,
        cae: '',
        result: 'EXITOSO',
        details: `Eliminó el movimiento ${movementToDelete.voucher} (${movementToDelete.concept}). Importe: ${formatCurrency(movementToDelete.debit || movementToDelete.credit)}. Titular: ${selectedCustomer?.name || selectedEmployee?.name}`,
      });

      // Clear deleted id from checkbox state if selected
      setSelectedMovementIds(prev => prev.filter(id => id !== movementToDelete.id));

      await showAlert('El movimiento ha sido eliminado y el saldo de la cuenta corriente ha sido recalculado exitosamente.');
      setIsDeleteModalOpen(false);
      setDeletePassword('');
      setMovementToDelete(null);
    } catch (error: any) {
      console.error('Error al eliminar movimiento de cuenta corriente:', error);
      await showAlert(`Error al eliminar movimiento: ${error.message || error}`);
    }
  };

  const handleEmitBatchInvoice = async () => {
    if (selectedMovementsForInvoice.length === 0) {
      await showAlert('No hay movimientos seleccionados para facturar.');
      return;
    }

    if (cbteTipo === 1 && selectedCustomer?.vatCondition !== 'Resp. Inscripto' && (selectedCustomer?.vatCondition as any) !== 'Responsable Inscripto') {
      await showAlert('REGLA ARCA: Factura "A" sólo puede emitirse a clientes Responsables Inscriptos con CUIT.');
      return;
    }

    setIsBatchSubmitting(true);
    try {
      const arcaConfig = fb.arcaConfig;
      const pointOfSale = currentBranch.pointOfSale || arcaConfig?.pointsOfSale?.[currentBranch.id as 'NECO 1' | 'NECO 2'] || '0001';
      const cbteTipoInt = cbteTipo;
      const cbteLetraVal = cbteTipo === 1 ? 'A' : 'B';
      const cbteNombreVal = cbteTipo === 1 ? 'Factura A' : 'Factura B';

      const nextNum = arcaService.getNextNumber(fb.electronicInvoices || [], pointOfSale, cbteTipoInt);

      // Build consolidated items from selected movements
      const invoiceItems: ElectronicInvoiceItem[] = selectedMovementsForInvoice.map((mov, idx) => {
        const sub = mov.debit > 0 ? mov.debit : mov.credit;
        const net = Math.round((sub / 1.21) * 100) / 100;
        const vat = Math.round((sub - net) * 100) / 100;
        return {
          productCode: mov.voucher || `MOV-${mov.id}`,
          description: `Mov. Cta Cte: ${mov.concept} (${mov.voucher})`,
          unitType: 'Unidad',
          quantity: 1,
          unitPrice: sub,
          vatRate: 21,
          netAmount: net,
          vatAmount: vat,
          totalAmount: sub,
        };
      });

      const totalAmount = invoiceItems.reduce((sum, item) => sum + item.totalAmount, 0);
      const netAmount = Math.round((totalAmount / 1.21) * 100) / 100;
      const vatAmount = Math.round((totalAmount - netAmount) * 100) / 100;

      const customerToInvoice = selectedCustomer || {
        code: selectedEmployee?.code || 'CF-0001',
        name: selectedEmployee?.name || 'Consumidor Final',
        dniCuit: selectedEmployee?.dni || '00-00000000-0',
        address: selectedEmployee?.address || 'S/D',
        vatCondition: 'Cons. Final',
        phone: '',
        email: '',
        currentBalance: 0,
        creditLimit: 0,
        status: 'NORMAL',
      } as Customer;

      // Call backend ARCA authorization
      const storedCfg = arcaService.getStoredConfig();
      const authRes = await arcaService.authorize({
        branchId: currentBranch.id,
        pointOfSale,
        cbteTipo: cbteTipoInt,
        cbteNumero: nextNum,
        customer: {
          name: customerToInvoice.name,
          cuitDni: customerToInvoice.dniCuit,
          vatCondition: customerToInvoice.vatCondition,
          address: customerToInvoice.address,
        },
        items: invoiceItems,
        netAmount,
        vatAmount,
        totalAmount,
        certificate: arcaConfig?.certificate || storedCfg.certificate,
        privateKey: arcaConfig?.privateKey || storedCfg.privateKey,
        cuit: arcaConfig?.cuit || storedCfg.cuit,
        environment: arcaConfig?.environment || storedCfg.environment,
      });

      if (!authRes.success || !authRes.cae) {
        await showAlert(`Comprobante no autorizado por ARCA:\n${authRes.error || 'Verifique que el Certificado (.crt) y la Clave Privada (.key) estén vinculados en Configuración ARCA.'}`);
        setIsBatchSubmitting(false);
        return;
      }

      const officialNum = authRes.cbteNumero || nextNum;
      const formattedNumber = arcaService.formatCbteNumber(pointOfSale, officialNum);
      const today = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toLocaleTimeString('es-AR');

      const cleanDoc = customerToInvoice.dniCuit.replace(/\D/g, '');
      const docType = cleanDoc.length === 11 ? 80 : cleanDoc.length >= 7 ? 96 : 99;

      const newInvoice: ElectronicInvoice = {
        id: `INV-${pointOfSale}-${officialNum}-${Date.now()}`,
        branchId: currentBranch.id,
        pointOfSale,
        cbteTipo: cbteTipoInt,
        cbteLetra: cbteLetraVal,
        cbteNombre: cbteNombreVal,
        cbteNumero: officialNum,
        formattedNumber,
        date: today,
        time: timeStr,
        cae: authRes.cae,
        caeVto: authRes.caeVto || new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
        qrUrl:
          authRes.qrUrl ||
          arcaService.buildArcaQrUrl(
            currentBranch.cuit,
            pointOfSale,
            cbteTipoInt,
            officialNum,
            totalAmount,
            docType,
            customerToInvoice.dniCuit,
            authRes.cae,
            today
          ),
        customer: {
          name: customerToInvoice.name,
          cuitDni: customerToInvoice.dniCuit,
          docType,
          vatCondition:
            customerToInvoice.vatCondition === 'Resp. Inscripto' || (customerToInvoice.vatCondition as any) === 'Responsable Inscripto'
              ? 'Resp. Inscripto'
              : customerToInvoice.vatCondition === 'Monotributo'
              ? 'Monotributo'
              : customerToInvoice.vatCondition === 'Exento'
              ? 'Exento'
              : 'Cons. Final',
          address: customerToInvoice.address,
        },
        items: invoiceItems,
        netAmount,
        vatAmount21: vatAmount,
        vatAmount105: 0,
        exemptAmount: 0,
        totalAmount,
        status: 'AUTORIZADO',
        environment: authRes.environment || 'produccion',
        operator: currentUser.fullName,
        createdAt: new Date().toISOString(),
      };

      await saveElectronicInvoice(newInvoice);
      await addAuditLog({
        id: `LOG-${Date.now()}`,
        date: today,
        time: timeStr,
        user: currentUser.fullName,
        branch: currentBranch.id,
        operation: `Emisión de ${cbteNombreVal} (Lote Cta Cte)`,
        comprobante: formattedNumber,
        pointOfSale,
        cae: newInvoice.cae,
        result: 'EXITOSO',
        details: `Facturación lote cta cte (${selectedMovementsForInvoice.length} movs) - Titular: ${customerToInvoice.name} - Total: ${formatCurrency(totalAmount)}`,
      });

      await showAlert(`Factura oficial emitida con éxito ante ARCA:\n${cbteNombreVal} N° ${formattedNumber}\nCAE: ${newInvoice.cae}`);
      
      // Clear selections and close modals
      setSelectedMovementIds([]);
      setIsBatchInvoiceModalOpen(false);
    } catch (err: any) {
      console.error('Error al emitir factura por lote:', err);
      await showAlert(`Error al emitir factura por lote ante ARCA: ${err.message || err}`);
    } finally {
      setIsBatchSubmitting(false);
    }
  };

  const handleExportExcel = () => {
    // Usar activePartyMovements que contiene los datos filtrados del titular seleccionado
    const ws = XLSX.utils.json_to_sheet(activePartyMovements);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Extracto");
    XLSX.writeFile(wb, `Extracto_${selectedPartyCode}.xlsx`);
  };

  const handlePrint = () => {
    // Para imprimir, se puede abrir una nueva ventana o usar la ventana actual
    // Como es un extracto, lo ideal sería tener una vista de impresión específica
    window.print();
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-80px)] select-none bg-[#ebeef2] text-[#181c1f] font-sans p-1">
      {/* Top Selector Strip */}
      <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {/* Account Category Switcher */}
          <div className="flex items-center border border-[#74777f] p-0.5 bg-[#ebeef2]">
            <button
              onClick={() => {
                setAccountType('CLIENTE');
                setSelectedPartyCode(customers[0]?.code || '');
                setSelectedMovementIds([]);
              }}
              className={`px-3 py-1 text-[11px] font-bold cursor-pointer flex items-center gap-1 ${
                accountType === 'CLIENTE'
                  ? 'bg-[#002046] text-white shadow-sm'
                  : 'text-[#44474e] hover:bg-[#e0e3e7]'
              }`}
            >
              <Building className="w-3 h-3" />
              <span>Cuentas Clientes</span>
            </button>
            <button
              onClick={() => {
                setAccountType('EMPLEADO');
                setSelectedPartyCode(employees[0]?.code || '');
                setSelectedMovementIds([]);
              }}
              className={`px-3 py-1 text-[11px] font-bold cursor-pointer flex items-center gap-1 ${
                accountType === 'EMPLEADO'
                  ? 'bg-[#002046] text-white shadow-sm'
                  : 'text-[#44474e] hover:bg-[#e0e3e7]'
              }`}
            >
              <UserCheck className="w-3 h-3" />
              <span>Personal / Vales Empleados</span>
            </button>
          </div>

          {/* Account Target Dropdown */}
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-bold text-[#002046] uppercase">
              Seleccionar Titular:
            </label>
            <select
              value={selectedPartyCode}
              onChange={(e) => {
                setSelectedPartyCode(e.target.value);
                setSelectedMovementIds([]);
              }}
              className="h-[26px] px-2 bg-white border border-[#74777f] text-[12px] font-bold text-[#002046] focus:outline-none min-w-[280px] cursor-pointer"
            >
              {accountType === 'CLIENTE'
                ? customers.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name} (Saldo: {formatCurrency(c.currentBalance)})
                    </option>
                  ))
                : employees.map((e) => (
                    <option key={e.code} value={e.code}>
                      Legajo {e.legajo} - {e.name} ({e.role} {e.branch}) - Saldo:{' '}
                      {formatCurrency(e.currentBalance)}
                    </option>
                  ))}
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setPaymentAmount('');
              setPaymentConcept(accountType === 'EMPLEADO' ? 'Devolución de Adelanto / Pago Cta Cte' : 'Cobranza a Cuenta Corriente');
              setPaymentVoucher('');
              setIsPaymentModalOpen(true);
            }}
            className="h-[26px] px-3 bg-[#aa3531] hover:bg-[#891c1d] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-sm"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Registrar Pago / Cobranza</span>
          </button>
          {accountType === 'EMPLEADO' && (
            <button
              onClick={() => {
                setAdvanceAmount('');
                setAdvanceConcept('Vale de Efectivo / Adelanto de Sueldo');
                setAdvanceVoucher('');
                setIsAdvanceModalOpen(true);
              }}
              className="h-[26px] px-3 bg-[#002046] hover:bg-[#112a4d] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-sm"
              title="Registrar un vale de dinero o adelanto de sueldo para este empleado"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Registrar Adelanto / Vale</span>
            </button>
          )}
          <button
            onClick={handlePrint}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-[#44474e]" />
            <span>Imprimir Extracto</span>
          </button>
          <button
            onClick={handleExportExcel}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#44474e]" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* Traditional Accounting Statement Header */}
      {selectedCustomer && accountType === 'CLIENTE' && (
        <div className="bg-[#e0e3e7] border border-[#74777f] p-2 mb-1 shadow-sm grid grid-cols-5 gap-2 text-[#181c1f]">
          <div className="bg-white p-1.5 border border-[#c4c6cf] flex flex-col">
            <span className="text-[10px] font-bold text-[#44474e] uppercase">Cliente / Titular</span>
            <span className="font-bold text-[#002046] text-[13px] truncate">
              {selectedCustomer.name}
            </span>
            <span className="text-[10px] text-[#74777f]">Cód. {selectedCustomer.code}</span>
          </div>
          <div className="bg-white p-1.5 border border-[#c4c6cf] flex flex-col">
            <span className="text-[10px] font-bold text-[#44474e] uppercase">DNI / CUIT</span>
            <span className="font-mono font-bold text-[#181c1f] text-[12px]">
              {selectedCustomer.dniCuit}
            </span>
            <span className="text-[10px] text-[#74777f]">{selectedCustomer.vatCondition}</span>
          </div>
          <div className="bg-white p-1.5 border border-[#c4c6cf] flex flex-col">
            <span className="text-[10px] font-bold text-[#44474e] uppercase">Límite de Crédito</span>
            <span className="font-mono font-bold text-[#181c1f] text-[13px]">
              {formatCurrency(selectedCustomer.creditLimit)}
            </span>
            <span className="text-[10px] text-[#74777f]">Autorizado por Gerencia</span>
          </div>
          <div className="bg-white p-1.5 border border-[#c4c6cf] flex flex-col">
            <span className="text-[10px] font-bold text-[#44474e] uppercase">Saldo Actual Deudor</span>
            <span className="font-mono font-black text-[#aa3531] text-[15px]">
              {formatCurrency(selectedCustomer.currentBalance)}
            </span>
            <span className="text-[10px] font-bold text-[#aa3531]">
              ESTADO: {selectedCustomer.status}
            </span>
          </div>
          <div className="bg-white p-1.5 border border-[#c4c6cf] flex flex-col">
            <span className="text-[10px] font-bold text-[#44474e] uppercase">Crédito Disponible</span>
            <span className="font-mono font-black text-[#002046] text-[15px]">
              {formatCurrency(
                Math.max(0, selectedCustomer.creditLimit - selectedCustomer.currentBalance)
              )}
            </span>
            <span className="text-[10px] text-[#002046]">Apto para ventas POS</span>
          </div>
        </div>
      )}

      {selectedEmployee && accountType === 'EMPLEADO' && (
        <div className="bg-[#e0e3e7] border border-[#74777f] p-2 mb-1 shadow-sm grid grid-cols-4 gap-2 text-[#181c1f]">
          <div className="bg-white p-1.5 border border-[#c4c6cf] flex flex-col">
            <span className="text-[10px] font-bold text-[#44474e] uppercase">Empleado / Legajo</span>
            <span className="font-bold text-[#002046] text-[13px]">
              {selectedEmployee.name} (Leg. {selectedEmployee.legajo})
            </span>
            <span className="text-[10px] text-[#74777f]">
              {selectedEmployee.role} - {selectedEmployee.branch}
            </span>
          </div>
          <div className="bg-white p-1.5 border border-[#c4c6cf] flex flex-col">
            <span className="text-[10px] font-bold text-[#44474e] uppercase">Límite Anticipo</span>
            <span className="font-mono font-bold text-[#181c1f] text-[13px]">
              {formatCurrency(selectedEmployee.creditLimit)}
            </span>
          </div>
          <div className="bg-white p-1.5 border border-[#c4c6cf] flex flex-col">
            <span className="text-[10px] font-bold text-[#44474e] uppercase">Saldo Retirado / Vales</span>
            <span className="font-mono font-black text-[#aa3531] text-[15px]">
              {formatCurrency(selectedEmployee.currentBalance)}
            </span>
          </div>
          <div className="bg-white p-1.5 border border-[#c4c6cf] flex flex-col">
            <span className="text-[10px] font-bold text-[#44474e] uppercase">Disponible a Cuenta</span>
            <span className="font-mono font-black text-[#002046] text-[15px]">
              {formatCurrency(
                Math.max(0, selectedEmployee.creditLimit - selectedEmployee.currentBalance)
              )}
            </span>
          </div>
          {selectedEmployee.discountPercent !== undefined && selectedEmployee.discountPercent > 0 && (
            <div className="bg-[#e6f4ea] p-1.5 border border-[#00522c] flex flex-col">
              <span className="text-[10px] font-bold text-[#00522c] uppercase">Bonificación / Desc.</span>
              <span className="font-mono font-black text-[#00522c] text-[15px]">
                {selectedEmployee.discountPercent}% OFF
              </span>
              <span className="text-[9px] text-[#00522c] leading-none">Beneficio de Personal</span>
            </div>
          )}
        </div>
      )}

      {/* Traditional Accounting Ledger Table */}
      <div className="bg-white border border-[#74777f] shadow-sm flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-[#aec7f7]" />
            <span>EXTRACTO HISTÓRICO DE MOVIMIENTOS (LIBRO MAYOR DE CUENTA CORRIENTE)</span>
          </div>
          <div className="font-mono text-[11px] text-[#d4e3ff]">
            {activePartyMovements.length} ASIENTOS CONTABLES REGISTRADOS
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-auto">
          <table className="w-full text-left border-collapse select-none text-[12px]">
            <thead className="sticky top-0 bg-[#e5e8ec] text-[#181c1f] font-bold text-[11px] border-b border-[#74777f]">
              <tr className="h-[24px]">
                {/* Checkbox column */}
                <th className="w-[45px] px-2 text-center border-r border-[#c4c6cf]">
                  <input
                    type="checkbox"
                    checked={activePartyMovements.length > 0 && selectedMovementIds.length === activePartyMovements.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedMovementIds(activePartyMovements.map(m => m.id));
                      } else {
                        setSelectedMovementIds([]);
                      }
                    }}
                    className="w-3.5 h-3.5 cursor-pointer accent-[#002046]"
                    title="Seleccionar todos los movimientos"
                  />
                </th>
                <th className="w-[120px] px-2 border-r border-[#c4c6cf]">FECHA / HORA</th>
                <th className="w-[140px] px-2 border-r border-[#c4c6cf]">COMPROBANTE</th>
                <th className="px-2 border-r border-[#c4c6cf]">CONCEPTO / DESCRIPCIÓN</th>
                <th className="w-[120px] px-2 text-right border-r border-[#c4c6cf] bg-[#e0e3e7]">
                  DEBE (+)
                </th>
                <th className="w-[120px] px-2 text-right border-r border-[#c4c6cf] bg-[#e0e3e7]">
                  HABER (-)
                </th>
                <th className="w-[130px] px-2 text-right border-r border-[#c4c6cf] bg-[#d0d4dc]">SALDO ACUMULADO</th>
                <th className="w-[60px] px-2 text-center bg-[#fceeed]">ACCIONES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ebeef2]">
              {activePartyMovements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-[#74777f] italic bg-[#f7fafe]">
                    No se registran movimientos históricos en esta cuenta corriente.
                  </td>
                </tr>
              ) : (
                activePartyMovements.map((mov, idx) => (
                  <tr
                    key={mov.id}
                    onDoubleClick={() => handleMovementDoubleClick(mov)}
                    title="Doble clic para ver el detalle de productos de este ticket"
                    className={`h-[24px] cursor-pointer ${
                      selectedMovementIds.includes(mov.id)
                        ? 'bg-[#d6e3ff]/30 hover:bg-[#d6e3ff]/40'
                        : idx % 2 === 0
                        ? 'bg-white hover:bg-[#e5e8ec]'
                        : 'bg-[#f1f4f8] hover:bg-[#e5e8ec]'
                    }`}
                  >
                    {/* Individual Checkbox */}
                    <td className="px-2 text-center border-r border-[#c4c6cf]">
                      <input
                        type="checkbox"
                        checked={selectedMovementIds.includes(mov.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMovementIds(prev => [...prev, mov.id]);
                          } else {
                            setSelectedMovementIds(prev => prev.filter(id => id !== mov.id));
                          }
                        }}
                        className="w-3.5 h-3.5 cursor-pointer accent-[#002046]"
                      />
                    </td>
                    <td className="px-2 font-mono text-[11px] border-r border-[#c4c6cf] text-[#44474e]">
                      {mov.date}
                    </td>
                    <td className="px-2 font-mono font-bold text-[11px] border-r border-[#c4c6cf] text-[#002046]">
                      {mov.voucher}
                    </td>
                    <td className="px-2 border-r border-[#c4c6cf] text-[12px]">{mov.concept}</td>
                    <td className="px-2 text-right font-mono font-bold text-[12px] border-r border-[#c4c6cf] text-[#aa3531]">
                      {mov.debit > 0 ? formatCurrency(mov.debit) : '-'}
                    </td>
                    <td className="px-2 text-right font-mono font-bold text-[12px] border-r border-[#c4c6cf] text-[#002046]">
                      {mov.credit > 0 ? formatCurrency(mov.credit) : '-'}
                    </td>
                    <td className="px-2 text-right font-mono font-black text-[12px] border-r border-[#c4c6cf] bg-[#f1f4f8] text-[#181c1f]">
                      {formatCurrency(mov.balance)}
                    </td>
                    {/* Delete movement button */}
                    <td className="px-2 text-center bg-[#fceeed]/40">
                      <button
                        onClick={() => {
                          setMovementToDelete(mov);
                          setDeletePassword('');
                          setIsDeleteModalOpen(true);
                        }}
                        className="p-0.5 text-[#aa3531] hover:text-[#891c1d] hover:bg-[#fceeed] rounded-full transition-colors cursor-pointer"
                        title="Eliminar movimiento"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Dynamic Multi-Receipt Action Bar */}
        {selectedMovementIds.length > 0 && (
          <div className="bg-[#d6e3ff] border-t border-[#74777f] p-2 flex items-center justify-between text-[12px] font-sans">
            <div className="flex items-center gap-3">
              <span className="font-bold text-[#002046]">
                🧾 MOVIMIENTOS SELECCIONADOS:{' '}
                <strong className="font-mono text-[12px] bg-[#002046] text-white px-2 py-0.5 rounded-sm">
                  {selectedMovementIds.length}
                </strong>
              </span>
              <span className="text-[#002046]/40">|</span>
              <span className="font-bold text-[#002046]">
                SUMA TOTAL A FACTURAR:{' '}
                <strong className="text-[#aa3531] font-mono text-[14px] bg-white px-2 py-0.5 border border-[#aa3531]">
                  {formatCurrency(
                    selectedMovementsForInvoice.reduce((sum, m) => sum + (m.debit > 0 ? m.debit : m.credit), 0)
                  )}
                </strong>
              </span>
            </div>

            <button
              onClick={() => {
                const isRespInscripto = selectedCustomer?.vatCondition === 'Resp. Inscripto' || (selectedCustomer?.vatCondition as any) === 'Responsable Inscripto';
                setCbteTipo(isRespInscripto ? 1 : 6);
                setIsBatchInvoiceModalOpen(true);
              }}
              className="h-[28px] px-4 bg-[#002046] hover:bg-[#1b365d] text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer shadow-sm animate-pulse"
            >
              <FileText className="w-3.5 h-3.5 text-[#aec7f7]" />
              <span>FACTURAR LOTES SELECCIONADOS ({selectedMovementIds.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal to Register Payment */}
      <WindowsModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`REGISTRAR COBRANZA A CUENTA CORRIENTE - ${selectedCustomer?.name || selectedEmployee?.name}`}
        maxWidth="max-w-md"
      >
        <div className="flex flex-col gap-2.5 p-2 text-[12px]">
          <div className="bg-white p-2 border border-[#c4c6cf] flex flex-col">
            <span className="font-bold text-[#002046]">
              Titular: {selectedCustomer?.name || selectedEmployee?.name}
            </span>
            <span className="text-[11px] text-[#44474e]">
              Saldo adeudado actual:{' '}
              <strong className="text-[#aa3531] font-mono">
                {formatCurrency(
                  accountType === 'CLIENTE'
                    ? selectedCustomer?.currentBalance || 0
                    : selectedEmployee?.currentBalance || 0
                )}
              </strong>
            </span>
          </div>

          <div>
            <label className="font-bold text-[#002046] block mb-0.5">Importe del Pago ($):</label>
            <input
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="w-full h-[28px] px-2 bg-white border border-[#74777f] font-mono text-[15px] font-black text-[#002046] focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="font-bold text-[#181c1f] block mb-0.5">N° Recibo / Comprobante:</label>
            <input
              type="text"
              value={paymentVoucher}
              onChange={(e) => setPaymentVoucher(e.target.value)}
              className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold"
            />
          </div>

          <div>
            <label className="font-bold text-[#181c1f] block mb-0.5">Concepto / Detalle:</label>
            <input
              type="text"
              value={paymentConcept}
              onChange={(e) => setPaymentConcept(e.target.value)}
              className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#c4c6cf] mt-2">
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(false)}
              className="h-[26px] px-3 bg-[#ebeef2] border border-[#74777f] text-[11px] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleRegisterPayment}
              className="h-[26px] px-4 bg-[#aa3531] hover:bg-[#891c1d] text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Confirmar Cobranza</span>
            </button>
          </div>
        </div>
      </WindowsModal>

      {/* Modal to Register Advance / Vale for Employees */}
      <WindowsModal
        isOpen={isAdvanceModalOpen}
        onClose={() => setIsAdvanceModalOpen(false)}
        title={`REGISTRAR ADELANTO / VALE DE EFECTIVO - ${selectedEmployee?.name}`}
        maxWidth="max-w-md"
      >
        <div className="flex flex-col gap-2.5 p-2 text-[12px] font-sans">
          <div className="bg-white p-2 border border-[#c4c6cf] flex flex-col">
            <span className="font-bold text-[#002046]">
              Empleado: {selectedEmployee?.name} (Legajo {selectedEmployee?.legajo})
            </span>
            <span className="text-[11px] text-[#44474e] mt-0.5">
              Saldo Retirado / Vales acumulado:{' '}
              <strong className="text-[#aa3531] font-mono">
                {formatCurrency(selectedEmployee?.currentBalance || 0)}
              </strong>
            </span>
            <span className="text-[10px] text-[#74777f]">
              Límite de Anticipo: {formatCurrency(1000000)} (Disponible: {formatCurrency(1000000 - (selectedEmployee?.currentBalance || 0))})
            </span>
          </div>

          <div>
            <label className="font-bold text-[#002046] block mb-0.5">Importe del Adelanto / Vale ($):</label>
            <input
              type="number"
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(e.target.value)}
              className="w-full h-[28px] px-2 bg-white border border-[#74777f] font-mono text-[15px] font-black text-[#002046] focus:outline-none"
              placeholder="0.00"
              autoFocus
            />
          </div>

          <div>
            <label className="font-bold text-[#181c1f] block mb-0.5">N° Vale / Comprobante:</label>
            <input
              type="text"
              value={advanceVoucher}
              onChange={(e) => setAdvanceVoucher(e.target.value)}
              className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold"
              placeholder={`VAL-${Math.floor(100000 + Math.random() * 900000)}`}
            />
          </div>

          <div>
            <label className="font-bold text-[#181c1f] block mb-0.5">Concepto / Detalle:</label>
            <input
              type="text"
              value={advanceConcept}
              onChange={(e) => setAdvanceConcept(e.target.value)}
              className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
              placeholder="Vale de Efectivo / Adelanto de Sueldo"
            />
          </div>

          <div className="bg-[#e2ecc8] p-2 border border-[#74777f]/30 text-[10px] text-[#2d4d18] flex flex-col gap-0.5 font-sans rounded-sm">
            <strong>⚡ Integración con Caja Registradora Automatizada:</strong>
            <span>1. Esto incrementará la deuda interna del empleado, acumulada automáticamente para su deducción de sueldo.</span>
            <span>2. <strong>¡AUTOMÁTICO!</strong> El sistema registrará de forma automática un movimiento de <strong>EGRESO</strong> de caja en la sucursal activa con el concepto *"Vale Empleado: [Nombre]"*, manteniendo el arqueo de billetes físicos perfecto sin trabajo extra.</span>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#c4c6cf] mt-2">
            <button
              type="button"
              onClick={() => setIsAdvanceModalOpen(false)}
              className="h-[26px] px-3 bg-[#ebeef2] border border-[#74777f] text-[11px] cursor-pointer font-bold"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleRegisterAdvance}
              className="h-[26px] px-4 bg-[#002046] hover:bg-[#112a4d] text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <DollarSign className="w-3.5 h-3.5 text-[#aec7f7]" />
              <span>Confirmar Adelanto</span>
            </button>
          </div>
        </div>
      </WindowsModal>

      {/* Modal to Confirm Deletion of Movement */}
      <WindowsModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletePassword('');
          setMovementToDelete(null);
        }}
        title="AUTORIZAR ELIMINACIÓN DE MOVIMIENTO"
        maxWidth="max-w-md"
      >
        <div className="flex flex-col gap-3 p-3 text-[12px] font-sans select-none">
          <div className="bg-[#fceeed] border border-[#aa3531] p-2.5 text-[#aa3531] flex flex-col gap-1 rounded-sm">
            <span className="font-bold uppercase text-[11px] flex items-center gap-1">
              ⚠️ ADVERTENCIA CRÍTICA:
            </span>
            <span>Esta acción es irreversible y eliminará el registro histórico de cuenta corriente.</span>
            <span>El saldo actual del titular será recalculado de forma automática en el sistema.</span>
          </div>

          {movementToDelete && (
            <div className="bg-[#f0f2f5] p-2.5 border border-[#c4c6cf] flex flex-col gap-1 rounded-sm font-sans">
              <div>
                <span className="font-bold text-[#44474e]">COMPROBANTE:</span>{' '}
                <span className="font-mono font-bold text-[#002046]">{movementToDelete.voucher}</span>
              </div>
              <div>
                <span className="font-bold text-[#44474e]">CONCEPTO / DETALLE:</span>{' '}
                <span>{movementToDelete.concept}</span>
              </div>
              <div>
                <span className="font-bold text-[#44474e]">FECHA / HORA:</span>{' '}
                <span className="font-mono text-[#44474e]">{movementToDelete.date}</span>
              </div>
              <div>
                <span className="font-bold text-[#44474e]">IMPORTE NETO RECALCULABLE:</span>{' '}
                <span className="font-mono font-black text-sm text-[#aa3531]">
                  {formatCurrency(movementToDelete.debit > 0 ? movementToDelete.debit : movementToDelete.credit)}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="font-bold text-[#002046] block">Contraseña de Autorización:</label>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-[32px] px-2 bg-white border border-[#74777f] font-mono text-[16px] text-center tracking-widest focus:outline-none font-bold"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#c4c6cf] mt-1">
            <button
              type="button"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeletePassword('');
                setMovementToDelete(null);
              }}
              className="h-[28px] px-3 bg-[#ebeef2] border border-[#74777f] text-[11px] cursor-pointer font-bold text-[#181c1f]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteMovement}
              className="h-[28px] px-4 bg-[#aa3531] hover:bg-[#891c1d] text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Autorizar y Eliminar</span>
            </button>
          </div>
        </div>
      </WindowsModal>

      {/* Multi-Receipt/Batch Invoice Review & Authorize Modal */}
      <WindowsModal
        isOpen={isBatchInvoiceModalOpen}
        onClose={() => setIsBatchInvoiceModalOpen(false)}
        title="CORROBORACIÓN Y EMISIÓN DE FACTURA ELECTRÓNICA LOTES"
        maxWidth="max-w-2xl"
      >
        <div className="flex flex-col gap-3 p-3 text-[11px] select-none font-sans bg-[#ebeef2]">
          {/* Top AFIP Banner Info */}
          <div className="bg-[#002046] text-white p-2.5 flex items-center justify-between border-b-2 border-[#aec7f7]">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-[#aec7f7]" />
              <div>
                <div className="font-bold text-[12px]">SUCURSAL DE EMISIÓN: {currentBranch.name}</div>
                <div className="text-[10px] text-[#aec7f7] font-mono">CUIT: {arcaConfig?.cuit || currentBranch.cuit || '30-71489201-9'}</div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[#aec7f7] block font-bold">PUNTO DE VENTA</span>
              <span className="font-mono font-black text-sm bg-white text-[#002046] px-2 py-0.5">
                PV {pointOfSale}
              </span>
            </div>
          </div>

          {/* 1. Select Invoice Type A or B & Print Format */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {/* 1A. Select Invoice Type A or B */}
            <div className="bg-white p-2.5 border border-[#74777f] shadow-sm flex flex-col gap-1.5 justify-center">
              <span className="font-bold text-[#002046] text-[10px] uppercase">
                1. Selección del Comprobante Fiscal Oficial:
              </span>
              <div className="grid grid-cols-2 gap-2 mt-0.5">
                <button
                  type="button"
                  onClick={() => setCbteTipo(6)}
                  className={`h-[32px] px-2 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer border ${
                    cbteTipo === 6
                      ? 'bg-[#002046] text-white border-[#002046]'
                      : 'bg-white text-[#44474e] border-[#74777f] hover:bg-[#f0f2f5]'
                  }`}
                >
                  <div className="w-4 h-4 flex items-center justify-center bg-[#aec7f7] text-[#002046] font-black rounded-full text-[11px]">B</div>
                  <div className="text-left leading-none">
                    <div className="font-bold">FACTURA B</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const isRespInscripto = selectedCustomer?.vatCondition === 'Resp. Inscripto' || (selectedCustomer?.vatCondition as any) === 'Responsable Inscripto';
                    if (!isRespInscripto && accountType === 'CLIENTE') {
                      showAlert('REGLA AFIP: Factura A solo permitida para clientes inscriptos con CUIT.');
                      return;
                    }
                    setCbteTipo(1);
                  }}
                  disabled={accountType === 'EMPLEADO' || (accountType === 'CLIENTE' && selectedCustomer?.vatCondition !== 'Resp. Inscripto' && (selectedCustomer?.vatCondition as any) !== 'Responsable Inscripto')}
                  className={`h-[32px] px-2 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer border disabled:opacity-40 disabled:cursor-not-allowed ${
                    cbteTipo === 1
                      ? 'bg-[#002046] text-white border-[#002046]'
                      : 'bg-white text-[#44474e] border-[#74777f] hover:bg-[#f0f2f5]'
                  }`}
                >
                  <div className="w-4 h-4 flex items-center justify-center bg-[#aec7f7] text-[#002046] font-black rounded-full text-[11px]">A</div>
                  <div className="text-left leading-none">
                    <div className="font-bold">FACTURA A</div>
                  </div>
                </button>
              </div>
            </div>

            {/* 1B. Select Ticket Format 80mm or A4 */}
            <div className="bg-white p-2.5 border border-[#74777f] shadow-sm flex flex-col gap-1.5 justify-center">
              <span className="font-bold text-[#002046] text-[10px] uppercase">
                2. Formato de Previsualización:
              </span>
              <div className="grid grid-cols-2 gap-2 mt-0.5">
                <button
                  type="button"
                  onClick={() => setPrintFormat('A4')}
                  className={`h-[32px] px-2 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer border ${
                    printFormat === 'A4'
                      ? 'bg-[#002046] text-white border-[#002046]'
                      : 'bg-white text-[#44474e] border-[#74777f] hover:bg-[#f0f2f5]'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Hoja A4 Oficial</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintFormat('TICKET_80MM')}
                  className={`h-[32px] px-2 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer border ${
                    printFormat === 'TICKET_80MM'
                      ? 'bg-[#002046] text-white border-[#002046]'
                      : 'bg-white text-[#44474e] border-[#74777f] hover:bg-[#f0f2f5]'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Ticket 80 mm</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. Visual AFIP Mockup Invoice "Corroboración" */}
          {ticketPreviewData && (
            <TicketPreview
              data={ticketPreviewData}
              branch={currentBranch}
              format={printFormat === 'A4' ? 'A4' : 'TICKET'}
              height="380px"
            />
          )}

          {/* Action buttons inside Batch review */}
          <div className="flex justify-end gap-2 pt-2 border-t border-[#c4c6cf]">
            <button
              type="button"
              onClick={() => setIsBatchInvoiceModalOpen(false)}
              disabled={isBatchSubmitting}
              className="h-[30px] px-3 bg-[#ebeef2] border border-[#74777f] text-[11px] cursor-pointer font-bold disabled:opacity-50"
            >
              Cancelar y Corregir
            </button>
            <button
              type="button"
              onClick={handleEmitBatchInvoice}
              disabled={isBatchSubmitting}
              className="h-[30px] px-4 bg-[#002046] hover:bg-[#1b365d] text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Receipt className="w-4 h-4 text-[#aec7f7]" />
              <span>{isBatchSubmitting ? 'Comunicando con ARCA WSFE...' : 'Enviar Facturación Oficial a ARCA/AFIP'}</span>
            </button>
          </div>
        </div>
      </WindowsModal>

      {/* Modal: Detalle de Productos del Recibo */}
      <WindowsModal
        isOpen={selectedSaleForDetail !== null}
        onClose={() => setSelectedSaleForDetail(null)}
        title={`Detalle de Comprobante / Recibo: ${selectedSaleForDetail?.ticketNumber || selectedSaleForDetail?.id || ''}`}
        icon={<Receipt className="w-4 h-4 text-[#aec7f7]" />}
        maxWidth="max-w-2xl"
      >
        {selectedSaleForDetail && (
          <div className="flex flex-col gap-3 p-1 text-black font-sans">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-2 bg-[#f0f2f5] p-3 border border-black/20 text-xs">
              <div>
                <strong>Nº Comprobante:</strong> {selectedSaleForDetail.ticketNumber || selectedSaleForDetail.id}
              </div>
              <div>
                <strong>Fecha/Hora:</strong>{' '}
                {selectedSaleForDetail.createdAt
                  ? new Date(selectedSaleForDetail.createdAt).toLocaleString('es-AR')
                  : '--'}
              </div>
              <div>
                <strong>Cliente:</strong> {selectedSaleForDetail.customerName || 'Consumidor Final'}
              </div>
              <div>
                <strong>Medio de Pago:</strong>{' '}
                <span className="font-bold text-[#002046]">
                  {selectedSaleForDetail.paymentMethod?.replace(/_/g, ' ') || 'EFECTIVO'}
                </span>
              </div>
              <div>
                <strong>Tipo de Ticket:</strong>{' '}
                {selectedSaleForDetail.invoiceType === 'RECIBO_COMUN'
                  ? 'RECIBO COMÚN / TICKET INTERNO'
                  : selectedSaleForDetail.invoiceType || 'RECIBO'}
              </div>
              <div>
                <strong>Sucursal:</strong> {selectedSaleForDetail.branchId || currentBranch.id}
              </div>
            </div>

            {/* Items Table */}
            <div className="border border-black/30 overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="bg-[#e5e8ec] border-b border-black/30 font-bold h-7">
                    <th className="px-2">Código</th>
                    <th className="px-2">Descripción</th>
                    <th className="px-2 text-right">Cant/Peso</th>
                    <th className="px-2 text-right">Precio Unit.</th>
                    <th className="px-2 text-right">Desc.</th>
                    <th className="px-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 bg-white">
                  {Array.isArray(selectedSaleForDetail.items) && selectedSaleForDetail.items.length > 0 ? (
                    selectedSaleForDetail.items.map((item: any, idx: number) => {
                      const qtyStr = item.weight
                        ? `${item.weight} Kg`
                        : item.quantity
                        ? `${item.quantity} Unid`
                        : '1 Unid';
                      return (
                        <tr key={`act-item-${item.id || item.code || idx}-${idx}`} className="h-6 hover:bg-gray-50">
                          <td className="px-2 text-[#555]">{item.code || '--'}</td>
                          <td className="px-2 font-sans font-bold">{item.description}</td>
                          <td className="px-2 text-right font-bold">{qtyStr}</td>
                          <td className="px-2 text-right">{formatCurrency(item.unitPrice)}</td>
                          <td className="px-2 text-right text-[#aa3531]">
                            {item.discountPercent ? `${item.discountPercent}%` : '-'}
                          </td>
                          <td className="px-2 text-right font-bold text-[#002046]">
                            {formatCurrency(item.subtotal)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-gray-500 italic">
                        No hay detalles cargados para este comprobante.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary Totals */}
            <div className="flex justify-end font-mono">
              <div className="w-[260px] border border-black/20 p-2.5 bg-[#f0f2f5] text-right font-bold text-xs flex flex-col gap-1">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(selectedSaleForDetail.subtotal || selectedSaleForDetail.total)}</span>
                </div>
                {selectedSaleForDetail.employeeDiscountAmount > 0 && (
                  <div className="flex justify-between text-[#aa3531]">
                    <span>Desc. Empleado ({selectedSaleForDetail.employeeDiscountPercent}%):</span>
                    <span>-{formatCurrency(selectedSaleForDetail.employeeDiscountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black border-t border-black/30 pt-1 text-[#002046]">
                  <span>Total Facturado:</span>
                  <span>{formatCurrency(selectedSaleForDetail.total)}</span>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-black/10">
              <button
                type="button"
                onClick={() => setSelectedSaleForDetail(null)}
                className="h-[30px] px-4 bg-[#002046] hover:bg-[#1b365d] text-white font-bold text-[11px] cursor-pointer"
              >
                Entendido / Cerrar
              </button>
            </div>
          </div>
        )}
      </WindowsModal>
    </div>
  );
};

