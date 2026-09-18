export type UnitType = 'Kg' | 'Unid';

export interface Product {
  code: string;
  docId?: string;
  description: string;
  category: string;
  unitType: UnitType;
  price: number;
  vatRate?: number; // 21, 10.5, etc.
  scalePlu: string | null;
  active: boolean;
}

export interface SaleItem {
  id: string;
  code: string;
  description: string;
  unitType: UnitType;
  quantity?: number;
  weight?: number;
  unitPrice: number;
  discountPercent: number;
  subtotal: number;
  scaleLabelCode?: string;
}

export type PaymentMethod =
  | 'EFECTIVO'
  | 'TARJETA'
  | 'QR'
  | 'TRANSFERENCIA'
  | 'CUENTA_CORRIENTE'
  | 'PAGO_COMBINADO';
export type InvoiceType = 'FACTURA_A' | 'FACTURA_B' | 'RECIBO_COMUN';

export interface Customer {
  code: string;
  name: string;
  dniCuit: string;
  phone: string;
  address: string;
  vatCondition: 'Resp. Inscripto' | 'Monotributo' | 'Cons. Final' | 'Exento';
  creditLimit: number;
  currentBalance: number;
  status: 'NORMAL' | 'AL_DIA' | 'SUSPENDIDO' | 'EXCEDIDO';
  notes?: string;
  email?: string;
}

export interface Employee {
  code: string;
  name: string;
  legajo: string;
  dni: string;
  phone: string;
  branch: 'NECO 1' | 'NECO 2';
  role: 'SUPERADMIN' | 'ADMIN' | 'ENCARGADO' | 'CAJERO' | 'CONSULTA';
  shift: 'MAÑANA' | 'TARDE' | 'COMPLETO';
  creditLimit: number;
  currentBalance: number;
  active: boolean;
  discountPercent?: number;
}

export interface AccountMovement {
  id: string;
  date: string;
  voucher: string;
  concept: string;
  debit: number;
  credit: number;
  balance: number;
  partyType: 'CLIENTE' | 'EMPLEADO';
  partyCode: string;
}

export interface CashMovement {
  id: string;
  time: string;
  type: 'FONDO' | 'EGRESO' | 'RETIRO' | 'INGRESO';
  concept: string;
  voucher: string;
  amount: number;
  saleId?: string;
  ticketNumber?: string;
  branchId?: string;
}

export interface CashClosure {
  id: string;
  date: string;
  branch: 'NECO 1' | 'NECO 2';
  register: string;
  operator: string;
  shift: string;
  totalSales: number;
  invoicesA: number;
  invoicesB: number;
  commonReceipts: number;
  cashAmount: number;
  cardAmount: number;
  qrAmount?: number;
  transferAmount: number;
  currentAccountAmount: number;
  entries: number;
  withdrawals: number;
  expenses: number;
  initialFund: number;
  expectedCash: number;
  actualCash: number;
  difference: number;
  // Enhanced multi-method reconciliation fields
  posnetAmount?: number;
  expectedPosnet?: number;
  actualPosnet?: number;
  posnetDifference?: number;
  combinedSalesTotal?: number;
  combinedSalesCount?: number;
  expectedCard?: number;
  actualCard?: number;
  cardDifference?: number;
  expectedTransfer?: number;
  actualTransfer?: number;
  transferDifference?: number;
  currentAccountCount?: number;
  currentAccountDetails?: Array<{
    customerName: string;
    amount: number;
    ticketNumber?: string;
    time?: string;
  }>;
  notes?: string;
  status: 'CONCILIADO' | 'CON_DIFERENCIA';
  branchId?: string;
  createdAt?: number;
  salesIds?: string[];
  movementIds?: string[];
  salesSummary?: Array<{
    id?: string;
    ticketNumber?: string;
    date?: string;
    time?: string;
    customerName?: string;
    customerDni?: string;
    invoiceType?: string;
    paymentMethod?: string;
    total: number;
    itemsCount?: number;
    items?: any[];
    combinedPayments?: any[];
    cae?: string;
  }>;
  movementsSummary?: Array<{
    id: string;
    type: 'FONDO' | 'INGRESO' | 'RETIRO' | 'EGRESO';
    concept: string;
    amount: number;
    time?: string;
    date?: string;
    user?: string;
    voucher?: string;
  }>;
}

export type RoleType = 'SUPERADMIN' | 'ADMIN' | 'ENCARGADO' | 'CAJERO' | 'CONSULTA';

export interface UserAccount {
  id: string;
  username: string;
  email?: string;
  fullName: string;
  password?: string;
  role: RoleType;
  branch: 'NECO 1' | 'NECO 2';
  active: boolean;
  lastLogin: string;
  permissions: {
    canApplyDiscounts: boolean;
    canCancelTickets: boolean;
    canModifyPrices: boolean;
    canViewCosts: boolean;
    canOpenDrawerWithoutSale: boolean;
    canViewReports: boolean;
    canPerformClosureZ: boolean;
    canSwitchBranch?: boolean;
  };
}

export interface BranchConfig {
  id: 'NECO 1' | 'NECO 2';
  name: string;
  fantasyName?: string;
  businessName?: string;
  legalName?: string;
  subtitle: string;
  address: string;
  phone: string;
  cuit: string;
  grossIncome: string;
  pointOfSale: string;
  scaleModel: string;
  scalePort: string;
  scaleBaud: number;
  scaleEanPrefix: string;
  printerModel: string;
  printerPort: string;
  iibb?: string;
  startActivities?: string;
  scaleType?: string;
  scaleBarcodeFormat?: 'PLU_PESO' | 'PLU_IMPORTE';
  scalePrefix?: string;
  ticketPrinter?: string;
  ticketPrefix?: string;
  ticketFooter?: string;
  defaultPriceList?: 'LISTA_1' | 'LISTA_2' | 'LISTA_3';
  active?: boolean;
}

export type ArcaCbteTipo = 1 | 6 | 3 | 8; // 1: Fac A, 6: Fac B, 3: NC A, 8: NC B
export type ArcaCbteLetra = 'A' | 'B';
export type ArcaCbteNombre =
  | 'Factura A'
  | 'Factura B'
  | 'Nota de Crédito A'
  | 'Nota de Crédito B';

export interface ElectronicInvoiceItem {
  productCode: string;
  description: string;
  unitType: UnitType;
  quantity: number;
  unitPrice: number;
  vatRate: number; // 21, 10.5, 0
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
}

export interface ElectronicInvoice {
  id: string;
  branchId: 'NECO 1' | 'NECO 2';
  pointOfSale: string; // e.g. "0001", "0002"
  cbteTipo: ArcaCbteTipo;
  cbteLetra: ArcaCbteLetra;
  cbteNombre: ArcaCbteNombre;
  cbteNumero: number;
  formattedNumber: string; // e.g. "0001-00000125"
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  cae: string;
  caeVto: string; // YYYY-MM-DD
  qrUrl: string;
  qrPayload?: Record<string, any>;
  customer: {
    name: string;
    cuitDni: string;
    docType: number; // 80: CUIT, 96: DNI, 99: Consumidor Final
    vatCondition: 'Resp. Inscripto' | 'Monotributo' | 'Cons. Final' | 'Exento';
    address: string;
  };
  items: ElectronicInvoiceItem[];
  netAmount: number;
  vatAmount21: number;
  vatAmount105: number;
  exemptAmount: number;
  totalAmount: number;
  status: 'AUTORIZADO' | 'PENDIENTE' | 'RECHAZADO' | 'ANULADO';
  rejectionReason?: string;
  environment: 'homologacion' | 'produccion';
  saleId?: string; // Reference to original POS sale
  associatedInvoiceId?: string; // For Credit Notes
  associatedInvoiceNumber?: string; // e.g. "0001-00000125"
  creditNoteReason?:
    | 'Anulación de venta'
    | 'Devolución de productos'
    | 'Error en facturación'
    | 'Diferencia de importe'
    | 'Descuento posterior'
    | 'Otro';
  creditNoteType?: 'TOTAL' | 'PARCIAL';
  creditedAmount?: number; // Total amount already credited against this invoice
  employeeDiscountAmount?: number;
  employeeDiscountPercent?: number;
  operator: string;
  createdAt: string;
}

export interface ArcaConfig {
  cuit: string;
  companyName: string;
  vatCondition: 'Responsable Inscripto';
  environment: 'homologacion' | 'produccion';
  connected: boolean;
  lastChecked?: string;
  pointsOfSale: {
    'NECO 1': string;
    'NECO 2': string;
  };
  alias?: string;
  hasPrivateKey?: boolean;
  privateKey?: string;
  hasCertificate?: boolean;
  certificate?: string;
  certExpiration?: string;
  certIssuer?: string;
  certSubject?: string;
}

export interface AuditLog {
  id: string;
  date: string;
  time: string;
  user: string;
  branch: 'NECO 1' | 'NECO 2';
  operation: string;
  comprobante?: string;
  pointOfSale?: string;
  cae?: string;
  result: 'EXITOSO' | 'RECHAZADO' | 'ERROR';
  details?: string;
}

export interface ProductSalesRanking {
  productCode: string;
  description: string;
  category: string;
  kilosSold: number;
  unitsSold: number;
  totalRevenue: number;
  sharePercent: number;
}

export type ActiveScreen =
  | 'POS'
  | 'PRODUCTOS'
  | 'CLIENTES'
  | 'CUENTAS_CORRIENTES'
  | 'EMPLEADOS'
  | 'APERTURA_CAJA'
  | 'CAJA_ACTUAL'
  | 'CIERRE_CAJA'
  | 'HISTORIAL_CIERRES'
  | 'FACTURACION'
  | 'CONFIGURACION_FACTURACION'
  | 'REPORTES'
  | 'RANKING_PRODUCTOS'
  | 'USUARIOS_ROLES'
  | 'CONFIGURACION';
