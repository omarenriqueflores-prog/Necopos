import { ActiveScreen, RoleType, UserAccount } from '../types/pos';

export type ModulePermission =
  | 'canAccessPOS'
  | 'canAccessProducts'
  | 'canAccessCustomers'
  | 'canAccessCurrentAccounts'
  | 'canAccessEmployees'
  | 'canAccessCash'
  | 'canAccessInvoicing'
  | 'canAccessReports'
  | 'canAccessStock'
  | 'canAccessMeatReception'
  | 'canAccessMeatDeboning'
  | 'canAccessConfiguration'
  | 'canAccessUsers';

export const MODULE_PERMISSIONS: ModulePermission[] = [
  'canAccessPOS',
  'canAccessProducts',
  'canAccessCustomers',
  'canAccessCurrentAccounts',
  'canAccessEmployees',
  'canAccessCash',
  'canAccessInvoicing',
  'canAccessReports',
  'canAccessStock',
  'canAccessMeatReception',
  'canAccessMeatDeboning',
  'canAccessConfiguration',
  'canAccessUsers',
];

const ROLE_DEFAULTS: Record<RoleType, ModulePermission[]> = {
  SUPERADMIN: [
    'canAccessPOS', 'canAccessProducts', 'canAccessCustomers', 'canAccessCurrentAccounts',
    'canAccessEmployees', 'canAccessCash', 'canAccessInvoicing', 'canAccessReports',
    'canAccessStock', 'canAccessMeatReception', 'canAccessMeatDeboning',
    'canAccessConfiguration', 'canAccessUsers',
  ],
  ADMIN: [
    'canAccessPOS', 'canAccessProducts', 'canAccessCustomers', 'canAccessCurrentAccounts',
    'canAccessEmployees', 'canAccessCash', 'canAccessInvoicing', 'canAccessReports',
    'canAccessStock', 'canAccessMeatReception', 'canAccessMeatDeboning',
    'canAccessConfiguration', 'canAccessUsers',
  ],
  ENCARGADO: [
    'canAccessPOS', 'canAccessProducts', 'canAccessCustomers', 'canAccessCurrentAccounts',
    'canAccessEmployees', 'canAccessCash', 'canAccessInvoicing', 'canAccessReports',
    'canAccessStock', 'canAccessMeatReception', 'canAccessMeatDeboning',
  ],
  CAJERO: [
    'canAccessPOS', 'canAccessCurrentAccounts', 'canAccessEmployees', 'canAccessInvoicing',
  ],
  CARNICERO: ['canAccessStock', 'canAccessMeatReception', 'canAccessMeatDeboning'],
  CONSULTA: [
    'canAccessPOS', 'canAccessProducts', 'canAccessCustomers', 'canAccessCurrentAccounts',
    'canAccessEmployees', 'canAccessInvoicing', 'canAccessReports', 'canAccessStock',
    'canAccessMeatReception', 'canAccessMeatDeboning',
  ],
};

export function getDefaultModulePermissions(role: RoleType): Record<ModulePermission, boolean> {
  return Object.fromEntries(
    MODULE_PERMISSIONS.map((permission) => [permission, ROLE_DEFAULTS[role].includes(permission)])
  ) as Record<ModulePermission, boolean>;
}

export function hasModuleAccess(user: UserAccount, permission: ModulePermission): boolean {
  if (user.role === 'SUPERADMIN' || user.role === 'ADMIN') return true;
  const configuredValue = user.permissions?.[permission];
  return typeof configuredValue === 'boolean'
    ? configuredValue
    : ROLE_DEFAULTS[user.role]?.includes(permission) ?? false;
}

export function permissionForScreen(screen: ActiveScreen): ModulePermission {
  switch (screen) {
    case 'POS': return 'canAccessPOS';
    case 'PRODUCTOS': return 'canAccessProducts';
    case 'CLIENTES': return 'canAccessCustomers';
    case 'CUENTAS_CORRIENTES': return 'canAccessCurrentAccounts';
    case 'EMPLEADOS': return 'canAccessEmployees';
    case 'APERTURA_CAJA':
    case 'CAJA_ACTUAL':
    case 'CIERRE_CAJA':
    case 'HISTORIAL_CIERRES': return 'canAccessCash';
    case 'FACTURACION': return 'canAccessInvoicing';
    case 'CONFIGURACION_FACTURACION': return 'canAccessConfiguration';
    case 'REPORTES':
    case 'RANKING_PRODUCTOS': return 'canAccessReports';
    case 'STOCK': return 'canAccessStock';
    case 'CONFIGURACION': return 'canAccessConfiguration';
    case 'USUARIOS_ROLES': return 'canAccessUsers';
  }
}
