import React, { useState, useMemo, useEffect } from 'react';
import {
  Receipt,
  FileText,
  Printer,
  Plus,
  Trash2,
  Check,
  Building,
  User,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  FileMinus,
  Settings,
  FileSpreadsheet,
  CheckCircle,
  Eye,
  Clock,
  ShieldCheck,
  UserPlus,
  FileCheck,
} from 'lucide-react';
import {
  Customer,
  Product,
  BranchConfig,
  UserAccount,
  ElectronicInvoice,
  ElectronicInvoiceItem,
  ArcaConfig,
  AuditLog,
  ArcaCbteTipo,
} from '../../types/pos';
import { formatCurrency, formatWeight } from '../../utils/scaleParser';
import { useDialog } from '../../context/DialogContext';
import { useFirebase } from '../../context/FirebaseContext';
import { arcaService } from '../../services/arcaService';
import { InvoicePrintModal } from './InvoicePrintModal';
import { CreditNoteModal } from './CreditNoteModal';
import { ArcaConfigModal } from '../config/ArcaConfigModal';
import { LibroIvaVentasScreen } from '../reports/LibroIvaVentasScreen';
import { CustomerSelectModal } from '../pos/CustomerSelectModal';
import { CustomerArcaQuickModal } from './CustomerArcaQuickModal';
import { resolveBranchForInvoice } from '../../utils/branchHelper';
import { LastVouchersModal } from './LastVouchersModal';

interface InvoicingScreenProps {
  customers: Customer[];
  products: Product[];
  currentBranch: BranchConfig;
  currentUser: UserAccount;
  branches?: BranchConfig[];
  invoices?: ElectronicInvoice[];
  arcaConfig?: ArcaConfig;
  auditLogs?: AuditLog[];
  onSaveInvoice?: (inv: ElectronicInvoice) => Promise<void>;
  onSaveArcaConfig?: (cfg: ArcaConfig) => Promise<void>;
  onSaveCustomer?: (c: Customer) => Promise<void>;
  onAddAuditLog?: (log: AuditLog) => Promise<void>;
  onOpenLibroIva?: () => void;
}

export const InvoicingScreen: React.FC<InvoicingScreenProps> = ({
  customers,
  products,
  currentBranch,
  currentUser,
  branches: propBranches,
  invoices: propInvoices,
  arcaConfig: propArcaConfig,
  auditLogs: propAuditLogs,
  onSaveInvoice: propOnSaveInvoice,
  onSaveArcaConfig: propOnSaveArcaConfig,
  onSaveCustomer: propOnSaveCustomer,
  onAddAuditLog: propOnAddAuditLog,
  onOpenLibroIva,
}) => {
  const { showAlert } = useDialog();
  const fb = useFirebase();

  const branches =
    propBranches ||
    ([fb.branchConfigs?.['NECO 1'], fb.branchConfigs?.['NECO 2']].filter(
      (b): b is BranchConfig => Boolean(b)
    ).length > 0
      ? [fb.branchConfigs?.['NECO 1'], fb.branchConfigs?.['NECO 2']].filter(
          (b): b is BranchConfig => Boolean(b)
        )
      : [currentBranch]);

  const invoices = propInvoices || fb.electronicInvoices || [];
  const arcaConfig = propArcaConfig || fb.arcaConfig || {
    cuit: '---',
    companyName: '---',
    vatCondition: 'Responsable Inscripto',
    environment: 'homologacion',
    pointsOfSale: { 'NECO 1': '0017', 'NECO 2': '0018' },
    connected: false
  };
  const auditLogs = propAuditLogs || fb.auditLogs || [];
  const onSaveInvoice = propOnSaveInvoice || fb.saveElectronicInvoice;
  const onSaveArcaConfig = propOnSaveArcaConfig || fb.saveArcaConfig;
  const onSaveCustomer = propOnSaveCustomer || fb.saveCustomer;
  const onAddAuditLog = propOnAddAuditLog || fb.addAuditLog;

  const isCashier = currentUser?.role === 'CAJERO';

  const [activeTab, setActiveTab] = useState<'LISTA' | 'NUEVA_MANUAL' | 'NOTAS_CREDITO' | 'LIBRO_IVA' | 'AUDITORIA'>('LISTA');

  // Si el usuario es cajero, no permitir acceso a pestañas contables ni de auditoría fiscal
  useEffect(() => {
    if (isCashier && (activeTab === 'LIBRO_IVA' || activeTab === 'AUDITORIA')) {
      setActiveTab('LISTA');
    }
  }, [isCashier, activeTab]);

  // Filters for Comprobantes
  const [filterBranch, setFilterBranch] = useState<string>('TODAS');
  const [filterType, setFilterType] = useState<string>('TODOS');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected invoice for Print Modal
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<ElectronicInvoice | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);

  // Determinar la sucursal de emisión del comprobante seleccionado para impresión (estricta por PV o branchId)
  const invoiceBranch = useMemo(() => {
    return resolveBranchForInvoice(selectedInvoiceForPrint, branches, currentBranch);
  }, [selectedInvoiceForPrint, branches, currentBranch]);

  // Selected invoice for Credit Note Modal
  const [selectedInvoiceForNC, setSelectedInvoiceForNC] = useState<ElectronicInvoice | null>(null);
  const [isNCModalOpen, setIsNCModalOpen] = useState<boolean>(false);

  // Arca Config Modal
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [isLastVouchersModalOpen, setIsLastVouchersModalOpen] = useState<boolean>(false);

  // Manual Invoicing State
  // Rule 4: automatic point of sale from branch/arcaConfig (customizable)
  const pointOfSale =
    currentBranch.pointOfSale ||
    arcaConfig?.pointsOfSale?.[currentBranch.id as 'NECO 1' | 'NECO 2'] ||
    '0001';
  const DEFAULT_CONSUMIDOR_FINAL: Customer = {
    code: 'CF-0001',
    name: 'Consumidor Final',
    dniCuit: '00-00000000-0',
    address: 'S/D',
    vatCondition: 'Cons. Final',
    phone: '',
    email: '',
    currentBalance: 0,
    creditLimit: 0,
    status: 'AL_DIA',
    notes: 'Consumidor Final Mostrador',
  };

  const allCustomers = useMemo(() => {
    const list = [...customers];
    const hasCf = list.some(
      (c) => c.code === 'CF-0001' || c.name.toLowerCase().includes('consumidor final')
    );
    if (!hasCf) {
      list.unshift(DEFAULT_CONSUMIDOR_FINAL);
    }
    return list;
  }, [customers]);

  // Default customer is strictly Consumidor Final
  const [selectedCustomerCode, setSelectedCustomerCode] = useState<string>(() => {
    const cf = customers.find(
      (c) => c.code === 'CF-0001' || c.name.toLowerCase().includes('consumidor final')
    );
    return cf?.code || 'CF-0001';
  });

  // Manual Comprobante Type State: 1 = Factura A, 6 = Factura B
  const [manualCbteTipo, setManualCbteTipo] = useState<ArcaCbteTipo>(6);
  const [isCustomerSelectModalOpen, setIsCustomerSelectModalOpen] = useState<boolean>(false);
  const [isCustomerArcaModalOpen, setIsCustomerArcaModalOpen] = useState<boolean>(false);

  const [saleCondition, setSaleCondition] = useState<'CONTADO' | 'CUENTA_CORRIENTE'>('CONTADO');
  const [manualLines, setManualLines] = useState<ElectronicInvoiceItem[]>([]);
  const [selectedProductCode, setSelectedProductCode] = useState<string>(products[0]?.code || '');
  const [itemQtyOrWeight, setItemQtyOrWeight] = useState<string>('1.00');
  const [isSubmittingManual, setIsSubmittingManual] = useState<boolean>(false);

  const selectedCustomer =
    allCustomers.find((c) => c.code === selectedCustomerCode) ||
    allCustomers.find((c) => c.code === 'CF-0001') ||
    DEFAULT_CONSUMIDOR_FINAL;

  const isRespInscripto =
    selectedCustomer.vatCondition === 'Resp. Inscripto' ||
    (selectedCustomer.vatCondition as any) === 'Responsable Inscripto';

  // Automatically adapt comprobante type when customer is selected:
  // Responsable Inscripto -> Factura A (1)
  // Others -> Factura B (6)
  // (User can still manually switch between Factura A and B in the dropdown)
  useEffect(() => {
    if (isRespInscripto) {
      setManualCbteTipo(1);
    } else {
      setManualCbteTipo(6);
    }
  }, [selectedCustomerCode, isRespInscripto]);

  const currentCbteConfig =
    manualCbteTipo === 1
      ? { cbteTipo: 1 as ArcaCbteTipo, cbteLetra: 'A' as const, cbteNombre: 'Factura A' as const }
      : { cbteTipo: 6 as ArcaCbteTipo, cbteLetra: 'B' as const, cbteNombre: 'Factura B' as const };

  const handleSaveCustomer = async (newCustomer: Customer) => {
    if (propOnSaveCustomer) {
      await propOnSaveCustomer(newCustomer);
    } else if (fb?.saveCustomer) {
      await fb.saveCustomer(newCustomer);
    }
  };

  const manualNetTotal = manualLines.reduce((acc, l) => acc + l.netAmount, 0);
  const manualVat21 = manualLines
    .filter((l) => l.vatRate === 21)
    .reduce((acc, l) => acc + l.vatAmount, 0);
  const manualVat105 = manualLines
    .filter((l) => l.vatRate === 10.5)
    .reduce((acc, l) => acc + l.vatAmount, 0);
  const manualTotal = manualNetTotal + manualVat21 + manualVat105;

  const handleAddManualLine = () => {
    const prod = products.find((p) => p.code === selectedProductCode) || products[0];
    if (!prod) {
      showAlert('No hay productos seleccionados.');
      return;
    }
    const val = parseFloat(itemQtyOrWeight) || 1;
    const subtotal = Math.round(val * prod.price * 100) / 100;
    const net = Math.round((subtotal / 1.21) * 100) / 100;
    const vat = Math.round((subtotal - net) * 100) / 100;

    setManualLines((prev) => [
      ...prev,
      {
        productCode: prod.code,
        description: prod.description,
        unitType: prod.unitType,
        quantity: val,
        unitPrice: prod.price,
        vatRate: 21,
        netAmount: net,
        vatAmount: vat,
        totalAmount: subtotal,
      },
    ]);
  };

  const handleEmitManualInvoice = async () => {
    if (manualLines.length === 0) {
      await showAlert('Debe agregar al menos un artículo para facturar.');
      return;
    }

    if (manualCbteTipo === 1 && !isRespInscripto) {
      await showAlert(
        'ATENCIÓN ARCA: La Factura "A" sólo puede emitirse a clientes con CUIT y condición Responsable Inscripto. Si el cliente es Consumidor Final o Monotributista, emita Factura "B", o cargue un cliente Responsable Inscripto con [+ Nuevo Cliente / ARCA].'
      );
      return;
    }

    setIsSubmittingManual(true);

    try {
      const nextNum = arcaService.getNextNumber(invoices, pointOfSale, manualCbteTipo);

      const authRes = await arcaService.authorize({
        branchId: currentBranch.id,
        pointOfSale,
        cbteTipo: manualCbteTipo,
        cbteNumero: nextNum,
        customer: {
          name: selectedCustomer.name,
          cuitDni: selectedCustomer.dniCuit,
          vatCondition: selectedCustomer.vatCondition,
          address: selectedCustomer.address,
        },
        items: manualLines,
        netAmount: manualNetTotal,
        vatAmount: manualVat21 + manualVat105,
        totalAmount: manualTotal,
      });

      if (!authRes.success && authRes.status === 'RECHAZADO') {
        await showAlert(`Comprobante rechazado por ARCA: ${authRes.error}`);
        setIsSubmittingManual(false);
        return;
      }

      const formattedNumber = arcaService.formatCbteNumber(pointOfSale, nextNum);
      const today = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toLocaleTimeString('es-AR');

      const cleanDoc = selectedCustomer.dniCuit.replace(/\D/g, '');
      const docType = cleanDoc.length === 11 ? 80 : cleanDoc.length >= 7 ? 96 : 99;

      const newInv: ElectronicInvoice = {
        id: `INV-${pointOfSale}-${nextNum}-${Date.now()}`,
        branchId: currentBranch.id,
        pointOfSale,
        cbteTipo: manualCbteTipo,
        cbteLetra: currentCbteConfig.cbteLetra,
        cbteNombre: currentCbteConfig.cbteNombre,
        cbteNumero: nextNum,
        formattedNumber,
        date: today,
        time: timeStr,
        cae: authRes.cae || '74102948192039',
        caeVto: authRes.caeVto || new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
        qrUrl:
          authRes.qrUrl ||
          arcaService.buildArcaQrUrl(
            currentBranch.cuit,
            pointOfSale,
            manualCbteTipo,
            nextNum,
            manualTotal,
            docType,
            selectedCustomer.dniCuit,
            authRes.cae || '74102948192039',
            today
          ),
        customer: {
          name: selectedCustomer.name,
          cuitDni: selectedCustomer.dniCuit,
          docType,
          vatCondition:
            selectedCustomer.vatCondition === 'Resp. Inscripto'
              ? 'Resp. Inscripto'
              : selectedCustomer.vatCondition === 'Monotributo'
              ? 'Monotributo'
              : selectedCustomer.vatCondition === 'Exento'
              ? 'Exento'
              : 'Cons. Final',
          address: selectedCustomer.address || 'S/D',
        },
        items: [...manualLines],
        netAmount: manualNetTotal,
        vatAmount21: manualVat21,
        vatAmount105: manualVat105,
        exemptAmount: 0,
        totalAmount: manualTotal,
        status: authRes.status || 'AUTORIZADO',
        environment: authRes.environment || 'homologacion',
        operator: currentUser.fullName,
        createdAt: new Date().toISOString(),
      };

      await onSaveInvoice(newInv);
      await onAddAuditLog({
        id: `LOG-${Date.now()}`,
        date: today,
        time: timeStr,
        user: currentUser.fullName,
        branch: currentBranch.id,
        operation: `Emisión de ${currentCbteConfig.cbteNombre}`,
        comprobante: formattedNumber,
        pointOfSale,
        cae: newInv.cae,
        result: 'EXITOSO',
        details: `Cliente: ${selectedCustomer.name} - Total: ${formatCurrency(manualTotal)}`,
      });

      setManualLines([]);
      setSelectedCustomerCode('CF-0001');
      setManualCbteTipo(6);
      setSelectedInvoiceForPrint(newInv);
      setIsPrintModalOpen(true);
      setActiveTab('LISTA');
      await showAlert(`Comprobante emitido con éxito ante ARCA.\nNúmero: ${formattedNumber}\nCAE: ${newInv.cae}`);
    } catch (err: any) {
      await showAlert(`Error al emitir comprobante: ${err.message}`);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        activeTab === 'NUEVA_MANUAL' &&
        !isCustomerSelectModalOpen &&
        !isCustomerArcaModalOpen &&
        !isConfigModalOpen &&
        !isPrintModalOpen
      ) {
        if (e.key === 'F3') {
          e.preventDefault();
          setIsCustomerSelectModalOpen(true);
        } else if (e.key === 'F12' && !isSubmittingManual && manualLines.length > 0) {
          e.preventDefault();
          handleEmitManualInvoice();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTab,
    isCustomerSelectModalOpen,
    isCustomerArcaModalOpen,
    isConfigModalOpen,
    isPrintModalOpen,
    isSubmittingManual,
    manualLines.length,
  ]);

  const handleOpenPrint = (inv: ElectronicInvoice) => {
    setSelectedInvoiceForPrint(inv);
    setIsPrintModalOpen(true);
  };

  const handleOpenCreditNote = (inv: ElectronicInvoice) => {
    const isSuperOrAdmin = currentUser?.role === 'SUPERADMIN' || currentUser?.role === 'ADMIN';
    const canCancel = isSuperOrAdmin || currentUser?.permissions?.canCancelTickets !== false;

    if (!canCancel) {
      showAlert(`Acceso Denegado: Su perfil de usuario (${currentUser?.role}) no posee permisos para anular comprobantes o emitir Notas de Crédito.`);
      return;
    }
    setSelectedInvoiceForNC(inv);
    setIsNCModalOpen(true);
  };

  const handleCreditNoteCreated = async (nc: ElectronicInvoice) => {
    await onSaveInvoice(nc);

    // Update credited amount on original invoice
    if (selectedInvoiceForNC) {
      const updatedOriginal: ElectronicInvoice = {
        ...selectedInvoiceForNC,
        creditedAmount: (selectedInvoiceForNC.creditedAmount || 0) + nc.totalAmount,
      };
      await onSaveInvoice(updatedOriginal);
    }

    await onAddAuditLog({
      id: `LOG-${Date.now()}`,
      date: nc.date,
      time: nc.time,
      user: currentUser.fullName,
      branch: currentBranch.id,
      operation: `Emisión de ${nc.cbteNombre}`,
      comprobante: nc.formattedNumber,
      pointOfSale: nc.pointOfSale,
      cae: nc.cae,
      result: 'EXITOSO',
      details: `NC sobre Factura ${nc.associatedInvoiceNumber} - Motivo: ${nc.creditNoteReason} - Importe: ${formatCurrency(
        nc.totalAmount
      )}`,
    });

    setSelectedInvoiceForPrint(nc);
    setIsPrintModalOpen(true);
    await showAlert(`Nota de Crédito emitida con éxito ante ARCA.\nNúmero: ${nc.formattedNumber}\nCAE: ${nc.cae}`);
  };

  // Filtered invoices for list view
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const invBranchId = inv.branchId || (inv.pointOfSale === '0018' || inv.formattedNumber?.startsWith('0018') ? 'NECO 2' : 'NECO 1');
      if (filterBranch !== 'TODAS' && invBranchId !== filterBranch) return false;
      if (filterType !== 'TODOS' && inv.cbteNombre !== filterType) return false;
      if (activeTab === 'NOTAS_CREDITO' && inv.cbteTipo !== 3 && inv.cbteTipo !== 8) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesClient = inv.customer?.name?.toLowerCase().includes(q);
        const matchesCuit = inv.customer?.cuitDni?.includes(q);
        const matchesNum = inv.formattedNumber?.includes(q);
        const matchesCae = inv.cae?.includes(q);
        if (!matchesClient && !matchesCuit && !matchesNum && !matchesCae) return false;
      }

      return true;
    });
  }, [invoices, filterBranch, filterType, activeTab, searchQuery]);

  return (
    <div className="flex flex-col w-full h-[calc(100vh-80px)] select-none bg-[#ebeef2] text-[#181c1f] font-sans p-1">
      {/* Top Header */}
      <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm mb-1 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Receipt className="w-4 h-4 text-[#002046]" />
            <span className="font-bold text-[#002046] text-[13px]">
              MÓDULO DE FACTURACIÓN ELECTRÓNICA ARCA (EX AFIP)
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] border-l border-[#c4c6cf] pl-3">
            <span className="bg-[#f0f2f5] border border-[#c4c6cf] px-2 py-0.5 font-bold text-[#002046]">
              Sucursal: {currentBranch.name}
            </span>
            <span className="bg-[#d6e3ff] border border-[#002046] px-2 py-0.5 font-mono font-bold text-[#002046]">
              Pto. Venta Asignado: {pointOfSale}
            </span>
            <span className="flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 font-bold text-[10px]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>ARCA EN LÍNEA ({arcaConfig.environment.toUpperCase()})</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!isCashier && (
            <>
              <button
                onClick={() => setIsLastVouchersModalOpen(true)}
                className="h-[26px] px-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-600 text-[#002046] text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                title="Consultar en ARCA el último comprobante de Facturas A/B y Notas de Crédito (FECompUltimoAutorizado)"
              >
                <FileCheck className="w-3.5 h-3.5 text-amber-700" />
                <span>Últimos Comprobantes ARCA</span>
              </button>

              <button
                onClick={() => setIsConfigModalOpen(true)}
                className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#002046] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Configuración ARCA</span>
              </button>

              {onOpenLibroIva && (
                <button
                  onClick={onOpenLibroIva}
                  className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#002046] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Libro IVA Ventas</span>
                </button>
              )}
            </>
          )}

          <button
            onClick={() => setActiveTab('NUEVA_MANUAL')}
            className="h-[26px] px-3 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva Factura Manual [F12]</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center bg-[#e5e8ec] border border-[#74777f] border-b-0 px-1 pt-1 gap-1">
        <button
          onClick={() => setActiveTab('LISTA')}
          className={`h-[28px] px-4 text-[11px] font-bold border-t border-x border-[#74777f] flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'LISTA'
              ? 'bg-white text-[#002046] border-b-white -mb-px'
              : 'bg-[#d6d9de] text-[#44474e] hover:bg-[#e0e3e7]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Comprobantes Emitidos ({invoices.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('NOTAS_CREDITO')}
          className={`h-[28px] px-4 text-[11px] font-bold border-t border-x border-[#74777f] flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'NOTAS_CREDITO'
              ? 'bg-white text-[#aa3531] border-b-white -mb-px'
              : 'bg-[#d6d9de] text-[#44474e] hover:bg-[#e0e3e7]'
          }`}
        >
          <FileMinus className="w-3.5 h-3.5 text-[#aa3531]" />
          <span>
            Notas de Crédito ({invoices.filter((i) => i.cbteTipo === 3 || i.cbteTipo === 8).length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('NUEVA_MANUAL')}
          className={`h-[28px] px-4 text-[11px] font-bold border-t border-x border-[#74777f] flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'NUEVA_MANUAL'
              ? 'bg-white text-[#002046] border-b-white -mb-px'
              : 'bg-[#d6d9de] text-[#44474e] hover:bg-[#e0e3e7]'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Emisión Manual de Comprobante</span>
        </button>

        {!isCashier && (
          <>
            <button
              onClick={() => setActiveTab('LIBRO_IVA')}
              className={`h-[28px] px-4 text-[11px] font-bold border-t border-x border-[#74777f] flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'LIBRO_IVA'
                  ? 'bg-white text-[#002046] border-b-white -mb-px'
                  : 'bg-[#d6d9de] text-[#44474e] hover:bg-[#e0e3e7]'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Libro IVA Ventas (Régimen)</span>
            </button>

            <button
              onClick={() => setActiveTab('AUDITORIA')}
              className={`h-[28px] px-4 text-[11px] font-bold border-t border-x border-[#74777f] flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'AUDITORIA'
                  ? 'bg-white text-[#002046] border-b-white -mb-px'
                  : 'bg-[#d6d9de] text-[#44474e] hover:bg-[#e0e3e7]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Registro de Auditoría Fiscal ({auditLogs.length})</span>
            </button>
          </>
        )}
      </div>

      {/* Main Content Area */}
      <div className="bg-white border border-[#74777f] shadow-sm flex-1 flex flex-col overflow-hidden min-h-0">
        {activeTab === 'LISTA' || activeTab === 'NOTAS_CREDITO' ? (
          /* LIST OF INVOICES VIEW */
          <div className="flex flex-col h-full">
            {/* Filter Bar */}
            <div className="bg-[#f7fafe] p-2 border-b border-[#c4c6cf] flex items-center justify-between text-[11px] flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-[#181c1f]">Sucursal:</span>
                  <select
                    value={filterBranch}
                    onChange={(e) => setFilterBranch(e.target.value)}
                    className="h-[24px] px-1 bg-white border border-[#74777f] font-bold text-[#002046]"
                  >
                    <option value="TODAS">Todas las Sucursales</option>
                    <option value="NECO 1">
                      Neco 1 (PV {branches?.find((b) => b.id === 'NECO 1')?.pointOfSale || arcaConfig?.pointsOfSale?.['NECO 1'] || '0017'})
                    </option>
                    <option value="NECO 2">
                      Neco 2 (PV {branches?.find((b) => b.id === 'NECO 2')?.pointOfSale || arcaConfig?.pointsOfSale?.['NECO 2'] || '0018'})
                    </option>
                  </select>
                </div>

                {activeTab === 'LISTA' && (
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-[#181c1f]">Tipo:</span>
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="h-[24px] px-1 bg-white border border-[#74777f]"
                    >
                      <option value="TODOS">Todos los tipos</option>
                      <option value="Factura A">Factura A</option>
                      <option value="Factura B">Factura B</option>
                      <option value="Nota de Crédito A">Nota de Crédito A</option>
                      <option value="Nota de Crédito B">Nota de Crédito B</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1">
                <Search className="w-3.5 h-3.5 text-[#74777f]" />
                <input
                  type="text"
                  placeholder="Buscar cliente, CUIT, CAE o número..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-[24px] px-2 w-[240px] bg-white border border-[#74777f] text-[11px]"
                />
              </div>
            </div>

            {/* Invoices Table */}
            <div className="flex-1 overflow-y-auto overflow-x-auto">
              <table className="w-full min-w-max text-left border-collapse text-[11px] select-none whitespace-nowrap">
                <thead className="sticky top-0 bg-[#e5e8ec] text-[#181c1f] font-bold border-b border-[#74777f]">
                  <tr className="h-[28px] whitespace-nowrap">
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">FECHA</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">COMPROBANTE</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">SUCURSAL</th>
                    <th className="px-2 border-r border-[#c4c6cf] text-center whitespace-nowrap">PV</th>
                    <th className="px-3 border-r border-[#c4c6cf] text-center whitespace-nowrap">NÚMERO</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">CLIENTE</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">CUIT / DNI</th>
                    <th className="px-3 border-r border-[#c4c6cf] text-right whitespace-nowrap">NETO</th>
                    <th className="px-3 border-r border-[#c4c6cf] text-right whitespace-nowrap">IVA 21%</th>
                    <th className="px-3 border-r border-[#c4c6cf] text-right whitespace-nowrap bg-[#e0e3e7]">
                      TOTAL
                    </th>
                    <th className="px-3 border-r border-[#c4c6cf] text-center whitespace-nowrap">CAE</th>
                    <th className="px-3 text-center whitespace-nowrap">ACCIONES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebeef2]">
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-10 text-gray-500 italic">
                        No se registran comprobantes para los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => {
                      const isNc = inv.cbteTipo === 3 || inv.cbteTipo === 8;
                      const isFullyCredited =
                        (inv.creditedAmount || 0) >= inv.totalAmount && !isNc;

                      return (
                        <tr
                          key={inv.id}
                          className={`h-[28px] hover:bg-[#f1f4f8] whitespace-nowrap ${
                            isNc ? 'bg-[#fff5f5] text-[#aa3531]' : ''
                          }`}
                        >
                          <td className="px-3 font-mono whitespace-nowrap border-r border-[#c4c6cf]">{inv.date}</td>
                          <td className="px-3 border-r border-[#c4c6cf] font-bold whitespace-nowrap">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              {isNc ? (
                                <FileMinus className="w-3.5 h-3.5 text-[#aa3531] shrink-0" />
                              ) : (
                                <FileText className="w-3.5 h-3.5 text-[#002046] shrink-0" />
                              )}
                              <span className="whitespace-nowrap">{inv.cbteNombre}</span>
                            </div>
                          </td>
                          <td className="px-3 border-r border-[#c4c6cf] font-semibold text-[10px] whitespace-nowrap">
                            {inv.branchId}
                          </td>
                          <td className="px-2 text-center font-mono border-r border-[#c4c6cf] whitespace-nowrap">
                            {inv.pointOfSale}
                          </td>
                          <td className="px-3 text-center font-mono font-bold border-r border-[#c4c6cf] whitespace-nowrap">
                            {inv.formattedNumber}
                          </td>
                          <td className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">
                            <span className="font-semibold whitespace-nowrap">{inv.customer.name}</span>
                            {inv.associatedInvoiceNumber && (
                              <span className="text-[10px] text-gray-500 font-mono whitespace-nowrap ml-2">
                                (Cmp. Asoc: {inv.associatedInvoiceNumber})
                              </span>
                            )}
                          </td>
                          <td className="px-3 font-mono border-r border-[#c4c6cf] whitespace-nowrap">
                            {inv.customer.cuitDni}
                          </td>
                          <td className="px-3 text-right font-mono border-r border-[#c4c6cf] whitespace-nowrap">
                            {formatCurrency(inv.netAmount)}
                          </td>
                          <td className="px-3 text-right font-mono border-r border-[#c4c6cf] whitespace-nowrap">
                            {formatCurrency(inv.vatAmount21)}
                          </td>
                          <td
                            className={`px-3 text-right font-mono font-bold border-r border-[#c4c6cf] whitespace-nowrap ${
                              isNc ? 'text-[#aa3531] bg-[#ffebeb]' : 'text-[#002046] bg-[#f7fafe]'
                            }`}
                          >
                            {isNc ? `-${formatCurrency(inv.totalAmount)}` : formatCurrency(inv.totalAmount)}
                          </td>
                          <td className="px-3 text-center font-mono text-[10px] border-r border-[#c4c6cf] whitespace-nowrap">
                            {inv.cae}
                          </td>
                          <td className="px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                              <button
                                onClick={() => handleOpenPrint(inv)}
                                className="h-[22px] px-2 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#002046] font-bold text-[10px] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                title="Ver / Imprimir A4 o Térmica 80mm"
                              >
                                <Printer className="w-3 h-3 shrink-0" />
                                <span className="whitespace-nowrap">Imprimir</span>
                              </button>

                              {!isNc && (
                                <button
                                  onClick={() => handleOpenCreditNote(inv)}
                                  disabled={isFullyCredited}
                                  className="h-[22px] px-2 bg-[#fff5f5] hover:bg-[#ffebeb] border border-[#aa3531] text-[#aa3531] font-bold text-[10px] flex items-center gap-1 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                                  title={
                                    isFullyCredited
                                      ? 'Factura totalmente acreditada'
                                      : 'Emitir Nota de Crédito vinculada'
                                  }
                                >
                                  <FileMinus className="w-3 h-3 shrink-0" />
                                  <span className="whitespace-nowrap">{isFullyCredited ? 'Acreditada' : 'Emitir NC'}</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Strip Summary */}
            <div className="bg-[#e0e3e7] border-t border-[#74777f] p-2 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-3">
                <span>
                  Total Comprobantes: <strong>{filteredInvoices.length}</strong>
                </span>
                <span className="text-[#c4c6cf]">|</span>
                <span>
                  Facturas A:{' '}
                  <strong>{filteredInvoices.filter((i) => i.cbteTipo === 1).length}</strong>
                </span>
                <span className="text-[#c4c6cf]">|</span>
                <span>
                  Facturas B:{' '}
                  <strong>{filteredInvoices.filter((i) => i.cbteTipo === 6).length}</strong>
                </span>
                <span className="text-[#c4c6cf]">|</span>
                <span className="text-[#aa3531]">
                  Notas de Crédito:{' '}
                  <strong>
                    {filteredInvoices.filter((i) => i.cbteTipo === 3 || i.cbteTipo === 8).length}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-[#002046]">IMPORTE TOTAL LISTADO:</span>
                <span className="bg-[#002046] text-white px-3 py-1 font-mono font-bold text-sm">
                  {formatCurrency(
                    filteredInvoices.reduce(
                      (acc, i) =>
                        acc + (i.cbteTipo === 3 || i.cbteTipo === 8 ? -i.totalAmount : i.totalAmount),
                      0
                    )
                  )}
                </span>
              </div>
            </div>
          </div>
        ) : activeTab === 'NUEVA_MANUAL' ? (
          /* MANUAL INVOICING CREATION VIEW */
          <div className="flex flex-col h-full p-2 gap-2 overflow-y-auto">
            <div className="bg-[#f7fafe] p-2.5 border border-[#74777f] flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-[#c4c6cf] pb-1.5">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-[#002046]" />
                  <span className="font-bold text-[#002046] text-[12px] uppercase">
                    DATOS DE CABECERA DEL COMPROBANTE FISCAL
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#44474e]">Punto de Venta Oficial:</span>
                  <span className="font-mono font-black bg-[#002046] text-white px-2 py-0.5 text-xs">
                    PV {pointOfSale} ({currentBranch.id})
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {/* Comprobante Type Selector (Factura A / Factura B) */}
                <div>
                  <label className="font-bold text-[#002046] block mb-0.5">
                    Tipo de Comprobante Fiscal:
                  </label>
                  <select
                    value={manualCbteTipo}
                    onChange={(e) => {
                      const tipo = Number(e.target.value) as ArcaCbteTipo;
                      setManualCbteTipo(tipo);
                    }}
                    className="w-full h-[26px] px-2 bg-white border border-[#002046] font-bold text-[#002046] text-[11.5px] cursor-pointer"
                  >
                    <option value={6}>Factura B (Letra B) - Cód. 006</option>
                    <option value={1}>Factura A (Letra A) - Cód. 001</option>
                  </select>
                  <span className="text-[9.5px] text-[#44474e] block mt-0.5 font-medium">
                    {manualCbteTipo === 1
                      ? 'Discrimina IVA 21% (Requiere CUIT RI)'
                      : 'Precio final (Cons. Final / Monotributo)'}
                  </span>
                </div>

                {/* Customer Selector with quick buttons */}
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="font-bold text-[#181c1f]">
                      Cliente Destinatario:
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const cf = allCustomers.find((c) => c.code === 'CF-0001') || DEFAULT_CONSUMIDOR_FINAL;
                          setSelectedCustomerCode(cf.code);
                          setManualCbteTipo(6);
                        }}
                        className={`px-1.5 py-0.5 text-[9.5px] font-bold border cursor-pointer ${
                          selectedCustomer.code === 'CF-0001'
                            ? 'bg-[#002046] text-white border-[#002046]'
                            : 'bg-[#f0f2f5] hover:bg-[#e2e7ef] text-[#002046] border-[#74777f]'
                        }`}
                        title="Restablecer a Consumidor Final predeterminado"
                      >
                        Consumidor Final
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsCustomerSelectModalOpen(true)}
                        className="px-1.5 py-0.5 bg-[#f0f2f5] hover:bg-[#e2e7ef] text-[#002046] text-[9.5px] font-bold border border-[#74777f] flex items-center gap-1 cursor-pointer"
                        title="Buscar clientes cargados en el sistema [F3]"
                      >
                        <Search className="w-2.5 h-2.5" />
                        <span>Buscar [F3]</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsCustomerArcaModalOpen(true)}
                        className="px-1.5 py-0.5 bg-[#002046] hover:bg-[#1b365d] text-white text-[9.5px] font-bold border border-[#002046] flex items-center gap-1 cursor-pointer shadow-2xs"
                        title="Registrar nuevo cliente y consultar CUIT en ARCA"
                      >
                        <UserPlus className="w-2.5 h-2.5" />
                        <span>+ Nuevo / ARCA</span>
                      </button>
                    </div>
                  </div>

                  <select
                    value={selectedCustomerCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      setSelectedCustomerCode(code);
                      const cust = allCustomers.find((c) => c.code === code);
                      if (cust) {
                        if (
                          cust.vatCondition === 'Resp. Inscripto' ||
                          (cust.vatCondition as any) === 'Responsable Inscripto'
                        ) {
                          setManualCbteTipo(1);
                        } else {
                          setManualCbteTipo(6);
                        }
                      }
                    }}
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold text-[11px]"
                  >
                    {allCustomers.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} - {c.name} ({c.vatCondition}) - {c.dniCuit}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sale Condition */}
                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">
                    Condición de Venta:
                  </label>
                  <select
                    value={saleCondition}
                    onChange={(e) => setSaleCondition(e.target.value as any)}
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
                  >
                    <option value="CONTADO">Contado / Transferencia</option>
                    <option value="CUENTA_CORRIENTE">Cuenta Corriente Comercial</option>
                  </select>
                </div>
              </div>

              {/* Customer Strip */}
              <div className="bg-white p-2 border border-[#c4c6cf] flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#002046]">{selectedCustomer.name}</span>
                  <span className="text-[#c4c6cf]">|</span>
                  <span className="font-mono text-[#44474e]">CUIT/DNI: {selectedCustomer.dniCuit}</span>
                  <span className="text-[#c4c6cf]">|</span>
                  <span>Domicilio: {selectedCustomer.address || 'S/D'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold font-mono px-2 py-0.5 bg-[#d6e3ff] text-[#002046]">
                    {selectedCustomer.vatCondition}
                  </span>
                  {manualCbteTipo === 1 && !isRespInscripto && (
                    <span className="text-[10px] font-bold text-[#aa3531] bg-[#fff0f0] px-1.5 py-0.5 border border-[#ffcdd2]">
                      ⚠️ Para Factura A se requiere CUIT Responsable Inscripto
                    </span>
                  )}
                  {manualCbteTipo === 1 && isRespInscripto && (
                    <span className="text-[10px] font-bold text-[#137333] bg-[#e6f4ea] px-1.5 py-0.5 border border-[#ceead6]">
                      ✅ Habilitado Factura A
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Line items addition toolbar */}
            <div className="bg-[#f0f2f5] p-2 border border-[#74777f] flex items-center gap-2 text-[11px]">
              <div className="flex-1 flex items-center gap-2">
                <span className="font-bold text-[#002046]">Agregar Artículo:</span>
                <select
                  value={selectedProductCode}
                  onChange={(e) => setSelectedProductCode(e.target.value)}
                  className="flex-1 h-[26px] px-2 bg-white border border-[#74777f] font-semibold"
                >
                  {products.map((p) => (
                    <option key={p.code} value={p.code}>
                      [{p.code}] {p.description} - {formatCurrency(p.price)} / {p.unitType}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-[120px]">
                <input
                  type="number"
                  step="0.01"
                  value={itemQtyOrWeight}
                  onChange={(e) => setItemQtyOrWeight(e.target.value)}
                  placeholder="Cant / Kg"
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono text-center font-bold"
                />
              </div>

              <button
                onClick={handleAddManualLine}
                className="h-[26px] px-4 bg-[#002046] hover:bg-[#1b365d] text-white font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Renglón</span>
              </button>
            </div>

            {/* Invoiced Lines Table */}
            <div className="bg-white border border-[#74777f] flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="sticky top-0 bg-[#e5e8ec] text-[#181c1f] font-bold border-b border-[#74777f]">
                  <tr className="h-6">
                    <th className="px-2 w-16">CÓDIGO</th>
                    <th className="px-2">DESCRIPCIÓN</th>
                    <th className="px-2 w-20 text-right">CANT / KG</th>
                    <th className="px-2 w-24 text-right">PRECIO UNIT.</th>
                    <th className="px-2 w-20 text-center">% IVA</th>
                    <th className="px-2 w-24 text-right">NETO</th>
                    <th className="px-2 w-24 text-right">SUBTOTAL</th>
                    <th className="px-2 w-10 text-center">ELIM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebeef2]">
                  {manualLines.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-gray-400 italic">
                        No hay artículos en este comprobante. Seleccione un producto arriba y presione "Agregar Renglón".
                      </td>
                    </tr>
                  ) : (
                    manualLines.map((line, idx) => (
                      <tr key={idx} className="h-6 hover:bg-[#f7fafe]">
                        <td className="px-2 font-mono">{line.productCode}</td>
                        <td className="px-2 font-medium">{line.description}</td>
                        <td className="px-2 text-right font-mono">
                          {line.unitType === 'Kg' ? formatWeight(line.quantity) : `${line.quantity} un`}
                        </td>
                        <td className="px-2 text-right font-mono">{formatCurrency(line.unitPrice)}</td>
                        <td className="px-2 text-center font-mono">{line.vatRate}%</td>
                        <td className="px-2 text-right font-mono">{formatCurrency(line.netAmount)}</td>
                        <td className="px-2 text-right font-mono font-bold">
                          {formatCurrency(line.totalAmount)}
                        </td>
                        <td className="text-center">
                          <button
                            onClick={() => setManualLines((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-[#aa3531] hover:text-[#891c1d] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals & Submit Footer */}
            <div className="bg-[#e0e3e7] border border-[#74777f] p-2 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-3">
                <span>
                  Neto Gravado: <strong className="font-mono">{formatCurrency(manualNetTotal)}</strong>
                </span>
                <span className="text-[#c4c6cf]">|</span>
                <span>
                  IVA 21%: <strong className="font-mono">{formatCurrency(manualVat21)}</strong>
                </span>
                {manualVat105 > 0 && (
                  <>
                    <span className="text-[#c4c6cf]">|</span>
                    <span>
                      IVA 10.5%: <strong className="font-mono">{formatCurrency(manualVat105)}</strong>
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[#002046] text-xs">TOTAL FACTURA:</span>
                  <span className="bg-[#002046] text-white px-3 py-1 font-mono text-base font-black">
                    {formatCurrency(manualTotal)}
                  </span>
                </div>

                <button
                  onClick={handleEmitManualInvoice}
                  disabled={isSubmittingManual || manualLines.length === 0}
                  className="h-[30px] px-6 bg-[#002046] hover:bg-[#1b365d] text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" />
                  <span>
                    {isSubmittingManual
                      ? 'Autorizando en ARCA...'
                      : `Emitir ${currentCbteConfig.cbteNombre} & Obtener CAE [F12]`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === 'AUDITORIA' ? (
          /* AUDIT LOG VIEW */
          <div className="flex flex-col h-full">
            <div className="bg-[#f7fafe] p-2 border-b border-[#c4c6cf] flex items-center justify-between text-[11px]">
              <span className="font-bold text-[#002046]">
                REGISTRO AUDITABLE DE COMUNICACIONES FISCALES CON ARCA (AFIP)
              </span>
              <span className="text-gray-600">{auditLogs.length} Eventos Registrados</span>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-auto">
              <table className="w-full min-w-max text-left border-collapse text-[11px] whitespace-nowrap">
                <thead className="sticky top-0 bg-[#e5e8ec] text-[#181c1f] font-bold border-b border-[#74777f]">
                  <tr className="h-7 whitespace-nowrap">
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">FECHA</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">HORA</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">OPERADOR</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">SUCURSAL</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">OPERACIÓN</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">COMPROBANTE</th>
                    <th className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">C.A.E.</th>
                    <th className="px-3 border-r border-[#c4c6cf] text-center whitespace-nowrap">RESULTADO</th>
                    <th className="px-3 whitespace-nowrap">DETALLES FISCALES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebeef2]">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-gray-400 italic">
                        No hay eventos de auditoría registrados en la sesión actual.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="h-7 hover:bg-[#f7fafe] whitespace-nowrap">
                        <td className="px-3 font-mono border-r border-[#c4c6cf] whitespace-nowrap">{log.date}</td>
                        <td className="px-3 font-mono border-r border-[#c4c6cf] whitespace-nowrap">{log.time}</td>
                        <td className="px-3 font-medium border-r border-[#c4c6cf] whitespace-nowrap">{log.user}</td>
                        <td className="px-3 border-r border-[#c4c6cf] whitespace-nowrap">{log.branch}</td>
                        <td className="px-3 font-bold text-[#002046] border-r border-[#c4c6cf] whitespace-nowrap">{log.operation}</td>
                        <td className="px-3 font-mono border-r border-[#c4c6cf] whitespace-nowrap">{log.comprobante || '--'}</td>
                        <td className="px-3 font-mono border-r border-[#c4c6cf] whitespace-nowrap">{log.cae || '--'}</td>
                        <td className="px-3 text-center border-r border-[#c4c6cf] whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 font-bold text-[9px] whitespace-nowrap ${
                              log.result === 'EXITOSO'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {log.result}
                          </span>
                        </td>
                        <td className="px-3 text-gray-700 whitespace-nowrap">{log.details || ''}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'LIBRO_IVA' ? (
          <div className="flex flex-col h-full overflow-hidden">
            <LibroIvaVentasScreen
              invoices={invoices}
              branches={branches}
              currentBranch={currentBranch}
            />
          </div>
        ) : null}
      </div>

      {/* MODAL: Printable Official Invoice (A4 & Ticket 80mm) */}
      <InvoicePrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        invoice={selectedInvoiceForPrint}
        branch={invoiceBranch}
        branches={branches}
      />

      {/* MODAL: Credit Note Issuance */}
      <CreditNoteModal
        isOpen={isNCModalOpen}
        onClose={() => setIsNCModalOpen(false)}
        invoice={selectedInvoiceForNC}
        existingInvoices={invoices}
        currentBranch={currentBranch}
        currentUser={currentUser}
        onSuccess={handleCreditNoteCreated}
      />

      {/* MODAL: ARCA Parameters & Test */}
      <ArcaConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        config={arcaConfig}
        branches={branches}
        onSaveConfig={onSaveArcaConfig}
      />

      {/* MODAL: Customer Search & Selection */}
      <CustomerSelectModal
        isOpen={isCustomerSelectModalOpen}
        onClose={() => setIsCustomerSelectModalOpen(false)}
        customers={allCustomers}
        onSelectCustomer={(cust) => {
          setSelectedCustomerCode(cust.code);
          if (
            cust.vatCondition === 'Resp. Inscripto' ||
            (cust.vatCondition as any) === 'Responsable Inscripto'
          ) {
            setManualCbteTipo(1);
          } else {
            setManualCbteTipo(6);
          }
          setIsCustomerSelectModalOpen(false);
        }}
        onOpenCreateCustomer={() => {
          setIsCustomerSelectModalOpen(false);
          setIsCustomerArcaModalOpen(true);
        }}
      />

      {/* MODAL: Fast Customer Creation & Live ARCA Query */}
      <CustomerArcaQuickModal
        isOpen={isCustomerArcaModalOpen}
        onClose={() => setIsCustomerArcaModalOpen(false)}
        existingCount={allCustomers.length}
        customers={allCustomers}
        arcaConfig={arcaConfig}
        onSaveCustomer={handleSaveCustomer}
        onCustomerCreatedAndSelected={(newCust) => {
          setSelectedCustomerCode(newCust.code);
          if (
            newCust.vatCondition === 'Resp. Inscripto' ||
            (newCust.vatCondition as any) === 'Responsable Inscripto'
          ) {
            setManualCbteTipo(1);
          } else {
            setManualCbteTipo(6);
          }
        }}
      />

      {/* MODAL: Check Last Authorized Vouchers in ARCA (FECompUltimoAutorizado) */}
      <LastVouchersModal
        isOpen={isLastVouchersModalOpen}
        onClose={() => setIsLastVouchersModalOpen(false)}
        initialPointOfSale={pointOfSale}
      />
    </div>
  );
};
