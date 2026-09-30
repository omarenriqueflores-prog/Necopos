import {
  Product,
  Customer,
  Employee,
  AccountMovement,
  CashMovement,
  CashClosure,
  UserAccount,
  BranchConfig,
} from '../types/pos';

export const INITIAL_BRANCH_CONFIGS: Record<'NECO 1' | 'NECO 2', BranchConfig> = {
  'NECO 1': {
    id: 'NECO 1',
    name: 'Carnicerías Neco - Central',
    fantasyName: 'Carnicerías Neco Central',
    businessName: 'MOYA CARLOS HUGO',
    subtitle: 'Sucursal Central & Salón de Cortes',
    address: 'Av. 24 de Septiembre 681, Tartagal',
    phone: '0387-4315890',
    cuit: '20-25506516-6',
    grossIncome: '20-25506516-6',
    pointOfSale: '0017',
    scaleModel: 'SYSTEL Cuora MAX / Kretz Aura',
    scalePort: 'COM1',
    scaleBaud: 9600,
    scaleEanPrefix: '20',
    printerModel: 'EPSON TM-T20III (Térmica 80mm)',
    printerPort: 'COM4',
    iibb: '20-25506516-6',
    startActivities: '01/09/2015',
    scaleType: 'Systel Cuora',
    scaleBarcodeFormat: 'PLU_PESO',
    scalePrefix: '20',
    ticketPrinter: 'EPSON TM-T20III (USB/COM4)',
    ticketPrefix: '1010',
    defaultPriceList: 'LISTA_1',
    active: true,
  },
  'NECO 2': {
    id: 'NECO 2',
    name: 'Carnicerías Neco - Villa Saavedra',
    fantasyName: 'Carnicerías Neco Villa Saavedra',
    businessName: 'MOYA CARLOS HUGO',
    subtitle: 'Sucursal Villa Saavedra',
    address: 'San Martín 120, Villa Saavedra, Tartagal',
    phone: '0387-4221144',
    cuit: '20-25506516-6',
    grossIncome: '20-25506516-6',
    pointOfSale: '0018',
    scaleModel: 'KRETZ Aura Eco / Systel Clipse',
    scalePort: 'COM2',
    scaleBaud: 9600,
    scaleEanPrefix: '20',
    printerModel: 'HASAR P-441F / EPSON TM-T20',
    printerPort: 'COM3',
    iibb: '20-25506516-6',
    startActivities: '01/09/2015',
    scaleType: 'Kretz Report NX',
    scaleBarcodeFormat: 'PLU_PESO',
    scalePrefix: '20',
    ticketPrinter: 'EPSON TM-T20III (USB/COM3)',
    ticketPrefix: '1020',
    defaultPriceList: 'LISTA_1',
    active: true,
  },
};

export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_CUSTOMERS: Customer[] = [];

export const INITIAL_EMPLOYEES: Employee[] = [];

export const INITIAL_ACCOUNT_MOVEMENTS: AccountMovement[] = [];

export const INITIAL_CASH_MOVEMENTS: CashMovement[] = [];

export const INITIAL_CASH_CLOSURES: CashClosure[] = [];

export const INITIAL_USERS: UserAccount[] = [
  {
    id: 'USR-01',
    username: 'admin',
    fullName: 'Administrador POS',
    role: 'SUPERADMIN',
    branch: 'NECO 1',
    active: true,
    lastLogin: new Date().toLocaleString('es-AR'),
    permissions: {
      canApplyDiscounts: true,
      canCancelTickets: true,
      canModifyPrices: true,
      canViewCosts: true,
      canOpenDrawerWithoutSale: true,
      canViewReports: true,
      canPerformClosureZ: true,
    },
  },
  {
    id: 'USR-02',
    username: 'omarenriqueflores@gmail.com',
    fullName: 'Omar Enrique Flores',
    role: 'SUPERADMIN',
    branch: 'NECO 1',
    active: true,
    lastLogin: new Date().toLocaleString('es-AR'),
    permissions: {
      canApplyDiscounts: true,
      canCancelTickets: true,
      canModifyPrices: true,
      canViewCosts: true,
      canOpenDrawerWithoutSale: true,
      canViewReports: true,
      canPerformClosureZ: true,
    },
  },
  {
    id: 'USR-03',
    username: 'dueno',
    fullName: 'Dueño Principal',
    role: 'CONSULTA',
    branch: 'NECO 1',
    active: true,
    lastLogin: new Date().toLocaleString('es-AR'),
    permissions: {
      canApplyDiscounts: false,
      canCancelTickets: false,
      canModifyPrices: false,
      canViewCosts: true,
      canOpenDrawerWithoutSale: false,
      canViewReports: true,
      canPerformClosureZ: false,
    },
  },
];

export const INITIAL_RANKING_DATA: {
  productCode: string;
  description: string;
  category: string;
  kilosSold: number;
  unitsSold: number;
  totalRevenue: number;
  sharePercent: number;
}[] = [];
