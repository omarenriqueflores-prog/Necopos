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
  updateDoc,
  deleteField,
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
  StockTransfer,
  PhysicalInventory,
} from '../types/pos';
import { INITIAL_BRANCH_CONFIGS, INITIAL_USERS } from '../data/mockData';

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
  environment: 'homologacion',
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

  // Sync localUser to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        if (localUser) {
          localStorage.setItem('neco_pos_local_user', JSON.stringify(localUser));
        } else {
          localStorage.removeItem('neco_pos_local_user');
        }
      } catch (err) {
        console.warn('Error saving local user to localStorage:', err);
      }
    }
  }, [localUser]);

  // Sync Products from Firestore
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('neco_pos_purged', 'true');
      } catch (_) {}
    }

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
          const category = String(data.category || data.categoria || data.rubro || 'Carnes Vacunas');
          const rawUnit = String(data.unitType || data.unidad || 'Kg');
          const unitType: 'Kg' | 'Unid' = rawUnit.toLowerCase().includes('u') ? 'Unid' : 'Kg';
          const price = Number(data.price ?? data.precio ?? 0);
          const vatRate = Number(data.vatRate ?? data.iva ?? 21);
          const scalePlu = data.scalePlu || data.plu ? String(data.scalePlu || data.plu) : code;
          const active = data.active !== false;

          return {
            code,
            docId: docItem.id,
            description: description.toUpperCase(),
            category,
            unitType,
            price,
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

    // Clean up unwanted legacy fields (costPrice, stock) from existing Firestore documents
    const cleanupUnwantedFields = async () => {
      try {
        const snap = await getDocs(collection(db, 'products'));
        for (const docItem of snap.docs) {
          const d = docItem.data();
          if (
            'costPrice' in d ||
            'costo' in d ||
            'stockNeco1' in d ||
            'stockNeco2' in d ||
            'stock' in d
          ) {
            await updateDoc(docItem.ref, {
              costPrice: deleteField(),
              costo: deleteField(),
              stockNeco1: deleteField(),
              stockNeco2: deleteField(),
              stock: deleteField(),
            });
          }
        }
      } catch (err) {
        // Silently skip if error
      }
    };
    cleanupUnwantedFields();

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
          setUsers(loaded);
        }
      },
      (error) => {
        console.warn('Firestore Users sync error:', error);
        setUsers(INITIAL_USERS);
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

  // Sync Cash Closures (con eliminación automática de cierres de sistema)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'cashClosures'),
      async (snapshot) => {
        const loaded: CashClosure[] = [];
        for (const docItem of snapshot.docs) {
          const data = docItem.data() as CashClosure;
          const isAuto =
            docItem.id.startsWith('Z-AUTO') ||
            String(data.operator || '').includes('AUTOMÁTICO') ||
            String(data.notes || '').includes('[AUTO-SISTEMA]') ||
            String(data.shift || '').includes('AUTOMÁTICO');
          if (isAuto) {
            try {
              await deleteDoc(docItem.ref);
            } catch (_) {}
          } else {
            loaded.push(data);
          }
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

  // Sync ARCA Config from Firestore (with bootstrapping)
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'arcaConfig', 'main'),
      async (docSnap) => {
        if (!docSnap.exists()) {
          try {
            await setDoc(doc(db, 'arcaConfig', 'main'), DEFAULT_ARCA_CONFIG);
            setArcaConfig(DEFAULT_ARCA_CONFIG);
          } catch (err) {
            console.error('Error bootstrapping arcaConfig:', err);
          }
        } else {
          const data = docSnap.data() as ArcaConfig;
          setArcaConfig(data);
          if (typeof window !== 'undefined' && data) {
            try {
              localStorage.setItem('necopos_arca_config', JSON.stringify(data));
              if (data.privateKey) {
                localStorage.setItem('necopos_arca_private_key', data.privateKey);
              }
              if (data.certificate) {
                localStorage.setItem('necopos_arca_certificate', data.certificate);
              }
            } catch (_) {}
          }
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

  // Sync Stock Movements
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'stockMovements'),
      (snapshot) => {
        const loaded: StockMovement[] = [];
        snapshot.docs.forEach((docItem) => {
          const data = docItem.data() as StockMovement;
          // Depurar y limpiar movimientos ruidosos con variación 0 de aperturas masivas
          if (data.type === 'STOCK_INICIAL' && (!data.quantity || data.quantity <= 0)) {
            deleteDoc(docItem.ref).catch(() => {});
            return;
          }
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
    const cleanProduct = {
      code: String(p.code),
      description: p.description,
      category: p.category,
      unitType: p.unitType,
      price: Number(p.price),
      scalePlu: p.scalePlu || null,
      active: p.active !== false,
    };
    try {
      await setDoc(doc(db, 'products', p.code), cleanProduct);
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
          const cleanProduct = {
            code: String(p.code),
            description: p.description,
            category: p.category,
            unitType: p.unitType,
            price: Number(p.price),
            scalePlu: p.scalePlu || null,
            active: p.active !== false,
          };
          batch.set(docRef, cleanProduct);
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

      // Delete any matching product documents in Firestore to guarantee complete removal
      const snap = await getDocs(collection(db, 'products'));
      for (const d of snap.docs) {
        const data = d.data();
        if (
          d.id === code ||
          d.id === docId ||
          String(data.code) === String(code) ||
          String(data.codigo) === String(code) ||
          String(data.id) === String(code) ||
          String(data.scalePlu) === String(code)
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
      await setDoc(doc(db, 'arcaConfig', 'main'), sanitizeForFirestore(cfg));
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('necopos_arca_config', JSON.stringify(cfg));
          if (cfg.privateKey) {
            localStorage.setItem('necopos_arca_private_key', cfg.privateKey);
          }
          if (cfg.certificate) {
            localStorage.setItem('necopos_arca_certificate', cfg.certificate);
          }
        } catch (_) {}
      }
      
      // Sync points of sale back to branches if they were updated in arcaConfig
      if (cfg.pointsOfSale) {
        const batch = writeBatch(db);
        for (const [branchKey, ptoVta] of Object.entries(cfg.pointsOfSale)) {
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
    const path = `stockMovements/${movement.id}`;
    try {
      const batch = writeBatch(db);
      // 1. Guardar movimiento inmutable
      batch.set(doc(db, 'stockMovements', movement.id), sanitizeForFirestore(movement));

      // 2. Actualizar stock de la sucursal
      const stockDocId = `${movement.branchId}_${movement.productCode}`;
      const stockRef = doc(db, 'branchStock', stockDocId);
      const existing = branchStock.find((s) => s.id === stockDocId);

      batch.set(
        stockRef,
        sanitizeForFirestore({
          id: stockDocId,
          branchId: movement.branchId,
          productCode: movement.productCode,
          currentStock: movement.newStock,
          minStock: existing?.minStock ?? 20,
          lastUpdated: new Date().toISOString(),
          chamberName: movement.chamber || (movement.branchId === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2'),
        }),
        { merge: true }
      );

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const recordStockMovementsBatch = async (movements: StockMovement[]) => {
    if (movements.length === 0) return;
    try {
      // Chunk batches by 250 items (each movement updates 2 documents)
      const chunkSize = 200;
      for (let i = 0; i < movements.length; i += chunkSize) {
        const chunk = movements.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        for (const mov of chunk) {
          batch.set(doc(db, 'stockMovements', mov.id), sanitizeForFirestore(mov));
          const stockDocId = `${mov.branchId}_${mov.productCode}`;
          const stockRef = doc(db, 'branchStock', stockDocId);
          const existing = branchStock.find((s) => s.id === stockDocId);

          batch.set(
            stockRef,
            sanitizeForFirestore({
              id: stockDocId,
              branchId: mov.branchId,
              productCode: mov.productCode,
              currentStock: mov.newStock,
              minStock: existing?.minStock ?? 20,
              lastUpdated: new Date().toISOString(),
              chamberName: mov.chamber || (mov.branchId === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2'),
            }),
            { merge: true }
          );
        }

        await batch.commit();
      }
    } catch (error) {
      console.error('Error in recordStockMovementsBatch:', error);
      throw error;
    }
  };

  const deductSaleStock = async (saleData: any, branchId: 'NECO 1' | 'NECO 2', operator: string) => {
    if (!saleData || !saleData.items || saleData.items.length === 0) return;

    // Idempotencia: Verificar si ya se procesó este descuento de venta
    const saleId = saleData.id || saleData.ticketNumber;
    const isAlreadyProcessed = stockMovements.some(
      (m) => m.type === 'VENTA' && (m.saleId === saleId || (saleData.ticketNumber && m.referenceDoc === saleData.ticketNumber))
    );
    if (isAlreadyProcessed) {
      console.log('Stock ya descontado para esta venta (idempotencia verificada):', saleId);
      return;
    }

    const movementsToRecord: StockMovement[] = [];
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    for (const item of saleData.items) {
      const productCode = item.code || item.productCode;
      if (!productCode) continue;

      const qty = Number(item.unitType === 'Kg' ? (item.weight || item.quantity || 0) : (item.quantity || 1));
      if (qty <= 0) continue;

      const stockDocId = `${branchId}_${productCode}`;
      const currentStockItem = branchStock.find((s) => s.id === stockDocId);
      const prevStock = currentStockItem ? Number(currentStockItem.currentStock) || 0 : 0;
      const newStock = Math.max(0, Number((prevStock - qty).toFixed(3)));

      const mov: StockMovement = {
        id: `SM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        date: dateStr,
        time: timeStr,
        timestamp: Date.now(),
        branchId,
        chamber: branchId === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2',
        productCode,
        productDescription: item.description || '',
        category: item.category || 'Carnes Vacunas',
        unitType: item.unitType || 'Kg',
        type: 'VENTA',
        quantity: qty,
        factor: -1,
        previousStock: prevStock,
        newStock,
        unitPrice: Number(item.unitPrice) || 0,
        totalValue: Number((qty * (Number(item.unitPrice) || 0)).toFixed(2)),
        referenceDoc: saleData.ticketNumber || `Venta ${saleData.id}`,
        saleId: String(saleId),
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
          operator,
          notes: `Despacho hacia ${transfer.destinationBranch}`,
        });
      }

      await recordStockMovementsBatch(movements);

      // Actualizar estado del remito a EN_TRANSITO
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
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-AR').split('/').reverse().join('-');
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const movements: StockMovement[] = [];

      for (const item of transfer.items) {
        const stockDocId = `${transfer.destinationBranch}_${item.productCode}`;
        const currentStockItem = branchStock.find((s) => s.id === stockDocId);
        const prevStock = currentStockItem ? Number(currentStockItem.currentStock) || 0 : 0;
        const newStock = Number((prevStock + item.quantity).toFixed(3));

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
          previousStock: prevStock,
          newStock,
          unitPrice: item.price,
          totalValue: item.totalValue,
          referenceDoc: transfer.transferNumber,
          transferId: transfer.id,
          operator,
          notes: `Recepción desde ${transfer.originBranch}`,
        });
      }

      await recordStockMovementsBatch(movements);

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

        movements.push({
          id: `SM-${Date.now()}-${idx}-${Math.floor(1000 + Math.random() * 9000)}`,
          date: dateStr,
          time: timeStr,
          timestamp: Date.now() + idx,
          branchId,
          chamber: branchId === 'NECO 1' ? 'Cámara Central NECO 1' : 'Cámara Frigorífica NECO 2',
          productCode: it.productCode,
          productDescription: desc,
          category: cat,
          unitType,
          type: 'STOCK_INICIAL',
          quantity: qty,
          factor: diff >= 0 ? 1 : -1,
          previousStock: prevStock,
          newStock,
          unitPrice: price,
          totalValue: Number((qty * price).toFixed(2)),
          referenceDoc: 'INICIO-CAMARA',
          operator,
          notes: 'Carga inicial o balance de apertura de cámara frigorífica',
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
        initializeChamberStock,
        revertCreditNoteStock,
        updateProductMinStock,
        purgeDatabase,
        purgeProductsCollection,
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
