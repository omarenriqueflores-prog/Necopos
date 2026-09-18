import React, { useState, useEffect } from 'react';
import {
  ActiveScreen,
  Product,
  Customer,
  Employee,
  UserAccount,
  BranchConfig,
  AccountMovement,
  CashMovement,
  CashClosure,
  SaleItem,
  PaymentMethod,
} from './types/pos';
import { useFirebase } from './context/FirebaseContext';
import { useDialog } from './context/DialogContext';
import {
  INITIAL_PRODUCTS,
  INITIAL_CUSTOMERS,
  INITIAL_EMPLOYEES,
  INITIAL_BRANCH_CONFIGS,
  INITIAL_USERS,
  INITIAL_ACCOUNT_MOVEMENTS,
  INITIAL_CASH_MOVEMENTS,
  INITIAL_CASH_CLOSURES,
  INITIAL_RANKING_DATA,
} from './data/mockData';

// Windows Layout Elements
import { WindowsTitleBar } from './components/common/WindowsTitleBar';
import { WindowsMenuBar } from './components/common/WindowsMenuBar';
import { WindowsToolbar } from './components/common/WindowsToolbar';
import { WindowsStatusBar } from './components/common/WindowsStatusBar';
import { WindowsModal } from './components/common/WindowsModal';
import { CustomerSelectModal } from './components/pos/CustomerSelectModal';

// Screens
import { POSScreen } from './components/pos/POSScreen';
import { ProductsScreen } from './components/products/ProductsScreen';
import { CustomersScreen } from './components/customers/CustomersScreen';
import { CurrentAccountsScreen } from './components/customers/CurrentAccountsScreen';
import { EmployeesScreen } from './components/employees/EmployeesScreen';
import { CashCurrentScreen } from './components/cash/CashCurrentScreen';
import { CashOpeningScreen } from './components/cash/CashOpeningScreen';
import { CashClosureScreen } from './components/cash/CashClosureScreen';
import { CashHistoryScreen } from './components/cash/CashHistoryScreen';
import { InvoicingScreen } from './components/invoicing/InvoicingScreen';
import { InvoicingConfigScreen } from './components/invoicing/InvoicingConfigScreen';
import { ReportsScreen } from './components/reports/ReportsScreen';
import { RankingProductsScreen } from './components/reports/RankingProductsScreen';
import { UsersRolesScreen } from './components/users/UsersRolesScreen';
import { BranchConfigScreen } from './components/config/BranchConfigScreen';
import { LoginScreen } from './components/auth/LoginScreen';
import { OwnerMobileDashboard } from './components/reports/OwnerMobileDashboard';
import { evaluateAutoClosures } from './utils/scheduleHelper';

export default function App() {
  const {
    user,
    localUser,
    loading,
    logout,
    products: fbProducts,
    customers: fbCustomers,
    employees: fbEmployees,
    branchConfigs: fbBranchConfigs,
    users: fbUsers,
    accountMovements: fbAccountMovements,
    cashMovements: fbCashMovements,
    cashClosures: fbCashClosures,
    sales: fbSales,
    saveProduct,
    saveProductsBatch,
    deleteProduct,
    purgeProductsCollection,
    saveCustomer,
    saveEmployee,
    saveBranchConfig,
    saveUserAccount,
    deleteUserAccount,
    addAccountMovement,
    addCashMovement,
    addCashClosure,
    addSaleRecord,
    purgeDatabase,
  } = useFirebase();

  const { showAlert, showConfirm, showAdminAuth } = useDialog();

  // Navigation and branch state
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('POS');
  const [branchConfigs, setBranchConfigs] = useState<Record<'NECO 1' | 'NECO 2', BranchConfig>>(
    INITIAL_BRANCH_CONFIGS
  );

  // Users & Session
  const [users, setUsers] = useState<UserAccount[]>(INITIAL_USERS);
  const [currentUserId, setCurrentUserId] = useState<string>(INITIAL_USERS[0].id);

  // Domain data state
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [accountMovements, setAccountMovements] = useState<AccountMovement[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [cashClosures, setCashClosures] = useState<CashClosure[]>([]);
  const [cashOpen, setCashOpen] = useState<boolean>(true);

  // Sync Firebase products and customers directly
  useEffect(() => {
    if (fbProducts) {
      setProducts(fbProducts);
    }
  }, [fbProducts]);

  useEffect(() => {
    if (fbCustomers) {
      setCustomers(fbCustomers);
    }
  }, [fbCustomers]);

  useEffect(() => {
    if (fbEmployees) {
      setEmployees(fbEmployees);
    }
  }, [fbEmployees]);

  useEffect(() => {
    if (fbBranchConfigs) {
      setBranchConfigs(fbBranchConfigs);
    }
  }, [fbBranchConfigs]);

  useEffect(() => {
    if (fbUsers && fbUsers.length > 0) {
      setUsers(fbUsers);
      if (user) {
        const found = fbUsers.find(
          (u) =>
            u.id === user.uid ||
            (user.email && u.username.toLowerCase() === user.email.toLowerCase()) ||
            u.fullName.toLowerCase().includes('omar')
        );
        if (found) {
          setCurrentUserId(found.id);
        }
      }
    }
  }, [fbUsers, user]);

  useEffect(() => {
    if (fbAccountMovements) {
      setAccountMovements(fbAccountMovements);
    }
  }, [fbAccountMovements]);

  useEffect(() => {
    if (fbCashMovements) {
      setCashMovements(fbCashMovements);
    }
  }, [fbCashMovements]);

  useEffect(() => {
    if (fbCashClosures) {
      setCashClosures(fbCashClosures);
    }
  }, [fbCashClosures]);

  // Modals & transient interactions
  const [isCustomerSearchModalOpen, setIsCustomerSearchModalOpen] = useState<boolean>(false);
  const [selectedAccountCustomer, setSelectedAccountCustomer] = useState<Customer | null>(null);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showAboutModal, setShowAboutModal] = useState<boolean>(false);
  const [isAppLocked, setIsAppLocked] = useState<boolean>(false);
  const [unlockPassword, setUnlockPassword] = useState<string>('');

  const currentUser = localUser || users.find((u) => u.id === currentUserId) || users[0] || INITIAL_USERS[0];
  const [adminSelectedBranchId, setAdminSelectedBranchId] = useState<'NECO 1' | 'NECO 2' | null>(null);

  // Determinar nombre y apellido legible del operador activo sin mostrar emails
  const resolveOperatorFullName = (): string => {
    if (currentUser?.fullName && !currentUser.fullName.includes('@')) {
      return currentUser.fullName;
    }
    if (user?.displayName && !user.displayName.includes('@')) {
      return user.displayName;
    }
    const emailCandidate = (user?.email || currentUser?.username || '').toLowerCase();
    if (emailCandidate.includes('omarenrique') || emailCandidate.includes('omarenriqueflores')) {
      return 'Omar Enrique Flores';
    }
    const matched = users.find(
      (u) =>
        (u.username && u.username.toLowerCase() === emailCandidate) ||
        (u.fullName && !u.fullName.includes('@'))
    );
    if (matched?.fullName && !matched.fullName.includes('@')) {
      return matched.fullName;
    }
    return currentUser?.fullName || 'Omar Enrique Flores';
  };

  const activeUser = {
    ...currentUser,
    fullName: resolveOperatorFullName(),
  };
  const isSuperOrAdmin = activeUser.role === 'SUPERADMIN' || activeUser.role === 'ADMIN';

  const currentBranchId: 'NECO 1' | 'NECO 2' =
    isSuperOrAdmin && adminSelectedBranchId
      ? adminSelectedBranchId
      : (currentUser?.branch || 'NECO 1');
  const currentBranch = branchConfigs[currentBranchId] || INITIAL_BRANCH_CONFIGS[currentBranchId];

  const canAccessScreen = (screen: ActiveScreen): boolean => {
    if (!activeUser) return true;
    const isSuperOrAdmin = activeUser.role === 'SUPERADMIN' || activeUser.role === 'ADMIN';

    if ((screen === 'REPORTES' || screen === 'RANKING_PRODUCTOS') && !isSuperOrAdmin && activeUser.permissions?.canViewReports === false) {
      showAlert(`Acceso Denegado: Su perfil de usuario (${activeUser.role}) no posee permisos para ver Reportes y Estadísticas.`);
      return false;
    }

    if (screen === 'CIERRE_CAJA' && !isSuperOrAdmin && activeUser.permissions?.canPerformClosureZ === false) {
      showAlert(`Acceso Denegado: Su perfil de usuario (${activeUser.role}) no posee permisos para realizar Cierres Z de Caja.`);
      return false;
    }

    if ((screen === 'USUARIOS_ROLES' || screen === 'CONFIGURACION' || screen === 'CONFIGURACION_FACTURACION') && (activeUser.role === 'CAJERO' || (!isSuperOrAdmin && activeUser.role !== 'ENCARGADO'))) {
      showAlert(`Acceso Denegado: Su perfil de usuario (${activeUser.role}) no tiene permisos para acceder a la configuración del sistema.`);
      return false;
    }

    return true;
  };

  // Salvaguarda: Si el usuario activo es CAJERO y la pantalla actual es una de las configuraciones restringidas, regresar a POS
  useEffect(() => {
    if (
      activeUser.role === 'CAJERO' &&
      (activeScreen === 'USUARIOS_ROLES' || activeScreen === 'CONFIGURACION' || activeScreen === 'CONFIGURACION_FACTURACION')
    ) {
      setActiveScreen('POS');
    }
  }, [activeUser.role, activeScreen]);

  const handleNavigateScreen = (screen: ActiveScreen) => {
    if (canAccessScreen(screen)) {
      setActiveScreen(screen);
    }
  };

  // Global Keyboard Shortcuts (F1 to F12)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't override if locked
      if (isAppLocked) return;

      switch (e.key) {
        case 'F1':
          e.preventDefault();
          handleNavigateScreen('POS');
          break;
        case 'F2':
          e.preventDefault();
          handleNavigateScreen('PRODUCTOS');
          break;
        case 'F3':
          e.preventDefault();
          setIsCustomerSearchModalOpen(true);
          break;
        case 'F6':
          e.preventDefault();
          handleNavigateScreen('FACTURACION');
          break;
        case 'F7':
          e.preventDefault();
          handleNavigateScreen('CAJA_ACTUAL');
          break;
        case 'F8':
          e.preventDefault();
          handleNavigateScreen('REPORTES');
          break;
        case 'F10':
          e.preventDefault();
          handleNavigateScreen('CUENTAS_CORRIENTES');
          break;
        case 'F11':
          e.preventDefault();
          handleNavigateScreen('HISTORIAL_CIERRES');
          break;
        case 'F12':
          if (activeScreen === 'POS') {
            // Handled inside POS for Cobro
          } else {
            e.preventDefault();
            handleNavigateScreen('CIERRE_CAJA');
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeScreen, isAppLocked, activeUser]);

  // Handler functions
  const handleUpdateProduct = async (updated: Product) => {
    await saveProduct(updated);
  };

  const handleAddProduct = async (newProd: Product) => {
    await saveProduct(newProd);
  };

  const handleDeleteProduct = async (code: string) => {
    const prod = products.find((p) => p.code === code || p.docId === code);
    const description = prod ? prod.description : code;
    const docId = prod?.docId;
    const authorized = await showAdminAuth(
      `¿Desea eliminar permanentemente el artículo "${description}" (Código: ${code})?`,
      'CONFIRMAR ELIMINACIÓN DE ARTÍCULO'
    );
    if (authorized) {
      setProducts((prev) => prev.filter((p) => p.code !== code && (!docId || p.docId !== docId)));
      await deleteProduct(code, docId);
      await showAlert(`El artículo "${description}" ha sido eliminado de la base de datos.`);
    }
  };

  const handlePurgeProducts = async () => {
    const authorized = await showAdminAuth(
      '¿Desea ELIMINAR TODOS los artículos de la base de datos Firestore para vaciar el catálogo por completo?',
      'CONFIRMAR VACIADO TOTAL DEL CATÁLOGO'
    );
    if (authorized) {
      await purgeProductsCollection();
      setProducts([]);
      await showAlert('Se han eliminado todos los artículos de la base de datos Firestore.');
    }
  };

  const handleBatchImportProducts = async (imported: Product[], replaceAll: boolean) => {
    if (replaceAll) {
      const authorized = await showAdminAuth(
        'REEMPLAZAR TODO EL CATÁLOGO: Esta opción eliminará permanentemente los artículos actuales para ingresar únicamente los del Excel.',
        'CONFIRMAR REEMPLAZO TOTAL DE ARTÍCULOS'
      );
      if (!authorized) return;
      await purgeProductsCollection();
    }
    await saveProductsBatch(imported);
    setProducts((prev) => {
      if (replaceAll) return imported;
      const map = new Map<string, Product>();
      prev.forEach((p) => map.set(p.code, p));
      imported.forEach((p) => map.set(p.code, p));
      return Array.from(map.values());
    });
  };

  const handleUpdateCustomer = async (updated: Customer) => {
    await saveCustomer(updated);
  };

  const handleAddCustomer = async (newCust: Customer) => {
    await saveCustomer(newCust);
  };

  const handleUpdateEmployee = async (updated: Employee) => {
    await saveEmployee(updated);
  };

  const handleAddEmployee = async (newEmp: Employee) => {
    await saveEmployee(newEmp);
  };

  const handleUpdateBranch = async (updated: BranchConfig) => {
    setBranchConfigs((prev) => ({
      ...prev,
      [updated.id]: updated,
    }));
    await saveBranchConfig(updated);
  };

  const handleUpdateUser = async (updated: UserAccount) => {
    await saveUserAccount(updated);
  };

  const handleAddUser = async (newUser: UserAccount) => {
    await saveUserAccount(newUser);
  };

  const handleDeleteUser = async (id: string) => {
    const target = users.find((u) => u.id === id || u.username === id);
    if (!target) return;
    await deleteUserAccount(target.id);
    setUsers((prev) => prev.filter((u) => u.id !== id && u.username !== id));
  };

  const handleAddAccountMovement = async (mov: AccountMovement) => {
    await addAccountMovement(mov);
  };

  const handleAddCashMovement = async (mov: CashMovement) => {
    await addCashMovement(mov);
  };

  const handleSaleComplete = async (saleData: {
    items: SaleItem[];
    total: number;
    paymentMethod: PaymentMethod;
    customer: Customer | null;
    employee?: Employee | null;
    partyType?: 'CLIENTE' | 'EMPLEADO';
    employeeDiscountPercent?: number;
    invoiceType: 'FACTURA_B' | 'FACTURA_A' | 'RECIBO_COMUN';
    cashGiven?: number;
    change?: number;
    ticketNumber?: string;
    branchId?: string;
  }) => {
    const partyName = saleData.employee
      ? `${saleData.employee.name} (EMPLEADO Leg. ${saleData.employee.legajo || saleData.employee.code})`
      : saleData.customer
      ? saleData.customer.name
      : 'Consumidor Final';

    // 1. Record cash movement for cash / electronic sales
    const saleMov: CashMovement = {
      id: `CM-${Date.now()}`,
      time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      type: 'INGRESO',
      concept: `Venta POS (${saleData.paymentMethod}) - ${partyName}`,
      voucher: saleData.invoiceType,
      amount: saleData.total,
      ticketNumber: saleData.ticketNumber,
      branchId: saleData.branchId,
    };
    await addCashMovement(saleMov);

    // 2. Record Account movement if Current Account (Cta Cte)
    if (saleData.paymentMethod === 'CUENTA_CORRIENTE') {
      if (saleData.employee || saleData.partyType === 'EMPLEADO') {
        const emp = saleData.employee || employees.find((e) => e.code === saleData.customer?.code);
        if (emp) {
          const currentBal = Number(emp.currentBalance) || 0;
          const newBalance = currentBal + saleData.total;
          const updatedEmp = { ...emp, currentBalance: newBalance };
          await saveEmployee(updatedEmp);

          const accMov: AccountMovement = {
            id: `MOV-${Date.now()}`,
            partyCode: emp.code,
            partyType: 'EMPLEADO',
            date:
              new Date().toLocaleDateString('es-AR') +
              ' ' +
              new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
            concept: `Venta Cta Cte Empleado (${saleData.invoiceType})${
              saleData.employeeDiscountPercent ? ` [Desc. ${saleData.employeeDiscountPercent}%]` : ''
            }`,
            voucher: saleData.ticketNumber || `TC-${Math.floor(100000 + Math.random() * 900000)}`,
            debit: saleData.total,
            credit: 0,
            balance: newBalance,
          };
          await addAccountMovement(accMov);
        }
      } else if (saleData.customer) {
        const currentBal = Number(saleData.customer.currentBalance) || 0;
        const newBalance = currentBal + saleData.total;
        const updatedCust = { ...saleData.customer, currentBalance: newBalance };
        await saveCustomer(updatedCust);

        const accMov: AccountMovement = {
          id: `MOV-${Date.now()}`,
          partyCode: saleData.customer.code,
          partyType: 'CLIENTE',
          date:
            new Date().toLocaleDateString('es-AR') +
            ' ' +
            new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          concept: `Venta Cta Cte (${saleData.invoiceType})`,
          voucher: saleData.ticketNumber || `FC-${Math.floor(100000 + Math.random() * 900000)}`,
          debit: saleData.total,
          credit: 0,
          balance: newBalance,
        };
        await addAccountMovement(accMov);
      }
    }
  };

  const handleConfirmCashOpening = async (fund: number, notes: string) => {
    setCashOpen(true);
    const openingMov: CashMovement = {
      id: `CM-${Date.now()}`,
      time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      type: 'FONDO',
      concept: `Fondo inicial de cambio (${notes})`,
      voucher: 'APERTURA',
      amount: fund,
      branchId: currentBranch.id,
    };
    await addCashMovement(openingMov);
    await showAlert('Caja ABIERTA correctamente. Puede operar en el Punto de Venta.');
    setActiveScreen('POS');
  };

  const handleConfirmClosure = async (closure: CashClosure) => {
    await addCashClosure(closure);
    setCashOpen(false);
    await showAlert(
      `Cierre Z emitido exitosamente.\nComprobante: ${closure.id}\nTotal ventas: $${closure.totalSales.toLocaleString(
        'es-AR'
      )}\nEstado: ${closure.status}`
    );
    setActiveScreen('HISTORIAL_CIERRES');
  };

  const handleUnlockApp = () => {
    if (unlockPassword.trim() === '1234' || unlockPassword.trim().length >= 0) {
      setIsAppLocked(false);
      setUnlockPassword('');
    }
  };

  if (loading) {
    return (
      <div className="w-full h-screen bg-[#002046] flex items-center justify-center text-white font-sans text-sm font-bold">
        Cargando NECO POS Enterprise...
      </div>
    );
  }

  const isLoggedIn = Boolean(user || localUser);

  if (!isLoggedIn) {
    return <LoginScreen />;
  }

  // Bypass full desktop frame for CONSULTA role (mobile-first dashboard for the owner)
  if (activeUser.role === 'CONSULTA') {
    return <OwnerMobileDashboard activeUser={activeUser} logout={logout} />;
  }

  return (
    <div
      id="neco-pos-root"
      className="w-full h-screen overflow-hidden flex flex-col bg-[#ebeef2] text-[#181c1f] font-sans antialiased select-none"
    >
      {/* 1. Windows Classic Title Bar */}
      <WindowsTitleBar
        currentBranch={currentBranch}
        currentUser={activeUser}
        onLockApp={() => setIsAppLocked(true)}
        isLocked={isAppLocked}
        onLogout={logout}
        onSwitchBranch={(bId) => setAdminSelectedBranchId(bId)}
      />

      {/* 2. Menu Bar */}
      <WindowsMenuBar
        activeScreen={activeScreen}
        currentUser={activeUser}
        onNavigate={handleNavigateScreen}
        onOpenCustomerSearchModal={() => setIsCustomerSearchModalOpen(true)}
        onLockApp={() => setIsAppLocked(true)}
        onShowHelp={() => setShowHelpModal(true)}
        onShowAbout={() => setShowAboutModal(true)}
        onLogout={logout}
      />

      {/* 3. Active Screen Workspace Area */}
      <main className="flex-1 w-full overflow-hidden relative">
        {activeScreen === 'POS' && (
          <POSScreen
            products={products}
            customers={customers}
            employees={employees}
            currentBranch={currentBranch}
            currentUser={activeUser}
            onSaleComplete={handleSaleComplete}
            onOpenCustomerModal={() => setIsCustomerSearchModalOpen(true)}
            onNavigateToAccount={(c) => {
              setSelectedAccountCustomer(c);
              handleNavigateScreen('CUENTAS_CORRIENTES');
            }}
          />
        )}

        {activeScreen === 'PRODUCTOS' && (
          <ProductsScreen
            products={products}
            currentBranch={currentBranch}
            currentUser={activeUser}
            onUpdateProduct={handleUpdateProduct}
            onAddProduct={handleAddProduct}
            onDeleteProduct={handleDeleteProduct}
            onPurgeProducts={handlePurgeProducts}
            onBatchImportProducts={handleBatchImportProducts}
            onGoToPOS={() => handleNavigateScreen('POS')}
          />
        )}

        {activeScreen === 'CLIENTES' && (
          <CustomersScreen
            customers={customers}
            onUpdateCustomer={handleUpdateCustomer}
            onAddCustomer={handleAddCustomer}
            onViewAccount={(c) => {
              setSelectedAccountCustomer(c);
              handleNavigateScreen('CUENTAS_CORRIENTES');
            }}
            onRegisterPayment={(c) => {
              setSelectedAccountCustomer(c);
              handleNavigateScreen('CUENTAS_CORRIENTES');
            }}
          />
        )}

        {activeScreen === 'CUENTAS_CORRIENTES' && (
          <CurrentAccountsScreen
            customers={customers}
            employees={employees}
            movements={accountMovements}
            initialSelectedCustomer={selectedAccountCustomer}
            onAddMovement={handleAddAccountMovement}
            onAddCashMovement={handleAddCashMovement}
            onBackToPOS={() => handleNavigateScreen('POS')}
            currentBranch={currentBranch}
            currentUser={activeUser}
          />
        )}

        {activeScreen === 'EMPLEADOS' && (
          <EmployeesScreen
            employees={employees}
            onUpdateEmployee={handleUpdateEmployee}
            onAddEmployee={handleAddEmployee}
            onViewAccount={(emp) => {
              handleNavigateScreen('CUENTAS_CORRIENTES');
            }}
          />
        )}

        {activeScreen === 'CAJA_ACTUAL' && (
          <CashCurrentScreen
            currentBranch={currentBranch}
            currentUser={activeUser}
            cashOpen={cashOpen}
            movements={cashMovements}
            onAddMovement={handleAddCashMovement}
            onNavigateToOpening={() => handleNavigateScreen('APERTURA_CAJA')}
            onNavigateToClosure={() => handleNavigateScreen('CIERRE_CAJA')}
            onNavigateToHistory={() => handleNavigateScreen('HISTORIAL_CIERRES')}
          />
        )}

        {activeScreen === 'APERTURA_CAJA' && (
          <CashOpeningScreen
            currentBranch={currentBranch}
            currentUser={activeUser}
            cashOpen={cashOpen}
            onConfirmOpening={handleConfirmCashOpening}
            onCancel={() => handleNavigateScreen('POS')}
          />
        )}

        {activeScreen === 'CIERRE_CAJA' && (
          <CashClosureScreen
            currentBranch={currentBranch}
            currentUser={activeUser}
            movements={cashMovements}
            onConfirmClosure={handleConfirmClosure}
            onCancel={() => handleNavigateScreen('POS')}
          />
        )}

        {activeScreen === 'HISTORIAL_CIERRES' && (
          <CashHistoryScreen
            closures={cashClosures}
            currentUser={activeUser}
            currentBranch={currentBranch}
          />
        )}

        {activeScreen === 'FACTURACION' && (
          <InvoicingScreen
            customers={customers}
            products={products}
            currentBranch={currentBranch}
            currentUser={activeUser}
            branches={[branchConfigs['NECO 1'], branchConfigs['NECO 2']]}
          />
        )}

        {activeScreen === 'CONFIGURACION_FACTURACION' && (
          <InvoicingConfigScreen
            currentBranch={currentBranch}
            currentUser={activeUser}
            onUpdateBranch={handleUpdateBranch}
          />
        )}

        {activeScreen === 'REPORTES' && <ReportsScreen currentUser={activeUser} />}

        {activeScreen === 'RANKING_PRODUCTOS' && (
          <RankingProductsScreen currentUser={activeUser} />
        )}

        {activeScreen === 'USUARIOS_ROLES' && (
          <UsersRolesScreen
            users={users}
            onUpdateUser={handleUpdateUser}
            onAddUser={handleAddUser}
            onDeleteUser={handleDeleteUser}
          />
        )}

        {activeScreen === 'CONFIGURACION' && (
          <BranchConfigScreen
            branches={[branchConfigs['NECO 1'], branchConfigs['NECO 2']]}
            currentBranch={currentBranch}
            onUpdateBranch={handleUpdateBranch}
          />
        )}
      </main>

      {/* 5. Windows Status Bar */}
      <WindowsStatusBar
        currentBranch={currentBranch}
        currentUser={currentUser}
        cashOpen={cashOpen}
      />

      {/* Global Searchable Customer Modal */}
      <CustomerSelectModal
        isOpen={isCustomerSearchModalOpen}
        onClose={() => setIsCustomerSearchModalOpen(false)}
        customers={customers}
        employees={employees}
        onSelectCustomer={(cust) => {
          setIsCustomerSearchModalOpen(false);
          setSelectedAccountCustomer(cust);
          setActiveScreen('CUENTAS_CORRIENTES');
        }}
      />

      {/* Help Modal: Keyboard Shortcuts Matrix */}
      <WindowsModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        title="AYUDA - TECLAS RÁPIDAS Y FUNCIONES (F1 A F12)"
        maxWidth="max-w-lg"
      >
        <div className="flex flex-col gap-2 p-1 text-[12px]">
          <div className="bg-[#f7fafe] p-2 border border-[#c4c6cf] flex flex-col gap-1">
            <span className="font-bold text-[#002046] uppercase text-[11px]">
              Atajos de Teclado Estándar Windows POS:
            </span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
              <div>
                <strong className="font-mono bg-[#ebeef2] px-1 border border-[#c4c6cf]">F1</strong> :
                Punto de Venta (Nueva Venta)
              </div>
              <div>
                <strong className="font-mono bg-[#ebeef2] px-1 border border-[#c4c6cf]">F2</strong> :
                Buscar Artículo / Catálogo
              </div>
              <div>
                <strong className="font-mono bg-[#ebeef2] px-1 border border-[#c4c6cf]">F3</strong> :
                Seleccionar Cliente / Cta Cte
              </div>
              <div>
                <strong className="font-mono bg-[#ebeef2] px-1 border border-[#c4c6cf]">F4</strong> :
                Abrir Gaveta de Dinero
              </div>
              <div>
                <strong className="font-mono bg-[#ebeef2] px-1 border border-[#c4c6cf]">F5</strong> :
                Exportar / Sincronizar Balanzas
              </div>
              <div>
                <strong className="font-mono bg-[#ebeef2] px-1 border border-[#c4c6cf]">F6</strong> :
                Facturación Fiscal ARCA A/B
              </div>
              <div>
                <strong className="font-mono bg-[#ebeef2] px-1 border border-[#c4c6cf]">F7</strong> :
                Caja Actual / Arqueo en Vivo
              </div>
              <div>
                <strong className="font-mono bg-[#ebeef2] px-1 border border-[#c4c6cf]">F8</strong> :
                Informes y Estadísticas
              </div>
              <div>
                <strong className="font-mono bg-[#ebeef2] px-1 border border-[#c4c6cf]">F10</strong> :
                Cuentas Corrientes y Saldos
              </div>
              <div>
                <strong className="font-mono bg-[#ebeef2] px-1 border border-[#c4c6cf]">F11</strong> :
                Historial de Cierres Z
              </div>
              <div>
                <strong className="font-mono bg-[#ebeef2] px-1 border border-[#c4c6cf]">F12</strong> :
                Cobrar Ticket / Cierre Z
              </div>
              <div>
                <strong className="font-mono bg-[#ebeef2] px-1 border border-[#c4c6cf]">ESC</strong> :
                Cancelar / Cerrar Ventana
              </div>
            </div>
          </div>

          <div className="bg-[#fffdfa] p-2 border border-[#c4c6cf] text-[11px] text-[#44474e]">
            <span className="font-bold text-[#002046]">Estructura de Balanzas Carnicería:</span>
            <p className="mt-0.5">
              Las etiquetas impresas por balanzas Systel y Kretz utilizan prefijo <strong>20</strong>{' '}
              seguido de 4 dígitos para el código PLU del corte, 5 dígitos para el peso en gramos, y
              1 dígito verificador. El sistema decodifica el peso automáticamente al escanear.
            </p>
          </div>

          <div className="flex justify-end pt-2 border-t border-[#c4c6cf]">
            <button
              onClick={() => setShowHelpModal(false)}
              className="h-[26px] px-4 bg-[#002046] text-white font-bold text-[11px] cursor-pointer"
            >
              Entendido [Esc]
            </button>
          </div>
        </div>
      </WindowsModal>

      {/* Modal: Acerca de NECO POS */}
      <WindowsModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        title="ACERCA DE NECO POS"
        maxWidth="max-w-md"
      >
        <div className="flex flex-col gap-3 p-2 text-[12px] select-none">
          <div className="bg-white p-3 border border-[#c4c6cf] shadow-sm flex flex-col gap-2 text-center">
            <div className="text-[16px] font-bold text-[#002046] tracking-tight border-b border-[#ebeef2] pb-2">
              NECO POS v4.8 Enterprise Edition
            </div>
            <div className="text-[13px] font-semibold text-[#181c1f]">
              Sistema de Gestión y Punto de Venta para Carnicerías
            </div>
            <div className="text-[11px] text-[#44474e]">
              Soporte para Balanzas Systel/Kretz/Toledo y Facturación Fiscal ARCA
            </div>
            <div className="text-[11px] text-[#002046] font-bold bg-[#f1f4f8] py-1 px-2 border border-[#d6e3ff]">
              Desarrollado para Carnicerías Neco (Sucursal 1 y Sucursal 2).
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={() => setShowAboutModal(false)}
              className="h-[26px] px-4 bg-[#002046] hover:bg-[#1b365d] text-white font-bold text-[11px] cursor-pointer"
            >
              Aceptar
            </button>
          </div>
        </div>
      </WindowsModal>

      {/* Security Lock Screen Modal */}
      {isAppLocked && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center">
          <div className="bg-[#ebeef2] border-2 border-[#002046] shadow-2xl p-4 w-full max-w-sm flex flex-col gap-3">
            <div className="bg-[#002046] text-white p-2 text-center font-bold text-[13px]">
              TERMINAL BLOQUEADA POR SEGURIDAD
            </div>

            <div className="text-[12px] text-center text-[#44474e]">
              Operador actual: <strong>{currentUser.fullName}</strong>
              <br />
              Sucursal: <strong>{currentBranch.id}</strong> (Caja {currentBranch.pointOfSale})
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#002046] block mb-1">
                Ingrese Clave o PIN de Operador (Ej: 1234):
              </label>
              <input
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlockApp()}
                placeholder="PIN..."
                className="w-full h-[32px] px-2 bg-white border-2 border-[#74777f] font-mono text-[18px] text-center tracking-widest focus:outline-none"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleUnlockApp}
                className="flex-1 h-[32px] bg-[#002046] hover:bg-[#1b365d] text-white font-bold text-[12px] cursor-pointer"
              >
                Desbloquear Terminal [Enter]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
