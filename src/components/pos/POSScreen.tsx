import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Scale,
  Receipt,
  Plus,
  Trash2,
  Printer,
  XCircle,
  CreditCard,
  Banknote,
  QrCode,
  UserCheck,
  Building,
  Percent,
  Split,
  ArrowLeftRight,
  Check,
  Barcode,
  Edit,
  FileCheck,
  Search,
} from 'lucide-react';
import { useFirebase } from '../../context/FirebaseContext';
import { useDialog } from '../../context/DialogContext';
import {
  Product,
  SaleItem,
  Customer,
  Employee,
  PaymentMethod,
  BranchConfig,
  UserAccount,
  AccountMovement,
} from '../../types/pos';
import { formatCurrency, formatWeight, parseBarcodeInput } from '../../utils/scaleParser';
import { isMeatProduct } from '../../utils/stockHelper';
import { generateTicketHtml, printTicket } from '../../utils/ticketGenerator';
import { CustomerSelectModal, SelectedPartyData } from './CustomerSelectModal';
import { WindowsModal } from '../common/WindowsModal';
import { ArcaInvoiceModal } from '../invoicing/ArcaInvoiceModal';
import { InvoicePrintModal } from '../invoicing/InvoicePrintModal';
import { ElectronicInvoice } from '../../types/pos';

interface POSScreenProps {
  products: Product[];
  customers: Customer[];
  employees?: Employee[];
  currentBranch: BranchConfig;
  currentUser: UserAccount;
  cashOpen: boolean;
  onSaleComplete?: (saleData: {
    items: SaleItem[];
    total: number;
    paymentMethod: PaymentMethod;
    customer: Customer | null;
    employee?: Employee | null;
    partyType?: 'CLIENTE' | 'EMPLEADO';
    employeeDiscountPercent?: number;
    employeeDiscountAmount?: number;
    invoiceType: 'FACTURA_B' | 'FACTURA_A' | 'RECIBO_COMUN';
    cashGiven?: number;
    change?: number;
    ticketNumber?: string;
    branchId?: string;
  }) => void;
  onOpenCustomerModal?: () => void;
  onOpenCustomerManagement?: () => void;
  onNavigateToAccount?: (customer: Customer) => void;
}

export const POSScreen: React.FC<POSScreenProps> = ({
  products,
  customers,
  employees = [],
  currentBranch,
  currentUser,
  cashOpen,
  onSaleComplete,
  onOpenCustomerManagement,
}) => {
  // Sale Items State initialized clean (empty ticket)
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);

  const {
    sales,
    addSaleRecord,
    electronicInvoices,
    saveElectronicInvoice,
    saveCustomer,
    saveEmployee,
    employees: fbEmployees,
    branchConfigs,
    addAccountMovement,
    addAuditLog,
    branchStock,
  } = useFirebase();

  const allEmployees = useMemo(() => {
    return employees && employees.length > 0 ? employees : fbEmployees || [];
  }, [employees, fbEmployees]);

  const { showAlert, showConfirm } = useDialog();
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(-1);
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState<number>(-1);
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedParty, setSelectedParty] = useState<SelectedPartyData | null>(null);
  const [employeeDiscountPercent, setEmployeeDiscountPercent] = useState<number>(0);
  const [manualDiscountPercent, setManualDiscountPercent] = useState<number>(0);
  const [discountInput, setDiscountInput] = useState<string>('');
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('EFECTIVO');
  const [paidWith, setPaidWith] = useState<string>('');
  const [combinedMethod1, setCombinedMethod1] = useState<PaymentMethod>('EFECTIVO');
  const [combinedAmount1, setCombinedAmount1] = useState<string>('');
  const [combinedMethod2, setCombinedMethod2] = useState<PaymentMethod>('TARJETA');
  const [combinedAmount2, setCombinedAmount2] = useState<string>('');
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState<boolean>(false);
  const [ticketInvoiceType, setTicketInvoiceType] = useState<'RECIBO_COMUN' | 'FACTURA_B' | 'FACTURA_A'>('FACTURA_B');
  const [isTicketModalOpen, setIsTicketModalOpen] = useState<boolean>(false);
  const [isArcaModalOpen, setIsArcaModalOpen] = useState<boolean>(false);
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<ElectronicInvoice | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editQtyOrWeight, setEditQtyOrWeight] = useState<string>('1.0');
  const [editPrice, setEditPrice] = useState<string>('0');
  const [isAddAmountModalOpen, setIsAddAmountModalOpen] = useState<boolean>(false);
  const [productToAmount, setProductToAmount] = useState<Product | null>(null);
  const [amountInput, setAmountInput] = useState<string>('1.000');
  const [liveScaleWeight, setLiveScaleWeight] = useState<number>(2.35);
  const [scaleStatus, setScaleStatus] = useState<'ESTABLE' | 'PESANDO'>('ESTABLE');
  const [lastNotification, setLastNotification] = useState<string | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const paidWithInputRef = useRef<HTMLInputElement>(null);
  const combinedAmount1Ref = useRef<HTMLInputElement>(null);
  const editQuantityInputRef = useRef<HTMLInputElement>(null);
  const editPriceInputRef = useRef<HTMLInputElement>(null);

  const formatQuantity = useCallback((val: number, unitType: string = 'Kg') => {
    return unitType === 'Kg'
      ? `${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(val)} Kg`
      : `${Math.round(val)} Unid.`;
  }, []);

  const getAvailableChamberStock = useCallback(
    (productCode: string): number => {
      const stockDoc = (branchStock || []).find(
        (s) => s.branchId === currentBranch.id && s.productCode === productCode
      );
      return stockDoc ? Number(stockDoc.currentStock) || 0 : 0;
    },
    [branchStock, currentBranch.id]
  );

  const getNextTicketNumber = useCallback(() => {
    // Dedicated internal POS ticket prefix (independent from ARCA fiscal point of sale)
    const ticketPrefix = currentBranch.ticketPrefix || (currentBranch.id === 'NECO 2' ? '1020' : '1010');
    const branchSales = (sales || []).filter((s: any) => {
      if (s.branchId && s.branchId !== currentBranch.id) return false;
      return true;
    });

    let maxSeq = 0;
    for (const s of branchSales) {
      if (s.ticketNumber) {
        // If ticket matches this branch prefix or ends in digits
        const match = String(s.ticketNumber).match(/[-_](\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          // If valid sequence (excluding legacy random 6-digit numbers)
          if (!isNaN(num) && num > maxSeq && num < 100000) {
            maxSeq = num;
          }
        }
      }
    }

    const nextSeq = maxSeq + 1;
    return `${ticketPrefix}-${String(nextSeq).padStart(5, '0')}`;
  }, [sales, currentBranch]);

  const currentNextTicketNumber = useMemo(() => {
    return getNextTicketNumber();
  }, [getNextTicketNumber]);

  const matchingProducts = useMemo(() => {
    const q = barcodeInput.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => {
        const matchCode = p.code.toLowerCase().includes(q);
        const matchBarcode = p.barcode ? p.barcode.toLowerCase().includes(q) : false;
        const matchDesc = p.description.toLowerCase().includes(q);
        const matchPlu = p.scalePlu ? p.scalePlu.toLowerCase().includes(q) : false;
        const matchCat = p.category.toLowerCase().includes(q);
        return matchCode || matchBarcode || matchDesc || matchPlu || matchCat;
      })
      .sort((a, b) => {
        const aExact =
          (a.barcode && a.barcode.toLowerCase() === q) || a.code.toLowerCase() === q ? 0 : 1;
        const bExact =
          (b.barcode && b.barcode.toLowerCase() === q) || b.code.toLowerCase() === q ? 0 : 1;
        return aExact - bExact;
      })
      .slice(0, 8);
  }, [barcodeInput, products]);

  const handleSelectProductFromSearch = (product: Product) => {
    const isMeat = isMeatProduct(product);
    setProductToAmount({
      ...product,
      unitType: isMeat ? 'Kg' : 'Unid',
    });
    setAmountInput('');
    setIsAddAmountModalOpen(true);
    setIsSearchFocused(false);
  };

  const handleConfirmAddAmount = () => {
    if (!productToAmount) return;

    const isMeat = productToAmount.unitType === 'Kg';
    const rawVal = parseFloat(amountInput.replace(',', '.')) || 0;
    if (rawVal <= 0) {
      showAlert(
        isMeat
          ? 'Debe ingresar manualmente la cantidad en kilogramos (mayor a 0).'
          : 'Debe ingresar manualmente la cantidad de unidades (mayor a 0).'
      );
      return;
    }

    const qtyOrWeight = isMeat
      ? Math.round(rawVal * 1000) / 1000
      : Math.max(1, Math.round(rawVal));
    const subtotal = Math.round(productToAmount.price * qtyOrWeight * 100) / 100;

    const newItem: SaleItem = {
      id: `item-${Date.now()}`,
      code: productToAmount.code,
      description: productToAmount.description,
      unitType: isMeat ? 'Kg' : 'Unid',
      weight: isMeat ? qtyOrWeight : undefined,
      quantity: isMeat ? undefined : qtyOrWeight,
      unitPrice: productToAmount.price,
      discountPercent: 0,
      subtotal: subtotal,
    };

    setSaleItems((prev) => [newItem, ...prev]);
    setSelectedItemIndex(0);
    setBarcodeInput('');
    setHighlightedSearchIndex(-1);
    setIsSearchFocused(false);
    setIsAddAmountModalOpen(false);
    setProductToAmount(null);

    showNotification(
      `Producto agregado: ${productToAmount.description} (${
        isMeat ? formatWeight(qtyOrWeight) : `${qtyOrWeight} Unid.`
      }) -> ${formatCurrency(subtotal)}`
    );

    setTimeout(() => barcodeInputRef.current?.focus(), 10);
  };

  // Auto focus barcode input on mount and keep it focused
  useEffect(() => {
    barcodeInputRef.current?.focus();
    barcodeInputRef.current?.select();
  }, []);

  const rawSubtotal = saleItems.reduce((acc, item) => acc + item.subtotal, 0);
  const totalWeight = saleItems
    .filter((i) => i.unitType === 'Kg')
    .reduce((acc, item) => acc + (item.weight || 0), 0);
  const totalUnits = saleItems
    .filter((i) => i.unitType === 'Unid')
    .reduce((acc, item) => acc + (item.quantity || 0), 0);

  const isEmployeeSelected = selectedParty?.type === 'EMPLEADO';
  const employeeDiscountAmount =
    isEmployeeSelected && employeeDiscountPercent > 0
      ? Math.round(rawSubtotal * (employeeDiscountPercent / 100))
      : 0;

  const manualDiscountAmount =
    manualDiscountPercent > 0
      ? Math.round((rawSubtotal - employeeDiscountAmount) * (manualDiscountPercent / 100))
      : 0;
  const totalDiscountAmount = employeeDiscountAmount + manualDiscountAmount;
  const totalDiscountPercent = rawSubtotal > 0
    ? Number(((totalDiscountAmount / rawSubtotal) * 100).toFixed(2))
    : 0;
  const totalAmount = Math.max(0, rawSubtotal - totalDiscountAmount);
  const saleItemsForCheckout = useMemo(() => {
    const discountFactor = rawSubtotal > 0 ? totalAmount / rawSubtotal : 1;
    let amountRemaining = totalAmount;
    return saleItems.map((item, index) => {
      const subtotal = Number(Math.min(
        amountRemaining,
        index === saleItems.length - 1 ? amountRemaining : item.subtotal * discountFactor
      ).toFixed(2));
      amountRemaining = Number((amountRemaining - subtotal).toFixed(2));
      return {
        ...item,
        discountPercent: totalDiscountPercent,
        subtotal,
      };
    });
  }, [saleItems, rawSubtotal, totalAmount, totalDiscountPercent]);
  const netAmount = Math.round(totalAmount / 1.21);
  const vatAmount = totalAmount - netAmount;

  const paidNum = parseFloat(paidWith.replace(/\./g, '').replace(',', '.')) || 0;
  const changeAmount = paidNum > 0 && totalAmount > 0 ? Math.max(0, paidNum - totalAmount) : 0;

  const isPaymentCovered = useMemo(() => {
    if (saleItems.length === 0 || totalAmount <= 0) return false;
    if (selectedPayment === 'EFECTIVO') return paidNum >= totalAmount;
    if (selectedPayment === 'PAGO_COMBINADO') {
      const v1 = parseFloat(combinedAmount1.replace(/\./g, '').replace(',', '.')) || 0;
      const v2 = parseFloat(combinedAmount2.replace(/\./g, '').replace(',', '.')) || 0;
      return v1 + v2 >= totalAmount;
    }
    if (selectedPayment === 'CUENTA_CORRIENTE') return selectedCustomer !== null || selectedParty !== null;
    return true;
  }, [
    saleItems.length,
    totalAmount,
    selectedPayment,
    paidNum,
    combinedAmount1,
    combinedAmount2,
    selectedCustomer,
    selectedParty,
  ]);

  const showNotification = (msg: string) => {
    setLastNotification(msg);
    setTimeout(() => setLastNotification(null), 3500);
  };

  const resetSaleToBlank = () => {
    setSaleItems([]);
    setSelectedCustomer(null);
    setSelectedParty(null);
    setEmployeeDiscountPercent(0);
    setManualDiscountPercent(0);
    setSelectedPayment('EFECTIVO');
    setTicketInvoiceType('RECIBO_COMUN');
    setPaidWith('');
    setCombinedAmount1('');
    setCombinedAmount2('');
    setSelectedItemIndex(-1);
    setBarcodeInput('');
  };

  const openEditLine = (field: 'quantity' | 'price') => {
    const item = saleItems[selectedItemIndex] || saleItems[0];
    if (!item) return;

    setSelectedItemIndex(saleItems.indexOf(item));
    setEditQtyOrWeight(String(item.unitType === 'Kg' ? item.weight : item.quantity));
    setEditPrice(String(item.unitPrice));
    setIsEditModalOpen(true);
    window.setTimeout(() => {
      const input = field === 'quantity' ? editQuantityInputRef.current : editPriceInputRef.current;
      input?.focus();
      input?.select();
    }, 50);
  };

  const handleClearSale = async () => {
    const confirmed = await showConfirm('¿Desea limpiar toda la venta actual?');
    if (confirmed) {
      resetSaleToBlank();
      showNotification('Venta limpiada. Todo en 0.');
      barcodeInputRef.current?.focus();
    }
  };

  const handleDeleteItem = (index: number) => {
    if (index >= 0 && index < saleItems.length) {
      const removed = saleItems[index];
      const newItems = saleItems.filter((_, idx) => idx !== index);
      setSaleItems(newItems);
      
      if (newItems.length === 0) {
        resetSaleToBlank();
        showNotification(`Artículo eliminado: ${removed.description}. Ticket en 0, cliente restablecido.`);
      } else {
        setSelectedItemIndex((prev) => Math.max(0, Math.min(index, newItems.length - 1)));
        showNotification(`Artículo eliminado: ${removed.description}`);
      }
    }
  };

  // Barcode / Scanner / Article Search submission
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // If a search match is highlighted, select it
    if (highlightedSearchIndex >= 0 && matchingProducts[highlightedSearchIndex]) {
      handleSelectProductFromSearch(matchingProducts[highlightedSearchIndex]);
      return;
    }

    const raw = barcodeInput.trim();
    if (!raw) return;

    const parsed = parseBarcodeInput(raw, products, currentBranch.scaleEanPrefix);

    if (parsed && parsed.product) {
      if (parsed.isScaleLabel) {
        const availableStock = getAvailableChamberStock(parsed.product.code);
        if (availableStock <= 0) {
          showNotification(`Aviso: ${parsed.product.description} sin stock en cámara (${formatQuantity(availableStock, parsed.product.unitType)}). Se ajustará en negativo.`);
        }

        const newItem: SaleItem = {
          id: `item-${Date.now()}`,
          code: parsed.product.code,
          description: parsed.product.description,
          unitType: parsed.product.unitType,
          weight: parsed.weight,
          quantity: parsed.quantity,
          unitPrice: parsed.unitPrice,
          discountPercent: 0,
          subtotal: parsed.subtotal,
          scaleLabelCode: raw,
        };

        setSaleItems((prev) => [newItem, ...prev]);
        setSelectedItemIndex(0);
        setBarcodeInput('');
        setHighlightedSearchIndex(-1);
        setIsSearchFocused(false);
        showNotification(
          `Balanza detectada: ${parsed.product.description} (${formatWeight(parsed.weight || 0)}) -> ${formatCurrency(parsed.subtotal)}`
        );
        barcodeInputRef.current?.focus();
      } else {
        handleSelectProductFromSearch(parsed.product);
      }
      return;
    }

    if (matchingProducts.length > 0) {
      handleSelectProductFromSearch(matchingProducts[0]);
      return;
    }

    showNotification(`Código o artículo no encontrado: "${raw}"`);
    barcodeInputRef.current?.focus();
  };

  // Auto focus modal amount input when prompt opens
  useEffect(() => {
    if (isAddAmountModalOpen) {
      setTimeout(() => {
        amountInputRef.current?.focus();
        amountInputRef.current?.select();
      }, 50);
    }
  }, [isAddAmountModalOpen]);

  // Keyboard hotkeys for fast POS operations
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If modal is open, don't trigger global POS shortcuts
      if (isCustomerModalOpen || isTicketModalOpen || isEditModalOpen || isAddAmountModalOpen || isCheckoutModalOpen || isDiscountModalOpen) return;

      // Search dropdown keyboard navigation
      if (document.activeElement === barcodeInputRef.current && matchingProducts.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedSearchIndex((prev) => (prev < matchingProducts.length - 1 ? prev + 1 : 0));
          return;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedSearchIndex((prev) => (prev > 0 ? prev - 1 : matchingProducts.length - 1));
          return;
        } else if (e.key === 'Escape') {
          setBarcodeInput('');
          setHighlightedSearchIndex(-1);
          setIsSearchFocused(false);
          return;
        }
      }

      if (e.key === 'F1') {
        e.preventDefault();
        e.stopImmediatePropagation();
        resetSaleToBlank();
        showNotification('Nueva Venta iniciada. Ticket en blanco.');
        barcodeInputRef.current?.focus();
      } else if (e.key === 'F3') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setIsCustomerModalOpen(true);
      } else if (e.key === 'F4') {
        e.preventDefault();
        e.stopImmediatePropagation();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
        setIsSearchFocused(true);
      } else if (e.key === 'F5') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (saleItems.length > 0) {
          setDiscountInput(manualDiscountPercent ? String(manualDiscountPercent) : '');
          setIsDiscountModalOpen(true);
        }
      } else if (e.key === 'F6') {
        e.preventDefault();
        e.stopImmediatePropagation();
        openEditLine('quantity');
      } else if (e.key === 'F7') {
        e.preventDefault();
        e.stopImmediatePropagation();
        openEditLine('price');
      } else if (e.key === 'F8') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSelectedPayment('EFECTIVO');
      } else if (e.key === 'F9') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSelectedPayment('TARJETA');
      } else if (e.key === 'F10') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSelectedPayment('QR');
      } else if (e.key === 'F11') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (saleItems.length > 0) void handleClearSale();
      } else if (e.key === 'F12') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (saleItems.length === 0) return;
        setTicketInvoiceType(
          e.ctrlKey
            ? 'RECIBO_COMUN'
            : 'FACTURA_B'
        );
        setIsCheckoutModalOpen(true);
      } else if (e.key === 'Delete') {
        if (selectedItemIndex >= 0 && selectedItemIndex < saleItems.length) {
          e.preventDefault();
          handleDeleteItem(selectedItemIndex);
        }
      } else if (e.key === 'ArrowDown') {
        if (document.activeElement !== barcodeInputRef.current) {
          e.preventDefault();
          setSelectedItemIndex((prev) => Math.min(prev + 1, saleItems.length - 1));
        }
      } else if (e.key === 'ArrowUp') {
        if (document.activeElement !== barcodeInputRef.current) {
          e.preventDefault();
          setSelectedItemIndex((prev) => Math.max(prev - 1, 0));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    isCustomerModalOpen,
    isTicketModalOpen,
    isCheckoutModalOpen,
    isDiscountModalOpen,
    isEditModalOpen,
    isArcaModalOpen,
    saleItems,
    selectedItemIndex,
    manualDiscountPercent,
    totalAmount,
    selectedPayment,
    paidWith,
    combinedAmount1,
    combinedAmount2,
    selectedCustomer,
    openEditLine,
    handleClearSale,
  ]);

  const handleSelectParty = (party: SelectedPartyData) => {
    setSelectedParty(party);
    if (party.type === 'EMPLEADO') {
      setEmployeeDiscountPercent(party.employeeDiscountPercent || 0);
      const virtualCust: Customer = {
        code: party.code,
        name: party.name,
        dniCuit: party.dniCuit,
        phone: party.phone,
        address: party.address || '',
        vatCondition: 'Cons. Final',
        creditLimit: party.creditLimit,
        currentBalance: party.currentBalance,
        status: 'NORMAL',
        notes: `Empleado: ${party.role || 'Personal'} - Legajo ${party.legajo || party.code}`,
      };
      setSelectedCustomer(virtualCust);
    } else {
      setEmployeeDiscountPercent(0);
      setSelectedCustomer(party.customer || null);
    }
    setSelectedPayment('CUENTA_CORRIENTE');
    showNotification(
      party.type === 'EMPLEADO'
        ? `Cuenta Empleado: ${party.name}${party.employeeDiscountPercent > 0 ? ` (${party.employeeDiscountPercent}% Desc.)` : ''}`
        : `Cliente seleccionado: ${party.name}`
    );
  };

  const handleClearCustomerOrParty = () => {
    setSelectedCustomer(null);
    setSelectedParty(null);
    setEmployeeDiscountPercent(0);
  };

  const handleFacturar = async (type: 'FACTURA_B' | 'FACTURA_A' | 'RECIBO_COMUN') => {
    if (!cashOpen) {
      await showAlert('La caja no está abierta. No es posible realizar ventas ni facturación.');
      return;
    }
    if (saleItems.length === 0) {
      await showAlert('No hay artículos cargados en la venta actual.');
      return;
    }

    if (totalAmount <= 0) {
      await showAlert('El importe total de la venta debe ser mayor a $ 0.');
      return;
    }

    // 1. VALIDACIÓN ESTRICTA PARA EFECTIVO: El importe recibido no puede ser 0 ni menor al total
    if (selectedPayment === 'EFECTIVO') {
      if (paidNum < totalAmount) {
        const falta = totalAmount - paidNum;
        await showAlert(
          paidNum === 0
            ? `Debe ingresar el importe con el que abona el cliente en el campo 'PAGA CON' o presionar el botón 'Exacto' para cubrir los $ ${formatCurrency(totalAmount)}.\n\nNo se permite emitir comprobantes sin cubrir el importe de la venta.`
            : `El importe ingresado en 'PAGA CON' ($ ${formatCurrency(paidNum)}) no cubre el total de la venta ($ ${formatCurrency(totalAmount)}).\n\nFaltan por cobrar: $ ${formatCurrency(falta)}.\nIngrese el monto correcto o presione 'Exacto'.`
        );
        return;
      }
    }

    // 2. VALIDACIÓN ESTRICTA PARA PAGO COMBINADO: La suma debe cubrir el total exacto o mayor
    if (selectedPayment === 'PAGO_COMBINADO') {
      const v1 = parseFloat(combinedAmount1.replace(/\./g, '').replace(',', '.')) || 0;
      const v2 = parseFloat(combinedAmount2.replace(/\./g, '').replace(',', '.')) || 0;
      const totalMix = v1 + v2;
      if (totalMix === 0) {
        await showAlert('Debe ingresar los importes para cada medio en el Pago Combinado.');
        return;
      }
      if (totalMix < totalAmount) {
        const falta = totalAmount - totalMix;
        await showAlert(
          `Los importes ingresados en el pago combinado ($ ${formatCurrency(totalMix)}) no cubren el total de la venta ($ ${formatCurrency(totalAmount)}).\n\nFaltan por cobrar: $ ${formatCurrency(falta)}.\nAjuste los importes o use los botones de ayuda para completar el total.`
        );
        return;
      }
    }

    // 3. VALIDACIÓN ESTRICTA PARA CUENTA CORRIENTE: Debe seleccionarse un cliente o empleado
    if (selectedPayment === 'CUENTA_CORRIENTE') {
      if (!selectedCustomer && !selectedParty) {
        await showAlert('Para cobrar en Cuenta Corriente debe seleccionar un cliente o empleado primero.');
        setIsCustomerModalOpen(true);
        return;
      }
      if (type === 'FACTURA_A' || type === 'FACTURA_B') {
        await showAlert(
          'Las ventas en Cuenta Corriente se registran únicamente con "Recibo Común / Comanda Interna" (Ctrl+F12).\n\nLa factura oficial (Factura A o B) se emitirá posteriormente desde el módulo de Cuentas Corrientes cuando el cliente o empleado realice el pago de su deuda.'
        );
        return;
      }
    }

    if (type === 'FACTURA_A' && selectedParty?.type === 'EMPLEADO') {
      await showAlert('La Factura A debe emitirse a nombre de un cliente con CUIT. Seleccione un cliente y complete sus datos en ARCA.');
      return;
    }

    setTicketInvoiceType(type);
    setIsCheckoutModalOpen(false);

    if (type === 'FACTURA_A' || type === 'FACTURA_B') {
      setIsArcaModalOpen(true);
    } else {
      setIsTicketModalOpen(true);
    }
  };

  const handleApplyDiscount = () => {
    const discount = Number(discountInput.replace(',', '.'));
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      void showAlert('Ingrese un porcentaje de descuento entre 0 y 100.');
      return;
    }
    setManualDiscountPercent(discount);
    setIsDiscountModalOpen(false);
  };

  useEffect(() => {
    if (!isCheckoutModalOpen || isCustomerModalOpen || isTicketModalOpen || isArcaModalOpen) return;

    const handleCheckoutShortcuts = (event: KeyboardEvent) => {
      const paymentMethods: Record<string, PaymentMethod> = {
        F5: 'TRANSFERENCIA',
        F6: 'PAGO_COMBINADO',
        F8: 'EFECTIVO',
        F9: 'TARJETA',
        F10: 'QR',
        F11: 'CUENTA_CORRIENTE',
      };
      const paymentMethod = paymentMethods[event.key];

      if (paymentMethod) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setSelectedPayment(paymentMethod);
        if (paymentMethod === 'PAGO_COMBINADO') {
          setCombinedAmount1('');
          setCombinedAmount2('');
          window.setTimeout(() => combinedAmount1Ref.current?.focus(), 0);
        } else if (paymentMethod === 'EFECTIVO') {
          window.setTimeout(() => {
            paidWithInputRef.current?.focus();
            paidWithInputRef.current?.select();
          }, 0);
        } else if (paymentMethod === 'CUENTA_CORRIENTE') {
          setIsCustomerModalOpen(true);
        }
        return;
      }

      if (event.key === 'F12') {
        event.preventDefault();
        event.stopImmediatePropagation();
        void handleFacturar(ticketInvoiceType);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        void (async () => {
          const confirmed = await showConfirm('¿Anular y cancelar la venta en curso?');
          if (confirmed) {
            resetSaleToBlank();
            showNotification('Venta cancelada. Todo restablecido en 0.');
            barcodeInputRef.current?.focus();
          }
        })();
      }
    };

    window.addEventListener('keydown', handleCheckoutShortcuts, true);
    return () => window.removeEventListener('keydown', handleCheckoutShortcuts, true);
  }, [
    isCheckoutModalOpen,
    isCustomerModalOpen,
    isTicketModalOpen,
    isArcaModalOpen,
    ticketInvoiceType,
    handleFacturar,
    combinedAmount1Ref,
    paidWithInputRef,
    showConfirm,
    resetSaleToBlank,
    showNotification,
  ]);

  const handleConfirmTicket = async () => {
    const v1 = parseFloat(combinedAmount1.replace(/\./g, '').replace(',', '.')) || 0;
    const v2 = parseFloat(combinedAmount2.replace(/\./g, '').replace(',', '.')) || 0;
    const resolvedInvoiceType = ticketInvoiceType || 'RECIBO_COMUN';

    const nextTicket = getNextTicketNumber();
    const isEmp = selectedParty?.type === 'EMPLEADO';
    const partyName = selectedPayment === 'CUENTA_CORRIENTE'
      ? isEmp
        ? `${selectedParty.name} (EMPLEADO Leg. ${selectedParty.legajo || selectedParty.code})`
        : selectedCustomer?.name || 'Consumidor Final'
      : 'Consumidor Final';
    const accountCustomer =
      selectedPayment === 'CUENTA_CORRIENTE'
        ? selectedParty?.customer || selectedCustomer
        : null;
    const accountEmployee =
      selectedPayment === 'CUENTA_CORRIENTE' ? selectedParty?.employee || null : null;

    const saleData = {
      id: `SALE-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      items: [...saleItemsForCheckout],
      subtotal: rawSubtotal,
      employeeDiscountPercent: selectedParty?.type === 'EMPLEADO'
        ? employeeDiscountPercent
        : 0,
      employeeDiscountAmount: isEmp ? employeeDiscountAmount : 0,
      manualDiscountPercent,
      manualDiscountAmount,
      discountPercent: totalDiscountPercent,
      discountAmount: totalDiscountAmount,
      total: totalAmount,
      paymentMethod: selectedPayment,
      customerName: partyName,
      partyType: accountEmployee ? 'EMPLEADO' : 'CLIENTE',
      employee: accountEmployee || undefined,
      customer: accountCustomer,
      invoiceType: resolvedInvoiceType,
      cashGiven: selectedPayment === 'PAGO_COMBINADO' ? v1 + v2 : paidNum,
      change: selectedPayment === 'PAGO_COMBINADO' ? Math.max(0, (v1 + v2) - totalAmount) : changeAmount,
      branchId: currentBranch.id,
      ticketNumber: nextTicket,
      ...(selectedPayment === 'PAGO_COMBINADO'
        ? {
            combinedPayments: [
              { method: combinedMethod1, amount: v1 },
              { method: combinedMethod2, amount: v2 },
            ],
          }
        : {}),
    };

    try {
      await addSaleRecord(saleData);
    } catch (e) {
      console.error('Firebase sale recording error:', e);
    }

    onSaleComplete?.({
      items: [...saleItemsForCheckout],
      total: totalAmount,
      paymentMethod: selectedPayment,
      customer: accountCustomer,
      employee: accountEmployee,
      partyType: accountEmployee ? 'EMPLEADO' : 'CLIENTE',
      employeeDiscountPercent: selectedParty?.type === 'EMPLEADO'
        ? employeeDiscountPercent
        : 0,
      employeeDiscountAmount: isEmp ? employeeDiscountAmount : 0,
      invoiceType: resolvedInvoiceType,
      cashGiven: selectedPayment === 'PAGO_COMBINADO' ? v1 + v2 : paidNum,
      change: selectedPayment === 'PAGO_COMBINADO' ? Math.max(0, (v1 + v2) - totalAmount) : changeAmount,
      ticketNumber: nextTicket,
      branchId: currentBranch.id,
    });

    // Auto-print ticket
    try {
      const ticketData = {
        items: [...saleItemsForCheckout],
        total: totalAmount,
        subtotal: rawSubtotal,
        paymentMethod: selectedPayment,
        customerName: partyName,
        customerDni: selectedPayment === 'CUENTA_CORRIENTE'
          ? selectedParty?.dni || selectedCustomer?.dniCuit || '--'
          : '--',
        customerVatCondition: selectedPayment === 'CUENTA_CORRIENTE'
          ? selectedParty?.customer?.vatCondition || selectedCustomer?.vatCondition || 'Consumidor Final'
          : 'Consumidor Final',
        invoiceType: resolvedInvoiceType,
        ticketNumber: nextTicket,
        cashGiven: selectedPayment === 'PAGO_COMBINADO' ? v1 + v2 : paidNum,
        change: selectedPayment === 'PAGO_COMBINADO' ? Math.max(0, (v1 + v2) - totalAmount) : changeAmount,
        operatorName: currentUser.fullName,
        employeeDiscountPercent: isEmp ? employeeDiscountPercent : 0,
        employeeDiscountAmount: employeeDiscountAmount,
        discountPercent: totalDiscountPercent,
        discountAmount: totalDiscountAmount,
        discountLabel: isEmp && manualDiscountPercent > 0
          ? 'Descuento empleado y adicional'
          : isEmp
          ? 'Descuento empleado'
          : 'Descuento',
        combinedPayments: selectedPayment === 'PAGO_COMBINADO' ? [
          { method: combinedMethod1, amount: v1 },
          { method: combinedMethod2, amount: v2 },
        ] : undefined,
      };
      const html = generateTicketHtml(ticketData, currentBranch);
      printTicket(html);
    } catch (printErr) {
      console.error('Auto-print error:', printErr);
    }

    setIsTicketModalOpen(false);
    setSaleItems([]);
    setSelectedCustomer(null);
    setSelectedParty(null);
    setEmployeeDiscountPercent(0);
    setManualDiscountPercent(0);
    setPaidWith('');
    setCombinedAmount1('');
    setCombinedAmount2('');
    showNotification('Venta registrada y guardada exitosamente en el sistema.');
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  };

  const handleArcaInvoiceCreated = async (inv: ElectronicInvoice) => {
    try {
      const v1 = parseFloat(combinedAmount1.replace(/\./g, '').replace(',', '.')) || 0;
      const v2 = parseFloat(combinedAmount2.replace(/\./g, '').replace(',', '.')) || 0;
      const isEmp = selectedParty?.type === 'EMPLEADO';

      await saveElectronicInvoice(inv);

      // Auto-print Arca Ticket
      try {
        const ticketData = {
          items: inv.items.map(i => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            subtotal: i.totalAmount,
            unitType: i.unitType
          })),
          total: inv.totalAmount,
          subtotal: inv.netAmount,
          vatAmount: inv.vatAmount21 + inv.vatAmount105,
          paymentMethod: selectedPayment,
          ticketNumber: inv.formattedNumber,
          customerName: inv.customer.name,
          customerDni: inv.customer.cuitDni,
          customerVatCondition: inv.customer.vatCondition,
          invoiceType: inv.cbteTipo === 1 ? 'FACTURA_A' : 
                       inv.cbteTipo === 6 ? 'FACTURA_B' : 
                       inv.cbteTipo === 3 ? 'NOTA_CREDITO_A' : 
                       inv.cbteTipo === 8 ? 'NOTA_CREDITO_B' : 
                       inv.cbteTipo === 11 ? 'FACTURA_C' : 'FACTURA_B',
          operatorName: currentUser.fullName,
          employeeDiscountAmount: employeeDiscountAmount,
          employeeDiscountPercent: isEmp ? employeeDiscountPercent : 0,
          discountAmount: totalDiscountAmount,
          discountPercent: totalDiscountPercent,
          discountLabel: selectedParty?.type === 'EMPLEADO' && manualDiscountPercent > 0
            ? 'Descuento empleado y adicional'
            : selectedParty?.type === 'EMPLEADO'
            ? 'Descuento empleado'
            : 'Descuento',
          cae: inv.cae,
          caeVto: inv.caeVto,
          qrUrl: inv.qrUrl
        };
        const html = generateTicketHtml(ticketData as any, currentBranch);
        printTicket(html);
      } catch (printErr) {
        console.error('ARCA auto-print error:', printErr);
      }

      await addAuditLog({
        id: `LOG-${Date.now()}`,
        date: inv.date,
        time: inv.time,
        user: currentUser.fullName,
        branch: currentBranch.id,
        operation: `Emisión POS de ${inv.cbteNombre}`,
        comprobante: inv.formattedNumber,
        pointOfSale: inv.pointOfSale,
        cae: inv.cae,
        result: 'EXITOSO',
        details: `Venta POS - ${isEmp ? 'Empleado' : 'Cliente'}: ${inv.customer.name} - Total: ${formatCurrency(inv.totalAmount)}`,
      });

      await addSaleRecord({
        items: [...saleItemsForCheckout],
        subtotal: rawSubtotal,
        employeeDiscountPercent: isEmp ? employeeDiscountPercent : 0,
        employeeDiscountAmount: isEmp ? employeeDiscountAmount : 0,
        manualDiscountPercent,
        manualDiscountAmount,
        discountPercent: totalDiscountPercent,
        discountAmount: totalDiscountAmount,
        total: totalAmount,
        paymentMethod: selectedPayment,
        customerName: inv.customer.name,
        partyType: isEmp ? 'EMPLEADO' : 'CLIENTE',
        employee: isEmp ? selectedParty.employee : undefined,
        customer: selectedParty?.customer || selectedCustomer,
        invoiceType: inv.cbteTipo === 1 ? 'FACTURA_A' : 'FACTURA_B',
        cashGiven: selectedPayment === 'PAGO_COMBINADO' ? v1 + v2 : paidNum,
        change: selectedPayment === 'PAGO_COMBINADO' ? Math.max(0, (v1 + v2) - totalAmount) : changeAmount,
        branchId: currentBranch.id,
        ticketNumber: inv.formattedNumber,
        electronicInvoiceId: inv.id,
        cae: inv.cae,
        ...(selectedPayment === 'PAGO_COMBINADO'
          ? {
              combinedPayments: [
                { method: combinedMethod1, amount: v1 },
                { method: combinedMethod2, amount: v2 },
              ],
            }
          : {}),
      });

      onSaleComplete?.({
        items: [...saleItemsForCheckout],
        total: totalAmount,
        paymentMethod: selectedPayment,
        customer: selectedParty?.customer || selectedCustomer,
        employee: selectedParty?.employee || null,
        partyType: isEmp ? 'EMPLEADO' : 'CLIENTE',
        employeeDiscountPercent: isEmp ? employeeDiscountPercent : 0,
        employeeDiscountAmount: isEmp ? employeeDiscountAmount : 0,
        invoiceType: inv.cbteTipo === 1 ? 'FACTURA_A' : 'FACTURA_B',
        cashGiven: selectedPayment === 'PAGO_COMBINADO' ? v1 + v2 : paidNum,
        change: selectedPayment === 'PAGO_COMBINADO' ? Math.max(0, (v1 + v2) - totalAmount) : changeAmount,
        ticketNumber: inv.formattedNumber,
        branchId: currentBranch.id,
      });

      setIsTicketModalOpen(false);
      setSaleItems([]);
      setSelectedCustomer(null);
      setSelectedParty(null);
      setEmployeeDiscountPercent(0);
      setManualDiscountPercent(0);
      setPaidWith('');
      setCombinedAmount1('');
      setCombinedAmount2('');

      setSelectedInvoiceForPrint(inv);
      setIsPrintModalOpen(true);
      showNotification(`Comprobante ${inv.formattedNumber} emitido en ARCA con CAE ${inv.cae}`);
    } catch (err: any) {
      console.error('Error saving invoice from POS:', err);
      showAlert(`Comprobante emitido con error al guardar: ${err.message}`);
    }
  };

  const handleApplyEdit = () => {
    if (selectedItemIndex >= 0 && selectedItemIndex < saleItems.length) {
      const val = parseFloat(editQtyOrWeight) || 0;
      if (val <= 0) {
        showAlert('La cantidad o peso debe ser un valor numérico mayor a 0.');
        return;
      }

      const current = saleItems[selectedItemIndex];

      const price = parseFloat(editPrice) || saleItems[selectedItemIndex].unitPrice;

      const isSuperOrAdmin = currentUser?.role === 'SUPERADMIN' || currentUser?.role === 'ADMIN';
      const canModifyPrices = isSuperOrAdmin || currentUser?.permissions?.canModifyPrices !== false;

      if (!canModifyPrices && current && current.unitPrice !== price) {
        showAlert('Acceso Denegado: Su perfil de usuario no posee permisos para modificar precios unitarios.');
        return;
      }

      setSaleItems((prev) => {
        const copy = [...prev];
        const newWeight = current.unitType === 'Kg' ? val : undefined;
        const newQty = current.unitType === 'Unid' ? Math.max(1, Math.round(val)) : undefined;
        const subtotal = Math.round(val * price);

        copy[selectedItemIndex] = {
          ...current,
          weight: newWeight,
          quantity: newQty,
          unitPrice: price,
          subtotal,
        };
        return copy;
      });

      setIsEditModalOpen(false);
      showNotification('Línea modificada correctamente.');
    }
  };

  // Lectura desde balanza electrónica COM1 (Modo Simulación / Prueba para entornos web sin puerto serial físico)
  const handleCaptureScale = () => {
    setScaleStatus('PESANDO');
    setTimeout(() => {
      // Simular variación realista de pesaje cárnico
      const randomWeights = [1.25, 2.15, 0.85, 3.42, 1.95, 2.35];
      const newWeight = randomWeights[Math.floor(Math.random() * randomWeights.length)];
      setLiveScaleWeight(newWeight);
      setScaleStatus('ESTABLE');
      showNotification(`[MODO PRUEBA / SIMULACIÓN] Balanza COM1 capturada: ${formatWeight(newWeight)}`);
    }, 300);
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-80px)] select-none bg-[#ebeef2] text-[#181c1f] font-sans p-1">
      {/* 1. TOP BAR: SCANNER INPUT & QUICK ACTIONS (WINFORMS DOCKED DENSITY) */}
      <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm mb-1 text-black">
        <form onSubmit={handleBarcodeSubmit} className="flex flex-wrap lg:flex-nowrap items-center gap-2 relative">
          {/* Main Barcode / PLU / Article Search input */}
          <div className="flex items-center gap-1.5 flex-1 min-w-[340px]">
            <label
              htmlFor="barcodeInput"
              className="text-[11px] font-bold text-black whitespace-nowrap flex items-center gap-1 uppercase"
            >
              <span className="bg-black text-white px-1 font-mono text-[10px]">F4</span>
              <span>BUSCAR ARTÍCULO / CÓDIGO:</span>
            </label>
            <div className="relative flex-1 flex items-center">
              <input
                ref={barcodeInputRef}
                id="barcodeInput"
                type="text"
                value={barcodeInput}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => {
                  setTimeout(() => setIsSearchFocused(false), 200);
                }}
                onChange={(e) => {
                  setBarcodeInput(e.target.value);
                  setHighlightedSearchIndex(-1);
                  setIsSearchFocused(true);
                }}
                placeholder="Escanee ticket de balanza / código de barras o busque artículo por nombre (ej. Coca Cola, Mayonesa)..."
                className="w-full h-[30px] pl-2.5 pr-14 bg-[#f7fafe] text-black font-mono text-[13px] font-bold border-2 border-black focus:bg-white focus:outline-none shadow-inner placeholder:text-[#555555]"
                autoComplete="off"
              />
              <div className="absolute right-2 flex items-center gap-1">
                {barcodeInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setBarcodeInput('');
                      setHighlightedSearchIndex(-1);
                      barcodeInputRef.current?.focus();
                    }}
                    className="text-[#aa3531] hover:text-black font-bold px-1 text-[11px] cursor-pointer"
                    title="Limpiar búsqueda"
                  >
                    ✕
                  </button>
                )}
                <Search className="w-3.5 h-3.5 text-black" />
              </div>

              {/* LIVE MATCHING PRODUCTS DROPDOWN POPOVER */}
              {isSearchFocused && matchingProducts.length > 0 && (
                <div className="absolute top-[34px] left-0 right-0 z-50 bg-white border-2 border-black shadow-xl overflow-hidden font-sans">
                  <div className="bg-black text-white px-2 py-1 text-[11px] font-bold flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Search className="w-3 h-3 text-[#aec7f7]" />
                      Coincidencias de búsqueda ({matchingProducts.length})
                    </span>
                    <span className="text-[10px] text-gray-300 font-normal">
                      [↑ ↓ Navegar | ENTER Seleccionar Cantidad]
                    </span>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto divide-y divide-[#ebeef2]">
                    {matchingProducts.map((p, idx) => {
                      const isHighlighted = idx === highlightedSearchIndex;
                      const isMeat = isMeatProduct(p);
                      const displayRubro =
                        p.rubro && p.rubro !== 'Carnes Vacunas'
                          ? p.rubro
                          : p.category && p.category !== 'Novillito'
                          ? p.category
                          : isMeat
                          ? 'Carnes'
                          : 'Almacén';

                      return (
                        <div
                          key={p.code}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectProductFromSearch(p);
                          }}
                          onMouseEnter={() => setHighlightedSearchIndex(idx)}
                          className={`px-3 py-2 cursor-pointer flex items-center justify-between transition-colors ${
                            isHighlighted
                              ? 'bg-[#002046] text-white font-bold'
                              : 'bg-white text-[#181c1f] hover:bg-[#e8f0fe]'
                          }`}
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-mono text-[11px] px-1 font-bold ${
                                  isHighlighted
                                    ? 'bg-[#1b365d] text-[#aec7f7]'
                                    : 'bg-[#e0e3e7] text-[#002046]'
                                }`}
                              >
                                CÓD: {p.code}
                              </span>
                              {p.barcode && (
                                <span
                                  className={`font-mono text-[10px] px-1 font-bold ${
                                    isHighlighted
                                      ? 'bg-[#00522c] text-white'
                                      : 'bg-[#dce5f5] text-[#002046]'
                                  }`}
                                >
                                  EAN: {p.barcode}
                                </span>
                              )}
                              <span
                                className={`text-[13px] uppercase font-bold tracking-tight ${
                                  isHighlighted ? 'text-white' : 'text-[#181c1f]'
                                }`}
                              >
                                {p.description}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                              <span
                                className={
                                  isHighlighted ? 'text-[#d4e3ff]' : 'text-[#44474e]'
                                }
                              >
                                Rubro:{' '}
                                <strong
                                  className={
                                    isHighlighted ? 'text-white' : 'text-black'
                                  }
                                >
                                  {displayRubro}
                                </strong>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span
                              className={`font-mono text-[14px] font-bold ${
                                isHighlighted ? 'text-[#d4e3ff]' : 'text-[#002046]'
                              }`}
                            >
                              {formatCurrency(p.price)}
                              <span
                                className={`text-[10px] font-normal font-sans ml-0.5 ${
                                  isHighlighted ? 'text-[#aec7f7]' : 'text-gray-600'
                                }`}
                              >
                                /{isMeat ? 'Kg' : 'Unid.'}
                              </span>
                            </span>
                            <button
                              type="button"
                              className={`h-[22px] px-2 text-[10px] font-bold uppercase rounded flex items-center gap-1 cursor-pointer ${
                                isHighlighted
                                  ? 'bg-[#00522c] text-white hover:bg-[#003822]'
                                  : 'bg-[#002046] text-white hover:bg-[#1b365d]'
                              }`}
                            >
                              <Plus className="w-3 h-3" />
                              <span>Ingresar Cantidad</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Customer / Employee info & Selector button */}
          <div className="flex items-center gap-1 text-black">
            <label className="text-[11px] font-bold text-black whitespace-nowrap">
              {selectedParty?.type === 'EMPLEADO' ? 'EMPLEADO:' : 'CLIENTE:'}
            </label>
            <div
              className={`flex items-center border px-2 h-[26px] text-[12px] font-bold ${
                selectedParty?.type === 'EMPLEADO'
                  ? 'bg-[#e6f4ea] border-[#00522c] text-black'
                  : 'bg-[#e0e3e7] border-black text-black'
              }`}
            >
              {selectedParty?.type === 'EMPLEADO' && (
                <UserCheck className="w-3.5 h-3.5 text-[#00522c] mr-1 shrink-0" />
              )}
              <span className="font-bold truncate max-w-[190px] text-black">
                {selectedCustomer
                  ? `${selectedCustomer.code} - ${selectedCustomer.name}`
                  : '0001 - Consumidor Final'}
              </span>
              {selectedParty?.type === 'EMPLEADO' && employeeDiscountPercent > 0 && (
                <span className="ml-1.5 bg-[#00522c] text-white text-[10px] font-bold px-1 py-0.2 rounded-xs font-mono">
                  -{employeeDiscountPercent}%
                </span>
              )}
              {selectedCustomer && (
                <button
                  type="button"
                  onClick={handleClearCustomerOrParty}
                  className="ml-1.5 text-[#aa3531] hover:font-bold text-[11px] cursor-pointer"
                  title="Quitar titular"
                >
                  ✕
                </button>
              )}
            </div>

            {/* If Employee is selected, allow quick % Discount adjuster button */}
            {selectedParty?.type === 'EMPLEADO' && (
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(true)}
                className="h-[26px] px-2 bg-[#00522c] hover:bg-[#003822] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                title="Modificar porcentaje de descuento para el empleado"
              >
                <Percent className="w-3 h-3" />
                <span>{employeeDiscountPercent > 0 ? `${employeeDiscountPercent}%` : '0% Desc'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCustomerModalOpen(true)}
              className="h-[26px] px-2 bg-[#ebeef2] hover:bg-[#d0d4dc] border border-black text-black text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <span className="bg-black text-white px-1 font-mono text-[10px] font-bold">F3</span>
              <span>Cta Cte</span>
            </button>
          </div>

          {/* Real-time search status indicator */}
          <div className="flex items-center gap-2 ml-auto text-[11px] text-black">
            {matchingProducts.length > 0 && barcodeInput.trim() ? (
              <span className="bg-[#d6e3ff] text-black px-2 py-0.5 font-bold border border-black/40 flex items-center gap-1">
                <Search className="w-3 h-3 text-black" />
                {matchingProducts.length} producto(s) encontrado(s)
              </span>
            ) : (
              <span className="text-black font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#008855]"></span>
                Búsqueda en tiempo real activa
              </span>
            )}
          </div>
        </form>

        {/* Sub-strip: Scanner Info & Toast Alert */}
        <div className="flex items-center justify-between mt-1 px-1 bg-[#f1f4f8] text-[11px] text-black border-t border-[#c4c6cf] pt-1">
          <div className="flex items-center gap-3 text-black">
            <span className="text-black font-bold">Modo Lector / EAN-13:</span>
            <span className="text-black font-medium">Prefijo Carnicería: <strong className="text-black font-mono font-bold">{currentBranch.scaleEanPrefix} (Pesables)</strong></span>
          </div>

          {lastNotification && (
            <div className="bg-[#aa3531] text-white px-2 py-0.5 text-[11px] font-bold animate-fade-in flex items-center gap-1">
              <span>●</span>
              <span>{lastNotification}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. MAIN POS WORKSPACE: 70% GRID / 30% SETTLEMENT PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-1 flex-1 min-h-0">
        {/* ================= LEFT (70%): DATAGRID OF SOLD PRODUCTS ================= */}
        <div className="lg:col-span-7 bg-white border border-[#74777f] flex flex-col shadow-sm">
          {/* Table Header Strip */}
          <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
            <div className="flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-[#aec7f7]" />
              <span>DETALLE DEL COMPROBANTE - TICKET N° {currentNextTicketNumber}</span>
            </div>
            <div className="font-mono text-[11px] text-[#d4e3ff]">
              {saleItems.length} LÍNEAS | PESO TOTAL: {totalWeight.toFixed(3).replace('.', ',')} KG
            </div>
          </div>

          {/* The DataGrid Table */}
          <div className="flex-1 overflow-y-auto overflow-x-auto min-h-[280px]">
            <table className="w-full text-left border-collapse select-none text-[12px]">
              <thead className="sticky top-0 bg-[#e5e8ec] text-[#181c1f] font-bold text-[11px] border-b border-[#74777f]">
                <tr className="h-[24px]">
                  <th className="w-[34px] px-1 text-center bg-[#e0e3e7] border-r border-[#c4c6cf]">#</th>
                  <th className="w-[70px] px-1.5 text-center border-r border-[#c4c6cf]">CÓDIGO</th>
                  <th className="px-2 border-r border-[#c4c6cf]">DESCRIPCIÓN DEL ARTÍCULO / CORTE</th>
                  <th className="w-[50px] px-1 text-center border-r border-[#c4c6cf]">TIPO</th>
                  <th className="w-[100px] px-1.5 text-right border-r border-[#c4c6cf]">CANT / PESO</th>
                  <th className="w-[110px] px-1.5 text-right border-r border-[#c4c6cf]">PRECIO U./KG</th>
                  <th className="w-[60px] px-1 text-right border-r border-[#c4c6cf]">BONIF%</th>
                  <th className="w-[120px] px-2 text-right border-r border-[#c4c6cf]">SUBTOTAL</th>
                  <th className="w-[54px] px-1 text-center bg-[#e0e3e7]">ELIM.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ebeef2] font-sans">
                {saleItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-[#74777f] italic bg-[#f7fafe]">
                      No hay artículos cargados en la venta actual. Escanee un código o digite un PLU arriba.
                    </td>
                  </tr>
                ) : (
                  saleItems.map((item, idx) => {
                    const isSelected = idx === selectedItemIndex;
                    const isKg = item.unitType === 'Kg';
                    const availableStock = getAvailableChamberStock(item.code);
                    const totalReqForCode = saleItems
                      .filter((x) => x.code === item.code)
                      .reduce((s, x) => s + (x.unitType === 'Kg' ? (x.weight || 0) : (x.quantity || 0)), 0);
                    const isExceeded = isKg && Boolean(item.scaleLabelCode) && totalReqForCode > availableStock;

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedItemIndex(idx)}
                        onDoubleClick={() => {
                          setEditQtyOrWeight(String(isKg ? item.weight : item.quantity));
                          setEditPrice(String(item.unitPrice));
                          setIsEditModalOpen(true);
                        }}
                        className={`h-[24px] cursor-pointer ${
                          isSelected
                            ? 'bg-[#002046] text-white font-bold'
                            : idx % 2 === 0
                            ? 'bg-white hover:bg-[#e5e8ec]'
                            : 'bg-[#f1f4f8] hover:bg-[#e5e8ec]'
                        }`}
                      >
                        <td
                          className={`text-center font-mono text-[11px] border-r border-[#c4c6cf] ${
                            isSelected ? 'bg-[#1b365d] text-white' : 'text-[#44474e]'
                          }`}
                        >
                          {isSelected ? `► ${idx + 1}` : idx + 1}
                        </td>
                        <td className="text-center font-mono text-[11px] border-r border-[#c4c6cf]">
                          {item.code}
                        </td>
                        <td className="px-2 border-r border-[#c4c6cf] truncate max-w-[340px]">
                          <span>{item.description}</span>
                          {item.scaleLabelCode && (
                            <span
                              className={`text-[10px] font-mono ml-1 ${
                                isSelected ? 'text-[#d6e3ff]' : 'text-[#74777f]'
                              }`}
                            >
                              [Bal. #{item.scaleLabelCode}]
                            </span>
                          )}
                          {isExceeded && (
                            <span className="ml-1.5 px-1.5 py-0.2 rounded bg-amber-600 text-white font-bold text-[9px] uppercase tracking-tight inline-block shadow-xs">
                              ⚠️ Ajuste negativo (Cám: {formatQuantity(availableStock, item.unitType)})
                            </span>
                          )}
                        </td>
                        <td
                          className={`text-center text-[10px] font-bold border-r border-[#c4c6cf] ${
                            isSelected ? 'bg-[#1b365d]' : 'bg-[#e5e8ec]'
                          }`}
                        >
                          {item.unitType}
                        </td>
                        <td className="text-right font-mono text-[12px] px-1.5 border-r border-[#c4c6cf]">
                          {isKg ? formatWeight(item.weight || 0) : `${item.quantity || 1} un`}
                        </td>
                        <td className="text-right font-mono text-[12px] px-1.5 border-r border-[#c4c6cf]">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td
                          className={`text-right font-mono text-[11px] px-1 border-r border-[#c4c6cf] ${
                            isSelected ? 'text-[#d4e3ff]' : 'text-[#74777f]'
                          }`}
                        >
                          {totalDiscountPercent > 0 ? `${totalDiscountPercent}%` : '0,00'}
                        </td>
                        <td
                          className={`text-right font-mono font-bold text-[12px] px-2 border-r border-[#c4c6cf] ${
                            isSelected ? 'text-[#ffdad6]' : 'text-[#002046]'
                          }`}
                        >
                          {formatCurrency(item.subtotal)}
                        </td>
                        <td className="text-center px-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteItem(idx);
                            }}
                            title={`Eliminar ${item.description}`}
                            className={`p-0.5 rounded cursor-pointer transition-all flex items-center justify-center mx-auto ${
                              isSelected
                                ? 'bg-[#aa3531] text-white hover:bg-[#8b2b28]'
                                : 'text-[#aa3531] hover:bg-[#ffdad6] hover:text-[#aa3531]'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
                {/* Empty filler rows to maintain Excel DataGrid look */}
                {Array.from({ length: Math.max(0, 10 - saleItems.length) }).map((_, i) => (
                  <tr key={`empty-${i}`} className="h-[22px] bg-[#f7fafe]/40">
                    <td className="border-r border-[#c4c6cf]/30"></td>
                    <td className="border-r border-[#c4c6cf]/30"></td>
                    <td className="border-r border-[#c4c6cf]/30"></td>
                    <td className="border-r border-[#c4c6cf]/30"></td>
                    <td className="border-r border-[#c4c6cf]/30"></td>
                    <td className="border-r border-[#c4c6cf]/30"></td>
                    <td className="border-r border-[#c4c6cf]/30"></td>
                    <td className="border-r border-[#c4c6cf]/30"></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Grid Footer Bar with Hotkey Action Controls */}
          <div className="h-[32px] bg-[#e0e3e7] border-t border-[#74777f] px-2 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1">
              <button
                disabled={saleItems.length === 0}
                onClick={() => openEditLine('quantity')}
                className="h-[24px] px-2 bg-[#ebeef2] hover:bg-white border border-[#74777f] text-[#002046] flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <span className="bg-[#1b365d] text-white px-1 font-mono text-[9px] font-bold">F6</span>
                <span>Modif. Cant/Peso</span>
              </button>
              <button
                disabled={saleItems.length === 0}
                onClick={() => openEditLine('price')}
                className="h-[24px] px-2 bg-[#ebeef2] hover:bg-white border border-[#74777f] text-[#002046] flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <span className="bg-[#1b365d] text-white px-1 font-mono text-[9px] font-bold">F7</span>
                <span>Modif. Precio</span>
              </button>
              <button
                disabled={saleItems.length === 0}
                onClick={() => handleDeleteItem(selectedItemIndex)}
                className="h-[24px] px-2 bg-[#ebeef2] hover:bg-[#ffdad6] border border-[#74777f] text-[#aa3531] flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <span className="bg-[#aa3531] text-white px-1 font-mono text-[9px] font-bold">Supr</span>
                <span>Quitar Ítem</span>
              </button>
              <button
                disabled={saleItems.length === 0}
                onClick={() => void handleClearSale()}
                className="h-[24px] px-2 bg-[#ebeef2] hover:bg-[#ffdad6] border border-[#74777f] text-[#aa3531] flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <span className="bg-[#aa3531] text-white px-1 font-mono text-[9px] font-bold">F11</span>
                <span>Limpiar Venta</span>
              </button>
            </div>

            <div className="flex items-center gap-3 text-[#181c1f]">
              <span>
                Renglones: <strong>{saleItems.length}</strong>
              </span>
              <span className="bg-[#d0d4dc] px-1.5 py-0.5 font-bold text-[10px]">
                Modo: INSERCIÓN RÁPIDA
              </span>
            </div>
          </div>
        </div>

        {/* ================= RIGHT (30%): TOTALS & PAYMENT SETTLEMENT PANEL ================= */}
        <div className="lg:col-span-3 flex flex-col gap-1 overflow-y-auto max-h-full pr-0.5">

          {/* FISCAL BREAKDOWN & ACCUMULATOR */}
          <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm flex flex-col gap-1 text-[12px]">
            <div className="flex justify-between items-center text-[#44474e]">
              <span>Subtotal Neto Gravado:</span>
              <span className="font-mono text-[#181c1f] font-semibold">{formatCurrency(netAmount)}</span>
            </div>
            <div className="flex justify-between items-center text-[#44474e]">
              <span>I.V.A. Débito Fiscal (21,0%):</span>
              <span className="font-mono text-[#181c1f] font-semibold">{formatCurrency(vatAmount)}</span>
            </div>
            <div className="flex justify-between items-center text-[#44474e]">
              <span>Total Ítems:</span>
              <span className="font-mono text-[#181c1f] font-semibold">
                {saleItems.length} ({totalWeight.toFixed(3).replace('.', ',')} Kg, {totalUnits} Un.)
              </span>
            </div>

            {/* BIG PROMINENT POS TOTAL DISPLAY */}
            <div className="bg-[#002046] text-white p-2 flex flex-col justify-center items-end mt-1 border border-[#001b3d]">
              {totalDiscountAmount > 0 ? (
                <div className="w-full flex items-center justify-between text-[11px] font-mono text-[#d4e3ff] pb-1 mb-1 border-b border-white/20">
                  <span>SUBTOTAL: {formatCurrency(rawSubtotal)}</span>
                  <span className="bg-[#00522c] text-[#74dc9e] font-bold px-1 py-0.2 text-[10px]">
                    DESCUENTO {totalDiscountPercent}% (-{formatCurrency(totalDiscountAmount)})
                  </span>
                </div>
              ) : null}
              <span className="text-[11px] font-mono text-[#d4e3ff] font-bold self-start uppercase">
                {totalDiscountAmount > 0
                  ? 'TOTAL CON DESCUENTO A PAGAR:'
                  : 'TOTAL A PAGAR:'}
              </span>
              <div className="font-mono text-[28px] font-black tracking-tight text-white">
                {formatCurrency(totalAmount)}
              </div>
            </div>
            {manualDiscountPercent > 0 && (
              <div className="flex justify-between text-[11px] font-bold text-[#aa3531]">
                <span>DESCUENTO ADICIONAL ({manualDiscountPercent}%)</span>
                <span>-{formatCurrency(manualDiscountAmount)}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1 mt-1">
              <button
                type="button"
                onClick={() => {
                  setDiscountInput(manualDiscountPercent ? String(manualDiscountPercent) : '');
                  setIsDiscountModalOpen(true);
                }}
                disabled={saleItems.length === 0}
                className="h-[32px] border border-[#74777f] bg-[#ebeef2] hover:bg-[#e0e3e7] text-[#002046] text-[11px] font-bold disabled:opacity-40"
              >
                <Percent className="inline w-3.5 h-3.5 mr-1" />
                {manualDiscountPercent ? `Descuento ${manualDiscountPercent}%` : 'Aplicar descuento'} [F5]
              </button>
              <button
                type="button"
                onClick={() => {
                  if (saleItems.length === 0) return;
                  setTicketInvoiceType('FACTURA_B');
                  setIsCheckoutModalOpen(true);
                }}
                disabled={saleItems.length === 0}
                className="h-[32px] bg-[#00522c] hover:bg-[#003822] text-white text-[12px] font-bold flex items-center justify-center gap-1 disabled:opacity-40"
              >
                <Banknote className="w-4 h-4" />
                COBRAR [F12]
              </button>
            </div>
          </div>

          {isCheckoutModalOpen && (
            <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-3">
              <div className="win-panel bg-[#d4d0c8] max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border-2 border-white">
                <div className="win-titlebar p-2 bg-[#002046] text-white flex items-center justify-between">
                  <span className="font-bold text-xs">COBRANZA — MEDIO DE PAGO Y COMPROBANTE</span>
                  <button type="button" onClick={() => setIsCheckoutModalOpen(false)} className="bg-[#c0c0c0] text-black px-2">X</button>
                </div>
                <div className="p-2 overflow-y-auto flex flex-col gap-2">
          {/* PAYMENT METHOD SELECTORS WITH HOTKEYS */}
          <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm flex flex-col gap-1">
            <div className="text-[10px] font-bold uppercase text-[#44474e] flex items-center justify-between">
              <span>Forma de Pago Seleccionada:</span>
              <span className="text-[#aa3531] font-mono font-bold">
                {selectedPayment.replace('_', ' ')}
              </span>
            </div>

            {/* 6 PAYMENT METHOD BUTTONS IN 3x2 GRID */}
            <div className="grid grid-cols-3 gap-1">
              {/* F8 EFECTIVO */}
              <button
                type="button"
                onClick={() => setSelectedPayment('EFECTIVO')}
                className={`h-[36px] px-1 flex flex-col items-center justify-center text-[10px] font-bold border cursor-pointer transition-colors ${
                  selectedPayment === 'EFECTIVO'
                    ? 'bg-[#002046] text-white border-[#002046]'
                    : 'bg-[#ebeef2] text-[#181c1f] border-[#c4c6cf] hover:bg-[#e0e3e7]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span
                    className={`px-1 text-[8px] font-mono font-bold ${
                      selectedPayment === 'EFECTIVO' ? 'bg-white text-[#002046]' : 'bg-[#1b365d] text-white'
                    }`}
                  >
                    F8
                  </span>
                  <span>EFECTIVO</span>
                </div>
                <Banknote className="w-3.5 h-3.5 mt-0.5" />
              </button>

              {/* F9 TARJETA */}
              <button
                type="button"
                onClick={() => setSelectedPayment('TARJETA')}
                className={`h-[36px] px-1 flex flex-col items-center justify-center text-[10px] font-bold border cursor-pointer transition-colors ${
                  selectedPayment === 'TARJETA'
                    ? 'bg-[#002046] text-white border-[#002046]'
                    : 'bg-[#ebeef2] text-[#181c1f] border-[#c4c6cf] hover:bg-[#e0e3e7]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span
                    className={`px-1 text-[8px] font-mono font-bold ${
                      selectedPayment === 'TARJETA'
                        ? 'bg-white text-[#002046]'
                        : 'bg-[#1b365d] text-white'
                    }`}
                  >
                    F9
                  </span>
                  <span>TARJETA</span>
                </div>
                <CreditCard className="w-3.5 h-3.5 mt-0.5" />
              </button>

              {/* F10 QR */}
              <button
                type="button"
                onClick={() => setSelectedPayment('QR')}
                className={`h-[36px] px-1 flex flex-col items-center justify-center text-[10px] font-bold border cursor-pointer transition-colors ${
                  selectedPayment === 'QR'
                    ? 'bg-[#002046] text-white border-[#002046]'
                    : 'bg-[#ebeef2] text-[#181c1f] border-[#c4c6cf] hover:bg-[#e0e3e7]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span
                    className={`px-1 text-[8px] font-mono font-bold ${
                      selectedPayment === 'QR' ? 'bg-white text-[#002046]' : 'bg-[#1b365d] text-white'
                    }`}
                  >
                    F10
                  </span>
                  <span>QR</span>
                </div>
                <QrCode className="w-3.5 h-3.5 mt-0.5" />
              </button>

              {/* TRANSFERENCIA */}
              <button
                type="button"
                onClick={() => setSelectedPayment('TRANSFERENCIA')}
                className={`h-[36px] px-1 flex flex-col items-center justify-center text-[10px] font-bold border cursor-pointer transition-colors ${
                  selectedPayment === 'TRANSFERENCIA'
                    ? 'bg-[#002046] text-white border-[#002046]'
                    : 'bg-[#ebeef2] text-[#181c1f] border-[#c4c6cf] hover:bg-[#e0e3e7]'
                }`}
              >
                <span className="flex items-center gap-1"><kbd className="px-1 text-[8px] bg-[#1b365d] text-white">F5</kbd> TRANSFER.</span>
                <ArrowLeftRight className="w-3.5 h-3.5 mt-0.5" />
              </button>

              {/* COMBINADO */}
              <button
                type="button"
                onClick={() => {
                  setSelectedPayment('PAGO_COMBINADO');
                  setCombinedAmount1('');
                  setCombinedAmount2('');
                }}
                className={`h-[36px] px-1 flex flex-col items-center justify-center text-[10px] font-bold border cursor-pointer transition-colors ${
                  selectedPayment === 'PAGO_COMBINADO'
                    ? 'bg-[#002046] text-white border-[#002046]'
                    : 'bg-[#ebeef2] text-[#181c1f] border-[#c4c6cf] hover:bg-[#e0e3e7]'
                }`}
              >
                <span className="flex items-center gap-1"><kbd className="px-1 text-[8px] bg-[#1b365d] text-white">F6</kbd> COMBINADO</span>
                <Split className="w-3.5 h-3.5 mt-0.5" />
              </button>

              {/* F11 CUENTA CORRIENTE */}
              <button
                type="button"
                onClick={() => {
                  setSelectedPayment('CUENTA_CORRIENTE');
                  setIsCustomerModalOpen(true);
                }}
                className={`h-[36px] px-1 flex flex-col items-center justify-center text-[10px] font-bold border cursor-pointer transition-colors ${
                  selectedPayment === 'CUENTA_CORRIENTE'
                    ? 'bg-[#002046] text-white border-[#002046]'
                    : 'bg-[#ebeef2] text-[#181c1f] border-[#c4c6cf] hover:bg-[#e0e3e7]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span
                    className={`px-1 text-[8px] font-mono font-bold ${
                      selectedPayment === 'CUENTA_CORRIENTE'
                        ? 'bg-white text-[#002046]'
                        : 'bg-[#1b365d] text-white'
                    }`}
                  >
                    F11
                  </span>
                  <span>CTA. CTE.</span>
                </div>
                <UserCheck className="w-3.5 h-3.5 mt-0.5" />
              </button>
            </div>

            {/* CASH CALCULATOR (PAGA CON / VUELTO) */}
            {selectedPayment === 'EFECTIVO' && (
              <div className="bg-[#f1f4f8] p-1.5 border border-[#c4c6cf] flex flex-col gap-1 mt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <label className="text-[11px] font-bold text-[#181c1f]">PAGA CON ($):</label>
                    {totalAmount > 0 && (
                      <button
                        type="button"
                        onClick={() => setPaidWith(String(totalAmount))}
                        className="text-[9px] font-bold bg-[#e0e3e7] hover:bg-[#c4c6cf] px-1.5 py-0.5 border border-[#74777f] text-[#002046] cursor-pointer"
                        title="Pagar con monto exacto"
                      >
                        Exacto
                      </button>
                    )}
                  </div>
                  <input
                    ref={paidWithInputRef}
                    type="text"
                    value={paidWith}
                    onChange={(e) => setPaidWith(e.target.value)}
                    placeholder="0,00"
                    className={`w-[120px] h-[24px] px-2 bg-white text-right font-mono text-[14px] font-bold border focus:outline-none ${
                      paidNum > 0 && paidNum < totalAmount
                        ? 'text-[#aa3531] border-[#aa3531] bg-[#fff5f5]'
                        : paidNum >= totalAmount && totalAmount > 0
                        ? 'text-[#00522c] border-[#00522c]'
                        : 'text-[#002046] border-[#74777f]'
                    }`}
                  />
                </div>
                <div
                  className={`flex items-center justify-between px-2 py-1 border ${
                    paidNum === 0 && totalAmount > 0
                      ? 'bg-[#fff0ee] border-[#ffdad6]'
                      : paidNum > 0 && paidNum < totalAmount
                      ? 'bg-[#ffebe9] border-[#ffdad6]'
                      : 'bg-[#e0e3e7] border-[#c4c6cf]'
                  }`}
                >
                  <span
                    className={`text-[11px] font-bold ${
                      paidNum < totalAmount && totalAmount > 0 ? 'text-[#aa3531]' : 'text-[#44474e]'
                    }`}
                  >
                    {paidNum === 0 && totalAmount > 0
                      ? 'FALTA INGRESAR PAGO:'
                      : paidNum > 0 && paidNum < totalAmount
                      ? 'FALTA COBRAR:'
                      : 'VUELTO / CAMBIO:'}
                  </span>
                  <span
                    className={`font-mono font-extrabold ${
                      paidNum === 0 && totalAmount > 0
                        ? 'text-[#aa3531] text-[12px]'
                        : paidNum > 0 && paidNum < totalAmount
                        ? 'text-[#aa3531] text-[14px]'
                        : 'text-[#002046] text-[16px]'
                    }`}
                  >
                    {paidNum === 0 && totalAmount > 0
                      ? `Faltan ${formatCurrency(totalAmount)}`
                      : paidNum > 0 && paidNum < totalAmount
                      ? `- ${formatCurrency(totalAmount - paidNum)}`
                      : formatCurrency(changeAmount)}
                  </span>
                </div>
              </div>
            )}

            {/* COMBINED PAYMENT PANEL (PAGO MIXTO RECONFIGURABLE) */}
            {selectedPayment === 'PAGO_COMBINADO' && (() => {
              const val1 = parseFloat(combinedAmount1.replace(/\./g, '').replace(',', '.')) || 0;
              const val2 = parseFloat(combinedAmount2.replace(/\./g, '').replace(',', '.')) || 0;
              const totalCobrado = val1 + val2;
              const saldoFaltante = Math.max(0, totalAmount - totalCobrado);
              const vueltoCombinado = Math.max(0, totalCobrado - totalAmount);

              return (
                <div className="bg-[#f1f4f8] p-2 border border-[#c4c6cf] flex flex-col gap-1.5 mt-1 text-[11px]">
                  <div className="flex items-center justify-between border-b border-[#c4c6cf] pb-1">
                    <span className="font-bold text-[#002046] uppercase">DESGLOSE PAGO MIXTO:</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCombinedAmount1('');
                          setCombinedAmount2('');
                        }}
                        className="text-[9px] bg-[#e0e3e7] hover:bg-[#c4c6cf] text-[#181c1f] px-1.5 py-0.5 font-bold border border-[#74777f]/40 cursor-pointer"
                        title="Poner ambos importes en 0"
                      >
                        Poner en 0
                      </button>
                      {totalAmount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const half = Math.round(totalAmount / 2);
                            setCombinedAmount1(String(half));
                            setCombinedAmount2(String(totalAmount - half));
                          }}
                          className="text-[9px] bg-[#d6e3ff] hover:bg-[#b5ccf8] text-[#002046] px-1.5 py-0.5 font-bold border border-[#74777f]/30 cursor-pointer"
                          title="Dividir en partes iguales solo si se desea"
                        >
                          50% / 50%
                        </button>
                      )}
                    </div>
                  </div>

                  {/* PRESET COMBOS */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[9px]">
                    <span className="text-[#74777f] font-semibold whitespace-nowrap">Combos:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCombinedMethod1('QR');
                        setCombinedMethod2('TARJETA');
                      }}
                      className="px-1 bg-white border border-[#c4c6cf] hover:bg-[#e0e3e7] text-[#002046] font-bold cursor-pointer whitespace-nowrap"
                    >
                      QR + Tarjeta
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCombinedMethod1('TRANSFERENCIA');
                        setCombinedMethod2('QR');
                      }}
                      className="px-1 bg-white border border-[#c4c6cf] hover:bg-[#e0e3e7] text-[#002046] font-bold cursor-pointer whitespace-nowrap"
                    >
                      Transf + QR
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCombinedMethod1('EFECTIVO');
                        setCombinedMethod2('TARJETA');
                      }}
                      className="px-1 bg-white border border-[#c4c6cf] hover:bg-[#e0e3e7] text-[#002046] font-bold cursor-pointer whitespace-nowrap"
                    >
                      Efectivo + Tarjeta
                    </button>
                  </div>

                  {/* METHOD 1 SELECT & INPUT */}
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 font-bold text-[#181c1f]">
                      <span>1. Medio:</span>
                      <select
                        value={combinedMethod1}
                        onChange={(e) => setCombinedMethod1(e.target.value as PaymentMethod)}
                        className="h-[22px] px-1 text-[10px] font-bold bg-white border border-[#74777f] cursor-pointer"
                      >
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="TARJETA">Tarjeta</option>
                        <option value="QR">Cobro QR</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                        <option value="CUENTA_CORRIENTE">Cta. Cte.</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      {val2 > 0 && val1 === 0 && totalAmount > val2 && (
                        <button
                          type="button"
                          onClick={() => setCombinedAmount1(String(totalAmount - val2))}
                          className="text-[9px] bg-[#d6e3ff] hover:bg-[#b5ccf8] text-[#002046] px-1 py-0.5 font-bold border border-[#74777f]/40 cursor-pointer"
                          title="Completar el saldo restante con el medio 1"
                        >
                          Resto
                        </button>
                      )}
                      <input
                        ref={combinedAmount1Ref}
                        type="text"
                        value={combinedAmount1}
                        onChange={(e) => setCombinedAmount1(e.target.value)}
                        placeholder="0,00"
                        className="w-[100px] h-[24px] px-2 bg-white text-right font-mono text-[13px] font-bold text-[#002046] border border-[#74777f] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* METHOD 2 SELECT & INPUT */}
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 font-bold text-[#181c1f]">
                      <span>2. Medio:</span>
                      <select
                        value={combinedMethod2}
                        onChange={(e) => setCombinedMethod2(e.target.value as PaymentMethod)}
                        className="h-[22px] px-1 text-[10px] font-bold bg-white border border-[#74777f] cursor-pointer"
                      >
                        <option value="TARJETA">Tarjeta</option>
                        <option value="QR">Cobro QR</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="CUENTA_CORRIENTE">Cta. Cte.</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      {val1 > 0 && val2 === 0 && totalAmount > val1 && (
                        <button
                          type="button"
                          onClick={() => setCombinedAmount2(String(totalAmount - val1))}
                          className="text-[9px] bg-[#d6e3ff] hover:bg-[#b5ccf8] text-[#002046] px-1 py-0.5 font-bold border border-[#74777f]/40 cursor-pointer"
                          title="Completar el saldo restante con el medio 2"
                        >
                          Resto
                        </button>
                      )}
                      <input
                        type="text"
                        value={combinedAmount2}
                        onChange={(e) => setCombinedAmount2(e.target.value)}
                        placeholder="0,00"
                        className="w-[100px] h-[24px] px-2 bg-white text-right font-mono text-[13px] font-bold text-[#002046] border border-[#74777f] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* SUMMARY & BALANCE BADGE */}
                  <div className="bg-[#e0e3e7] px-2 py-1.5 border border-[#c4c6cf] text-[10px] font-mono flex flex-col gap-0.5">
                    <div className="flex justify-between text-[#002046] font-bold">
                      <span>TOTAL COBRADO:</span>
                      <span>
                        {combinedMethod1.replace('_', ' ')} ({formatCurrency(val1)}) +{' '}
                        {combinedMethod2.replace('_', ' ')} ({formatCurrency(val2)}) ={' '}
                        {formatCurrency(totalCobrado)}
                      </span>
                    </div>
                    {totalAmount > 0 && (
                      <div className="flex justify-between font-bold pt-0.5 border-t border-[#c4c6cf]/60">
                        {totalCobrado === 0 ? (
                          <span className="text-[#44474e] italic">
                            Ingrese los importes a abonar por el cliente
                          </span>
                        ) : saldoFaltante > 0 ? (
                          <>
                            <span className="text-[#b3261e]">FALTA COBRAR:</span>
                            <span className="text-[#b3261e] font-extrabold">{formatCurrency(saldoFaltante)}</span>
                          </>
                        ) : vueltoCombinado > 0 ? (
                          <>
                            <span className="text-[#00522c]">VUELTO / CAMBIO:</span>
                            <span className="text-[#00522c] font-extrabold">{formatCurrency(vueltoCombinado)}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[#00522c]">✓ TOTAL EXACTO CUBIERTO</span>
                            <span className="text-[#00522c] font-extrabold">{formatCurrency(totalAmount)}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* If Cuenta Corriente selected, show current selected customer or employee status */}
            {selectedPayment === 'CUENTA_CORRIENTE' && (selectedCustomer || selectedParty) && (
              <div
                className={`p-2 border flex flex-col text-[11px] mt-1 gap-1 ${
                  selectedParty?.type === 'EMPLEADO'
                    ? 'bg-[#f2fcf5] border-[#00522c]/40'
                    : 'bg-[#f7fafe] border-[#c4c6cf]'
                }`}
              >
                <div className="flex justify-between items-center font-bold">
                  <span
                    className={
                      selectedParty?.type === 'EMPLEADO' ? 'text-[#00522c]' : 'text-[#002046]'
                    }
                  >
                    {selectedParty?.type === 'EMPLEADO' ? 'Cuenta Empleado:' : 'Cliente Cta Cte:'}
                  </span>
                  <span className="truncate max-w-[140px] text-right">
                    {selectedParty ? selectedParty.name : selectedCustomer?.name}
                  </span>
                </div>

                {selectedParty?.type === 'EMPLEADO' && (
                  <div className="flex justify-between text-[10px] text-[#00522c] bg-white/70 px-1 py-0.5 border border-[#00522c]/20">
                    <span>Legajo / Cargo:</span>
                    <span className="font-semibold">
                      {selectedParty.legajo || selectedParty.code} • {selectedParty.role || 'Empleado'}
                    </span>
                  </div>
                )}

                {selectedParty?.type === 'EMPLEADO' && employeeDiscountPercent > 0 && (
                  <div className="flex justify-between text-[10px] text-[#00522c] font-bold">
                    <span>Descuento Personal ({employeeDiscountPercent}%):</span>
                    <span className="font-mono">-{formatCurrency(employeeDiscountAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between text-[#44474e]">
                  <span>Saldo Actual:</span>
                  <span className="font-mono text-[#aa3531] font-bold">
                    {formatCurrency(
                      selectedParty?.currentBalance ?? selectedCustomer?.currentBalance ?? 0
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-[#44474e] border-t border-dashed border-[#c4c6cf] pt-0.5">
                  <span>Nuevo Saldo a Cargar:</span>
                  <span className="font-mono text-[#002046] font-bold">
                    {formatCurrency(
                      (selectedParty?.currentBalance ?? selectedCustomer?.currentBalance ?? 0) +
                        totalAmount
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* FINAL EMISSION ACTIONS */}
          <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm flex flex-col gap-2 mt-auto">
            <label className="text-[11px] font-bold text-[#002046]">
              TIPO DE COMPROBANTE
              <select
                value={ticketInvoiceType}
                onChange={(event) => setTicketInvoiceType(event.target.value as 'RECIBO_COMUN' | 'FACTURA_B' | 'FACTURA_A')}
                className="mt-1 h-[32px] w-full border border-[#74777f] bg-white px-2 text-[12px]"
              >
                <option value="RECIBO_COMUN">Ticket común — Consumidor Final</option>
                <option value="FACTURA_B">Factura B — Consumidor Final</option>
                <option value="FACTURA_A">Factura A — Cliente con CUIT</option>
              </select>
            </label>
            {ticketInvoiceType === 'FACTURA_A' && (
              <div className="text-[10px] text-[#44474e]">
                Se solicitarán o podrán elegirse los datos fiscales del cliente antes de emitir.
              </div>
            )}
            <button
              type="button"
              onClick={() => handleFacturar(ticketInvoiceType)}
              className="w-full h-[38px] bg-[#aa3531] hover:bg-[#891c1d] text-white font-bold flex items-center justify-center gap-2"
            >
              <Receipt className="w-4 h-4" />
              {ticketInvoiceType === 'RECIBO_COMUN'
                ? 'Confirmar cobro e imprimir ticket [F12]'
                : `Continuar con ${ticketInvoiceType === 'FACTURA_A' ? 'Factura A' : 'Factura B'} en ARCA [F12]`}
            </button>

            {/* CANCELAR VENTA */}
            <button
              type="button"
              onClick={async () => {
                const confirmed = await showConfirm('¿Anular y cancelar la venta en curso?');
                if (confirmed) {
                  resetSaleToBlank();
                  showNotification('Venta cancelada. Todo restablecido en 0.');
                  barcodeInputRef.current?.focus();
                }
              }}
              className="w-full h-[22px] bg-[#ebeef2] hover:bg-[#ffdad6] text-[#74777f] hover:text-[#aa3531] flex items-center justify-center gap-1 text-[10px] cursor-pointer"
            >
              <span>[Esc]</span>
              <span>CANCELAR / ANULAR VENTA ACTUAL</span>
            </button>
          </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <WindowsModal
        isOpen={isDiscountModalOpen}
        onClose={() => setIsDiscountModalOpen(false)}
        title="APLICAR DESCUENTO A LA VENTA"
        icon={<Percent className="w-4 h-4 text-[#aec7f7]" />}
        maxWidth="max-w-sm"
      >
        <div className="flex flex-col gap-3 p-2 text-[12px]">
          <label className="font-bold text-[#002046]">
            Porcentaje de descuento (0 a 100):
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={discountInput}
                onChange={(event) => setDiscountInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleApplyDiscount();
                  }
                }}
                className="h-[34px] w-full border border-[#74777f] px-2 text-right font-mono text-[16px]"
                autoFocus
              />
              <span className="font-bold">%</span>
            </div>
          </label>
          <div className="flex justify-between border-t border-[#c4c6cf] pt-2">
            <span>Descuento calculado:</span>
            <strong className="text-[#aa3531]">
              {formatCurrency(
                Math.round(
                  (rawSubtotal - employeeDiscountAmount) *
                    ((Number(discountInput.replace(',', '.')) || 0) / 100)
                )
              )}
            </strong>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#c4c6cf] pt-2">
            <button
              type="button"
              onClick={() => {
                setManualDiscountPercent(0);
                setDiscountInput('');
                setIsDiscountModalOpen(false);
              }}
              className="h-[28px] px-3 border border-[#74777f] bg-[#ebeef2]"
            >
              Quitar descuento
            </button>
            <button
              type="button"
              onClick={handleApplyDiscount}
              className="h-[28px] px-4 bg-[#002046] text-white font-bold"
            >
              Aplicar [Enter]
            </button>
          </div>
        </div>
      </WindowsModal>

      {/* MODAL 1: Real-time customer/employee search for Cuenta Corriente */}
      <CustomerSelectModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        customers={customers}
        employees={allEmployees}
        currentSaleSubtotal={rawSubtotal}
        initialDiscountPercent={employeeDiscountPercent}
        onSelectParty={handleSelectParty}
        onViewStatement={() => {
          if (onOpenCustomerManagement) onOpenCustomerManagement();
        }}
      />

      {/* MODAL INGRESAR CANTIDAD MANUALMENTE AL BUSCAR PRODUCTO */}
      <WindowsModal
        isOpen={isAddAmountModalOpen}
        onClose={() => {
          setIsAddAmountModalOpen(false);
          setProductToAmount(null);
          setTimeout(() => barcodeInputRef.current?.focus(), 10);
        }}
        title="INGRESAR CANTIDAD DEL PRODUCTO - PUNTO DE VENTA"
        icon={<Receipt className="w-4 h-4 text-[#aec7f7]" />}
        maxWidth="max-w-md"
      >
        {productToAmount && (() => {
          const isMeat = productToAmount.unitType === 'Kg';
          const rawVal = parseFloat(amountInput.replace(',', '.')) || 0;
          const validQty = rawVal > 0 ? (isMeat ? Math.round(rawVal * 1000) / 1000 : Math.max(1, Math.round(rawVal))) : 0;
          const calculatedSubtotal = Math.round(validQty * productToAmount.price * 100) / 100;
          const displayRubro =
            productToAmount.rubro && productToAmount.rubro !== 'Carnes Vacunas'
              ? productToAmount.rubro
              : productToAmount.category && productToAmount.category !== 'Novillito'
              ? productToAmount.category
              : isMeat
              ? 'Carnes'
              : 'Almacén';

          return (
            <div className="flex flex-col gap-3 p-2 text-[12px]">
              {/* Header Info Banner */}
              <div className="bg-[#002046] text-white p-2.5 border border-[#001b3d] shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] bg-[#1b365d] text-[#aec7f7] px-1.5 py-0.5 font-bold">
                      CÓD: {productToAmount.code}
                    </span>
                    {productToAmount.barcode && (
                      <span className="font-mono text-[10px] bg-[#00522c] text-white px-1.5 py-0.5 font-bold">
                        EAN: {productToAmount.barcode}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-sans text-gray-300 uppercase">
                    Rubro: {displayRubro}
                  </span>
                </div>
                <h3 className="text-[15px] font-bold uppercase tracking-tight text-white mt-1">
                  {productToAmount.description}
                </h3>
                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[#1b365d] text-[11px]">
                  <span>{isMeat ? 'Precio por Kg:' : 'Precio Unitario:'}</span>
                  <span className="font-mono text-[14px] font-bold text-[#aec7f7]">
                    {formatCurrency(productToAmount.price)}{' '}
                    <span className="text-[10px] font-normal font-sans">
                      / {isMeat ? 'Kg' : 'Unid.'}
                    </span>
                  </span>
                </div>
              </div>

              {/* Manual Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleConfirmAddAmount();
                }}
                className="flex flex-col gap-2.5 bg-[#f7fafe] p-3 border border-[#c4c6cf]"
              >
                <label htmlFor="amountModalInput" className="font-bold text-[#002046] text-[13px] flex items-center justify-between">
                  <span>
                    {isMeat
                      ? 'CANTIDAD / PESO MANUAL (KG):'
                      : 'CANTIDAD DEL PRODUCTO (UNIDADES):'}
                  </span>
                  <span className="text-[11px] font-normal text-[#555555]">
                    Ingreso manual por teclado
                  </span>
                </label>

                <div className="relative flex items-center">
                  <input
                    ref={amountInputRef}
                    id="amountModalInput"
                    type="number"
                    step={isMeat ? '0.001' : '1'}
                    min={isMeat ? '0.001' : '1'}
                    value={amountInput}
                    placeholder={isMeat ? '0.000' : 'Ingrese cantidad...'}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Protect against accidentally scanning an 8-13 digit barcode into the quantity field
                      if (val.length >= 7 && !val.includes('.')) {
                        return;
                      }
                      setAmountInput(val);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsAddAmountModalOpen(false);
                        setProductToAmount(null);
                        setTimeout(() => barcodeInputRef.current?.focus(), 10);
                      }
                    }}
                    className="w-full h-[40px] px-3 bg-white font-mono text-[22px] font-bold text-black border-2 border-[#002046] focus:outline-none focus:ring-2 focus:ring-[#002046] shadow-inner text-center pr-14"
                    autoFocus
                  />
                  <span className="absolute right-3 font-mono font-bold text-[12px] text-[#002046] pointer-events-none">
                    {isMeat ? 'Kg' : 'Unid.'}
                  </span>
                </div>

                {/* Subtotal Calculation Display */}
                <div className="mt-1 p-2.5 bg-white border border-[#c4c6cf] flex items-center justify-between">
                  <span className="font-bold text-[#44474e] text-[12px]">
                    Subtotal (
                    {isMeat
                      ? `${formatWeight(validQty)}`
                      : `${validQty} ${validQty === 1 ? 'Unidad' : 'Unidades'}`}{' '}
                    × {formatCurrency(productToAmount.price)}):
                  </span>
                  <span className="font-mono text-[18px] font-extrabold text-[#002046]">
                    {formatCurrency(calculatedSubtotal)}
                  </span>
                </div>
              </form>

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-[#c4c6cf]">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddAmountModalOpen(false);
                    setProductToAmount(null);
                    setTimeout(() => barcodeInputRef.current?.focus(), 10);
                  }}
                  className="h-[28px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[11px] font-semibold cursor-pointer"
                >
                  Cancelar [Esc]
                </button>
                <button
                  type="button"
                  disabled={rawVal <= 0}
                  onClick={handleConfirmAddAmount}
                  className="h-[30px] px-5 bg-[#002046] hover:bg-[#1b365d] text-white font-bold text-[12px] flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4 text-[#aec7f7]" />
                  <span>AGREGAR AL TICKET [ENTER]</span>
                </button>
              </div>
            </div>
          );
        })()}
      </WindowsModal>

      {/* MODAL 2: Modify Line (Qty/Weight & Price) */}
      <WindowsModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="MODIFICAR LÍNEA: CANTIDAD [F6] / PRECIO [F7]"
        maxWidth="max-w-md"
      >
        {saleItems[selectedItemIndex] && (() => {
          const current = saleItems[selectedItemIndex];
          const chamberStock = getAvailableChamberStock(current.code);
          const otherItemsWeight = saleItems
            .filter((it, idx) => it.code === current.code && idx !== selectedItemIndex)
            .reduce((sum, it) => sum + (it.unitType === 'Kg' ? (it.weight || 0) : (it.quantity || 0)), 0);
          const maxAllowed = Math.max(0, chamberStock - otherItemsWeight);

          return (
            <div className="flex flex-col gap-2.5 p-2 text-[12px]">
              <div className="bg-white p-2 border border-[#c4c6cf]">
                <span className="font-bold text-[#002046] block">
                  {current.description}
                </span>
                <div className="text-[11px] text-[#44474e] flex items-center justify-between mt-1">
                  <span>
                    Código: {current.code} | Unidad: {current.unitType}
                  </span>
                  <span
                    className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
                      chamberStock <= 0
                        ? 'bg-red-100 text-red-800 border border-red-300'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}
                  >
                    Stock Cámara {currentBranch.id}: {formatQuantity(chamberStock, current.unitType)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-[#181c1f] flex items-center justify-between">
                  <span>
                    {current.unitType === 'Kg'
                      ? 'Peso en Kilogramos (Kg):'
                      : 'Cantidad (Unidades):'}
                  </span>
                  <span className="text-[10px] font-bold text-[#00639b]">
                    Stock en cámara: {formatQuantity(chamberStock, current.unitType)}
                  </span>
                </label>
                <input
                  ref={editQuantityInputRef}
                  type="number"
                  step={current.unitType === 'Kg' ? '0.005' : '1'}
                  value={editQtyOrWeight}
                  onChange={(e) => setEditQtyOrWeight(e.target.value)}
                  className="h-[28px] px-2 bg-white font-mono text-[14px] font-bold border border-[#74777f] focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-[#181c1f] flex items-center justify-between">
                  <span>Precio Unitario ($):</span>
                  {!(currentUser?.role === 'SUPERADMIN' || currentUser?.role === 'ADMIN' || currentUser?.permissions?.canModifyPrices !== false) && (
                    <span className="text-[10px] text-amber-700 font-normal">(Solo lectura)</span>
                  )}
                </label>
                <input
                  ref={editPriceInputRef}
                  type="number"
                  disabled={!(currentUser?.role === 'SUPERADMIN' || currentUser?.role === 'ADMIN' || currentUser?.permissions?.canModifyPrices !== false)}
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className={`h-[28px] px-2 font-mono text-[14px] font-bold border border-[#74777f] focus:outline-none ${
                    !(currentUser?.role === 'SUPERADMIN' || currentUser?.role === 'ADMIN' || currentUser?.permissions?.canModifyPrices !== false)
                      ? 'bg-[#f1f4f8] text-[#74777f] cursor-not-allowed'
                      : 'bg-white'
                  }`}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#c4c6cf]">
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteItem(selectedItemIndex);
                    setIsEditModalOpen(false);
                  }}
                  className="h-[26px] px-3 bg-[#aa3531] hover:bg-[#8b2b28] text-white font-bold text-[11px] cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar Producto</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="h-[26px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[11px] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyEdit}
                    className="h-[26px] px-4 bg-[#002046] hover:bg-[#1b365d] text-white font-bold text-[11px] cursor-pointer"
                  >
                    Guardar Cambios
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </WindowsModal>

      {/* MODAL 3: Thermal Ticket Preview & POS Receipt */}
      <WindowsModal
        isOpen={isTicketModalOpen}
        onClose={() => setIsTicketModalOpen(false)}
        title={
          ticketInvoiceType === 'RECIBO_COMUN'
            ? 'EMISIÓN DE RECIBO COMÚN / TICKET INTERNO - VISTA PREVIA'
            : 'EMISIÓN DE TICKET FISCAL ARCA - VISTA PREVIA'
        }
        maxWidth={currentBranch.ticketPrinter === 'A4' ? 'max-w-4xl' : 'max-w-lg'}
      >
        <div className="flex flex-col gap-3 p-1">
          <div className="bg-white border border-[#74777f] shadow-inner overflow-hidden flex flex-col h-[520px]">
            <iframe
              srcDoc={generateTicketHtml({
                items: saleItemsForCheckout.map(item => ({
                  code: item.code || '---',
                  description: item.description,
                  quantity: item.unitType === 'Kg' ? (item.weight || 0) : (item.quantity || 0),
                  unitPrice: item.unitPrice,
                  subtotal: item.subtotal,
                  weight: item.unitType === 'Kg' ? (item.weight || 0) : undefined
                })),
                total: totalAmount,
                subtotal: netAmount,
                vatAmount: vatAmount,
                paymentMethod: selectedPayment as any,
                ticketNumber: currentNextTicketNumber,
                customerName: selectedParty?.type === 'EMPLEADO' 
                  ? selectedPayment === 'CUENTA_CORRIENTE'
                    ? `${selectedParty.name} (EMPLEADO Leg. ${selectedParty.legajo || selectedParty.code})`
                    : 'CONSUMIDOR FINAL'
                  : selectedPayment === 'CUENTA_CORRIENTE'
                    ? (selectedCustomer?.name || 'CONSUMIDOR FINAL')
                    : 'CONSUMIDOR FINAL',
                customerDni: selectedPayment === 'CUENTA_CORRIENTE'
                  ? selectedCustomer?.dniCuit || '--'
                  : '--',
                customerVatCondition: selectedPayment === 'CUENTA_CORRIENTE'
                  ? selectedCustomer?.vatCondition || 'Consumidor Final'
                  : 'Consumidor Final',
                invoiceType: ticketInvoiceType as any,
                operatorName: currentUser.fullName,
                createdAt: new Date().toISOString(),
                employeeDiscountPercent: selectedParty?.type === 'EMPLEADO'
                  ? employeeDiscountPercent
                  : 0,
                employeeDiscountAmount: employeeDiscountAmount,
                discountAmount: totalDiscountAmount,
                discountPercent: totalDiscountPercent,
                discountLabel: selectedParty?.type === 'EMPLEADO' && manualDiscountPercent > 0
                  ? 'Descuento empleado y adicional'
                  : selectedParty?.type === 'EMPLEADO'
                  ? 'Descuento empleado'
                  : 'Descuento',
                cashGiven: selectedPayment === 'PAGO_COMBINADO' 
                  ? (parseFloat(combinedAmount1.replace(/\./g, '').replace(',', '.')) || 0) + (parseFloat(combinedAmount2.replace(/\./g, '').replace(',', '.')) || 0)
                  : paidNum,
                change: selectedPayment === 'PAGO_COMBINADO'
                  ? Math.max(0, ((parseFloat(combinedAmount1.replace(/\./g, '').replace(',', '.')) || 0) + (parseFloat(combinedAmount2.replace(/\./g, '').replace(',', '.')) || 0)) - totalAmount)
                  : changeAmount,
                cae: '86362320331436', // Mock CAE for preview
                caeVto: '2026-09-19'
              }, currentBranch, currentBranch.ticketPrinter === 'A4' ? 'A4' : 'TICKET')
                .replace('onload="setTimeout(() => { window.print(); }, 400)"', '')
                .replace('onload="setTimeout(() => { window.print(); }, 300)"', '')}
              className="w-full h-full border-none"
              title="Ticket Preview"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#c4c6cf]">
            <span className="text-[11px] text-[#44474e]">
              Destino: <strong className="text-[#002046]">{currentBranch.ticketPrinter || currentBranch.printerModel || 'Térmica 80mm'}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsTicketModalOpen(false)}
                className="h-[28px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[11px] font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              {ticketInvoiceType === 'RECIBO_COMUN' ? (
                <button
                  type="button"
                  onClick={handleConfirmTicket}
                  className="h-[28px] px-4 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5 text-[#aec7f7]" />
                  <span>Emitir e Imprimir Recibo [Enter]</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsTicketModalOpen(false);
                      setIsArcaModalOpen(true);
                    }}
                    className="h-[28px] px-3 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Receipt className="w-3.5 h-3.5 text-[#aec7f7]" />
                    <span>Facturar Oficial ARCA (CAE) [F12]</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmTicket}
                    className="h-[28px] px-3 bg-[#333a42] hover:bg-[#181c1f] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Ticket Interno [Enter]</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </WindowsModal>

      {/* ARCA Invoice Modal for fast electronic billing */}
      <ArcaInvoiceModal
        isOpen={isArcaModalOpen}
        onClose={() => setIsArcaModalOpen(false)}
        saleData={{
          items: saleItemsForCheckout.map((i) => ({
            code: i.code,
            description: i.description,
            unitType: i.unitType,
            weight: i.weight,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            subtotal: i.subtotal,
            vatRate: 21,
          })),
          total: totalAmount,
          employeeDiscountAmount: employeeDiscountAmount,
          employeeDiscountPercent: isEmployeeSelected ? employeeDiscountPercent : 0,
          discountAmount: totalDiscountAmount,
          discountPercent: totalDiscountPercent,
          discountLabel: isEmployeeSelected && manualDiscountPercent > 0
            ? 'Descuento empleado y adicional'
            : isEmployeeSelected
            ? 'Descuento empleado'
            : 'Descuento',
          customer: ticketInvoiceType === 'FACTURA_B' ? null : selectedCustomer,
        }}
        existingInvoices={electronicInvoices}
        currentBranch={currentBranch}
        currentUser={currentUser}
        customers={customers}
        onSaveCustomer={saveCustomer}
        onInvoiceCreated={handleArcaInvoiceCreated}
      />

      {/* Invoice Print Modal (A4 & Ticket 80mm) */}
      <InvoicePrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        invoice={selectedInvoiceForPrint}
        branch={currentBranch}
        branches={
          branchConfigs
            ? ([branchConfigs['NECO 1'], branchConfigs['NECO 2']].filter(Boolean) as BranchConfig[])
            : undefined
        }
      />
    </div>
  );
};
