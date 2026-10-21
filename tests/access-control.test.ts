import { describe, expect, it } from 'vitest';
import { UserAccount } from '../src/types/pos';
import { hasModuleAccess } from '../src/utils/accessControl';

const createUser = (
  role: UserAccount['role'],
  modulePermissions: Partial<UserAccount['permissions']> = {}
): UserAccount => ({
  id: 'test-user',
  username: 'test-user',
  fullName: 'Test User',
  role,
  branch: 'NECO 1',
  active: true,
  lastLogin: '',
  permissions: {
    canApplyDiscounts: false,
    canCancelTickets: false,
    canModifyPrices: false,
    canViewCosts: false,
    canOpenDrawerWithoutSale: false,
    canViewReports: false,
    canPerformClosureZ: false,
    ...modulePermissions,
  },
});

describe('Permisos de acceso por módulo', () => {
  it('limita por defecto al cajero a ventas, facturación, cuentas corrientes y empleados', () => {
    const cashier = createUser('CAJERO');
    expect([
      hasModuleAccess(cashier, 'canAccessPOS'),
      hasModuleAccess(cashier, 'canAccessInvoicing'),
      hasModuleAccess(cashier, 'canAccessCurrentAccounts'),
      hasModuleAccess(cashier, 'canAccessEmployees'),
    ]).toEqual([true, true, true, true]);
    expect([
      hasModuleAccess(cashier, 'canAccessProducts'),
      hasModuleAccess(cashier, 'canAccessStock'),
      hasModuleAccess(cashier, 'canAccessMeatReception'),
      hasModuleAccess(cashier, 'canAccessCash'),
      hasModuleAccess(cashier, 'canAccessUsers'),
    ]).toEqual([false, false, false, false, false]);
  });

  it('asigna al carnicero stock, recepción y desposte por defecto', () => {
    const butcher = createUser('CARNICERO');
    expect([
      hasModuleAccess(butcher, 'canAccessStock'),
      hasModuleAccess(butcher, 'canAccessMeatReception'),
      hasModuleAccess(butcher, 'canAccessMeatDeboning'),
      hasModuleAccess(butcher, 'canAccessPOS'),
    ]).toEqual([true, true, true, false]);
  });

  it('permite personalizar permisos de módulos por usuario, excepto administradores', () => {
    const cashier = createUser('CAJERO', { canAccessStock: true, canAccessPOS: false });
    expect(hasModuleAccess(cashier, 'canAccessStock')).toBe(true);
    expect(hasModuleAccess(cashier, 'canAccessPOS')).toBe(false);
    expect(hasModuleAccess(createUser('ADMIN', { canAccessStock: false }), 'canAccessStock')).toBe(true);
  });
});
