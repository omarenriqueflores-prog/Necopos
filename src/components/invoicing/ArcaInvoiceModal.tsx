import React, { useState, useEffect, useMemo } from 'react';
import {
  Receipt,
  Search,
  UserPlus,
  Printer,
  CheckCircle,
  AlertCircle,
  Building,
  RefreshCw,
  FileText,
} from 'lucide-react';
import {
  Customer,
  BranchConfig,
  UserAccount,
  ElectronicInvoice,
  ElectronicInvoiceItem,
  ArcaCbteTipo,
} from '../../types/pos';
import { formatCurrency, formatWeight } from '../../utils/scaleParser';
import { WindowsModal } from '../common/WindowsModal';
import { arcaService } from '../../services/arcaService';
import { useDialog } from '../../context/DialogContext';
import { useFirebase } from '../../context/FirebaseContext';

interface ArcaInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  saleData: {
    id?: string;
    items: Array<{
      productCode?: string;
      code?: string;
      description: string;
      unitType?: any;
      weight?: number;
      quantity?: number;
      unitPrice: number;
      subtotal: number;
      vatRate?: number;
    }>;
    total: number;
    customer?: Customer | null;
  } | null;
  existingInvoices: ElectronicInvoice[];
  currentBranch: BranchConfig;
  currentUser: UserAccount;
  customers: Customer[];
  onSaveCustomer: (c: Customer) => Promise<void>;
  onInvoiceCreated: (invoice: ElectronicInvoice) => void;
}

export const ArcaInvoiceModal: React.FC<ArcaInvoiceModalProps> = ({
  isOpen,
  onClose,
  saleData,
  existingInvoices,
  currentBranch,
  currentUser,
  customers,
  onSaveCustomer,
  onInvoiceCreated,
}) => {
  const { showAlert } = useDialog();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('0001');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState<string>('');

  const filteredCustomers = useMemo(() => {
    // Ensure "Consumidor Final" is always in the list for selection
    const cfExists = customers.some(
      (c) =>
        c.code === '0001' ||
        c.code === 'CF-0001' ||
        c.name.toLowerCase() === 'consumidor final'
    );

    let list = [...customers];
    if (!cfExists) {
      list.unshift({
        code: '0001',
        name: 'Consumidor Final',
        dniCuit: '00-00000000-0',
        address: 'S/D',
        vatCondition: 'Cons. Final',
        phone: '',
        email: '',
        currentBalance: 0,
        creditLimit: 0,
        status: 'NORMAL',
      } as any);
    }

    const q = customerSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dniCuit.includes(q) ||
        c.code.toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  // Quick Customer Creation Mode
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState<boolean>(false);
  const [newCuit, setNewCuit] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newVatCondition, setNewVatCondition] = useState<
    'Resp. Inscripto' | 'Monotributo' | 'Cons. Final' | 'Exento'
  >('Cons. Final');
  const [newAddress, setNewAddress] = useState<string>('');
  const [isLookingUpCuit, setIsLookingUpCuit] = useState<boolean>(false);

  // Invoicing state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Initialize customer from sale
  useEffect(() => {
    if (saleData?.customer) {
      setSelectedCustomer(saleData.customer);
      setSelectedCustomerId(saleData.customer.code);
    } else {
      // Default to the specific "Consumidor Final" record
      const genericCf = customers.find(
        (c) =>
          c.code === '0001' ||
          c.code === 'CF-0001' ||
          c.name.toLowerCase() === 'consumidor final'
      );

      const fallbackCf: Customer = {
        code: '0001',
        name: 'Consumidor Final',
        dniCuit: '00-00000000-0',
        address: 'S/D',
        vatCondition: 'Cons. Final',
        phone: '',
        email: '',
        currentBalance: 0,
        creditLimit: 0,
        status: 'NORMAL',
      };

      const cf = genericCf || fallbackCf;
      setSelectedCustomer(cf);
      setSelectedCustomerId(cf.code);
    }
  }, [saleData, customers]);

  const handleCustomerChange = (code: string) => {
    setSelectedCustomerId(code);
    const found =
      filteredCustomers.find((c) => c.code === code) ||
      customers.find((c) => c.code === code) ||
      (code === '0001' || code === 'CF-0001'
        ? {
            code: '0001',
            name: 'Consumidor Final',
            dniCuit: '00-00000000-0',
            address: 'S/D',
            vatCondition: 'Cons. Final',
            phone: '',
            email: '',
            currentBalance: 0,
            creditLimit: 0,
            status: 'NORMAL',
          } as any
        : null);

    if (found) {
      setSelectedCustomer(found);
    }
  };

  // Automatically select matching customer when searching so state is never desynced from UI
  useEffect(() => {
    const trimmed = customerSearch.trim();
    if (trimmed && filteredCustomers.length > 0) {
      const alreadyInList = filteredCustomers.some((c) => c.code === selectedCustomerId);
      if (!alreadyInList) {
        setSelectedCustomerId(filteredCustomers[0].code);
        setSelectedCustomer(filteredCustomers[0]);
      }
    }
  }, [customerSearch, filteredCustomers, selectedCustomerId]);

  const fb = useFirebase();
  const arcaConfig = fb.arcaConfig;

  if (!isOpen || !saleData) return null;

  // Determine branch and official point of sale
  const pointOfSale =
    currentBranch.pointOfSale ||
    arcaConfig?.pointsOfSale?.[currentBranch.id as 'NECO 1' | 'NECO 2'] ||
    '0001';

  // Determine suggested comprobante based on customer tax status
  const vatCondition = (selectedCustomer?.vatCondition || '').toLowerCase().trim();
  const isRespInscripto = 
    vatCondition.includes('resp') && 
    vatCondition.includes('inscripto') &&
    !vatCondition.includes('no'); // Avoid 'No Responsable Inscripto' if it exists

  const suggested = isRespInscripto
    ? {
        cbteTipo: 1 as ArcaCbteTipo,
        cbteLetra: 'A' as const,
        cbteNombre: 'Factura A' as const,
        description: 'Cliente Responsable Inscripto con CUIT (Discrimina IVA 21%)',
      }
    : {
        cbteTipo: 6 as ArcaCbteTipo,
        cbteLetra: 'B' as const,
        cbteNombre: 'Factura B' as const,
        description: 'Consumidor Final / Monotributo (IVA incluido)',
      };

  // Calculate items and taxes per product VAT rate (21%, 10.5%, 0% exempt)
  const productsList = fb.products || [];
  const invoiceItems: ElectronicInvoiceItem[] = (saleData.items || []).map((i, idx) => {
    const qty = i.unitType === 'Kg' ? i.weight || 1 : i.quantity || 1;
    const sub = Number(i.subtotal) || 0;
    const prodRef = productsList.find((p) => p.code === (i.productCode || i.code));
    
    // Determine rate explicitly from item, product reference or category rule
    let rate: number | undefined = undefined;
    if (typeof i.vatRate === 'number' && i.vatRate >= 0) {
      rate = i.vatRate;
    } else if (prodRef?.vatRate !== undefined && prodRef?.vatRate !== null && typeof prodRef.vatRate === 'number') {
      rate = prodRef.vatRate;
    } else {
      const cat = (i.category || prodRef?.category || '').toLowerCase();
      if (cat.includes('carne') || cat.includes('res') || cat.includes('achura') || cat.includes('desposte')) {
        rate = 10.5;
      } else if (cat.includes('almacén') || cat.includes('bebida') || cat.includes('limpieza') || cat.includes('carbón') || cat.includes('varios')) {
        rate = 21.0;
      }
    }

    const effectiveRate = rate !== undefined ? rate : 21; // Used for calculation if explicit or rule matched
    const divisor = effectiveRate === 10.5 ? 1.105 : effectiveRate === 27 ? 1.27 : effectiveRate === 0 ? 1.0 : 1.21;
    const net = Math.round((sub / divisor) * 100) / 100;
    const vat = Math.round((sub - net) * 100) / 100;

    return {
      productCode: i.productCode || i.code || `ART-${idx + 1}`,
      description: i.description,
      unitType: (i.unitType as any) || 'Kg',
      quantity: qty,
      unitPrice: i.unitPrice,
      vatRate: rate !== undefined ? rate : -1, // -1 indicates unverified
      netAmount: net,
      vatAmount: vat,
      totalAmount: sub,
    };
  });

  const totalAmount = saleData.total;
  const netAmount = Number(invoiceItems.reduce((acc, item) => acc + item.netAmount, 0).toFixed(2));
  const vatAmount21 = Number(
    invoiceItems.filter((it) => it.vatRate === 21).reduce((acc, item) => acc + item.vatAmount, 0).toFixed(2)
  );
  const vatAmount105 = Number(
    invoiceItems.filter((it) => it.vatRate === 10.5).reduce((acc, item) => acc + item.vatAmount, 0).toFixed(2)
  );
  const exemptAmount = Number(
    invoiceItems.filter((it) => it.vatRate === 0).reduce((acc, item) => acc + item.netAmount, 0).toFixed(2)
  );
  const vatAmount = Number((vatAmount21 + vatAmount105).toFixed(2));

  const handleConsultarCuit = async () => {
    if (!newCuit) {
      await showAlert('Por favor ingrese un CUIT o DNI.');
      return;
    }
    setIsLookingUpCuit(true);
    try {
      const res = await arcaService.lookupCuit(newCuit);
      if (res.success && res.data) {
        setNewName(res.data.name);
        setNewCuit(res.data.cuit);
        setNewVatCondition(res.data.vatCondition);
        setNewAddress(res.data.address);
        await showAlert(
          `Consulta ARCA exitosa:\nContribuyente: ${res.data.name}\nCondición: ${res.data.vatCondition}\nEstado: ${res.data.state}`
        );
      }
    } catch (err: any) {
      await showAlert(`Error al consultar ARCA: ${err.message}`);
    } finally {
      setIsLookingUpCuit(false);
    }
  };

  const handleSaveQuickCustomer = async () => {
    if (!newName.trim()) {
      await showAlert('Ingrese el nombre o razón social del cliente.');
      return;
    }
    const newCode = `CLI-${Date.now().toString().slice(-4)}`;
    const createdCustomer: Customer = {
      code: newCode,
      name: newName.trim(),
      dniCuit: newCuit.trim() || '00-00000000-0',
      address: newAddress.trim() || 'S/D',
      vatCondition:
        newVatCondition === 'Resp. Inscripto'
          ? 'Resp. Inscripto'
          : newVatCondition === 'Monotributo'
          ? 'Monotributo'
          : newVatCondition === 'Exento'
          ? 'Exento'
          : 'Cons. Final',
      phone: '',
      currentBalance: 0,
      creditLimit: 100000,
      status: 'NORMAL',
    };

    await onSaveCustomer(createdCustomer);
    setSelectedCustomer(createdCustomer);
    setSelectedCustomerId(newCode);
    setIsNewCustomerOpen(false);
    await showAlert('Cliente registrado correctamente.');
  };

  const handleEmitInvoice = async () => {
    if (!selectedCustomer) {
      await showAlert('Seleccione un cliente destinatario.');
      return;
    }

    const unverified = invoiceItems.filter((it) => it.vatRate === -1);
    if (unverified.length > 0) {
      await showAlert(
        `REGLA FISCAL ARCA: No se puede emitir la factura. Los siguientes productos no poseen una alícuota de IVA verificada: ${unverified.map((u) => u.description || u.productCode).join(', ')}. Por favor configure la condición fiscal en la lista de productos.`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const nextNum = arcaService.getNextNumber(existingInvoices, pointOfSale, suggested.cbteTipo);

      // Call backend ARCA WSFEv1 authorization
      const storedCfg = arcaService.getStoredConfig();
      const authRes = await arcaService.authorize({
        branchId: currentBranch.id,
        pointOfSale,
        cbteTipo: suggested.cbteTipo,
        cbteNumero: nextNum,
        customer: {
          name: selectedCustomer.name,
          cuitDni: selectedCustomer.dniCuit,
          vatCondition: selectedCustomer.vatCondition,
          address: selectedCustomer.address,
        },
        items: invoiceItems,
        netAmount,
        vatAmount,
        totalAmount,
        cuit: fb?.arcaConfig?.cuit || storedCfg.cuit,
        environment: fb?.arcaConfig?.environment || storedCfg.environment,
      });

      if (!authRes.success || !authRes.cae) {
        await showAlert(`Comprobante no autorizado por ARCA:\n${authRes.error || 'Verifique que el Certificado (.crt) y la Clave Privada (.key) estén vinculados en Configuración ARCA.'}`);
        setIsSubmitting(false);
        return;
      }

      const officialNum = authRes.cbteNumero || nextNum;
      const formattedNumber = arcaService.formatCbteNumber(pointOfSale, officialNum);
      const today = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toLocaleTimeString('es-AR');

      const cleanDoc = selectedCustomer.dniCuit.replace(/\D/g, '');
      const nroDoc = parseInt(cleanDoc, 10) || 0;
      const docType = (nroDoc > 0) 
        ? (cleanDoc.length === 11 ? 80 : cleanDoc.length >= 7 ? 96 : 99)
        : 99;

      const newInvoice: ElectronicInvoice = {
        id: `INV-${pointOfSale}-${officialNum}-${Date.now()}`,
        branchId: currentBranch.id,
        pointOfSale,
        cbteTipo: suggested.cbteTipo,
        cbteLetra: suggested.cbteLetra,
        cbteNombre: suggested.cbteNombre,
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
            suggested.cbteTipo,
            officialNum,
            totalAmount,
            docType,
            selectedCustomer.dniCuit,
            authRes.cae,
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
        items: invoiceItems,
        netAmount,
        vatAmount21,
        vatAmount105,
        exemptAmount,
        totalAmount,
        status: 'AUTORIZADO',
        environment: authRes.environment || 'produccion',
        saleId: saleData.id,
        operator: currentUser.fullName,
        employeeDiscountAmount: saleData.employeeDiscountAmount || 0,
        employeeDiscountPercent: saleData.employeeDiscountPercent || 0,
        createdAt: new Date().toISOString(),
      };

      onInvoiceCreated(newInvoice);
      onClose();
    } catch (err: any) {
      await showAlert(`Error en proceso de facturación: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <WindowsModal
      isOpen={isOpen}
      onClose={onClose}
      title="EMISIÓN DE FACTURA ELECTRÓNICA ARCA (EX AFIP)"
      maxWidth="max-w-2xl"
    >
      <div className="flex flex-col gap-2 p-1 text-[12px] select-none font-sans">
        {/* Branch & Point of Sale Detection Header */}
        <div className="bg-[#002046] text-white p-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-[#aec7f7]" />
            <div>
              <div className="font-bold text-[12px]">SUCURSAL: {currentBranch.name}</div>
              <div className="text-[10px] text-[#c4c6cf]">{currentBranch.address}</div>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-[#aec7f7] uppercase block font-bold">
              PUNTO DE VENTA ASIGNADO:
            </span>
            <span className="font-mono font-black text-sm bg-white text-[#002046] px-2 py-0.5">
              PV {pointOfSale}
            </span>
          </div>
        </div>

        {/* Customer & Document Selection Section */}
        <div className="bg-white p-2.5 border border-[#74777f] flex flex-col gap-2 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#c4c6cf] pb-1.5">
            <span className="font-bold text-[#002046] text-[11px] uppercase">
              1. Identificación del Cliente Destinatario:
            </span>

            <button
              type="button"
              onClick={() => setIsNewCustomerOpen(!isNewCustomerOpen)}
              className="h-[24px] px-2 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#002046] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{isNewCustomerOpen ? 'Cerrar Alta Rápida' : '+ Alta Rápida de Cliente'}</span>
            </button>
          </div>

          {/* Quick Customer Creation Accordion */}
          {isNewCustomerOpen ? (
            <div className="bg-[#f7fafe] p-2.5 border border-[#002046] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#002046] text-[11px]">
                  NUEVO CLIENTE / CONSULTA PADRÓN ARCA:
                </span>
                <span className="text-[10px] text-[#44474e]">
                  Se guardará automáticamente en el sistema
                </span>
              </div>

              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-4">
                  <label className="font-bold text-[#181c1f] block mb-0.5">CUIT / DNI:</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newCuit}
                      onChange={(e) => setNewCuit(e.target.value)}
                      placeholder="XX-XXXXXXXX-X"
                      className="flex-1 h-[26px] px-2 bg-white border border-[#74777f] font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={handleConsultarCuit}
                      disabled={isLookingUpCuit}
                      className="h-[26px] px-2 bg-[#002046] text-white text-[10px] font-bold cursor-pointer hover:bg-[#1b365d] disabled:opacity-50"
                      title="Consultar en ARCA Padrón"
                    >
                      {isLookingUpCuit ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'ARCA'}
                    </button>
                  </div>
                </div>

                <div className="col-span-5">
                  <label className="font-bold text-[#181c1f] block mb-0.5">Nombre / Razón Social:</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nombre o Empresa"
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold text-[11px]"
                  />
                </div>

                <div className="col-span-3">
                  <label className="font-bold text-[#181c1f] block mb-0.5">Condición IVA:</label>
                  <select
                    value={newVatCondition}
                    onChange={(e) => setNewVatCondition(e.target.value as any)}
                    className="w-full h-[26px] px-1 bg-white border border-[#74777f] text-[11px] font-bold"
                  >
                    <option value="Cons. Final">Consumidor Final</option>
                    <option value="Resp. Inscripto">Resp. Inscripto</option>
                    <option value="Monotributo">Monotributo</option>
                    <option value="Exento">Exento</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="Domicilio Comercial (Calle, Número, Localidad)"
                  className="flex-1 h-[26px] px-2 bg-white border border-[#74777f] text-[11px]"
                />
                <button
                  type="button"
                  onClick={handleSaveQuickCustomer}
                  className="h-[26px] px-3 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold cursor-pointer"
                >
                  Guardar y Usar
                </button>
              </div>
            </div>
          ) : (
            /* Standard Customer Dropdown with Search */
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-4">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="font-bold text-[#181c1f]">Buscar Cliente:</label>
                    {customerSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerSearch('');
                          handleCustomerChange('0001');
                        }}
                        className="text-[10px] text-[#aa3531] hover:underline cursor-pointer font-bold"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2 top-1.5 w-3.5 h-3.5 text-[#74777f]" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (filteredCustomers.length > 0) {
                            handleCustomerChange(filteredCustomers[0].code);
                          }
                        }
                      }}
                      placeholder="Nombre, CUIT o Código... [Enter]"
                      className="w-full h-[26px] pl-7 pr-2 bg-white border border-[#74777f] text-[11px] focus:outline-none focus:border-[#002046]"
                      autoFocus
                    />
                  </div>
                  {customerSearch.trim() && filteredCustomers.length > 0 && (
                    <span className="text-[10px] text-[#00522c] font-bold block mt-0.5">
                      ✓ Coincidencia: {filteredCustomers[0].name} (Presione Enter)
                    </span>
                  )}
                </div>

                <div className="col-span-5">
                  <label className="font-bold text-[#181c1f] block mb-0.5">Seleccionar Cliente:</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold text-[11px]"
                  >
                    {filteredCustomers.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} - ({c.vatCondition}) - {c.dniCuit}
                      </option>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <option value="">No se encontraron resultados</option>
                    )}
                  </select>
                </div>

                <div className="col-span-3">
                  <label className="font-bold text-[#181c1f] block mb-0.5">Condición de Venta:</label>
                  <input
                    type="text"
                    readOnly
                    value="Contado Efectivo / Transferencia"
                    className="w-full h-[26px] px-2 bg-[#f0f2f5] border border-[#c4c6cf] font-semibold text-[11px]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Customer Details Strip & Rule Compliance */}
          {selectedCustomer && (
            <div className="bg-[#f0f2f5] p-2 border border-[#c4c6cf] flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2 truncate">
                <span className="font-bold text-[#002046]">{selectedCustomer.name}</span>
                <span className="text-[#c4c6cf]">|</span>
                <span className="font-mono text-[#44474e]">{selectedCustomer.dniCuit}</span>
                <span className="text-[#c4c6cf]">|</span>
                <span className="text-[#44474e] truncate max-w-[180px]">
                  {selectedCustomer.address || 'S/D'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold font-mono px-2 py-0.5 bg-white border border-[#74777f] text-[#002046]">
                  {selectedCustomer.vatCondition}
                </span>
                <button
                  type="button"
                  onClick={() => handleCustomerChange('0001')}
                  className="h-[20px] px-2 bg-[#002046] hover:bg-[#1b365d] text-white text-[10px] font-bold cursor-pointer"
                >
                  Consumidor Final
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Suggested ARCA Comprobante Banner */}
        <div className="bg-[#d6e3ff] border border-[#002046] p-2.5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#002046]" />
              <span className="font-bold text-[#002046] text-[13px]">
                COMPROBANTE SUGERIDO: {suggested.cbteNombre.toUpperCase()} (LETRA {suggested.cbteLetra})
              </span>
            </div>
            <div className="text-[11px] text-[#002046] mt-0.5">{suggested.description}</div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-[#002046] font-bold block">PUNTO DE VENTA</span>
            <span className="font-mono font-bold text-base text-[#002046]">{pointOfSale}</span>
          </div>
        </div>

        {/* Items Summary Table */}
        <div className="bg-white border border-[#74777f] shadow-sm max-h-[160px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead className="sticky top-0 bg-[#e5e8ec] text-[#181c1f] font-bold border-b border-[#74777f]">
              <tr className="h-6">
                <th className="px-2">ARTÍCULO</th>
                <th className="px-2 text-right">CANT / PESO</th>
                <th className="px-2 text-right">PRECIO UNIT.</th>
                <th className="px-2 text-center">% IVA</th>
                <th className="px-2 text-right">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ebeef2]">
              {saleData.items.map((item, idx) => (
                <tr key={idx} className="h-5 hover:bg-[#f7fafe]">
                  <td className="px-2 font-semibold truncate max-w-[200px]">{item.description}</td>
                  <td className="px-2 text-right font-mono">
                    {item.unitType === 'Kg'
                      ? formatWeight(item.weight || 0)
                      : `${item.quantity || 1} un`}
                  </td>
                  <td className="px-2 text-right font-mono">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-2 text-center font-mono">21%</td>
                  <td className="px-2 text-right font-mono font-bold">
                    {formatCurrency(item.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Breakdown */}
        <div className="bg-[#e0e3e7] border border-[#74777f] p-2 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-3">
            <span>
              Neto Gravado: <strong className="font-mono">{formatCurrency(netAmount)}</strong>
            </span>
            <span className="text-[#c4c6cf]">|</span>
            <span>
              IVA Débito (21%): <strong className="font-mono">{formatCurrency(vatAmount)}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-bold text-[#002046] text-[12px]">TOTAL A FACTURAR:</span>
            <span className="bg-[#002046] text-white px-3 py-1 font-mono text-base font-black">
              {formatCurrency(totalAmount)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-1 border-t border-[#c4c6cf]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-[28px] px-4 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[11px] font-semibold cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleEmitInvoice}
            disabled={isSubmitting}
            className="h-[28px] px-6 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>
              {isSubmitting
                ? 'Conectando con ARCA...'
                : `Emitir ${suggested.cbteNombre} & Obtener CAE [F12]`}
            </span>
          </button>
        </div>
      </div>
    </WindowsModal>
  );
};
