import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  runTransaction,
  query,
  where,
  limit,
  Transaction,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  Product,
  Customer,
  Employee,
  BranchConfig,
  UserAccount,
  AccountMovement,
  CashMovement,
  CashClosure,
  ElectronicInvoice,
  ArcaConfig,
  AuditLog,
  BranchStock,
  StockMovement,
  StockMovementType,
  StockTransfer,
  PhysicalInventory,
  MeatDeboning,
  MeatReception,
  DeboningYieldTemplate,
  CarcassStatus,
  CarcassUnit,
} from '../types/pos';
import { calculateDeboningMassBalance, prepareNextTemplateVersion } from '../utils/deboningHelper';
import {
  formatKg,
  classifyStockMovementBatch,
  isMeatProduct,
  getStorageLocationName,
  getStoreRubroLabel,
} from '../utils/stockHelper';
import { isStoreUnitProduct } from '../utils/scaleParser';
import { INITIAL_BRANCH_CONFIGS, INITIAL_USERS } from '../data/mockData';
import { arcaService } from '../services/arcaService';

export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) {
    return null as any;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as any;
  }
  const cleanObj: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      cleanObj[key] = sanitizeForFirestore(value);
    }
  }
  return cleanObj;
}

const DEFAULT_ARCA_CONFIG: ArcaConfig = {
  cuit: '20-25506516-6',
  companyName: 'MOYA CARLOS HUGO',
  vatCondition: 'Responsable Inscripto',
  environment: 'produccion',
  connected: true,
  lastChecked: new Date().toISOString(),
  pointsOfSale: {
    'NECO 1': '0017',
    'NECO 2': '0018',
  },
};

interface FirebaseContextType {
  user: User | null;
  localUser: UserAccount | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  products: Product[];
  customers: Customer[];
  employees: Employee[];
  branchConfigs: Record<'NECO 1' | 'NECO 2', BranchConfig> | null;
  users: UserAccount[];
  accountMovements: AccountMovement[];
  cashMovements: CashMovement[];
  cashClosures: CashClosure[];
  sales: any[];
  electronicInvoices: ElectronicInvoice[];
  arcaConfig: ArcaConfig;
  auditLogs: AuditLog[];
  branchStock: BranchStock[];
  stockMovements: StockMovement[];
  stockTransfers: StockTransfer[];
  physicalInventories: PhysicalInventory[];
  meatDebonings: MeatDeboning[];
  meatReceptions: MeatReception[];
  deboningTemplates: DeboningYieldTemplate[];
  saveDeboningTemplate: (template: DeboningYieldTemplate) => Promise<void>;
  deleteDeboningTemplate: (id: string) => Promise<void>;
  saveProduct: (p: Product) => Promise<void>;
  saveProductsBatch: (items: Product[]) => Promise<void>;
  deleteProduct: (code: string, docId?: string) => Promise<void>;
  saveCustomer: (c: Customer) => Promise<void>;
  saveEmployee: (e: Employee) => Promise<void>;
  saveBranchConfig: (b: BranchConfig) => Promise<void>;
  saveUserAccount: (u: UserAccount) => Promise<void>;
  deleteUserAccount: (id: string) => Promise<void>;
  addAccountMovement: (m: AccountMovement) => Promise<void>;
  deleteAccountMovement: (id: string) => Promise<void>;
  addCashMovement: (m: CashMovement) => Promise<void>;
  deleteCashMovement: (id: string) => Promise<void>;
  addCashClosure: (c: CashClosure) => Promise<void>;
  deleteCashClosure: (id: string) => Promise<void>;
  purgeAutoClosures: () => Promise<void>;
  addSaleRecord: (saleData: any) => Promise<void>;
  cancelSaleRecord: (saleData: any, operator: string) => Promise<void>;
  deleteSaleRecord: (saleId: string) => Promise<void>;
  updateCustomerBalance: (customerId: string, newBalance: number) => Promise<void>;
  saveElectronicInvoice: (inv: ElectronicInvoice) => Promise<void>;
  saveArcaConfig: (cfg: ArcaConfig) => Promise<void>;
  addAuditLog: (log: AuditLog) => Promise<void>;
  recordStockMovement: (movement: StockMovement) => Promise<void>;
  recordStockMovementsBatch: (movements: StockMovement[]) => Promise<void>;
  deductSaleStock: (saleData: any, branchId: 'NECO 1' | 'NECO 2', operator: string) => Promise<void>;
  saveStockTransfer: (transfer: StockTransfer) => Promise<void>;
  dispatchStockTransfer: (transfer: StockTransfer, operator: string) => Promise<void>;
  receiveStockTransfer: (transfer: StockTransfer, operator: string) => Promise<void>;
  cancelStockTransfer: (transfer: StockTransfer, operator: string, reason?: string) => Promise<void>;
  applyPhysicalInventory: (inventory: PhysicalInventory, operator: string) => Promise<void>;
  saveMeatDeboning: (deboning: MeatDeboning) => Promise<void>;
  finalizeMeatDeboning: (deboning: MeatDeboning, operator: string) => Promise<void>;
  deleteOrCancelMeatDeboning: (deboningId: string, operator: string, reason?: string) => Promise<void>;
  saveMeatReception: (reception: MeatReception) => Promise<void>;
  finalizeMeatReception: (reception: MeatReception, operator: string) => Promise<void>;
  deleteOrCancelMeatReception: (receptionId: string, operator: string, reason?: string, hardDelete?: boolean) => Promise<void>;
  deleteMeatReception: (receptionId: string, operator: string, reason?: string) => Promise<void>;
  initializeChamberStock: (
    branchId: 'NECO 1' | 'NECO 2',
    items: Array<{ productCode: string; stock: number; minStock?: number }>,
    operator: string
  ) => Promise<void>;
  revertCreditNoteStock: (
    items: any[],
    branchId: 'NECO 1' | 'NECO 2',
    operator: string,
    referenceDoc: string
  ) => Promise<void>;
  updateProductMinStock: (
    branchId: 'NECO 1' | 'NECO 2',
    productCode: string,
    minStock: number
  ) => Promise<void>;
  purgeDatabase: () => Promise<void>;
  purgeProductsCollection: () => Promise<void>;
  purgeInventoryTransactions: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [localUser, setLocalUser] = useState<UserAccount | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('neco_pos_local_user');
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (err) {
        console.warn('Error reading local user from localStorage:', err);
      }
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branchConfigs, setBranchConfigs] = useState<Record<'NECO 1' | 'NECO 2', BranchConfig> | null>(null);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [accountMovements, setAccountMovements] = useState<AccountMovement[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [cashClosures, setCashClosures] = useState<CashClosure[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [electronicInvoices, setElectronicInvoices] = useState<ElectronicInvoice[]>([]);
  const [arcaConfig, setArcaConfig] = useState<ArcaConfig>(DEFAULT_ARCA_CONFIG);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [branchStock, setBranchStock] = useState<BranchStock[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>([]);
  const [physicalInventories, setPhysicalInventories] = useState<PhysicalInventory[]>([]);
  const [meatDebonings, setMeatDebonings] = useState<MeatDeboning[]>([]);
  const [meatReceptions, setMeatReceptions] = useState<MeatReception[]>([]);
  const [deboningTemplates, setDeboningTemplates] = useState<DeboningYieldTemplate[]>([]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userEmail = currentUser.email || 'omarenriqueflores@gmail.com';
          const userDisplayName = currentUser.displayName || (userEmail.toLowerCase().includes('omar') ? 'Omar Enrique Flores' : userEmail.split('@')[0]);
          const userId = currentUser.uid || 'USR-02';

          const userDocRef = doc(db, 'users', userId);
          const userSnap = await getDoc(userDocRef);

          if (!userSnap.exists()) {
            const newUserDoc: UserAccount = {
              id: userId,
              username: userEmail,
              fullName: userDisplayName,
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
            };
            await setDoc(userDocRef, newUserDoc);
          }
        } catch (err) {
          console.warn('Auto registration error for user:', err);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync active user to arcaService and localStorage
  useEffect(() => {
    let isCancelled = false;
    if (localUser) {
      arcaService.setAuthUser({
        id: localUser.id,
        username: localUser.username,
        role: localUser.role,
        active: localUser.active !== false,
        password: localUser.password,
      });
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('neco_pos_local_user', JSON.stringify(localUser));
        } catch (err) {
          console.warn('Error saving local user to localStorage:', err);
        }
      }
    } else if (user) {
      user.getIdToken().then((token) => {
        if (!isCancelled) {
          arcaService.setAuthUser({
            id: user.uid,
            username: user.email || user.uid,
            role: 'SUPERADMIN',
            firebaseToken: token,
            active: true,
          });
        }
      }).catch(() => {});
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('neco_pos_local_user');
        } catch (_) {}
      }
    } else {
      arcaService.setAuthUser(null);
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('neco_pos_local_user');
        } catch (_) {}
      }
    }
    return () => {
      isCancelled = true;
    };
  }, [user, localUser]);

  // Sync Products from Firestore (purely read-only synchronization, no automatic updates or deletions)
  useEffect(() => {
    const productsPath = 'products';
    const unsub = onSnapshot(
      collection(db, productsPath),
      (snapshot) => {
        const loadedProducts: Product[] = snapshot.docs.map((docItem) => {
          const data = docItem.data() || {};
          const code = String(data.code || data.codigo || data.id || docItem.id || `P-${Math.random()}`);
          const description = String(
            data.description || data.descripcion || data.name || data.nombre || 'PRODUCTO SIN DESCRIPCIÓN'
          );
          const descUpper = description.toUpperCase();

          // Preserve exact rubro and category from Firestore
          const rawRubro = data.rubro || data.departamento;
          const rawCategory = data.category || data.categoria || data.especie;
          const rubro = rawRubro ? String(rawRubro) : 'Carnes Vacunas';
          const category = rawCategory ? String(rawCategory) : 'Novillito';

          // Preserve exact unitType stored in Firestore without force-converting
          const rawUnit = data.unitType || data.unidad;
          let unitType: 'Kg' | 'Unid' = 'Kg';
          if (rawUnit) {
            const uLower = String(rawUnit).trim().toLowerCase();
            unitType = (uLower === 'unid' || uLower === 'u' || uLower === 'unidad' || uLower === 'unidades') ? 'Unid' : 'Kg';
          } else {
            // Only infer if completely missing from Firestore
            const isStoreItem = isStoreUnitProduct({
              description: descUpper,
              rubro,
              category,
            });
            unitType = isStoreItem ? 'Unid' : 'Kg';
          }

          const price = Number(data.price ?? data.precio ?? 0);
          const vatRate = Number(data.vatRate ?? data.iva ?? 21);
          const scalePlu =
            data.scalePlu !== undefined
              ? (data.scalePlu ? String(data.scalePlu) : null)
              : data.plu
              ? String(data.plu)
              : (unitType === 'Unid' ? null : code);
          const barcodeRaw = data.barcode || data.codigoBarras || data.ean || null;
          const barcode = barcodeRaw ? String(barcodeRaw).trim() : null;
          const active = data.active !== false;

          // Preserve cost and stock fields without data loss
          const costPrice =
            data.costPrice !== undefined
              ? Number(data.costPrice)
              : data.costo !== undefined
              ? Number(data.costo)
              : undefined;
          const costo = data.costo !== undefined ? Number(data.costo) : costPrice;
          const stockNeco1 = data.stockNeco1 !== undefined ? Number(data.stockNeco1) : undefined;
          const stockNeco2 = data.stockNeco2 !== undefined ? Number(data.stockNeco2) : undefined;
          const stock = data.stock !== undefined ? Number(data.stock) : undefined;

          return {
            code,
            docId: docItem.id,
            barcode,
            name: data.name ? String(data.name) : undefined,
            description: descUpper,
            rubro,
            category,
            species: data.species ? String(data.species) : undefined,
            unitType,
            price,
            costPrice,
            costo,
            stockNeco1,
            stockNeco2,
            stock,
            vatRate,
            scalePlu,
            active,
          };
        });

        // Always show the real products stored in Firestore
        setProducts(loadedProducts);
      },
      (error) => {
        console.warn('Firestore Products sync error:', error);
        setProducts([]);
      }
    );

    return () => unsub();
  }, []);

  // Sync Customers from Firestore
  useEffect(() => {
    const customersPath = 'customers';
    const unsub = onSnapshot(
      collection(db, customersPath),
      (snapshot) => {
        const loadedCustomers = snapshot.docs.map((docItem) => docItem.data() as Customer);
        setCustomers(loadedCustomers);
      },
      (error) => {
        console.warn('Firestore Customers sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync Employees from Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'employees'),
      (snapshot) => {
        const loaded = snapshot.docs.map((docItem) => docItem.data() as Employee);
        setEmployees(loaded);
      },
      (error) => {
        console.warn('Firestore Employees sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync Branches from Firestore (with bootstrapping if empty)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'branches'),
      async (snapshot) => {
        if (snapshot.empty) {
          // Bootstrap default branches in Firestore
          for (const key of Object.keys(INITIAL_BRANCH_CONFIGS) as ('NECO 1' | 'NECO 2')[]) {
            try {
              await setDoc(doc(db, 'branches', key), INITIAL_BRANCH_CONFIGS[key]);
            } catch (err) {
              console.error('Error bootstrapping branch:', key, err);
            }
          }
        } else {
          const loaded: any = {};
          snapshot.docs.forEach((docItem) => {
            loaded[docItem.id] = docItem.data() as BranchConfig;
          });
          setBranchConfigs(loaded);
        }
      },
      (error) => {
        console.warn('Firestore Branches sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync Users from Firestore (with bootstrapping if empty)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      async (snapshot) => {
        if (snapshot.empty) {
          // Bootstrap default users in Firestore
          for (const u of INITIAL_USERS) {
            try {
              await setDoc(doc(db, 'users', u.id), u);
            } catch (err) {
              console.error('Error bootstrapping user:', u.id, err);
            }
          }
          setUsers(INITIAL_USERS);
        } else {
          const loaded = snapshot.docs.map((docItem) => docItem.data() as UserAccount);
          const map = new Map<string, UserAccount>();
          for (const u of loaded) {
            if (u.username) {
              map.set(u.username.trim().toLowerCase(), u);
            }
          }
          setUsers(Array.from(map.values()));
        }
      },
      (error) => {
        console.warn('Firestore Users sync error:', error);
        const map = new Map<string, UserAccount>();
        for (const u of INITIAL_USERS) {
          if (u.username) {
            map.set(u.username.trim().toLowerCase(), u);
          }
        }
        setUsers(Array.from(map.values()));
      }
    );
    return () => unsub();
  }, []);

  // Sync Account Movements
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'accountMovements'),
      (snapshot) => {
        const loaded = snapshot.docs.map((docItem) => docItem.data() as AccountMovement);
        loaded.sort((a, b) => b.id.localeCompare(a.id));
        setAccountMovements(loaded);
      },
      (error) => {
        console.warn('Firestore AccountMovements sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync Cash Movements
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'cashMovements'),
      (snapshot) => {
        const loaded = snapshot.docs.map((docItem) => docItem.data() as CashMovement);
        loaded.sort((a, b) => b.id.localeCompare(a.id));
        setCashMovements(loaded);
      },
      (error) => {
        console.warn('Firestore CashMovements sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync Cash Closures (strictly read-only synchronization)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'cashClosures'),
      (snapshot) => {
        const loaded: CashClosure[] = [];
        for (const docItem of snapshot.docs) {
          const data = docItem.data() as CashClosure;
          loaded.push(data);
        }
        loaded.sort((a, b) => b.id.localeCompare(a.id));
        setCashClosures(loaded);
      },
      (error) => {
        console.warn('Firestore CashClosures sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync Sales
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'sales'),
      (snapshot) => {
        const loaded = snapshot.docs.map((docItem) => docItem.data() as any);
        loaded.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
        setSales(loaded);
      },
      (error) => {
        console.warn('Firestore Sales sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync Electronic Invoices from Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'electronicInvoices'),
      (snapshot) => {
        const loaded = snapshot.docs.map((docItem) => docItem.data() as ElectronicInvoice);
        loaded.sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date));
        setElectronicInvoices(loaded);
      },
      (error) => {
        console.warn('Firestore ElectronicInvoices sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync ARCA Config from Firestore (non-sensitive status only; secrets remain on server)
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'arcaConfig', 'main'),
      async (docSnap) => {
        const localStored = arcaService.getStoredConfig();
        const serverStored = await arcaService.fetchServerCredentials();

        if (!docSnap.exists()) {
          try {
            const initialCfg: ArcaConfig = {
              ...DEFAULT_ARCA_CONFIG,
              ...localStored,
              ...(serverStored || {}),
              hasCertificate: Boolean(serverStored?.hasCertificate ?? localStored.hasCertificate),
              hasPrivateKey: Boolean(serverStored?.hasPrivateKey ?? localStored.hasPrivateKey),
              certificateLinked: Boolean(
                (serverStored?.hasCertificate ?? localStored.hasCertificate) &&
                  (serverStored?.hasPrivateKey ?? localStored.hasPrivateKey)
              ),
            };
            delete initialCfg.certificate;
            delete initialCfg.privateKey;
            await setDoc(doc(db, 'arcaConfig', 'main'), sanitizeForFirestore(initialCfg), { merge: true });
            setArcaConfig(initialCfg);
            arcaService.persistCredentials(initialCfg);
          } catch (err) {
            console.error('Error bootstrapping arcaConfig:', err);
          }
        } else {
          const data = docSnap.data() as ArcaConfig;
          const hasCert = Boolean(
            serverStored?.hasCertificate ?? data.hasCertificate ?? localStored.hasCertificate
          );
          const hasKey = Boolean(
            serverStored?.hasPrivateKey ?? data.hasPrivateKey ?? localStored.hasPrivateKey
          );

          const merged: ArcaConfig = {
            ...DEFAULT_ARCA_CONFIG,
            ...data,
            ...(serverStored || {}),
            hasCertificate: hasCert,
            hasPrivateKey: hasKey,
            certificateLinked: Boolean(hasCert && hasKey),
          };
          delete merged.certificate;
          delete merged.privateKey;

          setArcaConfig(merged);
          arcaService.persistCredentials(merged);
        }
      },
      (error) => {
        console.warn('Firestore ARCA Config sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync Audit Logs from Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'auditLogs'),
      (snapshot) => {
        const loaded = snapshot.docs.map((docItem) => docItem.data() as AuditLog);
        loaded.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
        setAuditLogs(loaded);
      },
      (error) => {
        console.warn('Firestore AuditLogs sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync BranchStock
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'branchStock'),
      (snapshot) => {
        const loaded = snapshot.docs.map((docItem) => docItem.data() as BranchStock);
        setBranchStock(loaded);
      },
      (error) => {
        console.warn('Firestore BranchStock sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync Stock Movements (strictly read-only synchronization)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'stockMovements'),
      (snapshot) => {
        const loaded: StockMovement[] = [];
        snapshot.docs.forEach((docItem) => {
          const data = docItem.data() as StockMovement;
          loaded.push(data);
        });
        loaded.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setStockMovements(loaded);
      },
      (error) => {
        console.warn('Firestore StockMovements sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync Stock Transfers
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'stockTransfers'),
      (snapshot) => {
        const loaded = snapshot.docs.map((docItem) => docItem.data() as StockTransfer);
        loaded.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setStockTransfers(loaded);
      },
      (error) => {
        console.warn('Firestore StockTransfers sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync Physical Inventories
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'physicalInventories'),
      (snapshot) => {
        const loaded = snapshot.docs.map((docItem) => docItem.data() as PhysicalInventory);
        loaded.sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
        setPhysicalInventories(loaded);
      },
      (error) => {
        console.warn('Firestore PhysicalInventories sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync Meat Debonings
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'meatDebonings'),
      (snapshot) => {
        const loaded = snapshot.docs.map((docItem) => docItem.data() as MeatDeboning);
        loaded.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setMeatDebonings(loaded);
      },
      (error) => {
        console.warn('Firestore MeatDebonings sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync Meat Receptions
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'meatReceptions'),
      (snapshot) => {
        const loaded = snapshot.docs.map((docItem) => docItem.data() as MeatReception);
        loaded.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setMeatReceptions(loaded);
      },
      (error) => {
        console.warn('Firestore MeatReceptions sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  // Sync Deboning Templates
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'deboningTemplates'),
      (snapshot) => {
        const loaded = snapshot.docs.map((docItem) => docItem.data() as DeboningYieldTemplate);
        loaded.sort((a, b) => (b.version || 0) - (a.version || 0));
        setDeboningTemplates(loaded);
      },
      (error) => {
        console.warn('Firestore DeboningTemplates sync error:', error);
      }
    );
    return () => unsub();
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    setLocalUser(null);
  };

  const loginWithEmail = async (emailOrUsername: string, pass: string) => {
    const inputClean = emailOrUsername.trim();
    const lowerInput = inputClean.toLowerCase();

    let targetEmail = inputClean;
    if (!targetEmail.includes('@')) {
      const foundUser = users.find(
        (u) =>
          u.username.toLowerCase() === lowerInput ||
          u.fullName.toLowerCase() === lowerInput
      );
      if (foundUser && foundUser.email) {
        targetEmail = foundUser.email;
      } else {
        targetEmail = `${lowerInput}@necopos.com`;
      }
    }

    try {
      await signInWithEmailAndPassword(auth, targetEmail, pass);
      setLocalUser(null);
    } catch (firebaseErr: any) {
      console.warn('Firebase Auth login failed, checking local Firestore users:', firebaseErr.message);

      const localMatch = users.find(
        (u) =>
          u.username.toLowerCase() === lowerInput ||
          (u.email && u.email.toLowerCase() === lowerInput) ||
          (u.email && u.email.toLowerCase() === targetEmail.toLowerCase()) ||
          u.fullName.toLowerCase() === lowerInput
      );

      if (localMatch) {
        if (localMatch.password && localMatch.password !== pass) {
          throw new Error('Contraseña incorrecta.');
        }
        setLocalUser(localMatch);
        return;
      }

      if (
        firebaseErr.code === 'auth/invalid-credential' ||
        firebaseErr.code === 'auth/user-not-found' ||
        firebaseErr.code === 'auth/wrong-password'
      ) {
        throw new Error('Usuario, correo electrónico o contraseña incorrectos.');
      }
      throw firebaseErr;
    }
  };

  const logout = async () => {
    setLocalUser(null);
    await firebaseSignOut(auth);
  };

  const saveProduct = async (p: Product) => {
    const path = `products/${p.code}`;
    const cleanProduct: Record<string, any> = {
      code: String(p.code),
      description: p.description,
      price: Number(p.price),
      active: p.active !== false,
    };
    if (p.barcode !== undefined) cleanProduct.barcode = p.barcode ? String(p.barcode).trim() : null;
    if (p.name !== undefined) cleanProduct.name = p.name;
    if (p.rubro !== undefined) cleanProduct.rubro = p.rubro;
    if (p.category !== undefined) cleanProduct.category = p.category;
    if (p.species !== undefined) cleanProduct.species = p.species;
    if (p.unitType !== undefined) cleanProduct.unitType = p.unitType;
    if (p.scalePlu !== undefined) cleanProduct.scalePlu = p.scalePlu;
    if (p.vatRate !== undefined) cleanProduct.vatRate = p.vatRate;
    if (p.costPrice !== undefined) cleanProduct.costPrice = p.costPrice;
    if (p.costo !== undefined) cleanProduct.costo = p.costo;
    if (p.stockNeco1 !== undefined) cleanProduct.stockNeco1 = p.stockNeco1;
    if (p.stockNeco2 !== undefined) cleanProduct.stockNeco2 = p.stockNeco2;
    if (p.stock !== undefined) cleanProduct.stock = p.stock;

    try {
      await setDoc(doc(db, 'products', p.code), cleanProduct, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const saveProductsBatch = async (items: Product[]) => {
    try {
      const chunkSize = 450;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const p of chunk) {
          const docRef = doc(db, 'products', String(p.code));
          const cleanProduct: Record<string, any> = {
            code: String(p.code),
            description: p.description,
            price: Number(p.price),
            active: p.active !== false,
          };
          if (p.barcode !== undefined) cleanProduct.barcode = p.barcode ? String(p.barcode).trim() : null;
          if (p.name !== undefined) cleanProduct.name = p.name;
          if (p.rubro !== undefined) cleanProduct.rubro = p.rubro;
          if (p.category !== undefined) cleanProduct.category = p.category;
          if (p.species !== undefined) cleanProduct.species = p.species;
          if (p.unitType !== undefined) cleanProduct.unitType = p.unitType;
          if (p.scalePlu !== undefined) cleanProduct.scalePlu = p.scalePlu;
          if (p.vatRate !== undefined) cleanProduct.vatRate = p.vatRate;
          if (p.costPrice !== undefined) cleanProduct.costPrice = p.costPrice;
          if (p.costo !== undefined) cleanProduct.costo = p.costo;
          if (p.stockNeco1 !== undefined) cleanProduct.stockNeco1 = p.stockNeco1;
          if (p.stockNeco2 !== undefined) cleanProduct.stockNeco2 = p.stockNeco2;
          if (p.stock !== undefined) cleanProduct.stock = p.stock;

          batch.set(docRef, cleanProduct, { merge: true });
        }
        await batch.commit();
      }
    } catch (error) {
      console.error('Error in saveProductsBatch:', error);
      throw error;
    }
  };

  const deleteProduct = async (code: string, docId?: string) => {
    try {
      if (docId) {
        try {
          await deleteDoc(doc(db, 'products', docId));
        } catch (_) {}
      }
      try {
        await deleteDoc(doc(db, 'products', code));
      } catch (_) {}

      // Delete by exact matching code only if needed, never by scalePlu!
      const snap = await getDocs(collection(db, 'products'));
      for (const d of snap.docs) {
        const data = d.data();
        if (
          d.id === code ||
          d.id === docId ||
          String(data.code) === String(code) ||
          String(data.codigo) === String(code)
        ) {
          try {
            await deleteDoc(d.ref);
          } catch (_) {}
        }
      }
    } catch (error) {
      console.error('Error deleting product from Firestore:', error);
    }
  };

  const saveCustomer = async (c: Customer) => {
    const path = `customers/${c.code}`;
    try {
      await setDoc(doc(db, 'customers', c.code), sanitizeForFirestore(c));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const saveEmployee = async (e: Employee) => {
    const path = `employees/${e.code}`;
    try {
      await setDoc(doc(db, 'employees', e.code), sanitizeForFirestore(e));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const saveBranchConfig = async (b: BranchConfig) => {
    const path = `branches/${b.id}`;
    try {
      await setDoc(doc(db, 'branches', b.id), sanitizeForFirestore(b));
      if (b.pointOfSale) {
        await setDoc(
          doc(db, 'arcaConfig', 'main'),
          sanitizeForFirestore({
            pointsOfSale: {
              [b.id]: b.pointOfSale,
            },
          }),
          { merge: true }
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const saveUserAccount = async (u: UserAccount) => {
    const path = `users/${u.id}`;
    try {
      await setDoc(doc(db, 'users', u.id), sanitizeForFirestore(u));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const deleteUserAccount = async (id: string) => {
    const path = `users/${id}`;
    try {
      await deleteDoc(doc(db, 'users', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const addAccountMovement = async (m: AccountMovement) => {
    const path = `accountMovements/${m.id}`;
    try {
      await setDoc(doc(db, 'accountMovements', m.id), sanitizeForFirestore(m));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const deleteAccountMovement = async (id: string) => {
    const path = `accountMovements/${id}`;
    try {
      await deleteDoc(doc(db, 'accountMovements', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const addCashMovement = async (m: CashMovement) => {
    const path = `cashMovements/${m.id}`;
    try {
      await setDoc(doc(db, 'cashMovements', m.id), sanitizeForFirestore(m));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const deleteCashMovement = async (movementId: string) => {
    const path = `cashMovements/${movementId}`;
    try {
      await deleteDoc(doc(db, 'cashMovements', movementId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const addCashClosure = async (c: CashClosure) => {
    const path = `cashClosures/${c.id}`;
    try {
      await setDoc(doc(db, 'cashClosures', c.id), sanitizeForFirestore(c));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const deleteCashClosure = async (id: string) => {
    const path = `cashClosures/${id}`;
    try {
      await deleteDoc(doc(db, 'cashClosures', id));
      setCashClosures((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const purgeAutoClosures = async () => {
    try {
      const snap = await getDocs(collection(db, 'cashClosures'));
      for (const d of snap.docs) {
        const data = d.data();
        const isAuto =
          d.id.startsWith('Z-AUTO') ||
          String(data.operator || '').includes('AUTOMÁTICO') ||
          String(data.notes || '').includes('[AUTO-SISTEMA]') ||
          String(data.shift || '').includes('AUTOMÁTICO');
        if (isAuto) {
          try {
            await deleteDoc(d.ref);
          } catch (err) {
            console.error('Error borrando cierre automático:', d.id, err);
          }
        }
      }
      setCashClosures((prev) =>
        prev.filter(
          (c) =>
            !c.id.startsWith('Z-AUTO') &&
            !c.operator.includes('AUTOMÁTICO') &&
            !c.notes?.includes('[AUTO-SISTEMA]') &&
            !c.shift?.includes('AUTOMÁTICO')
        )
      );
    } catch (err) {
      console.error('Error purgando cierres automáticos:', err);
    }
  };

  const addSaleRecord = async (saleData: any) => {
    const salesPath = `sales/${saleData.id || Date.now()}`;
    try {
      const docId = saleData.id || `SALE-${Date.now()}`;
      const cleaned = sanitizeForFirestore({
        ...saleData,
        id: docId,
        createdAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'sales', docId), cleaned);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, salesPath);
    }
  };

  const deleteSaleRecord = async (saleId: string) => {
    const salesPath = `sales/${saleId}`;
    try {
      await deleteDoc(doc(db, 'sales', saleId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, salesPath);
    }
  };

  const cancelSaleRecord = async (saleData: any, operator: string) => {
    try {
      const saleId = saleData.id;
      if (!saleId) throw new Error('No se puede cancelar una venta sin ID.');

      // 1. Validar existencia y estado real de la venta en Firestore / memoria
      const saleRef = doc(db, 'sales', String(saleId));
      const saleSnap = await getDoc(saleRef);

      if (!saleSnap.exists()) {
        throw new Error(`La venta "${saleId}" no existe en el sistema.`);
      }

      const existingData = saleSnap.data() || {};
      if (existingData.cancelled || existingData.status === 'CANCELLED') {
        throw new Error(`La venta "${saleId}" ya fue cancelada previamente.`);
      }

      // 2. Crear movimientos inversos para restaurar stock con claves de idempotencia estables
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const movements: StockMovement[] = [];

      const itemsToRevert = saleData.items || existingData.items || [];
      const targetBranch = saleData.branchId || existingData.branchId || 'NECO 1';
      const ticketRef = saleData.ticketNumber || existingData.ticketNumber || saleId;

      for (let idx = 0; idx < itemsToRevert.length; idx++) {
        const item = itemsToRevert[idx];
        const productCode = item.code || item.productCode;
        if (!productCode) continue;

        const qty = Number(item.unitType === 'Kg' ? (item.weight || item.quantity || 0) : (item.quantity || 1));
        if (qty <= 0) continue;

        const prodRef = products.find((p) => p.code === productCode);
        const isMeat = isMeatProduct(prodRef || item);

        movements.push({
          id: `SM-${Date.now()}-${idx}-${Math.floor(1000 + Math.random() * 9000)}`,
          idempotencyKey: `REV_SALE_${saleId}_${productCode}_${idx}`,
          date: dateStr,
          time: timeStr,
          timestamp: Date.now() + idx,
          branchId: targetBranch,
          chamber: getStorageLocationName(targetBranch, isMeat),
          productCode: productCode,
          productDescription: item.description || '',
          category: item.category || (isMeat ? 'Carnes Vacunas' : 'Almacén'),
          unitType: item.unitType || (isMeat ? 'Kg' : 'Unid'),
          type: 'DEVOLUCION',
          quantity: qty,
          factor: 1, // Restaura stock
          previousStock: 0,
          newStock: 0,
          unitPrice: Number(item.unitPrice) || 0,
          totalValue: Number((qty * (Number(item.unitPrice) || 0)).toFixed(2)),
          referenceDoc: `REV-${ticketRef}`,
          saleId: String(saleId),
          operator: operator || 'Cajero POS',
          notes: `Reversión por cancelación de venta POS: ${ticketRef}`,
        });
      }

      if (movements.length > 0) {
        await recordStockMovementsBatch(movements);
      }

      // 3. Conservar el documento de la venta original marcándolo como CANCELADO
      await setDoc(
        saleRef,
        sanitizeForFirestore({
          status: 'CANCELLED',
          cancelled: true,
          cancelledAt: `${dateStr} ${timeStr}`,
          cancelledBy: operator || 'Cajero POS',
          cancelReason: saleData.cancelReason || 'Cancelación comercial solicitada por usuario',
        }),
        { merge: true }
      );
    } catch (error) {
      console.error('Error canceling sale record:', error);
      throw error;
    }
  };

  const updateCustomerBalance = async (customerId: string, newBalance: number) => {
    const path = `customers/${customerId}`;
    try {
      const customerRef = doc(db, 'customers', customerId);
      await setDoc(customerRef, { currentBalance: newBalance }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const saveElectronicInvoice = async (inv: ElectronicInvoice) => {
    const path = `electronicInvoices/${inv.id}`;
    try {
      await setDoc(doc(db, 'electronicInvoices', inv.id), sanitizeForFirestore(inv));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const saveArcaConfig = async (cfg: ArcaConfig) => {
    const path = `arcaConfig/main`;
    try {
      const stored = arcaService.getStoredConfig();
      const hasCert = Boolean(cfg.certificate || cfg.hasCertificate || arcaConfig.hasCertificate || stored.hasCertificate);
      const hasKey = Boolean(cfg.privateKey || cfg.hasPrivateKey || arcaConfig.hasPrivateKey || stored.hasPrivateKey);

      const mergedWithUpload: ArcaConfig = {
        ...stored,
        ...arcaConfig,
        ...cfg,
        hasCertificate: hasCert,
        hasPrivateKey: hasKey,
        certificateLinked: Boolean(hasCert && hasKey),
      };

      // Forward any uploaded certificate/privateKey to the server and persist only sanitized metadata locally
      const sanitized = arcaService.persistCredentials(mergedWithUpload);
      setArcaConfig(sanitized);
      await setDoc(doc(db, 'arcaConfig', 'main'), sanitizeForFirestore(sanitized), { merge: true });

      // Sync points of sale back to branches if they were updated in arcaConfig
      if (sanitized.pointsOfSale) {
        const batch = writeBatch(db);
        for (const [branchKey, ptoVta] of Object.entries(sanitized.pointsOfSale)) {
          const branchRef = doc(db, 'branches', branchKey);
          batch.set(branchRef, { pointOfSale: ptoVta }, { merge: true });
        }
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const addAuditLog = async (log: AuditLog) => {
    const path = `auditLogs/${log.id}`;
    try {
      await setDoc(doc(db, 'auditLogs', log.id), sanitizeForFirestore(log));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  // ==========================================
  // INVENTORY OPERATIONS
  // ==========================================

  const recordStockMovement = async (movement: StockMovement) => {
    const movWithKey: StockMovement = {
      ...movement,
      idempotencyKey: movement.idempotencyKey || `MOV_${movement.id}`,
    };
    return recordStockMovementsBatch([movWithKey]);
  };

  const recordStockMovementsBatch = async (movements: StockMovement[]) => {
    // 1. Regla D: Validación estricta del lote (Lote inválido)
    if (!movements || !Array.isArray(movements) || movements.length === 0) {
      throw new Error('Regla D: Lote inválido: el lote de movimientos está vacío.');
    }

    for (const mov of movements) {
      if (!mov || !mov.productCode || !mov.branchId || !mov.id) {
        throw new Error(
          `Regla D: Lote inválido: movimiento ${mov?.id || 'sin ID'} carece de datos obligatorios (código de producto, sucursal o ID faltante).`
        );
      }
      const qty = Number(mov.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error(
          `Regla D: Lote inválido: movimiento "${mov.productCode}" tiene cantidad no numérica o menor/igual a cero (${mov.quantity}).`
        );
      }

      const commercialTypes: StockMovementType[] = [
        'VENTA',
        'DEVOLUCION',
        'TRANSFERENCIA_SALIDA',
        'TRANSFERENCIA_ENTRADA',
        'PRODUCCION',
        'DESPOSTE_INGRESO',
        'DESPOSTE_SALIDA',
      ];
      if (commercialTypes.includes(mov.type) && (!mov.idempotencyKey || !mov.idempotencyKey.trim())) {
        throw new Error(
          `Regla D.1: Movimiento comercial "${mov.type}" para producto "${mov.productCode}" exige una clave de idempotencia estable (idempotencyKey).`
        );
      }
    }

    try {
      await runTransaction(db, async (transaction) => {
        // 2. Verificar idempotencia de forma robusta
        const movementsWithKey = movements.filter((m) => !!m.idempotencyKey);
        const existingKeyDocs = new Map<string, any>();

        for (const mov of movementsWithKey) {
          const idempRef = doc(db, 'idempotencyKeys', mov.idempotencyKey!);
          const idempDoc = await transaction.get(idempRef);
          if (idempDoc.exists()) {
            existingKeyDocs.set(mov.idempotencyKey!, idempDoc.data());
          }
        }

        const alreadyAppliedKeys = new Set<string>();

        for (const mov of movementsWithKey) {
          const saved = existingKeyDocs.get(mov.idempotencyKey!);
          if (saved) {
            // Comprobar consistencia: producto, sucursal, cantidad y factor
            const isSameProduct = !saved.productCode || saved.productCode === mov.productCode;
            const isSameBranch = !saved.branchId || saved.branchId === mov.branchId;
            const isSameQty =
              saved.quantity === undefined ||
              Math.abs(Number(saved.quantity) - Number(mov.quantity)) < 0.001;
            const isSameFactor =
              saved.factor === undefined || Number(saved.factor) === Number(mov.factor);

            if (!isSameProduct || !isSameBranch || !isSameQty || !isSameFactor) {
              throw new Error(
                `Inconsistencia detectada en clave de idempotencia "${mov.idempotencyKey}": los datos del movimiento no coinciden con el registro existente. Producto: ${saved.productCode} vs ${mov.productCode}, Cantidad: ${saved.quantity} vs ${mov.quantity}. Operación bloqueada para evitar corrupción de stock.`
              );
            }
            alreadyAppliedKeys.add(mov.idempotencyKey!);
          }
        }

        // Determinar qué movimientos faltan por procesar
        const missingMovements = movements.filter(
          (m) => !m.idempotencyKey || !alreadyAppliedKeys.has(m.idempotencyKey)
        );

        // Caso C: Lote completamente aplicado previamente (todas las claves ya existen)
        if (missingMovements.length === 0) {
          console.warn(
            `Idempotencia: Todos los movimientos del lote (${alreadyAppliedKeys.size}) ya fueron aplicados previamente. No se modifica el stock.`
          );
          return;
        }

        if (alreadyAppliedKeys.size > 0) {
          console.info(
            `Recuperación de lote parcial: ${alreadyAppliedKeys.size} movimientos ya existían; aplicando únicamente los ${missingMovements.length} movimientos faltantes.`
          );
        }

        // 3. Procesar ÚNICAMENTE los movimientos faltantes (missingMovements)
        // Agrupar por producto/sucursal para lectura y actualización continua
        const groups = new Map<string, StockMovement[]>();
        for (const mov of missingMovements) {
          const key = `${mov.branchId}_${mov.productCode}`;
          const list = groups.get(key) || [];
          list.push(mov);
          groups.set(key, list);
        }

        const processedMovements: StockMovement[] = [];
        const stockUpdates: Array<{ ref: any; data: any }> = [];

        // 4. Procesar cada grupo leyendo el stock actual del backend
        for (const [stockKey, groupMovs] of groups.entries()) {
          const stockRef = doc(db, 'branchStock', stockKey);
          const stockSnap = await transaction.get(stockRef);

          let runningStock = stockSnap.exists() ? Number(stockSnap.data().currentStock) || 0 : 0;
          let minStock = stockSnap.exists() ? stockSnap.data().minStock ?? 20 : 20;
          let chamberName = stockSnap.exists()
            ? stockSnap.data().chamberName
            : groupMovs[0].branchId === 'NECO 1'
            ? 'Cámara Central NECO 1'
            : 'Cámara Frigorífica NECO 2';

          for (const mov of groupMovs) {
            const qty = Number(mov.quantity) || 0;
            const factor = mov.factor || 1;
            const prev = runningStock;
            runningStock = Number((runningStock + qty * factor).toFixed(3));

            processedMovements.push({
              ...mov,
              previousStock: prev,
              newStock: runningStock,
            });

            if (mov.chamber) chamberName = mov.chamber;
          }

          const [branchIdStr] = stockKey.split('_');
          const productCode = stockKey.substring(branchIdStr.length + 1);

          stockUpdates.push({
            ref: stockRef,
            data: {
              id: stockKey,
              branchId: branchIdStr,
              productCode,
              currentStock: runningStock,
              minStock,
              lastUpdated: new Date().toISOString(),
              chamberName,
            },
          });
        }

        // 5. Aplicar todas las escrituras (movimientos, claves de idempotencia completas y stocks)
        for (const mov of processedMovements) {
          const movRef = doc(db, 'stockMovements', mov.id);
          transaction.set(movRef, sanitizeForFirestore(mov));

          // Registrar la clave de idempotencia completa con producto, sucursal, cantidad y factor
          if (mov.idempotencyKey) {
            const idempRef = doc(db, 'idempotencyKeys', mov.idempotencyKey);
            transaction.set(idempRef, {
              timestamp: Date.now(),
              movementId: mov.id,
              productCode: mov.productCode,
              branchId: mov.branchId,
              quantity: Number(mov.quantity),
              factor: Number(mov.factor ?? 1),
              reference: mov.referenceDoc || '',
            });
          }
        }

        for (const update of stockUpdates) {
          transaction.set(update.ref, sanitizeForFirestore(update.data), { merge: true });
        }
      });
    } catch (error) {
      console.error('Error en recordStockMovementsBatch (Transaction):', error);
      throw error;
    }
  };

  const deductSaleStock = async (saleData: any, branchId: 'NECO 1' | 'NECO 2', operator: string) => {
    if (!saleData || !saleData.items || saleData.items.length === 0) return;

    // Idempotencia: Verificar si ya se procesó este descuento de venta usando un ID único garantizado
    const saleId = saleData.id || `SALE-${Date.now()}-${Math.random()}`;
    const isAlreadyProcessed = stockMovements.some(
      (m) => m.type === 'VENTA' && m.saleId === saleId
    );
    console.log("Debug: deductSaleStock isAlreadyProcessed:", isAlreadyProcessed, "saleId:", saleId);
    if (isAlreadyProcessed) {
      console.log('Stock ya descontado para esta venta (idempotencia verificada):', saleId);
      return;
    }

    const movementsToRecord: StockMovement[] = [];
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    for (let idx = 0; idx < saleData.items.length; idx++) {
      const item = saleData.items[idx];
      const productCode = item.code || item.productCode;
      if (!productCode) continue;

      const qty = Number(item.unitType === 'Kg' ? (item.weight || item.quantity || 0) : (item.quantity || 1));
      if (qty <= 0) continue;

      const prodRef = products.find((p) => p.code === productCode);
      const isMeat = isMeatProduct(prodRef || item);

      const mov: StockMovement = {
        id: `SM-${Date.now()}-${idx}-${Math.floor(1000 + Math.random() * 9000)}`,
        date: dateStr,
        time: timeStr,
        timestamp: Date.now() + idx,
        branchId,
        chamber: getStorageLocationName(branchId, isMeat),
        productCode,
        productDescription: item.description || '',
        category: item.category || prodRef?.category || (isMeat ? 'Carnes Vacunas' : 'Almacén'),
        unitType: item.unitType || prodRef?.unitType || (isMeat ? 'Kg' : 'Unid'),
        type: 'VENTA',
        quantity: qty,
        factor: -1,
        previousStock: 0,
        newStock: 0,
        unitPrice: Number(item.unitPrice) || 0,
        totalValue: Number((qty * (Number(item.unitPrice) || 0)).toFixed(2)),
        referenceDoc: saleData.ticketNumber || `Venta ${saleData.id}`,
        saleId: String(saleId),
        idempotencyKey: `SALE_${saleId}_${productCode}_${idx}`,
        operator: operator || 'Cajero POS',
        notes: `Venta POS - ${saleData.customerName || 'Consumidor Final'} (${saleData.invoiceType || 'Ticket'})`,
      };

      movementsToRecord.push(mov);
    }

    if (movementsToRecord.length > 0) {
      await recordStockMovementsBatch(movementsToRecord);
    }
  };

  const saveStockTransfer = async (transfer: StockTransfer) => {
    const path = `stockTransfers/${transfer.id}`;
    try {
      await setDoc(doc(db, 'stockTransfers', transfer.id), sanitizeForFirestore(transfer));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const dispatchStockTransfer = async (transfer: StockTransfer, operator: string) => {
    try {
      if (!transfer || !transfer.id) {
        throw new Error('Identificador de remito inválido.');
      }

      // 1. Validar el estado real del remito en Firestore antes de despachar
      const transferRef = doc(db, 'stockTransfers', transfer.id);
      const transferSnap = await getDoc(transferRef);
      if (transferSnap.exists()) {
        const currentData = transferSnap.data() as StockTransfer;
        if (currentData.status === 'EN_TRANSITO' || currentData.status === 'RECIBIDA') {
          console.warn('El remito de traslado ya fue despachado previamente (idempotencia):', transfer.transferNumber);
          return;
        }
        if (currentData.status === 'CANCELADA') {
          throw new Error(`El remito ${transfer.transferNumber} se encuentra cancelado.`);
        }
      }

      // 2. Validar disponibilidad de stock en sucursal de origen
      for (const item of transfer.items) {
        if (!item.productCode || item.quantity <= 0) {
          throw new Error(`Ítem inválido en transferencia: ${item.productCode || 'Sin código'}`);
        }
        const stockDocId = `${transfer.originBranch}_${item.productCode}`;
        const currentStockItem = branchStock.find((s) => s.id === stockDocId);
        const prevStock = currentStockItem ? Number(currentStockItem.currentStock) || 0 : 0;

        if (prevStock < item.quantity - 0.001) {
          throw new Error(
            `Stock insuficiente en ${transfer.originBranch} para el producto "${item.description || item.productCode}". Disponible: ${prevStock}, Requerido: ${item.quantity}.`
          );
        }
      }

      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const movements: StockMovement[] = [];

      for (const item of transfer.items) {
        const stockDocId = `${transfer.originBranch}_${item.productCode}`;
        const currentStockItem = branchStock.find((s) => s.id === stockDocId);
        const prevStock = currentStockItem ? Number(currentStockItem.currentStock) || 0 : 0;
        const newStock = Number((prevStock - item.quantity).toFixed(3));

        movements.push({
          id: `SM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
          date: dateStr,
          time: timeStr,
          timestamp: Date.now(),
          branchId: transfer.originBranch,
          chamber: transfer.originBranch === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2',
          productCode: item.productCode,
          productDescription: item.description,
          category: item.category,
          unitType: item.unitType,
          type: 'TRANSFERENCIA_SALIDA',
          quantity: item.quantity,
          factor: -1,
          previousStock: prevStock,
          newStock,
          unitPrice: item.price,
          totalValue: item.totalValue,
          referenceDoc: transfer.transferNumber,
          transferId: transfer.id,
          idempotencyKey: `TR_OUT_${transfer.id || transfer.transferNumber}_${item.productCode}`,
          operator,
          notes: `Despacho hacia ${transfer.destinationBranch}`,
        });
      }

      await recordStockMovementsBatch(movements);

      // Actualizar estado del remito a EN_TRANSITO en Firestore
      const updatedTransfer: StockTransfer = {
        ...transfer,
        status: 'EN_TRANSITO',
        sentAt: `${dateStr} ${timeStr}`,
      };
      await saveStockTransfer(updatedTransfer);
    } catch (error) {
      console.error('Error dispatching stock transfer:', error);
      throw error;
    }
  };

  const receiveStockTransfer = async (transfer: StockTransfer, operator: string) => {
    try {
      if (!transfer || !transfer.id) {
        throw new Error('Identificador de remito inválido.');
      }

      // 1. Validar el estado real del remito en Firestore
      const transferRef = doc(db, 'stockTransfers', transfer.id);
      const transferSnap = await getDoc(transferRef);
      
      let realStatus = transfer.status;
      if (transferSnap.exists()) {
        const currentData = transferSnap.data() as StockTransfer;
        realStatus = currentData.status;
      }

      if (realStatus === 'RECIBIDA') {
        console.warn('El remito de traslado ya fue recibido previamente (idempotencia verificada):', transfer.transferNumber);
        return;
      }

      if (realStatus === 'BORRADOR') {
        throw new Error(`El remito ${transfer.transferNumber} no se puede recibir porque aún no ha sido despachado (estado BORRADOR).`);
      }

      if (realStatus === 'CANCELADA') {
        throw new Error(`El remito ${transfer.transferNumber} se encuentra cancelado y no puede ser recibido.`);
      }

      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const movements: StockMovement[] = [];

      for (const item of transfer.items) {
        movements.push({
          id: `SM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
          date: dateStr,
          time: timeStr,
          timestamp: Date.now(),
          branchId: transfer.destinationBranch,
          chamber: transfer.destinationBranch === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2',
          productCode: item.productCode,
          productDescription: item.description,
          category: item.category,
          unitType: item.unitType,
          type: 'TRANSFERENCIA_ENTRADA',
          quantity: item.quantity,
          factor: 1,
          previousStock: 0,
          newStock: 0,
          unitPrice: item.price,
          totalValue: item.totalValue,
          referenceDoc: transfer.transferNumber,
          transferId: transfer.id,
          idempotencyKey: `TR_IN_${transfer.id || transfer.transferNumber}_${item.productCode}`,
          operator,
          notes: `Recepción desde ${transfer.originBranch}`,
        });
      }

      await recordStockMovementsBatch(movements);

      // Si se transfirió una recepción completa con referencia unívoca o coincidencia exacta única
      for (const item of transfer.items) {
        if (item.productCode) {
          let matchingReceptions = meatReceptions.filter(
            (r) =>
              r.branchId === transfer.originBranch &&
              r.status === 'CONFIRMADO' &&
              (item.receptionId ? r.id === item.receptionId : r.productCode === item.productCode)
          );

          // Evitar modificar si hay ambigüedad o múltiples coincidencias
          if (matchingReceptions.length === 1) {
            const matchingReception = matchingReceptions[0];
            if (item.quantity >= matchingReception.totalWeightKg - 0.01) {
              const updatedReception: MeatReception = {
                ...matchingReception,
                branchId: transfer.destinationBranch,
                chamber: transfer.destinationBranch === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2',
                carcasses: (matchingReception.carcasses || []).map((c) => ({
                  ...c,
                  branchId: transfer.destinationBranch,
                  chamber: transfer.destinationBranch === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2',
                  status: 'DISPONIBLE' as CarcassStatus,
                })),
              };
              await saveMeatReception(updatedReception);
            }
          }
        }
      }

      // Actualizar estado del remito a RECIBIDA
      const updatedTransfer: StockTransfer = {
        ...transfer,
        status: 'RECIBIDA',
        receivedAt: `${dateStr} ${timeStr}`,
        receivedByUser: operator,
      };
      await saveStockTransfer(updatedTransfer);
    } catch (error) {
      console.error('Error receiving stock transfer:', error);
      throw error;
    }
  };

  const cancelStockTransfer = async (transfer: StockTransfer, operator: string, reason?: string) => {
    try {
      // Si la transferencia ya estaba despachada (EN_TRANSITO), debemos reintegrar el stock a la sucursal de origen
      if (transfer.status === 'EN_TRANSITO') {
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
        const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const movements: StockMovement[] = [];

        for (const item of transfer.items) {
          const stockDocId = `${transfer.originBranch}_${item.productCode}`;
          const currentStockItem = branchStock.find((s) => s.id === stockDocId);
          const prevStock = currentStockItem ? Number(currentStockItem.currentStock) || 0 : 0;
          const newStock = Number((prevStock + item.quantity).toFixed(3));

          movements.push({
            id: `SM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
            idempotencyKey: `TR_REV_${transfer.id || transfer.transferNumber}_${item.productCode}`,
            date: dateStr,
            time: timeStr,
            timestamp: Date.now(),
            branchId: transfer.originBranch,
            chamber: transfer.originBranch === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2',
            productCode: item.productCode,
            productDescription: item.description,
            category: item.category,
            unitType: item.unitType,
            type: 'DEVOLUCION',
            quantity: item.quantity,
            factor: 1,
            previousStock: prevStock,
            newStock,
            unitPrice: item.price,
            totalValue: item.totalValue,
            referenceDoc: transfer.transferNumber,
            transferId: transfer.id,
            operator,
            notes: `Reversión por cancelación de transferencia: ${reason || 'Cancelada'}`,
          });
        }

        await recordStockMovementsBatch(movements);
      }

      const updatedTransfer: StockTransfer = {
        ...transfer,
        status: 'CANCELADA',
        notes: (transfer.notes ? `${transfer.notes} | ` : '') + `Cancelada por ${operator}: ${reason || 'Sin motivo'}`,
      };
      await saveStockTransfer(updatedTransfer);
    } catch (error) {
      console.error('Error canceling stock transfer:', error);
      throw error;
    }
  };

  const applyPhysicalInventory = async (inventory: PhysicalInventory, operator: string) => {
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const movements: StockMovement[] = [];

      for (const item of inventory.items) {
        if (item.difference === 0) continue;

        const isPositive = item.difference > 0;
        const absDiff = Math.abs(item.difference);

        movements.push({
          id: `SM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
          idempotencyKey: `INV_ADJ_${inventory.id || inventory.inventoryNumber}_${item.productCode}`,
          date: dateStr,
          time: timeStr,
          timestamp: Date.now(),
          branchId: inventory.branchId,
          chamber: inventory.chamber,
          productCode: item.productCode,
          productDescription: item.description,
          category: item.category,
          unitType: item.unitType,
          type: isPositive ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
          quantity: absDiff,
          factor: isPositive ? 1 : -1,
          previousStock: item.systemStock,
          newStock: item.physicalCount,
          unitPrice: item.unitPrice,
          totalValue: Math.abs(item.differenceValue),
          referenceDoc: inventory.inventoryNumber,
          operator,
          reason: 'Ajuste de inventario físico en cámara',
          notes: `Conteo Físico Real: ${item.physicalCount} | Teórico: ${item.systemStock}`,
        });
      }

      if (movements.length > 0) {
        await recordStockMovementsBatch(movements);
      }

      const updatedInventory: PhysicalInventory = {
        ...inventory,
        status: 'APLICADO',
        appliedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'physicalInventories', inventory.id), sanitizeForFirestore(updatedInventory));
    } catch (error) {
      console.error('Error applying physical inventory:', error);
      throw error;
    }
  };

  const saveMeatDeboning = async (deboning: MeatDeboning) => {
    const path = `meatDebonings/${deboning.id}`;
    try {
      await setDoc(doc(db, 'meatDebonings', deboning.id), sanitizeForFirestore(deboning));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const finalizeMeatDeboning = async (deboning: MeatDeboning, operator: string) => {
    try {
      // 1. Idempotencia y validaciones básicas
      if (deboning.status === 'FINALIZADO') {
        console.warn('El desposte ya fue finalizado previamente (idempotencia):', deboning.code);
        return;
      }

      // Regla C.7: Al menos una salida válida para finalizar un desposte comercial
      const validCuts = deboning.cuts.filter((c) => Number(c.weightKg) > 0);
      if (validCuts.length === 0) {
        throw new Error('Regla C.7: Debe registrar al menos un corte con peso positivo para finalizar el desposte.');
      }

      const hasCarcasses = Boolean(deboning.selectedCarcassIds && deboning.selectedCarcassIds.length > 0);
      const hasSourceProduct = Boolean(deboning.sourceProductCode && deboning.sourceProductCode.trim());

      // Problema 2: Obligatoriedad de fuente de materia prima verificable
      if (!hasCarcasses && !hasSourceProduct) {
        throw new Error(
          'Regla B.1: No se puede finalizar el desposte sin una fuente de materia prima verificable. Debe especificar el código de producto de origen o seleccionar las medias reses individuales a despostar.'
        );
      }

      // Modalidad B: Medias reses individuales identificadas
      if (hasCarcasses) {
        let theoreticalSum = 0;
        const allAvailableCarcasses: CarcassUnit[] = [];
        meatReceptions.forEach((r) => {
          if (r.carcasses) allAvailableCarcasses.push(...r.carcasses);
        });

        for (const cid of deboning.selectedCarcassIds!) {
          const carcass = allAvailableCarcasses.find((c) => c.id === cid);
          if (!carcass) {
            throw new Error(`Regla C.2: No se encontró la media res con ID "${cid}" en ninguna recepción registrada.`);
          }
          // Regla C.3: Disponibilidad (o consumida por este mismo desposte en reintento)
          if (carcass.status && carcass.status !== 'DISPONIBLE' && carcass.deboningId !== deboning.id) {
            throw new Error(
              `Regla C.3: La media res "${cid}" ya fue consumida por otro desposte (${carcass.deboningId || carcass.status}) y no está disponible.`
            );
          }
          theoreticalSum += Number(carcass.weightKg) || 0;
        }

        const diff = Math.abs(deboning.initialWeightKg - theoreticalSum);
        const tolerance = 0.5; // Tolerancia de 500g (Regla C.5)
        if (diff > tolerance) {
          throw new Error(
            `Regla C.5: El peso de entrada (${formatKg(deboning.initialWeightKg)}) difiere de la suma de las unidades seleccionadas (${formatKg(theoreticalSum)}) por ${formatKg(diff)}. La tolerancia máxima es de 0.5 Kg.`
          );
        }
      } else if (hasSourceProduct) {
        // Modalidad A: Materia prima administrada como producto de stock
        const stockDocId = `${deboning.branchId}_${deboning.sourceProductCode}`;
        const currentStockItem = branchStock.find((s) => s.id === stockDocId);
        const availableStock = currentStockItem ? Number(currentStockItem.currentStock) || 0 : 0;
        const srcKey = `DEB_SRC_${deboning.code || deboning.id}`;
        const isSrcAlreadyApplied = stockMovements.some((m) => m.idempotencyKey === srcKey);

        if (!isSrcAlreadyApplied && availableStock < deboning.initialWeightKg - 0.001) {
          throw new Error(
            `Regla B.3: Stock de origen insuficiente para el desposte. Disponible: ${availableStock} Kg, Requerido: ${deboning.initialWeightKg} Kg en ${deboning.branchId}.`
          );
        }
      }

      // Validación estricta de balance de masas (Regla C.8)
      const balance = calculateDeboningMassBalance(deboning.initialWeightKg, deboning.cuts);
      if (balance.isImpossibleBalance) {
        throw new Error(
          `Regla C.8: Balance de masas imposible. El total de salida (${formatKg(balance.totalOutputWeightKg)}) supera el peso inicial (${formatKg(deboning.initialWeightKg)}).`
        );
      }

      const now = new Date();
      const dateStr = deboning.date || now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = deboning.time || now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const movements: StockMovement[] = [];

      // 2. Preparar movimientos de stock:
      // Salida de materia prima exactamente una vez (Modalidad A o Modalidad B derivada)
      let rawMaterialCode = deboning.sourceProductCode?.trim();
      if (!rawMaterialCode && hasCarcasses) {
        const firstCarcassId = deboning.selectedCarcassIds![0];
        const parentReception = meatReceptions.find((r) => r.carcasses?.some((c) => c.id === firstCarcassId));
        rawMaterialCode = parentReception?.productCode?.trim();
      }

      if (!rawMaterialCode) {
        throw new Error(
          `Regla B.2: Código de origen inválido. No se permite utilizar la categoría ("${deboning.animalCategory || 'Desconocida'}") como SKU de producto. Debe especificar un código de producto (SKU) válido para la materia prima.`
        );
      }

      if (rawMaterialCode) {
        movements.push({
          id: `SM-${Date.now()}-SRC-${Math.floor(1000 + Math.random() * 9000)}`,
          idempotencyKey: `DEB_SRC_${deboning.code || deboning.id}`,
          date: dateStr,
          time: timeStr,
          timestamp: Date.now(),
          branchId: deboning.branchId,
          chamber: deboning.chamber,
          productCode: rawMaterialCode,
          productDescription: `Materia Prima p/ Desposte - Tropa ${deboning.tropaNumber}`,
          category: deboning.animalCategory || 'Novillito',
          unitType: 'Kg',
          type: 'DESPOSTE_SALIDA',
          quantity: deboning.initialWeightKg,
          factor: -1,
          previousStock: 0,
          newStock: 0,
          unitPrice: deboning.costPerKgInitial,
          totalValue: deboning.totalInitialCost,
          referenceDoc: deboning.code,
          operator,
          notes: `Salida de materia prima para despiece. Tropa ${deboning.tropaNumber}`,
        });
      }

      for (let i = 0; i < deboning.cuts.length; i++) {
        const cut = deboning.cuts[i];
        if (!cut.weightKg || cut.weightKg <= 0) continue;

        movements.push({
          id: `SM-${Date.now()}-${i}-${Math.floor(1000 + Math.random() * 9000)}`,
          idempotencyKey: `DEB_CUT_${deboning.code || deboning.id}_${cut.productCode}_${i}`,
          date: dateStr,
          time: timeStr,
          timestamp: Date.now() + i,
          branchId: deboning.branchId,
          chamber: deboning.chamber,
          productId: cut.productId,
          productCode: cut.productCode,
          productDescription: cut.description,
          category: cut.category,
          unitType: cut.unitType || 'Kg',
          type: 'PRODUCCION',
          quantity: cut.weightKg,
          factor: 1,
          previousStock: 0,
          newStock: 0,
          unitPrice: cut.currentSalePrice,
          totalValue: cut.totalSaleValue,
          referenceDoc: deboning.code,
          operator,
          notes: `Ingreso por Desposte Tropa ${deboning.tropaNumber} (${deboning.animalCategory})`,
        });
      }

      // 3. Ejecutar movimientos de stock (atómico con transacción interna idempotente)
      if (movements.length > 0) {
        await recordStockMovementsBatch(movements);
      }

      // 4. Actualizar estados de unidades y desposte
      const batch = writeBatch(db);

      // Marcar unidades como DESPOSTADAS
      if (deboning.selectedCarcassIds && deboning.selectedCarcassIds.length > 0) {
        for (const rec of meatReceptions) {
          const matchingCarcasses = rec.carcasses?.filter((c) => deboning.selectedCarcassIds?.includes(c.id));
          if (matchingCarcasses && matchingCarcasses.length > 0) {
            const updatedCarcasses = rec.carcasses.map((c) => {
              if (deboning.selectedCarcassIds?.includes(c.id)) {
                return { ...c, status: 'DESPOSTADO' as CarcassStatus, deboningId: deboning.id };
              }
              return c;
            });
            const recRef = doc(db, 'meatReceptions', rec.id);
            batch.set(recRef, sanitizeForFirestore({ ...rec, carcasses: updatedCarcasses }), { merge: true });
          }
        }
      }

      // Finalizar la orden de desposte (marcar FINALIZADO solo tras confirmar movimientos)
      const updatedDeboning: MeatDeboning = {
        ...deboning,
        status: 'FINALIZADO',
        hasPendingStockMovements: false,
        operator,
        appliedAt: new Date().toISOString(),
      };
      const debRef = doc(db, 'meatDebonings', deboning.id);
      batch.set(debRef, sanitizeForFirestore(updatedDeboning), { merge: true });

      await batch.commit();
    } catch (error: any) {
      console.error('Error finalizing meat deboning:', error);
      // Registrar estado pendiente en la orden para evitar falsa finalización
      try {
        await setDoc(
          doc(db, 'meatDebonings', deboning.id),
          sanitizeForFirestore({
            ...deboning,
            status: 'BORRADOR',
            hasPendingStockMovements: true,
            lastError: error.message || 'Error al impactar stock en finalización',
          }),
          { merge: true }
        );
      } catch (_) {}
      throw error;
    }
  };

  const deleteOrCancelMeatDeboning = async (deboningId: string, operator: string, reason?: string) => {
    try {
      const deboning = meatDebonings.find((d) => d.id === deboningId);
      if (!deboning) return;
      if (deboning.status === 'ANULADO') {
        console.warn('El desposte ya se encuentra anulado.');
        return;
      }

      if (deboning.status === 'BORRADOR') {
        await deleteDoc(doc(db, 'meatDebonings', deboningId));
        return;
      }

      // Si fue FINALIZADO, generar movimientos inversos de reversión trazables con claves estables
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const reverseMovements: StockMovement[] = [];

      // A. Revertir cortes obtenidos (descontar con AJUSTE_NEGATIVO)
      for (let i = 0; i < deboning.cuts.length; i++) {
        const cut = deboning.cuts[i];
        if (!cut.weightKg || cut.weightKg <= 0) continue;

        reverseMovements.push({
          id: `SM-REV-DEB-${Date.now()}-${i}-${Math.floor(1000 + Math.random() * 9000)}`,
          idempotencyKey: `REV_DEB_CUT_${deboning.code || deboning.id}_${cut.productCode}_${i}`,
          date: dateStr,
          time: timeStr,
          timestamp: Date.now() + i,
          branchId: deboning.branchId,
          chamber: deboning.chamber,
          productId: cut.productId,
          productCode: cut.productCode,
          productDescription: cut.description,
          category: cut.category,
          unitType: cut.unitType || 'Kg',
          type: 'AJUSTE_NEGATIVO',
          quantity: cut.weightKg,
          factor: -1,
          previousStock: 0,
          newStock: 0,
          unitPrice: cut.currentSalePrice,
          totalValue: cut.totalSaleValue,
          referenceDoc: `REV-${deboning.code}`,
          reversalOf: deboning.code,
          operator,
          notes: `Reversión por anulación de Desposte ${deboning.code} (Corte ${cut.description})`,
        });
      }

      // B. Restaurar materia prima / media res (reincorporar con AJUSTE_POSITIVO)
      let rawMaterialCode = deboning.sourceProductCode?.trim();
      if (!rawMaterialCode && deboning.selectedCarcassIds && deboning.selectedCarcassIds.length > 0) {
        const firstCarcassId = deboning.selectedCarcassIds[0];
        const parentReception = meatReceptions.find((r) => r.carcasses?.some((c) => c.id === firstCarcassId));
        rawMaterialCode = parentReception?.productCode || parentReception?.category || (deboning.animalCategory || 'Novillito');
      }

      if (rawMaterialCode) {
        reverseMovements.push({
          id: `SM-REV-SRC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
          idempotencyKey: `REV_DEB_SRC_${deboning.code || deboning.id}`,
          date: dateStr,
          time: timeStr,
          timestamp: Date.now(),
          branchId: deboning.branchId,
          chamber: deboning.chamber,
          productCode: rawMaterialCode,
          productDescription: `Materia Prima Reincorporada - Tropa ${deboning.tropaNumber}`,
          category: deboning.animalCategory || 'Novillito',
          unitType: 'Kg',
          type: 'AJUSTE_POSITIVO',
          quantity: deboning.initialWeightKg,
          factor: 1,
          previousStock: 0,
          newStock: 0,
          unitPrice: deboning.costPerKgInitial,
          totalValue: deboning.totalInitialCost,
          referenceDoc: `REV-${deboning.code}`,
          reversalOf: deboning.code,
          operator,
          notes: `Restauración de materia prima por anulación de desposte ${deboning.code}`,
        });
      }

      if (reverseMovements.length > 0) {
        await recordStockMovementsBatch(reverseMovements);
      }

      // C. Restaurar estado de las medias reses en meatReceptions
      // Verificar que los estados correspondan a esa orden y no sobrescribir cambios de otra operación
      if (deboning.selectedCarcassIds && deboning.selectedCarcassIds.length > 0) {
        for (const rec of meatReceptions) {
          const hasMatching = rec.carcasses?.some(
            (c) => deboning.selectedCarcassIds?.includes(c.id) && c.deboningId === deboning.id
          );
          if (hasMatching) {
            const updatedCarcasses = rec.carcasses.map((c) => {
              if (deboning.selectedCarcassIds?.includes(c.id) && c.deboningId === deboning.id) {
                return { ...c, status: 'DISPONIBLE' as CarcassStatus, deboningId: undefined };
              }
              return c;
            });
            await saveMeatReception({
              ...rec,
              carcasses: updatedCarcasses,
            });
          }
        }
      }

      // D. Marcar desposte como ANULADO (solo tras completar todas las reversiones)
      const updated: MeatDeboning = {
        ...deboning,
        status: 'ANULADO',
        hasPendingStockMovements: false,
        notes: (deboning.notes ? `${deboning.notes} | ` : '') + `Anulado por ${operator}: ${reason || 'Sin motivo'}`,
      };
      await saveMeatDeboning(updated);
    } catch (error) {
      console.error('Error deleting or cancelling meat deboning:', error);
      throw error;
    }
  };

  const saveDeboningTemplate = async (template: DeboningYieldTemplate) => {
    const path = `deboningTemplates/${template.id}`;
    try {
      await runTransaction(db, async (transaction) => {
        // Regla 2: Recuperar el documento y el historial existentes desde Firestore antes de crear la nueva versión
        const templateRef = doc(db, 'deboningTemplates', template.id);
        const templateSnap = await transaction.get(templateRef);

        const existingDoc = templateSnap.exists()
          ? (templateSnap.data() as DeboningYieldTemplate)
          : null;

        // Preparar nueva versión preservando todas las versiones anteriores e impidiendo sobrescrituras concurrentes
        const templateToSave = prepareNextTemplateVersion(existingDoc, template);

        transaction.set(templateRef, sanitizeForFirestore(templateToSave), { merge: true });
      });
    } catch (error) {
      console.error('Error en saveDeboningTemplate (Transaction):', error);
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  };

  const deleteDeboningTemplate = async (id: string) => {
    const path = `deboningTemplates/${id}`;
    try {
      // Regla A.3 y Regla 2: Mantener el comportamiento de desactivación sin borrado físico
      const templateRef = doc(db, 'deboningTemplates', id);
      const snap = await getDoc(templateRef);
      if (snap.exists()) {
        const existingDoc = snap.data() as DeboningYieldTemplate;
        const deactivated: DeboningYieldTemplate = {
          ...existingDoc,
          isActive: false,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(templateRef, sanitizeForFirestore(deactivated), { merge: true });
      } else {
        const localDoc = deboningTemplates.find((t) => t.id === id);
        if (localDoc) {
          const deactivated: DeboningYieldTemplate = {
            ...localDoc,
            isActive: false,
            updatedAt: new Date().toISOString(),
          };
          await setDoc(templateRef, sanitizeForFirestore(deactivated), { merge: true });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  };

  const saveMeatReception = async (reception: MeatReception) => {
    const path = `meatReceptions/${reception.id}`;
    try {
      await setDoc(doc(db, 'meatReceptions', reception.id), sanitizeForFirestore(reception));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const finalizeMeatReception = async (reception: MeatReception, operator: string) => {
    try {
      // Idempotencia: Verificar si ya está confirmada
      if (reception.status === 'CONFIRMADO') {
        console.warn('La recepción ya fue confirmada previamente (idempotencia verificada):', reception.code);
        return;
      }

      const now = new Date();
      const dateStr = reception.date || now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = reception.time || now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // Validar que el peso total coincida con la suma de las unidades individuales cargadas
      if (reception.carcasses && reception.carcasses.length > 0) {
        const sumCarcassesWeight = Number(
          reception.carcasses.reduce((sum, c) => sum + (Number(c.weightKg) || 0), 0).toFixed(3)
        );
        if (Math.abs(sumCarcassesWeight - reception.totalWeightKg) > 0.05) {
          throw new Error(
            `Inconsistencia de pesaje: El peso total (${formatKg(reception.totalWeightKg)}) difiere de la suma de las medias reses individuales (${formatKg(sumCarcassesWeight)}).`
          );
        }
      }

      // Asegurar que cada media res tenga ID único permanente y estado DISPONIBLE
      const normalizedCarcasses: CarcassUnit[] = (reception.carcasses || []).map((c, idx) => ({
        ...c,
        id: c.id && c.id.trim() ? c.id.trim() : `${reception.code}-MR-${String(idx + 1).padStart(3, '0')}`,
        receptionId: reception.id,
        tropaNumber: reception.tropaNumber,
        supplier: reception.supplier,
        species: reception.species,
        category: reception.category,
        branchId: reception.branchId,
        chamber: reception.chamber,
        status: 'DISPONIBLE' as CarcassStatus,
      }));

      // Si tiene código de producto vinculado, incrementar existencia de stock en la cámara elegida
      const targetProdCode = reception.productCode?.trim() || 'MEDIA_RES';
      const prod = products.find((p) => p.code === targetProdCode);
      const prodDesc = prod?.description || reception.productDescription || `Media Res ${reception.species} - Tropa ${reception.tropaNumber}`;
      const prodCat = prod?.category || reception.category || 'Novillito';
      const unitType = prod?.unitType || 'Kg';

      const movement: StockMovement = {
        id: `SM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        date: dateStr,
        time: timeStr,
        timestamp: Date.now(),
        branchId: reception.branchId,
        chamber: reception.chamber,
        productId: prod?.id || prod?.docId,
        productCode: targetProdCode,
        productDescription: prodDesc,
        category: prodCat,
        unitType,
        type: 'ENTRADA',
        quantity: reception.totalWeightKg,
        factor: 1,
        previousStock: 0,
        newStock: 0,
        unitPrice: reception.pricePerKg,
        totalValue: reception.totalCost,
        referenceDoc: reception.code,
        idempotencyKey: `REC_CONFIRM_${reception.code || reception.id}`,
        operator,
        notes: `Recepción Tropa SENASA ${reception.tropaNumber} | Proveedor: ${reception.supplier} (${reception.totalQuantity} medias reses, Fact/Rem: ${reception.invoiceNumber || reception.deliveryNoteNumber || 'S/N'})`,
      };

      await recordStockMovementsBatch([movement]);

      const confirmed: MeatReception = {
        ...reception,
        carcasses: normalizedCarcasses,
        status: 'CONFIRMADO',
        operator,
        appliedAt: new Date().toISOString(),
      };
      await saveMeatReception(confirmed);
    } catch (error) {
      console.error('Error finalizing meat reception:', error);
      throw error;
    }
  };

  const updateConfirmedMeatReception = async (updatedReception: MeatReception, originalReception: MeatReception, operator: string) => {
    try {
      const now = new Date();
      const dateStr = updatedReception.date || now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = updatedReception.time || now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // Calcular diferencia de peso
      const weightDiff = Number((updatedReception.totalWeightKg - originalReception.totalWeightKg).toFixed(3));

      if (Math.abs(weightDiff) > 0.001) {
        const targetProdCode = updatedReception.productCode?.trim() || 'MEDIA_RES';
        const prod = products.find((p) => p.code === targetProdCode);
        const prodDesc = prod?.description || updatedReception.productDescription || `Media Res ${updatedReception.species} - Tropa ${updatedReception.tropaNumber}`;
        const prodCat = prod?.category || updatedReception.category || 'Novillito';
        const unitType = prod?.unitType || 'Kg';

        const movement: StockMovement = {
          id: `SM-ADJ-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
          date: dateStr,
          time: timeStr,
          timestamp: Date.now(),
          branchId: updatedReception.branchId,
          chamber: updatedReception.chamber,
          productId: prod?.id || prod?.docId,
          productCode: targetProdCode,
          productDescription: prodDesc,
          category: prodCat,
          unitType,
          type: weightDiff >= 0 ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
          quantity: Math.abs(weightDiff),
          factor: weightDiff >= 0 ? 1 : -1,
          previousStock: 0,
          newStock: 0,
          unitPrice: updatedReception.pricePerKg,
          totalValue: Number(Math.abs(weightDiff * updatedReception.pricePerKg).toFixed(2)),
          referenceDoc: updatedReception.code,
          operator,
          notes: `Ajuste por Edición de Recepción Tropa ${updatedReception.tropaNumber}. Dif: ${weightDiff.toFixed(3)} Kg.`,
        };

        await recordStockMovementsBatch([movement]);
      }

      const updated: MeatReception = {
        ...updatedReception,
        status: 'CONFIRMADO',
        operator,
        updatedAt: new Date().toISOString(),
      };
      await saveMeatReception(updated);
    } catch (error) {
      console.error('Error updating confirmed meat reception:', error);
      throw error;
    }
  };

  const deleteOrCancelMeatReception = async (
    receptionId: string,
    operator: string,
    reason?: string,
    hardDelete: boolean = false
  ) => {
    try {
      const reception = meatReceptions.find((r) => r.id === receptionId);
      if (!reception) return;

      if (reception.status === 'PENDIENTE') {
        await deleteDoc(doc(db, 'meatReceptions', receptionId));
        return;
      }

      if (reception.status === 'ANULADO') {
        if (hardDelete) {
          await deleteDoc(doc(db, 'meatReceptions', receptionId));
        }
        return;
      }

      // 1. Validar que no tenga despostes confirmados asociados
      const hasDebonings = meatDebonings.some(
        (d) =>
          d.status === 'FINALIZADO' &&
          (d.tropaNumber === reception.tropaNumber ||
            d.sourceProductCode === reception.code ||
            (d.selectedCarcassIds && d.selectedCarcassIds.some((cid) => reception.carcasses?.some((c) => c.id === cid))))
      );
      if (hasDebonings) {
        throw new Error(
          `No es posible eliminar o anular la recepción ${reception.code}: contiene medias reses con despostes finalizados en el sistema. Debe anular primero los despostes asociados.`
        );
      }

      const hasConsumedCarcasses = reception.carcasses?.some(
        (c) => c.status === 'DESPOSTADO' || c.status === 'TRASLADADO'
      );
      if (hasConsumedCarcasses) {
        throw new Error(
          `No es posible eliminar o anular la recepción ${reception.code}: una o más medias reses ya han sido despostadas o trasladadas.`
        );
      }

      // 2. Validar que no tenga traslados asociados
      const hasTransfers = stockTransfers.some(
        (t) =>
          (t.status === 'EN_TRANSITO' || t.status === 'RECIBIDA') &&
          t.items.some((it) => it.description.includes(reception.tropaNumber) || it.productCode === reception.productCode)
      );
      if (hasTransfers) {
        throw new Error(
          `No es posible eliminar o anular la recepción ${reception.code}: existen traslados de mercadería asociados a la Tropa ${reception.tropaNumber}.`
        );
      }

      // 3. Si estaba CONFIRMADO, generar movimiento inverso de reversión trazable
      if (reception.status === 'CONFIRMADO') {
        const targetProdCode = reception.productCode?.trim() || 'MEDIA_RES';
        const prod = products.find((p) => p.code === targetProdCode);
        const prodDesc = prod?.description || reception.productDescription || `Media Res ${reception.species} - Tropa ${reception.tropaNumber}`;

        const reverseMovement: StockMovement = {
          id: `SM-REV-REC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
          idempotencyKey: `REV_REC_${reception.code || reception.id}`,
          date: new Date().toLocaleDateString('es-AR').split('/').reverse().join('-'),
          time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          timestamp: Date.now(),
          branchId: reception.branchId,
          chamber: reception.chamber,
          productId: prod?.id || prod?.docId,
          productCode: targetProdCode,
          productDescription: prodDesc,
          category: reception.category || 'Novillito',
          unitType: 'Kg',
          type: 'AJUSTE_NEGATIVO',
          quantity: reception.totalWeightKg,
          factor: -1,
          previousStock: 0,
          newStock: 0,
          unitPrice: reception.pricePerKg,
          totalValue: reception.totalCost,
          referenceDoc: `REV-${reception.code}`,
          reversalOf: reception.code,
          operator,
          notes: `Reversión por ${hardDelete ? 'eliminación' : 'anulación'} de Recepción ${reception.code} Tropa ${reception.tropaNumber}: ${reason || 'Eliminación con clave de Administrador'}`,
        };

        await recordStockMovementsBatch([reverseMovement]);
      }

      if (hardDelete) {
        await deleteDoc(doc(db, 'meatReceptions', receptionId));
      } else {
        // 4. Actualizar estado de las medias reses y de la recepción a ANULADO
        const updatedCarcasses = (reception.carcasses || []).map((c) => ({
          ...c,
          status: 'ANULADO' as CarcassStatus,
        }));

        const updated: MeatReception = {
          ...reception,
          carcasses: updatedCarcasses,
          status: 'ANULADO',
          notes: (reception.notes ? `${reception.notes} | ` : '') + `Anulado por ${operator}: ${reason || 'Sin motivo'}`,
          updatedAt: new Date().toISOString(),
        };
        await saveMeatReception(updated);
      }
    } catch (error) {
      console.error('Error deleting or cancelling meat reception:', error);
      throw error;
    }
  };

  const deleteMeatReception = async (receptionId: string, operator: string, reason?: string) => {
    return deleteOrCancelMeatReception(receptionId, operator, reason, true);
  };

  const initializeChamberStock = async (
    branchId: 'NECO 1' | 'NECO 2',
    items: Array<{ productCode: string; stock: number; minStock?: number }>,
    operator: string
  ) => {
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const movements: StockMovement[] = [];

      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const prod = products.find((p) => p.code === it.productCode);
        const desc = prod?.description || it.productCode;
        const cat = prod?.category || 'Carnes Vacunas';
        const unitType = prod?.unitType || 'Kg';
        const price = prod?.price || 10000;

        const stockDocId = `${branchId}_${it.productCode}`;
        const existing = branchStock.find((s) => s.id === stockDocId);
        const prevStock = existing ? Number(existing.currentStock) || 0 : 0;
        const newStock = Number(Number(it.stock).toFixed(3)) || 0;
        const diff = Number((newStock - prevStock).toFixed(3));

        // Si no hay variación y el stock es 0, no creamos movimiento de auditoría vacío
        if (Math.abs(diff) < 0.0001 && newStock === 0 && prevStock === 0) {
          continue;
        }

        // Si no hay variación pero ya tiene stock establecido y coincide, omitir
        if (Math.abs(diff) < 0.0001 && existing) {
          continue;
        }

        const qty = Math.abs(diff) > 0 ? Math.abs(diff) : newStock;

        const isMeat = isMeatProduct(prod);

        movements.push({
          id: `SM-${Date.now()}-${idx}-${Math.floor(1000 + Math.random() * 9000)}`,
          idempotencyKey: `INIT_STOCK_${branchId}_${it.productCode}_${Date.now()}_${idx}`,
          date: dateStr,
          time: timeStr,
          timestamp: Date.now() + idx,
          branchId,
          chamber: getStorageLocationName(branchId, isMeat),
          productCode: it.productCode,
          productDescription: desc,
          category: isMeat ? cat : getStoreRubroLabel(prod || { description: desc, category: cat }),
          unitType,
          type: 'STOCK_INICIAL',
          quantity: qty,
          factor: diff >= 0 ? 1 : -1,
          previousStock: prevStock,
          newStock,
          unitPrice: price,
          totalValue: Number((qty * price).toFixed(2)),
          referenceDoc: isMeat ? 'INICIO-CAMARA' : 'INICIO-ALMACEN',
          operator,
          notes: isMeat
            ? 'Carga inicial o balance de apertura de cámara frigorífica'
            : 'Carga inicial o actualización de stock de almacén y artículos varios',
        });
      }

      if (movements.length > 0) {
        await recordStockMovementsBatch(movements);
      }
    } catch (error) {
      console.error('Error initializing chamber stock:', error);
      throw error;
    }
  };

  const revertCreditNoteStock = async (
    items: any[],
    branchId: 'NECO 1' | 'NECO 2',
    operator: string,
    referenceDoc: string
  ) => {
    if (!items || items.length === 0) return;
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const movements: StockMovement[] = [];

      for (const item of items) {
        const productCode = item.code || item.productCode;
        if (!productCode) continue;

        const qty = Number(item.quantity || item.weight || 0);
        if (qty <= 0) continue;

        const stockDocId = `${branchId}_${productCode}`;
        const currentStockItem = branchStock.find((s) => s.id === stockDocId);
        const prevStock = currentStockItem ? Number(currentStockItem.currentStock) || 0 : 0;
        const newStock = Number((prevStock + qty).toFixed(3));

        movements.push({
          id: `SM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
          idempotencyKey: `NC_REV_${referenceDoc}_${productCode}`,
          date: dateStr,
          time: timeStr,
          timestamp: Date.now(),
          branchId,
          chamber: branchId === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2',
          productCode,
          productDescription: item.description || '',
          category: item.category || 'Carnes Vacunas',
          unitType: item.unitType || 'Kg',
          type: 'DEVOLUCION',
          quantity: qty,
          factor: 1,
          previousStock: prevStock,
          newStock,
          unitPrice: Number(item.unitPrice) || 0,
          totalValue: Number((qty * (Number(item.unitPrice) || 0)).toFixed(2)),
          referenceDoc,
          operator,
          notes: `Reingreso a cámara por Nota de Crédito / Devolución (${referenceDoc})`,
        });
      }

      if (movements.length > 0) {
        await recordStockMovementsBatch(movements);
      }
    } catch (error) {
      console.error('Error reverting credit note stock:', error);
      throw error;
    }
  };

  const updateProductMinStock = async (
    branchId: 'NECO 1' | 'NECO 2',
    productCode: string,
    minStock: number
  ) => {
    const stockDocId = `${branchId}_${productCode}`;
    try {
      await setDoc(
        doc(db, 'branchStock', stockDocId),
        sanitizeForFirestore({
          id: stockDocId,
          branchId,
          productCode,
          minStock,
          lastUpdated: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (error) {
      console.error('Error updating product minStock:', error);
    }
  };

  const purgeDatabase = async () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('neco_pos_purged', 'true');
    }
    const collectionsToPurge = [
      'sales',
      'products',
      'customers',
      'employees',
      'accountMovements',
      'cashMovements',
      'cashClosures',
      'electronicInvoices',
      'auditLogs',
      'branchStock',
      'stockMovements',
      'stockTransfers',
      'physicalInventories',
    ];
    for (const colName of collectionsToPurge) {
      try {
        const snapshot = await getDocs(collection(db, colName));
        for (const docSnap of snapshot.docs) {
          await deleteDoc(doc(db, colName, docSnap.id));
        }
      } catch (err) {
        console.error(`Error purging collection ${colName}:`, err);
      }
    }
    setProducts([]);
    setCustomers([]);
    setEmployees([]);
    setUsers([]);
    setAccountMovements([]);
    setCashMovements([]);
    setCashClosures([]);
    setSales([]);
    setElectronicInvoices([]);
    setAuditLogs([]);
  };

  const purgeInventoryTransactions = async () => {
    const collectionsToPurge = [
      'stockMovements',
      'stockTransfers',
    ];
    for (const colName of collectionsToPurge) {
      try {
        const snapshot = await getDocs(collection(db, colName));
        for (const docSnap of snapshot.docs) {
          await deleteDoc(doc(db, colName, docSnap.id));
        }
      } catch (err) {
        console.error(`Error purging inventory collection ${colName}:`, err);
        throw err;
      }
    }
  };

  const purgeProductsCollection = async () => {
    try {
      const snap = await getDocs(collection(db, 'products'));
      for (const d of snap.docs) {
        try {
          await deleteDoc(d.ref);
        } catch (_) {}
      }
      setProducts([]);
    } catch (err) {
      console.error('Error purging products collection:', err);
    }
  };

  return (
    <FirebaseContext.Provider
      value={{
        user,
        localUser,
        loading,
        loginWithGoogle,
        loginWithEmail,
        logout,
        products,
        customers,
        employees,
        branchConfigs,
        users,
        accountMovements,
        cashMovements,
        cashClosures,
        sales,
        electronicInvoices,
        arcaConfig,
        auditLogs,
        branchStock,
        stockMovements,
        stockTransfers,
        physicalInventories,
        meatDebonings,
        saveDeboningTemplate,
        deleteDeboningTemplate,
        deboningTemplates,
        saveProduct,
        saveProductsBatch,
        deleteProduct,
        saveCustomer,
        saveEmployee,
        saveBranchConfig,
        saveUserAccount,
        deleteUserAccount,
        addAccountMovement,
        deleteAccountMovement,
        addCashMovement,
        deleteCashMovement,
        addCashClosure,
        deleteCashClosure,
        purgeAutoClosures,
        addSaleRecord,
        cancelSaleRecord,
        deleteSaleRecord,
        updateCustomerBalance,
        saveElectronicInvoice,
        saveArcaConfig,
        addAuditLog,
        recordStockMovement,
        recordStockMovementsBatch,
        deductSaleStock,
        saveStockTransfer,
        dispatchStockTransfer,
        receiveStockTransfer,
        cancelStockTransfer,
        applyPhysicalInventory,
        saveMeatDeboning,
        finalizeMeatDeboning,
        deleteOrCancelMeatDeboning,
        meatReceptions,
        saveMeatReception,
        finalizeMeatReception,
        deleteOrCancelMeatReception,
        deleteMeatReception,
        initializeChamberStock,
        revertCreditNoteStock,
        updateProductMinStock,
        purgeDatabase,
        purgeProductsCollection,
        purgeInventoryTransactions,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
};
