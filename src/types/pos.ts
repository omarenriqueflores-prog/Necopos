export type UnitType = 'Kg' | 'Unid';

export interface Product {
  id?: string;
  code: string;
  docId?: string;
  barcode?: string | null;
  name?: string;
  description: string;
  rubro?: string;
  category: string;
  species?: string;
  unitType: UnitType;
  price: number;
  costPrice?: number;
  costo?: number;
  stockNeco1?: number;
  stockNeco2?: number;
  stock?: number;
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
  date?: string;
  createdAt?: string;
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
  discountAmount?: number;
  discountPercent?: number;
  discountLabel?: string;
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
  csr?: string;
  hasPrivateKey?: boolean;
  privateKey?: string;
  hasCertificate?: boolean;
  certificate?: string;
  certificateLinked?: boolean;
  certExpiration?: string;
  certIssuer?: string;
  certSubject?: string;
  certificateSubject?: string;
  certificateIssuer?: string;
  certificateValidTo?: string;
  vaultBundle?: string;
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
  | 'CONFIGURACION'
  | 'STOCK';

// ==========================================
// MÓDULO DE STOCK E INVENTARIO - NECO POS
// ==========================================

export interface BranchStock {
  id: string; // `${branchId}_${productCode}`
  branchId: 'NECO 1' | 'NECO 2';
  productId?: string;
  productCode: string;
  currentStock: number; // en Kg (3 decimales) o Unid
  minStock: number; // Alerta de stock mínimo
  lastUpdated: string; // ISO date
  chamberName?: string; // Ej: 'Cámara Frigorífica NECO 1'
}

export type StockMovementType =
  | 'ENTRADA'
  | 'VENTA'
  | 'TRANSFERENCIA_SALIDA'
  | 'TRANSFERENCIA_ENTRADA'
  | 'AJUSTE_POSITIVO'
  | 'AJUSTE_NEGATIVO'
  | 'MERMA'
  | 'DEVOLUCION'
  | 'STOCK_INICIAL'
  | 'PRODUCCION'
  | 'DESPOSTE_INGRESO'
  | 'DESPOSTE_SALIDA';

export interface StockMovement {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  timestamp: number;
  branchId: 'NECO 1' | 'NECO 2';
  chamber?: string;
  productId?: string;
  productCode: string;
  productDescription: string;
  category: string;
  unitType: UnitType;
  type: StockMovementType;
  quantity: number; // Siempre valor absoluto positivo
  factor: 1 | -1; // 1 para sumas, -1 para restas
  previousStock: number;
  newStock: number;
  unitPrice: number; // Precio de venta vigente al momento del movimiento
  totalValue: number; // quantity * unitPrice
  referenceDoc?: string; // Nro Ticket, Factura, Transferencia, Remito
  saleId?: string; // Identificador único de venta para idempotencia
  transferId?: string;
  reason?: string; // Motivo de merma o ajuste
  operator: string;
  notes?: string;
  idempotencyKey?: string;
  reversalOf?: string;
}

export type StockTransferStatus = 'BORRADOR' | 'EN_TRANSITO' | 'RECIBIDA' | 'CANCELADA';

export interface StockTransferItem {
  productId?: string;
  productCode: string;
  description: string;
  category: string;
  unitType: UnitType;
  quantity: number;
  price: number;
  totalValue: number;
  receptionId?: string;
  carcassId?: string;
}

export interface StockTransfer {
  id: string;
  transferNumber: string; // Ej: TR-0001
  originBranch: 'NECO 1' | 'NECO 2';
  destinationBranch: 'NECO 1' | 'NECO 2';
  status: StockTransferStatus;
  createdAt: string;
  sentAt?: string;
  receivedAt?: string;
  createdByUser: string;
  receivedByUser?: string;
  items: StockTransferItem[];
  totalKilos: number;
  totalUnits: number;
  totalCommercialValue: number;
  notes?: string;
  vehiclePlate?: string;
  driverName?: string;
}

export interface InventoryAuditItem {
  productId?: string;
  productCode: string;
  description: string;
  category: string;
  unitType: UnitType;
  systemStock: number;
  physicalCount: number;
  difference: number;
  unitPrice: number;
  differenceValue: number;
}

export interface InventoryAudit {
  id: string;
  inventoryNumber: string;
  branchId: 'NECO 1' | 'NECO 2';
  chamber: string;
  date: string;
  time: string;
  operator: string;
  status: 'BORRADOR' | 'APLICADO';
  items: InventoryAuditItem[];
  totalDifferencesKg: number;
  totalDifferencesValue: number;
  appliedAt?: string;
  notes?: string;
}

export type PhysicalInventory = InventoryAudit;
export type PhysicalInventoryItem = InventoryAuditItem;

// ==========================================
// MÓDULO DE DESPOSTE, RENDIMIENTOS Y TRAZABILIDAD
// ==========================================

export type DeboningCarcassType =
  | 'MEDIA_RES'
  | 'CUARTO_DELANTERO'
  | 'CUARTO_TRASERO'
  | 'RES_ENTERA'
  | 'CERDO_ENTERO';

export interface DeboningCutItem {
  productId?: string;
  productCode: string;
  description: string;
  category: string;
  unitType: UnitType;
  weightKg: number; // Kilos reales obtenidos en balanza
  yieldPercent: number; // % sobre el peso inicial de la materia prima
  currentSalePrice: number; // Precio de venta de mostrador vigente
  totalSaleValue: number; // weightKg * currentSalePrice
  allocatedCostPerKg: number; // Costo ponderado por valor relativo comercial
  totalAllocatedCost: number; // weightKg * allocatedCostPerKg
  projectedMarginPercent: number; // ((totalSaleValue - totalAllocatedCost) / totalSaleValue) * 100
  cutType?: 'CORTE_UTIL' | 'PICADA_RECORTES' | 'GRASA' | 'HUESO';
}

// ==========================================
// CATEGORÍAS ANIMALES OFICIALES PARA PRODUCTOS Y STOCK
// ==========================================
export const ANIMAL_CATEGORIES = [
  'Vaca',
  'Ternera',
  'Novillito',
  'Novillo Pesado',
  'Vaquillona',
  'Cerdo',
] as const;

export type AnimalCategory = (typeof ANIMAL_CATEGORIES)[number];

export interface MeatDeboning {
  id: string;
  code: string; // Ej: DESP-0001
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  timestamp: number;
  branchId: 'NECO 1' | 'NECO 2';
  chamber: string;
  status: 'BORRADOR' | 'FINALIZADO' | 'ANULADO';
  operator: string;
  butcherMaster?: string; // Responsable o maestro despostador
  // Trazabilidad de faena y origen
  tropaNumber: string; // Nro de tropa SENASA
  supplier: string; // Frigorífico proveedor o matarife
  carcassType: DeboningCarcassType;
  animalCategory: AnimalCategory | string; // Vaca, Ternera, Novillito, Novillo Pesado, Vaquillona, Cerdo
  dteGuideNumber?: string; // DTE / Guía SENASA
  initialWeightKg: number; // Peso bruto al gancho ingresado
  costPerKgInitial: number; // Costo $/kg gancho de compra
  totalInitialCost: number; // initialWeightKg * costPerKgInitial
  sourceProductCode?: string; // Producto de cámara a descontar si existía
  // Rendimiento físico y cortes obtenidos
  cuts: DeboningCutItem[];
  totalOutputWeightKg: number; // Suma de todos los cortes y subproductos
  netMeatWeightKg: number; // Kilos de cortes limpios vendibles
  boneWeightKg: number; // Hueso
  fatWeightKg: number; // Grasa de pella
  scrapWeightKg: number; // Recortes para picada
  shrinkageWeightKg: number; // Merma de despiece / oreo (initial - output)
  shrinkagePercent: number; // % merma
  netMeatYieldPercent: number; // % carne limpia sobre inicial
  totalYieldPercent: number; // % salida total sobre inicial
  // Rendimiento económico y costos
  totalCommercialValue: number; // Suma de valor venta de cortes
  grossMarginTotal: number; // totalCommercialValue - totalInitialCost
  grossMarginPercent: number; // Margen bruto proyectado %
  multiplicationFactor: number; // totalCommercialValue / totalInitialCost
  breakEvenPricePerKg: number; // totalInitialCost / netMeatWeightKg
  selectedCarcassIds?: string[]; // IDs de las medias reses seleccionadas para este desposte
  isEstimated?: boolean; // Indica si los cortes provienen de estimación por coeficientes
  yieldTemplateId?: string; // Plantilla de rendimiento utilizada si aplica
  templateVersion?: number;
  confirmedAt?: string;
  notes?: string;
  appliedAt?: string;
  hasPendingStockMovements?: boolean;
}

// ==========================================
// MÓDULO DE RENDIMIENTO Y PLANTILLAS DE COEFICIENTES
// ==========================================

export interface YieldCoefficientItem {
  productCode: string;
  description: string;
  category: string;
  cutType: 'CORTE_UTIL' | 'PICADA_RECORTES' | 'GRASA' | 'HUESO';
  weightKg: number;
  coefficient: number; // weightKg / referenceInitialWeightKg (ej: 0.125)
  yieldPercent: number; // coefficient * 100
  suggestedPrice?: number;
}

export interface YieldTemplateVersionHistory {
  version: number;
  updatedAt: string;
  operator: string;
  referenceInitialWeightKg: number;
  items: YieldCoefficientItem[];
  shrinkageWeightKg: number;
  shrinkagePercent: number;
  totalYieldPercent: number;
  notes?: string;
}

export interface DeboningYieldTemplate {
  id: string; // ej: YIELD-NOVILLITO-001 (identidad permanente)
  name: string; // Nombre descriptivo personalizado
  receptionId?: string;
  tropaNumber?: string;
  referenceCarcassId?: string;
  referenceInitialWeightKg: number;
  species: string;
  animalCategory: string;
  carcassType: DeboningCarcassType;
  items: YieldCoefficientItem[];
  shrinkageWeightKg: number;
  shrinkagePercent: number;
  totalYieldPercent: number;
  operator: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  isActive: boolean;
  notes?: string;
  versionHistory?: YieldTemplateVersionHistory[];
}

// ==========================================
// MÓDULO DE INGRESO / RECEPCIÓN DE MEDIAS RESES
// ==========================================

export type CarcassStatus =
  | 'PENDIENTE'
  | 'DISPONIBLE'
  | 'DESPOSTADO'
  | 'TRASLADADO'
  | 'ANULADO'
  | 'ESTIMADO';

export interface CarcassUnit {
  id: string; // Identificador interno único (ej: REC-0001-UNIT-…). No se muestra al usuario.
  label?: string; // Etiqueta correlativa visible dentro de la recepción (MR-001, MR-002, MR-003…)
  receptionId?: string;
  tropaNumber?: string;
  supplier?: string;
  species?: string;
  category?: string;
  branchId?: 'NECO 1' | 'NECO 2';
  chamber?: string;
  tagNumber?: string; // N° de Garfa / Caravana / Precinto SENASA
  weightKg: number; // Peso real individual en balanza (Kg)
  pricePerKg?: number; // Precio de compra individual para facturas con valores mixtos
  cost?: number; // Costo individual calculado ($)
  status?: CarcassStatus; // Estado individual de la media res
  deboningId?: string; // ID de desposte si fue procesada
  transferId?: string; // ID de traslado si fue trasladada
  notes?: string;
}

export interface MeatReception {
  id: string;
  code: string; // Ej: REC-0001
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  timestamp: number;
  branchId: 'NECO 1' | 'NECO 2';
  chamber: string;
  status: 'PENDIENTE' | 'CONFIRMADO' | 'ANULADO' | 'FINALIZADO';
  operator: string;
  // Origen y Proveedor
  supplier: string; // Frigorífico / Matarife
  supplierId?: string;
  supplierCuit?: string;
  supplierAddress?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  supplierContact?: string;
  species: string; // Vacuno / Bovino, Porcino / Cerdo
  category: AnimalCategory | string; // Vaca, Ternera, Novillito, Novillo Pesado, Vaquillona, Cerdo
  tropaNumber: string; // N° Tropa SENASA
  invoiceNumber?: string; // N° Factura
  deliveryNoteNumber?: string; // N° Remito
  dteGuideNumber?: string; // DTE / Guía SENASA
  // Costos y Cantidades
  pricePerKg: number; // Precio de compra $/Kg al gancho
  totalQuantity: number; // Cantidad de medias reses
  totalWeightKg: number; // Kilos totales recibidos
  totalCost: number; // Costo total compra ($)
  carcasses: CarcassUnit[]; // Detalle individual de cada media res
  // Stock
  productCode?: string; // Código de producto para incrementar en stock de cámara
  productDescription?: string;
  notes?: string;
  appliedAt?: string;
  updatedAt?: string;
}

export interface MeatSupplier {
  id: string;
  name: string;
  cuit?: string;
  address?: string;
  phone?: string;
  email?: string;
  contact?: string;
  notes?: string;
  updatedAt: string;
}
