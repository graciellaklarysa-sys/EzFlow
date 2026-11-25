import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, reportListenerError } from '../lib/firebase';
import { clampStr, formatIDR, generateSafeId, getMakassarDateString } from '../lib/format';
import { resolveIngredientForOutlet, validateCartStockAvailability } from '../lib/posStock';
import { useAuth } from './AuthContext';
import type {
  AiInsight,
  Attendance,
  AuditLog,
  Category,
  CctvAnalysisResult,
  CctvCamera,
  CctvUpload,
  Employee,
  Expense,
  Ingredient,
  NotificationItem,
  OperationalTask,
  Outlet,
  PaymentMethod,
  Product,
  Purchase,
  Shift,
  StockMovement,
  Supplier,
  Transaction,
  TransactionItem,
  TransactionStatus,
  UserRole,
} from '../types/ezflow';

export { resolveIngredientForOutlet };

function getSortMillis(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'string') {
    const ms = Date.parse(val);
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof val === 'object' && val !== null) {
    const maybeTs = val as { toMillis?: () => number; seconds?: number };
    if (typeof maybeTs.toMillis === 'function') return maybeTs.toMillis();
    if (typeof maybeTs.seconds === 'number') return maybeTs.seconds * 1000;
  }
  return 0;
}

interface CheckoutPayload {
  outletId: string;
  outletName: string;
  items: Array<{ product: Product; quantity: number; notes?: string }>;
  discount: number;
  taxPercent: number;
  serviceChargePercent: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  notes?: string;
}

interface InviteMemberPayload {
  memberUid: string;
  name: string;
  position: string;
  role: Exclude<UserRole, 'SUPER_ADMIN'>;
  outletId: string;
  email?: string;
  phone?: string;
}

interface BusinessDataContextValue {
  loadingData: boolean;
  dataError: string | null;
  outlets: Outlet[];
  employees: Employee[];
  categories: Category[];
  products: Product[];
  ingredients: Ingredient[];
  suppliers: Supplier[];
  purchases: Purchase[];
  stockMovements: StockMovement[];
  transactions: Transaction[];
  expenses: Expense[];
  shifts: Shift[];
  attendance: Attendance[];
  operationalTasks: OperationalTask[];
  aiInsights: AiInsight[];
  cctvCameras: CctvCamera[];
  cctvUploads: CctvUpload[];
  notifications: NotificationItem[];
  auditLogs: AuditLog[];
  currentMemberRole: UserRole;
  checkoutPosTransaction: (payload: CheckoutPayload) => Promise<Transaction>;
  createPendingOrder: (payload: CheckoutPayload) => Promise<Transaction>;
  completePendingTransaction: (
    tx: Transaction,
    paymentMethod: PaymentMethod,
    amountPaid: number,
    note?: string
  ) => Promise<Transaction>;
  updateTransactionStatus: (tx: Transaction, newStatus: TransactionStatus, note?: string) => Promise<void>;
  saveOutlet: (data: Omit<Outlet, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<void>;
  saveCategory: (name: string, sortOrder: number, existingId?: string) => Promise<string>;
  saveProduct: (data: Omit<Product, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<void>;
  saveIngredient: (data: Omit<Ingredient, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<void>;
  saveSupplier: (data: Omit<Supplier, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<void>;
  recordPurchaseAndStockIn: (params: {
    ingredient: Ingredient;
    supplier?: Supplier;
    quantity: number;
    totalCost: number;
    recordExpense: boolean;
  }) => Promise<void>;
  adjustIngredientStock: (params: {
    ingredient: Ingredient;
    delta: number;
    movementType: 'adjustment' | 'waste';
    reason: string;
  }) => Promise<void>;
  saveEmployee: (data: Omit<Employee, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<void>;
  saveShift: (data: Omit<Shift, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<void>;
  deleteShift: (shiftId: string) => Promise<void>;
  clockInEmployee: (employee: Employee) => Promise<void>;
  clockOutAttendance: (att: Attendance) => Promise<void>;
  saveExpense: (data: Omit<Expense, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdBy' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<void>;
  deleteExpense: (expense: Expense) => Promise<void>;
  saveOperationalTask: (data: Omit<OperationalTask, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<void>;
  deleteOperationalTask: (taskId: string) => Promise<void>;
  saveAiInsight: (data: Omit<AiInsight, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdBy' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  saveCctvCamera: (data: Omit<CctvCamera, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<string>;
  deleteCctvCamera: (cameraId: string) => Promise<void>;
  createCctvUploadRecord: (data: Omit<CctvUpload, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'uploadedBy' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateCctvUploadRecord: (
    uploadId: string,
    updates: {
      jobStatus: CctvUpload['jobStatus'];
      processorMessage?: string;
      analysisResult?: CctvAnalysisResult;
      analyzedAt?: string;
      storedFileName?: string;
    }
  ) => Promise<void>;
  deleteCctvUpload: (uploadId: string) => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  updateBusinessSettings: (updates: Record<string, unknown>) => Promise<void>;
  inviteBusinessMemberByUid: (payload: InviteMemberPayload) => Promise<void>;
  updateBusinessMemberRole: (memberUid: string, role: Exclude<UserRole, 'SUPER_ADMIN'>) => Promise<void>;
  removeBusinessMember: (memberUid: string) => Promise<void>;
}

const BusinessDataContext = createContext<BusinessDataContextValue | null>(null);

export function useBusinessData() {
  const ctx = useContext(BusinessDataContext);
  if (!ctx) throw new Error('useBusinessData must be used inside BusinessDataProvider');
  return ctx;
}

export function BusinessDataProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser, userProfile, activeBusiness, effectiveRole } = useAuth();

  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [operationalTasks, setOperationalTasks] = useState<OperationalTask[]>([]);
  const [aiInsights, setAiInsights] = useState<AiInsight[]>([]);
  const [cctvCameras, setCctvCameras] = useState<CctvCamera[]>([]);
  const [cctvUploads, setCctvUploads] = useState<CctvUpload[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const bizId = activeBusiness?.id;
  const ownerUid = activeBusiness?.ownerUid;
  const memberUids = activeBusiness?.memberUids || (ownerUid ? [ownerUid] : []);

  useEffect(() => {
    if (!firebaseUser || !bizId) {
      setOutlets([]);
      setEmployees([]);
      setCategories([]);
      setProducts([]);
      setIngredients([]);
      setSuppliers([]);
      setPurchases([]);
      setStockMovements([]);
      setTransactions([]);
      setExpenses([]);
      setShifts([]);
      setAttendance([]);
      setOperationalTasks([]);
      setAiInsights([]);
      setCctvCameras([]);
      setCctvUploads([]);
      setNotifications([]);
      setAuditLogs([]);
      setDataError(null);
      return;
    }

    setLoadingData(true);
    setDataError(null);
    const isSuper = effectiveRole === 'SUPER_ADMIN';

    const sub = <T extends Record<string, unknown>>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      sortField?: string
    ) => {
      const path = `businesses/${bizId}/${colName}`;
      const colRef = collection(db, 'businesses', bizId, colName);
      // Scope non-super-admin list queries by memberUids to match Firestore security rules without composite indexes
      const q = isSuper ? query(colRef) : query(colRef, where('memberUids', 'array-contains', firebaseUser.uid));
      return onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => d.data() as T);
          if (sortField) {
            items.sort((a, b) => getSortMillis(b[sortField]) - getSortMillis(a[sortField]));
          }
          setter(items);
          setLoadingData(false);
        },
        (err) => {
          setLoadingData(false);
          setDataError(reportListenerError(err, OperationType.LIST, path));
        }
      );
    };

    const unsubs = [
      sub<Outlet & Record<string, unknown>>('outlets', setOutlets as React.Dispatch<React.SetStateAction<(Outlet & Record<string, unknown>)[]>>),
      sub<Employee & Record<string, unknown>>('employees', setEmployees as React.Dispatch<React.SetStateAction<(Employee & Record<string, unknown>)[]>>),
      sub<Category & Record<string, unknown>>('categories', setCategories as React.Dispatch<React.SetStateAction<(Category & Record<string, unknown>)[]>>),
      sub<Product & Record<string, unknown>>('products', setProducts as React.Dispatch<React.SetStateAction<(Product & Record<string, unknown>)[]>>),
      sub<Ingredient & Record<string, unknown>>('ingredients', setIngredients as React.Dispatch<React.SetStateAction<(Ingredient & Record<string, unknown>)[]>>),
      sub<Supplier & Record<string, unknown>>('suppliers', setSuppliers as React.Dispatch<React.SetStateAction<(Supplier & Record<string, unknown>)[]>>),
      sub<Purchase & Record<string, unknown>>('purchases', setPurchases as React.Dispatch<React.SetStateAction<(Purchase & Record<string, unknown>)[]>>, 'createdAt'),
      sub<StockMovement & Record<string, unknown>>('stock_movements', setStockMovements as React.Dispatch<React.SetStateAction<(StockMovement & Record<string, unknown>)[]>>, 'createdAt'),
      sub<Transaction & Record<string, unknown>>('transactions', setTransactions as React.Dispatch<React.SetStateAction<(Transaction & Record<string, unknown>)[]>>, 'occurredAt'),
      sub<Expense & Record<string, unknown>>('expenses', setExpenses as React.Dispatch<React.SetStateAction<(Expense & Record<string, unknown>)[]>>, 'expenseDate'),
      sub<Shift & Record<string, unknown>>('shifts', setShifts as React.Dispatch<React.SetStateAction<(Shift & Record<string, unknown>)[]>>, 'shiftDate'),
      sub<Attendance & Record<string, unknown>>('attendance', setAttendance as React.Dispatch<React.SetStateAction<(Attendance & Record<string, unknown>)[]>>, 'createdAt'),
      sub<OperationalTask & Record<string, unknown>>('operational_tasks', setOperationalTasks as React.Dispatch<React.SetStateAction<(OperationalTask & Record<string, unknown>)[]>>, 'createdAt'),
      sub<AiInsight & Record<string, unknown>>('ai_insights', setAiInsights as React.Dispatch<React.SetStateAction<(AiInsight & Record<string, unknown>)[]>>, 'createdAt'),
      sub<CctvCamera & Record<string, unknown>>('cctv_cameras', setCctvCameras as React.Dispatch<React.SetStateAction<(CctvCamera & Record<string, unknown>)[]>>),
      sub<CctvUpload & Record<string, unknown>>('cctv_uploads', setCctvUploads as React.Dispatch<React.SetStateAction<(CctvUpload & Record<string, unknown>)[]>>, 'createdAt'),
      sub<NotificationItem & Record<string, unknown>>('notifications', setNotifications as React.Dispatch<React.SetStateAction<(NotificationItem & Record<string, unknown>)[]>>, 'createdAt'),
      sub<AuditLog & Record<string, unknown>>('audit_logs', setAuditLogs as React.Dispatch<React.SetStateAction<(AuditLog & Record<string, unknown>)[]>>, 'createdAt'),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [firebaseUser, bizId, effectiveRole]);

  const currentMemberRole: UserRole = (() => {
    if (effectiveRole === 'SUPER_ADMIN') return 'SUPER_ADMIN';
    if (activeBusiness && firebaseUser) {
      if (activeBusiness.ownerUid === firebaseUser.uid) return 'OWNER';
      if (activeBusiness.memberRoles?.[firebaseUser.uid]) {
        return activeBusiness.memberRoles[firebaseUser.uid];
      }
    }
    const empMatch = employees.find(
      (e) => e.userUid === firebaseUser?.uid || (e.email && e.email.toLowerCase() === firebaseUser?.email?.toLowerCase())
    );
    return empMatch?.role || effectiveRole;
  })();

  const requireContext = () => {
    if (!bizId || !ownerUid || !firebaseUser) {
      throw new Error('Workspace bisnis belum aktif.');
    }
    return { bizId, ownerUid, uid: firebaseUser.uid, userName: userProfile?.name || firebaseUser.displayName || 'Pengguna' };
  };

  const buildOrderFinancials = (payload: CheckoutPayload) => {
    const txId = generateSafeId('tx');
    const nowIso = new Date().toISOString();
    const receiptNum = `EZF-${nowIso.slice(2, 10).replace(/-/g, '')}-${txId.slice(-4).toUpperCase()}`;

    const txItems: TransactionItem[] = payload.items.map((l) => ({
      productId: l.product.id,
      productName: clampStr(l.product.name, 120),
      quantity: l.quantity,
      unitPrice: l.product.price,
      unitCogs: l.product.cogs,
      lineTotal: l.product.price * l.quantity,
      ...(l.notes ? { notes: clampStr(l.notes, 120) } : {}),
    }));

    const subtotal = txItems.reduce((s, i) => s + i.lineTotal, 0);
    const safeDiscount = Math.max(0, Math.min(payload.discount || 0, subtotal));
    const taxableBase = Math.max(0, subtotal - safeDiscount);
    const taxAmount = Math.round((taxableBase * (payload.taxPercent || 0)) / 100);
    const serviceChargeAmount = Math.round((taxableBase * (payload.serviceChargePercent || 0)) / 100);
    const total = taxableBase + taxAmount + serviceChargeAmount;
    const estimatedCogs = txItems.reduce((s, i) => s + i.unitCogs * i.quantity, 0);

    return {
      txId,
      nowIso,
      receiptNum,
      txItems,
      subtotal,
      safeDiscount,
      taxAmount,
      serviceChargeAmount,
      total,
      estimatedCogs,
    };
  };

  // Atomic POS Checkout with Outlet-Resolved Recipe Stock Deduction
  const checkoutPosTransaction = useCallback(
    async (payload: CheckoutPayload): Promise<Transaction> => {
      const { bizId: bId, ownerUid: oUid, uid, userName } = requireContext();
      if (!payload.items.length) throw new Error('Keranjang masih kosong.');

      // Aggregate outlet-resolved ingredient requirements across all cart items
      const requiredIngredients = new Map<string, { needed: number; name: string; unit: string }>();
      for (const line of payload.items) {
        for (const rec of line.product.recipe || []) {
          const resolvedIng = resolveIngredientForOutlet(ingredients, rec, payload.outletId);
          const targetIngId = resolvedIng?.id || rec.ingredientId;
          const prev = requiredIngredients.get(targetIngId);
          const qtyNeeded = rec.quantity * line.quantity;
          if (prev) {
            prev.needed += qtyNeeded;
          } else {
            requiredIngredients.set(targetIngId, {
              needed: qtyNeeded,
              name: resolvedIng?.name || rec.ingredientName,
              unit: resolvedIng?.unit || rec.unit,
            });
          }
        }
      }

      const fin = buildOrderFinancials(payload);
      const amountPaid = payload.paymentMethod === 'Tunai' ? Math.max(fin.total, payload.amountPaid || fin.total) : fin.total;
      const changeAmount = payload.paymentMethod === 'Tunai' ? Math.max(0, amountPaid - fin.total) : 0;

      const txRecord: Transaction = {
        id: fin.txId,
        businessId: bId,
        outletId: payload.outletId,
        outletName: clampStr(payload.outletName, 120),
        ownerUid: oUid,
        memberUids,
        receiptNumber: fin.receiptNum,
        items: fin.txItems,
        subtotal: fin.subtotal,
        discount: fin.safeDiscount,
        taxAmount: fin.taxAmount,
        serviceChargeAmount: fin.serviceChargeAmount,
        total: fin.total,
        estimatedCogs: fin.estimatedCogs,
        paymentMethod: payload.paymentMethod,
        amountPaid,
        changeAmount,
        status: 'completed',
        notes: clampStr(payload.notes || '', 300),
        cashierUid: uid,
        cashierName: clampStr(userName, 120),
        occurredAt: fin.nowIso,
        isDemo: false,
      };

      try {
        await runTransaction(db, async (transaction) => {
          // 1. ALL READS FIRST
          const ingredientReads: Array<{
            id: string;
            needed: number;
            snapData: Ingredient;
            ref: ReturnType<typeof doc>;
          }> = [];

          for (const [ingId, req] of requiredIngredients.entries()) {
            const ingRef = doc(db, 'businesses', bId, 'ingredients', ingId);
            const snap = await transaction.get(ingRef);
            if (!snap.exists()) {
              throw new Error(`Bahan baku "${req.name}" tidak ditemukan di inventaris outlet ini.`);
            }
            const ingData = snap.data() as Ingredient;
            if (ingData.stock < req.needed) {
              throw new Error(
                `Stok "${ingData.name}" tidak mencukupi (tersedia ${ingData.stock} ${ingData.unit}, dibutuhkan ${req.needed} ${ingData.unit}).`
              );
            }
            ingredientReads.push({ id: ingId, needed: req.needed, snapData: ingData, ref: ingRef });
          }

          // 2. ALL WRITES AFTER READS
          const ts = serverTimestamp();

          for (const item of ingredientReads) {
            const newStock = Number((item.snapData.stock - item.needed).toFixed(3));
            transaction.update(item.ref, {
              stock: newStock,
              updatedAt: ts,
            });

            const movId = generateSafeId('mov');
            transaction.set(doc(db, 'businesses', bId, 'stock_movements', movId), {
              id: movId,
              businessId: bId,
              outletId: payload.outletId,
              ownerUid: oUid,
              memberUids,
              ingredientId: item.id,
              ingredientName: clampStr(item.snapData.name, 120),
              movementType: 'sale_deduction',
              quantityDelta: -item.needed,
              unit: item.snapData.unit,
              referenceId: fin.txId,
              reason: `Penjualan POS ${fin.receiptNum}`,
              userUid: uid,
              userName: clampStr(userName, 120),
              occurredAt: fin.nowIso,
              createdAt: ts,
              updatedAt: ts,
            });

            if (newStock <= 0 || (item.snapData.stock > item.snapData.minStock && newStock <= item.snapData.minStock)) {
              const notifId = generateSafeId('notif');
              transaction.set(doc(db, 'businesses', bId, 'notifications', notifId), {
                id: notifId,
                businessId: bId,
                outletId: payload.outletId,
                ownerUid: oUid,
                memberUids,
                type: newStock <= 0 ? 'stockout' : 'low_stock',
                title: newStock <= 0 ? `Stok Habis: ${item.snapData.name}` : `Stok Menipis: ${item.snapData.name}`,
                message: `Sisa stok ${item.snapData.name} kini ${newStock} ${item.snapData.unit} setelah transaksi ${fin.receiptNum}.`,
                isRead: false,
                createdAt: ts,
                updatedAt: ts,
              });
            }
          }

          transaction.set(doc(db, 'businesses', bId, 'transactions', fin.txId), {
            ...txRecord,
            createdAt: ts,
            updatedAt: ts,
          });

          const txNotifId = generateSafeId('notif');
          transaction.set(doc(db, 'businesses', bId, 'notifications', txNotifId), {
            id: txNotifId,
            businessId: bId,
            outletId: payload.outletId,
            ownerUid: oUid,
            memberUids,
            type: 'transaction',
            title: `Transaksi Selesai: ${fin.receiptNum}`,
            message: `Pembayaran ${formatIDR(fin.total)} (${payload.paymentMethod}) di ${payload.outletName} oleh ${userName}.`,
            isRead: false,
            createdAt: ts,
            updatedAt: ts,
          });
        });
      } catch (err) {
        if (err instanceof Error && (err.message.includes('Stok') || err.message.includes('Bahan baku'))) {
          throw err;
        }
        handleFirestoreError(err, OperationType.WRITE, `businesses/${bId}/transactions/${fin.txId}`);
      }

      return txRecord;
    },
    [bizId, ownerUid, firebaseUser, userProfile?.name, memberUids, ingredients]
  );

  // Create a Pending (Open Bill) Order without deducting stock or recognizing revenue
  const createPendingOrder = useCallback(
    async (payload: CheckoutPayload): Promise<Transaction> => {
      const { bizId: bId, ownerUid: oUid, uid, userName } = requireContext();
      if (!payload.items.length) throw new Error('Keranjang masih kosong.');
      const stockCheck = validateCartStockAvailability(payload.items, ingredients, payload.outletId);
      if (!stockCheck.ok) {
        throw new Error(stockCheck.error);
      }

      const fin = buildOrderFinancials(payload);
      const txRecord: Transaction = {
        id: fin.txId,
        businessId: bId,
        outletId: payload.outletId,
        outletName: clampStr(payload.outletName, 120),
        ownerUid: oUid,
        memberUids,
        receiptNumber: fin.receiptNum,
        items: fin.txItems,
        subtotal: fin.subtotal,
        discount: fin.safeDiscount,
        taxAmount: fin.taxAmount,
        serviceChargeAmount: fin.serviceChargeAmount,
        total: fin.total,
        estimatedCogs: fin.estimatedCogs,
        paymentMethod: payload.paymentMethod || 'Tunai',
        amountPaid: 0,
        changeAmount: 0,
        status: 'pending',
        notes: clampStr(payload.notes || 'Pesanan tertunda (open bill)', 300),
        cashierUid: uid,
        cashierName: clampStr(userName, 120),
        occurredAt: fin.nowIso,
        isDemo: false,
      };

      try {
        const batch = writeBatch(db);
        const ts = serverTimestamp();
        batch.set(doc(db, 'businesses', bId, 'transactions', fin.txId), {
          ...txRecord,
          createdAt: ts,
          updatedAt: ts,
        });

        const notifId = generateSafeId('notif');
        batch.set(doc(db, 'businesses', bId, 'notifications', notifId), {
          id: notifId,
          businessId: bId,
          outletId: payload.outletId,
          ownerUid: oUid,
          memberUids,
          type: 'transaction',
          title: `Pesanan Tertunda: ${fin.receiptNum}`,
          message: `Open bill ${formatIDR(fin.total)} disimpan di ${payload.outletName} (stok belum dipotong).`,
          isRead: false,
          createdAt: ts,
          updatedAt: ts,
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `businesses/${bId}/transactions/${fin.txId}`);
      }

      return txRecord;
    },
    [bizId, ownerUid, firebaseUser, userProfile?.name, memberUids, ingredients]
  );

  // Settle a Pending Order to Completed with Atomic Outlet-Resolved Stock Deduction
  const completePendingTransaction = useCallback(
    async (
      tx: Transaction,
      paymentMethod: PaymentMethod,
      amountPaidInput: number,
      note?: string
    ): Promise<Transaction> => {
      const { bizId: bId, ownerUid: oUid, uid, userName } = requireContext();
      if (tx.status !== 'pending') {
        throw new Error('Hanya transaksi berstatus tertunda yang dapat diselesaikan pembayarannya.');
      }

      const requiredIngredients = new Map<string, { needed: number; name: string; unit: string }>();
      for (const line of tx.items) {
        const prod = products.find((p) => p.id === line.productId);
        for (const rec of prod?.recipe || []) {
          const resolvedIng = resolveIngredientForOutlet(ingredients, rec, tx.outletId);
          const targetIngId = resolvedIng?.id || rec.ingredientId;
          const prev = requiredIngredients.get(targetIngId);
          const qtyNeeded = rec.quantity * line.quantity;
          if (prev) {
            prev.needed += qtyNeeded;
          } else {
            requiredIngredients.set(targetIngId, {
              needed: qtyNeeded,
              name: resolvedIng?.name || rec.ingredientName,
              unit: resolvedIng?.unit || rec.unit,
            });
          }
        }
      }

      const nowIso = new Date().toISOString();
      const amountPaid = paymentMethod === 'Tunai' ? Math.max(tx.total, amountPaidInput || tx.total) : tx.total;
      const changeAmount = paymentMethod === 'Tunai' ? Math.max(0, amountPaid - tx.total) : 0;
      const safeNote = clampStr(note || tx.notes || 'Dilunasi di kasir', 300);

      try {
        await runTransaction(db, async (transaction) => {
          const ingredientReads: Array<{
            id: string;
            needed: number;
            snapData: Ingredient;
            ref: ReturnType<typeof doc>;
          }> = [];

          for (const [ingId, req] of requiredIngredients.entries()) {
            const ingRef = doc(db, 'businesses', bId, 'ingredients', ingId);
            const snap = await transaction.get(ingRef);
            if (!snap.exists()) {
              throw new Error(`Bahan baku "${req.name}" tidak ditemukan di inventaris outlet ini.`);
            }
            const ingData = snap.data() as Ingredient;
            if (ingData.stock < req.needed) {
              throw new Error(
                `Stok "${ingData.name}" tidak mencukupi (tersedia ${ingData.stock} ${ingData.unit}, dibutuhkan ${req.needed} ${ingData.unit}).`
              );
            }
            ingredientReads.push({ id: ingId, needed: req.needed, snapData: ingData, ref: ingRef });
          }

          const ts = serverTimestamp();

          for (const item of ingredientReads) {
            const newStock = Number((item.snapData.stock - item.needed).toFixed(3));
            transaction.update(item.ref, { stock: newStock, updatedAt: ts });

            const movId = generateSafeId('mov');
            transaction.set(doc(db, 'businesses', bId, 'stock_movements', movId), {
              id: movId,
              businessId: bId,
              outletId: tx.outletId,
              ownerUid: oUid,
              memberUids,
              ingredientId: item.id,
              ingredientName: clampStr(item.snapData.name, 120),
              movementType: 'sale_deduction',
              quantityDelta: -item.needed,
              unit: item.snapData.unit,
              referenceId: tx.id,
              reason: `Pelunasan POS ${tx.receiptNumber}`,
              userUid: uid,
              userName: clampStr(userName, 120),
              occurredAt: nowIso,
              createdAt: ts,
              updatedAt: ts,
            });

            if (newStock <= 0 || (item.snapData.stock > item.snapData.minStock && newStock <= item.snapData.minStock)) {
              const notifId = generateSafeId('notif');
              transaction.set(doc(db, 'businesses', bId, 'notifications', notifId), {
                id: notifId,
                businessId: bId,
                outletId: tx.outletId,
                ownerUid: oUid,
                memberUids,
                type: newStock <= 0 ? 'stockout' : 'low_stock',
                title: newStock <= 0 ? `Stok Habis: ${item.snapData.name}` : `Stok Menipis: ${item.snapData.name}`,
                message: `Sisa stok ${item.snapData.name} kini ${newStock} ${item.snapData.unit} setelah pelunasan ${tx.receiptNumber}.`,
                isRead: false,
                createdAt: ts,
                updatedAt: ts,
              });
            }
          }

          transaction.update(doc(db, 'businesses', bId, 'transactions', tx.id), {
            status: 'completed',
            paymentMethod,
            amountPaid,
            changeAmount,
            notes: safeNote,
            occurredAt: nowIso,
            updatedAt: ts,
          });

          const txNotifId = generateSafeId('notif');
          transaction.set(doc(db, 'businesses', bId, 'notifications', txNotifId), {
            id: txNotifId,
            businessId: bId,
            outletId: tx.outletId,
            ownerUid: oUid,
            memberUids,
            type: 'transaction',
            title: `Pelunasan Selesai: ${tx.receiptNumber}`,
            message: `Pesanan tertunda dilunasi sebesar ${formatIDR(tx.total)} (${paymentMethod}).`,
            isRead: false,
            createdAt: ts,
            updatedAt: ts,
          });
        });
      } catch (err) {
        if (err instanceof Error && (err.message.includes('Stok') || err.message.includes('Bahan baku'))) {
          throw err;
        }
        handleFirestoreError(err, OperationType.UPDATE, `businesses/${bId}/transactions/${tx.id}`);
      }

      return {
        ...tx,
        status: 'completed',
        paymentMethod,
        amountPaid,
        changeAmount,
        notes: safeNote,
        occurredAt: nowIso,
      };
    },
    [bizId, ownerUid, firebaseUser, userProfile?.name, memberUids, products, ingredients]
  );

  // Cancel or Refund transaction atomically restoring outlet-resolved recipe stock
  const updateTransactionStatus = useCallback(
    async (tx: Transaction, newStatus: TransactionStatus, note?: string) => {
      const { bizId: bId, ownerUid: oUid, uid, userName } = requireContext();
      if (tx.status === 'cancelled' || tx.status === 'refunded') {
        throw new Error('Transaksi yang sudah dibatalkan/direfund tidak dapat diubah lagi.');
      }

      const shouldRestoreStock =
        tx.status === 'completed' && (newStatus === 'cancelled' || newStatus === 'refunded');

      const restoreMap = new Map<string, number>();
      if (shouldRestoreStock) {
        for (const line of tx.items) {
          const prod = products.find((p) => p.id === line.productId);
          for (const rec of prod?.recipe || []) {
            const resolvedIng = resolveIngredientForOutlet(ingredients, rec, tx.outletId);
            const targetIngId = resolvedIng?.id || rec.ingredientId;
            restoreMap.set(targetIngId, (restoreMap.get(targetIngId) || 0) + rec.quantity * line.quantity);
          }
        }
      }

      const nowIso = new Date().toISOString();

      try {
        await runTransaction(db, async (transaction) => {
          const reads: Array<{ ing: Ingredient; addQty: number; ref: ReturnType<typeof doc> }> = [];
          for (const [ingId, addQty] of restoreMap.entries()) {
            const ingRef = doc(db, 'businesses', bId, 'ingredients', ingId);
            const snap = await transaction.get(ingRef);
            if (snap.exists()) {
              reads.push({ ing: snap.data() as Ingredient, addQty, ref: ingRef });
            }
          }

          const ts = serverTimestamp();
          const txRef = doc(db, 'businesses', bId, 'transactions', tx.id);
          transaction.update(txRef, {
            status: newStatus,
            notes: clampStr(note || tx.notes || `Status diubah ke ${newStatus}`, 300),
            updatedAt: ts,
          });

          for (const item of reads) {
            const restoredStock = Number((item.ing.stock + item.addQty).toFixed(3));
            transaction.update(item.ref, { stock: restoredStock, updatedAt: ts });

            const movId = generateSafeId('mov');
            transaction.set(doc(db, 'businesses', bId, 'stock_movements', movId), {
              id: movId,
              businessId: bId,
              outletId: tx.outletId,
              ownerUid: oUid,
              memberUids,
              ingredientId: item.ing.id,
              ingredientName: clampStr(item.ing.name, 120),
              movementType: 'refund_restore',
              quantityDelta: item.addQty,
              unit: item.ing.unit,
              referenceId: tx.id,
              reason: `Pengembalian stok (${newStatus}) ${tx.receiptNumber}`,
              userUid: uid,
              userName: clampStr(userName, 120),
              occurredAt: nowIso,
              createdAt: ts,
              updatedAt: ts,
            });
          }

          const logId = generateSafeId('audit');
          transaction.set(doc(db, 'businesses', bId, 'audit_logs', logId), {
            id: logId,
            businessId: bId,
            ownerUid: oUid,
            memberUids,
            action: `TRANSACTION_${newStatus.toUpperCase()}`,
            entityType: 'transaction',
            entityId: tx.id,
            details: `Transaksi ${tx.receiptNumber} diubah ke ${newStatus}`,
            actorUid: uid,
            actorName: clampStr(userName, 120),
            createdAt: ts,
            updatedAt: ts,
          });

          const notifId = generateSafeId('notif');
          transaction.set(doc(db, 'businesses', bId, 'notifications', notifId), {
            id: notifId,
            businessId: bId,
            outletId: tx.outletId,
            ownerUid: oUid,
            memberUids,
            type: 'transaction',
            title: `Transaksi ${newStatus === 'refunded' ? 'Direfund' : 'Dibatalkan'}: ${tx.receiptNumber}`,
            message: shouldRestoreStock
              ? `Nilai ${formatIDR(tx.total)} direfund/dibatalkan dan stok bahan telah dikembalikan.`
              : `Pesanan tertunda ${tx.receiptNumber} dibatalkan.`,
            isRead: false,
            createdAt: ts,
            updatedAt: ts,
          });
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `businesses/${bId}/transactions/${tx.id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, userProfile?.name, memberUids, products, ingredients]
  );

  const saveOutlet = useCallback(
    async (data: Omit<Outlet, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => {
      const { bizId: bId, ownerUid: oUid } = requireContext();
      const id = existingId || generateSafeId('out');
      const ref = doc(db, 'businesses', bId, 'outlets', id);
      try {
        if (existingId) {
          await updateDoc(ref, {
            name: clampStr(data.name, 120),
            address: clampStr(data.address, 300),
            contactNumber: clampStr(data.contactNumber || '', 40),
            operatingHours: clampStr(data.operatingHours || '', 80),
            tableCount: Math.max(0, Math.round(data.tableCount)),
            capacity: Math.max(0, Math.round(data.capacity)),
            isActive: Boolean(data.isActive),
            isArchived: Boolean(data.isArchived),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            id,
            businessId: bId,
            ownerUid: oUid,
            memberUids,
            name: clampStr(data.name, 120),
            address: clampStr(data.address, 300),
            contactNumber: clampStr(data.contactNumber || '', 40),
            operatingHours: clampStr(data.operatingHours || '', 80),
            tableCount: Math.max(0, Math.round(data.tableCount)),
            capacity: Math.max(0, Math.round(data.capacity)),
            isActive: Boolean(data.isActive),
            isArchived: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `businesses/${bId}/outlets/${id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, memberUids]
  );

  const saveCategory = useCallback(
    async (name: string, sortOrder: number, existingId?: string): Promise<string> => {
      const { bizId: bId, ownerUid: oUid } = requireContext();
      const id = existingId || generateSafeId('cat');
      const ref = doc(db, 'businesses', bId, 'categories', id);
      try {
        if (existingId) {
          await updateDoc(ref, { name: clampStr(name, 80), sortOrder: Math.round(sortOrder), updatedAt: serverTimestamp() });
        } else {
          await setDoc(ref, {
            id,
            businessId: bId,
            ownerUid: oUid,
            memberUids,
            name: clampStr(name, 80),
            sortOrder: Math.round(sortOrder),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        return id;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `businesses/${bId}/categories/${id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, memberUids]
  );

  const saveProduct = useCallback(
    async (data: Omit<Product, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => {
      const { bizId: bId, ownerUid: oUid } = requireContext();
      const id = existingId || generateSafeId('prod');
      const ref = doc(db, 'businesses', bId, 'products', id);
      const safeRecipe = (data.recipe || []).slice(0, 25);
      try {
        if (existingId) {
          await updateDoc(ref, {
            name: clampStr(data.name, 120),
            categoryId: data.categoryId,
            categoryName: clampStr(data.categoryName || '', 80),
            price: Math.max(0, Number(data.price)),
            cogs: Math.max(0, Number(data.cogs)),
            imageUrl: clampStr(data.imageUrl || '', 500),
            recipe: safeRecipe,
            isAvailable: Boolean(data.isAvailable),
            isArchived: Boolean(data.isArchived),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            id,
            businessId: bId,
            ownerUid: oUid,
            memberUids,
            name: clampStr(data.name, 120),
            categoryId: data.categoryId,
            categoryName: clampStr(data.categoryName || '', 80),
            price: Math.max(0, Number(data.price)),
            cogs: Math.max(0, Number(data.cogs)),
            imageUrl: clampStr(data.imageUrl || '', 500),
            recipe: safeRecipe,
            isAvailable: Boolean(data.isAvailable),
            isArchived: Boolean(data.isArchived),
            isDemo: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `businesses/${bId}/products/${id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, memberUids]
  );

  const saveIngredient = useCallback(
    async (data: Omit<Ingredient, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => {
      const { bizId: bId, ownerUid: oUid } = requireContext();
      const id = existingId || generateSafeId('ing');
      const ref = doc(db, 'businesses', bId, 'ingredients', id);
      try {
        if (existingId) {
          await updateDoc(ref, {
            outletId: data.outletId,
            name: clampStr(data.name, 120),
            itemType: data.itemType,
            unit: clampStr(data.unit, 20),
            stock: Math.max(0, Number(data.stock)),
            minStock: Math.max(0, Number(data.minStock)),
            costPerUnit: Math.max(0, Number(data.costPerUnit)),
            supplierId: data.supplierId || '',
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            id,
            businessId: bId,
            outletId: data.outletId,
            ownerUid: oUid,
            memberUids,
            name: clampStr(data.name, 120),
            itemType: data.itemType,
            unit: clampStr(data.unit, 20),
            stock: Math.max(0, Number(data.stock)),
            minStock: Math.max(0, Number(data.minStock)),
            costPerUnit: Math.max(0, Number(data.costPerUnit)),
            supplierId: data.supplierId || '',
            isDemo: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `businesses/${bId}/ingredients/${id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, memberUids]
  );

  const saveSupplier = useCallback(
    async (data: Omit<Supplier, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => {
      const { bizId: bId, ownerUid: oUid } = requireContext();
      const id = existingId || generateSafeId('sup');
      const ref = doc(db, 'businesses', bId, 'suppliers', id);
      try {
        if (existingId) {
          await updateDoc(ref, {
            name: clampStr(data.name, 120),
            contactName: clampStr(data.contactName || '', 120),
            phone: clampStr(data.phone || '', 40),
            email: clampStr(data.email || '', 200),
            address: clampStr(data.address || '', 300),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            id,
            businessId: bId,
            ownerUid: oUid,
            memberUids,
            name: clampStr(data.name, 120),
            contactName: clampStr(data.contactName || '', 120),
            phone: clampStr(data.phone || '', 40),
            email: clampStr(data.email || '', 200),
            address: clampStr(data.address || '', 300),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `businesses/${bId}/suppliers/${id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, memberUids]
  );

  const recordPurchaseAndStockIn = useCallback(
    async (params: {
      ingredient: Ingredient;
      supplier?: Supplier;
      quantity: number;
      totalCost: number;
      recordExpense: boolean;
    }) => {
      const { bizId: bId, ownerUid: oUid, uid, userName } = requireContext();
      const { ingredient, supplier, quantity, totalCost, recordExpense } = params;
      if (quantity <= 0) throw new Error('Jumlah pembelian harus lebih dari 0.');

      const purchaseId = generateSafeId('pur');
      const movId = generateSafeId('mov');
      const nowIso = new Date().toISOString();
      const newUnitCost = totalCost > 0 ? Math.round(totalCost / quantity) : ingredient.costPerUnit;

      try {
        await runTransaction(db, async (transaction) => {
          const ingRef = doc(db, 'businesses', bId, 'ingredients', ingredient.id);
          const ingSnap = await transaction.get(ingRef);
          if (!ingSnap.exists()) throw new Error('Bahan baku tidak ditemukan.');
          const currStock = (ingSnap.data() as Ingredient).stock;
          const ts = serverTimestamp();

          transaction.update(ingRef, {
            stock: Number((currStock + quantity).toFixed(3)),
            costPerUnit: newUnitCost,
            updatedAt: ts,
          });

          transaction.set(doc(db, 'businesses', bId, 'purchases', purchaseId), {
            id: purchaseId,
            businessId: bId,
            outletId: ingredient.outletId,
            ownerUid: oUid,
            memberUids,
            supplierId: supplier?.id || '',
            supplierName: clampStr(supplier?.name || 'Pembelian Langsung', 120),
            ingredientId: ingredient.id,
            ingredientName: clampStr(ingredient.name, 120),
            quantity,
            totalCost,
            purchasedAt: nowIso,
            createdBy: uid,
            createdAt: ts,
            updatedAt: ts,
          });

          transaction.set(doc(db, 'businesses', bId, 'stock_movements', movId), {
            id: movId,
            businessId: bId,
            outletId: ingredient.outletId,
            ownerUid: oUid,
            memberUids,
            ingredientId: ingredient.id,
            ingredientName: clampStr(ingredient.name, 120),
            movementType: 'purchase_in',
            quantityDelta: quantity,
            unit: ingredient.unit,
            referenceId: purchaseId,
            reason: `Pembelian stok masuk${supplier ? ` dari ${supplier.name}` : ''}`,
            userUid: uid,
            userName: clampStr(userName, 120),
            occurredAt: nowIso,
            createdAt: ts,
            updatedAt: ts,
          });

          if (recordExpense && totalCost > 0) {
            const expId = generateSafeId('exp');
            transaction.set(doc(db, 'businesses', bId, 'expenses', expId), {
              id: expId,
              businessId: bId,
              outletId: ingredient.outletId,
              ownerUid: oUid,
              memberUids,
              category: 'Bahan Baku',
              description: clampStr(`Pembelian ${ingredient.name} (${quantity} ${ingredient.unit})`, 300),
              amount: totalCost,
              expenseDate: getMakassarDateString(new Date()),
              paymentMethod: 'Transfer Bank',
              createdBy: uid,
              isDemo: false,
              createdAt: ts,
              updatedAt: ts,
            });
          }
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `businesses/${bId}/purchases/${purchaseId}`);
      }
    },
    [bizId, ownerUid, firebaseUser, userProfile?.name, memberUids]
  );

  const adjustIngredientStock = useCallback(
    async (params: {
      ingredient: Ingredient;
      delta: number;
      movementType: 'adjustment' | 'waste';
      reason: string;
    }) => {
      const { bizId: bId, ownerUid: oUid, uid, userName } = requireContext();
      const { ingredient, delta, movementType, reason } = params;
      if (delta === 0) throw new Error('Perubahan stok tidak boleh 0.');
      const movId = generateSafeId('mov');
      const nowIso = new Date().toISOString();

      try {
        await runTransaction(db, async (transaction) => {
          const ingRef = doc(db, 'businesses', bId, 'ingredients', ingredient.id);
          const snap = await transaction.get(ingRef);
          if (!snap.exists()) throw new Error('Bahan tidak ditemukan.');
          const ingData = snap.data() as Ingredient;
          const nextStock = Number((ingData.stock + delta).toFixed(3));
          if (nextStock < 0) {
            throw new Error(`Penyesuaian ditolak: stok akhir tidak boleh negatif (${nextStock}).`);
          }
          const ts = serverTimestamp();
          transaction.update(ingRef, { stock: nextStock, updatedAt: ts });
          transaction.set(doc(db, 'businesses', bId, 'stock_movements', movId), {
            id: movId,
            businessId: bId,
            outletId: ingredient.outletId,
            ownerUid: oUid,
            memberUids,
            ingredientId: ingredient.id,
            ingredientName: clampStr(ingredient.name, 120),
            movementType,
            quantityDelta: delta,
            unit: ingredient.unit,
            reason: clampStr(reason || 'Penyesuaian stok manual', 200),
            userUid: uid,
            userName: clampStr(userName, 120),
            occurredAt: nowIso,
            createdAt: ts,
            updatedAt: ts,
          });

          if (nextStock <= 0 || (ingData.stock > ingData.minStock && nextStock <= ingData.minStock)) {
            const notifId = generateSafeId('notif');
            transaction.set(doc(db, 'businesses', bId, 'notifications', notifId), {
              id: notifId,
              businessId: bId,
              outletId: ingredient.outletId,
              ownerUid: oUid,
              memberUids,
              type: nextStock <= 0 ? 'stockout' : 'low_stock',
              title: nextStock <= 0 ? `Stok Habis: ${ingredient.name}` : `Stok Menipis: ${ingredient.name}`,
              message: `Stok ${ingredient.name} kini ${nextStock} ${ingredient.unit} (${movementType}).`,
              isRead: false,
              createdAt: ts,
              updatedAt: ts,
            });
          }
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes('negatif')) throw err;
        handleFirestoreError(err, OperationType.UPDATE, `businesses/${bId}/ingredients/${ingredient.id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, userProfile?.name, memberUids]
  );

  const saveEmployee = useCallback(
    async (data: Omit<Employee, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => {
      const { bizId: bId, ownerUid: oUid } = requireContext();
      const id = existingId || generateSafeId('emp');
      const ref = doc(db, 'businesses', bId, 'employees', id);
      try {
        if (existingId) {
          const existingEmp = employees.find((e) => e.id === existingId);
          await updateDoc(ref, {
            name: clampStr(data.name, 120),
            email: clampStr(data.email || '', 200),
            phone: clampStr(data.phone || '', 40),
            position: clampStr(data.position, 80),
            role: data.role,
            outletId: data.outletId,
            status: data.status,
            updatedAt: serverTimestamp(),
          });
          if (existingEmp?.userUid && activeBusiness && existingEmp.userUid !== oUid && oUid === firebaseUser?.uid) {
            const nextRoles = { ...(activeBusiness.memberRoles || {}), [existingEmp.userUid]: data.role };
            await updateDoc(doc(db, 'businesses', bId), {
              memberRoles: nextRoles,
              updatedAt: serverTimestamp(),
            });
          }
        } else {
          await setDoc(ref, {
            id,
            businessId: bId,
            ownerUid: oUid,
            memberUids,
            name: clampStr(data.name, 120),
            email: clampStr(data.email || '', 200),
            phone: clampStr(data.phone || '', 40),
            position: clampStr(data.position, 80),
            role: data.role,
            outletId: data.outletId,
            status: data.status,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `businesses/${bId}/employees/${id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, memberUids, employees, activeBusiness]
  );

  const saveShift = useCallback(
    async (data: Omit<Shift, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => {
      const { bizId: bId, ownerUid: oUid } = requireContext();
      if (!data.shiftDate || !data.startTime || !data.endTime) {
        throw new Error('Tanggal dan jam shift wajib diisi.');
      }
      if (data.endTime <= data.startTime) {
        throw new Error('Jam selesai shift harus lebih lambat dari jam mulai.');
      }
      const id = existingId || generateSafeId('shift');
      const ref = doc(db, 'businesses', bId, 'shifts', id);
      try {
        if (existingId) {
          await updateDoc(ref, {
            outletId: data.outletId,
            employeeId: data.employeeId,
            employeeName: clampStr(data.employeeName || '', 120),
            shiftDate: data.shiftDate,
            startTime: data.startTime,
            endTime: data.endTime,
            notes: clampStr(data.notes || '', 200),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            id,
            businessId: bId,
            outletId: data.outletId,
            ownerUid: oUid,
            memberUids,
            employeeId: data.employeeId,
            employeeName: clampStr(data.employeeName || '', 120),
            shiftDate: data.shiftDate,
            startTime: data.startTime,
            endTime: data.endTime,
            notes: clampStr(data.notes || '', 200),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `businesses/${bId}/shifts/${id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, memberUids]
  );

  const deleteShift = useCallback(
    async (shiftId: string) => {
      const { bizId: bId } = requireContext();
      try {
        await deleteDoc(doc(db, 'businesses', bId, 'shifts', shiftId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `businesses/${bId}/shifts/${shiftId}`);
      }
    },
    [bizId, ownerUid, firebaseUser]
  );

  const clockInEmployee = useCallback(
    async (employee: Employee) => {
      const { bizId: bId, ownerUid: oUid } = requireContext();
      if (employee.status !== 'active') {
        throw new Error('Karyawan berstatus nonaktif tidak dapat melakukan Clock-In.');
      }
      const id = generateSafeId('att');
      const nowIso = new Date().toISOString();
      const dateStr = getMakassarDateString(new Date());
      try {
        const batch = writeBatch(db);
        const ts = serverTimestamp();
        batch.set(doc(db, 'businesses', bId, 'attendance', id), {
          id,
          businessId: bId,
          outletId: employee.outletId,
          ownerUid: oUid,
          memberUids,
          employeeId: employee.id,
          employeeName: clampStr(employee.name, 120),
          date: dateStr,
          clockIn: nowIso,
          status: 'clocked_in',
          createdAt: ts,
          updatedAt: ts,
        });
        const notifId = generateSafeId('notif');
        batch.set(doc(db, 'businesses', bId, 'notifications', notifId), {
          id: notifId,
          businessId: bId,
          outletId: employee.outletId,
          ownerUid: oUid,
          memberUids,
          type: 'attendance',
          title: `Clock-In: ${employee.name}`,
          message: `${employee.name} (${employee.position}) memulai shift pada ${dateStr}.`,
          isRead: false,
          createdAt: ts,
          updatedAt: ts,
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `businesses/${bId}/attendance/${id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, memberUids]
  );

  const clockOutAttendance = useCallback(
    async (att: Attendance) => {
      const { bizId: bId, ownerUid: oUid } = requireContext();
      const now = new Date();
      const start = new Date(att.clockIn);
      const hoursWorked = Number(Math.max(0.01, Math.min(24, (now.getTime() - start.getTime()) / 3600000)).toFixed(2));
      try {
        const batch = writeBatch(db);
        const ts = serverTimestamp();
        batch.update(doc(db, 'businesses', bId, 'attendance', att.id), {
          clockOut: now.toISOString(),
          hoursWorked,
          status: 'clocked_out',
          updatedAt: ts,
        });
        const notifId = generateSafeId('notif');
        batch.set(doc(db, 'businesses', bId, 'notifications', notifId), {
          id: notifId,
          businessId: bId,
          outletId: att.outletId,
          ownerUid: oUid,
          memberUids,
          type: 'attendance',
          title: `Clock-Out: ${att.employeeName || 'Karyawan'}`,
          message: `${att.employeeName || 'Karyawan'} menyelesaikan tugas (${hoursWorked} jam).`,
          isRead: false,
          createdAt: ts,
          updatedAt: ts,
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `businesses/${bId}/attendance/${att.id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, memberUids]
  );

  const saveExpense = useCallback(
    async (data: Omit<Expense, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdBy' | 'createdAt' | 'updatedAt'>, existingId?: string) => {
      const { bizId: bId, ownerUid: oUid, uid } = requireContext();
      const id = existingId || generateSafeId('exp');
      const ref = doc(db, 'businesses', bId, 'expenses', id);
      try {
        if (existingId) {
          await updateDoc(ref, {
            outletId: data.outletId,
            category: clampStr(data.category, 60),
            description: clampStr(data.description, 300),
            amount: Math.max(0, Number(data.amount)),
            expenseDate: data.expenseDate,
            paymentMethod: clampStr(data.paymentMethod || 'Tunai', 40),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            id,
            businessId: bId,
            outletId: data.outletId,
            ownerUid: oUid,
            memberUids,
            category: clampStr(data.category, 60),
            description: clampStr(data.description, 300),
            amount: Math.max(0, Number(data.amount)),
            expenseDate: data.expenseDate,
            paymentMethod: clampStr(data.paymentMethod || 'Tunai', 40),
            createdBy: uid,
            isDemo: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `businesses/${bId}/expenses/${id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, memberUids]
  );

  const deleteExpense = useCallback(
    async (expense: Expense) => {
      const { bizId: bId, ownerUid: oUid, uid, userName } = requireContext();
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'businesses', bId, 'expenses', expense.id));
        const logId = generateSafeId('audit');
        batch.set(doc(db, 'businesses', bId, 'audit_logs', logId), {
          id: logId,
          businessId: bId,
          ownerUid: oUid,
          memberUids,
          action: 'EXPENSE_DELETED',
          entityType: 'expense',
          entityId: expense.id,
          details: clampStr(`Hapus pengeluaran: ${expense.description} (Rp${expense.amount})`, 500),
          actorUid: uid,
          actorName: clampStr(userName, 120),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `businesses/${bId}/expenses/${expense.id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, userProfile?.name, memberUids]
  );

  const saveOperationalTask = useCallback(
    async (data: Omit<OperationalTask, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>, existingId?: string) => {
      const { bizId: bId, ownerUid: oUid } = requireContext();
      const id = existingId || generateSafeId('task');
      const ref = doc(db, 'businesses', bId, 'operational_tasks', id);
      const canFullEdit = ['SUPER_ADMIN', 'OWNER', 'MANAGER'].includes(currentMemberRole);
      try {
        if (existingId && !canFullEdit) {
          // Cashier/Staff role strictly transitions task status per Firestore rules
          await updateDoc(ref, {
            status: data.status,
            updatedAt: serverTimestamp(),
          });
        } else if (existingId) {
          await updateDoc(ref, {
            outletId: data.outletId,
            title: clampStr(data.title, 160),
            category: data.category,
            assignedToId: data.assignedToId || '',
            assignedToName: clampStr(data.assignedToName || '', 120),
            dueDate: data.dueDate || '',
            status: data.status,
            notes: clampStr(data.notes || '', 300),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            id,
            businessId: bId,
            outletId: data.outletId,
            ownerUid: oUid,
            memberUids,
            title: clampStr(data.title, 160),
            category: data.category,
            assignedToId: data.assignedToId || '',
            assignedToName: clampStr(data.assignedToName || '', 120),
            dueDate: data.dueDate || '',
            status: data.status,
            notes: clampStr(data.notes || '', 300),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        // Emit operational task notification on new assignment or completion
        if (!existingId || data.status === 'completed') {
          const notifId = generateSafeId('notif');
          await setDoc(doc(db, 'businesses', bId, 'notifications', notifId), {
            id: notifId,
            businessId: bId,
            outletId: data.outletId,
            ownerUid: oUid,
            memberUids,
            type: 'task',
            title: data.status === 'completed' ? `Tugas Selesai: ${clampStr(data.title, 90)}` : `Tugas Baru: ${clampStr(data.title, 90)}`,
            message: data.assignedToName
              ? `Penanggung jawab: ${data.assignedToName} · Status: ${data.status === 'completed' ? 'Selesai' : 'Baru'}.`
              : `Checklist operasional diperbarui (${data.category}).`,
            isRead: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `businesses/${bId}/operational_tasks/${id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, memberUids, currentMemberRole]
  );

  const deleteOperationalTask = useCallback(
    async (taskId: string) => {
      const { bizId: bId } = requireContext();
      try {
        await deleteDoc(doc(db, 'businesses', bId, 'operational_tasks', taskId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `businesses/${bId}/operational_tasks/${taskId}`);
      }
    },
    [bizId, ownerUid, firebaseUser]
  );

  const saveAiInsight = useCallback(
    async (data: Omit<AiInsight, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdBy' | 'createdAt' | 'updatedAt'>) => {
      const { bizId: bId, ownerUid: oUid, uid } = requireContext();
      const id = generateSafeId('ai');
      try {
        const batch = writeBatch(db);
        const ts = serverTimestamp();
        batch.set(doc(db, 'businesses', bId, 'ai_insights', id), {
          id,
          businessId: bId,
          outletId: data.outletId || 'ALL',
          ownerUid: oUid,
          memberUids,
          moduleType: clampStr(data.moduleType, 60),
          title: clampStr(data.title, 160),
          summary: clampStr(data.summary, 4000),
          confidence: clampStr(data.confidence || 'Sedang', 30),
          createdBy: uid,
          createdAt: ts,
          updatedAt: ts,
        });
        const notifId = generateSafeId('notif');
        batch.set(doc(db, 'businesses', bId, 'notifications', notifId), {
          id: notifId,
          businessId: bId,
          outletId: data.outletId || 'ALL',
          ownerUid: oUid,
          memberUids,
          type: 'ai',
          title: `Rekomendasi AI Baru: ${clampStr(data.title, 90)}`,
          message: `Analisis modul ${data.moduleType} telah disimpan ke riwayat AI Insights.`,
          isRead: false,
          createdAt: ts,
          updatedAt: ts,
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `businesses/${bId}/ai_insights/${id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, memberUids]
  );

  const saveCctvCamera = useCallback(
    async (
      data: Omit<CctvCamera, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<string> => {
      const { bizId: bId, ownerUid: oUid } = requireContext();
      const id = existingId || generateSafeId('cam');
      const ref = doc(db, 'businesses', bId, 'cctv_cameras', id);

      const cleanUrl = data.streamUrl ? clampStr(data.streamUrl.trim(), 500) : '';
      if (cleanUrl && /^(javascript|data|vbscript):/i.test(cleanUrl)) {
        throw new Error('URL stream kamera tidak valid.');
      }

      const optionalFields: Record<string, unknown> = {};
      if (data.sourceType) optionalFields.sourceType = data.sourceType;
      if (cleanUrl) optionalFields.streamUrl = cleanUrl;
      if (data.deviceLabel) optionalFields.deviceLabel = clampStr(data.deviceLabel, 120);
      if (data.connectionStatus) optionalFields.connectionStatus = data.connectionStatus;
      if (typeof data.tableCapacity === 'number' && Number.isFinite(data.tableCapacity)) {
        optionalFields.tableCapacity = Math.max(0, Math.min(500, Math.round(data.tableCapacity)));
      }
      if (data.lastAnalyzedAt) optionalFields.lastAnalyzedAt = clampStr(data.lastAnalyzedAt, 40);
      if (data.lastSummary) optionalFields.lastSummary = clampStr(data.lastSummary, 500);

      try {
        if (existingId) {
          await updateDoc(ref, {
            outletId: data.outletId,
            name: clampStr(data.name, 120),
            locationArea: clampStr(data.locationArea, 120),
            retentionDays: Math.max(1, Math.min(365, Math.round(data.retentionDays))),
            privacyNoticeEnabled: Boolean(data.privacyNoticeEnabled),
            ...optionalFields,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            id,
            businessId: bId,
            outletId: data.outletId,
            ownerUid: oUid,
            memberUids,
            name: clampStr(data.name, 120),
            locationArea: clampStr(data.locationArea, 120),
            retentionDays: Math.max(1, Math.min(365, Math.round(data.retentionDays))),
            privacyNoticeEnabled: Boolean(data.privacyNoticeEnabled),
            ...optionalFields,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        return id;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `businesses/${bId}/cctv_cameras/${id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, memberUids]
  );

  const deleteCctvCamera = useCallback(
    async (cameraId: string) => {
      const { bizId: bId } = requireContext();
      try {
        await deleteDoc(doc(db, 'businesses', bId, 'cctv_cameras', cameraId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `businesses/${bId}/cctv_cameras/${cameraId}`);
      }
    },
    [bizId, ownerUid, firebaseUser]
  );

  const createCctvUploadRecord = useCallback(
    async (
      data: Omit<CctvUpload, 'id' | 'businessId' | 'ownerUid' | 'memberUids' | 'uploadedBy' | 'createdAt' | 'updatedAt'>
    ): Promise<string> => {
      const { bizId: bId, ownerUid: oUid, uid } = requireContext();
      const id = generateSafeId('cctv');
      try {
        const batch = writeBatch(db);
        const ts = serverTimestamp();

        const uploadDoc: Record<string, unknown> = {
          id,
          businessId: bId,
          outletId: data.outletId,
          ownerUid: oUid,
          memberUids,
          cameraId: data.cameraId,
          cameraName: clampStr(data.cameraName || '', 120),
          fileName: clampStr(data.fileName, 200),
          fileSizeBytes: Math.max(1, Math.round(data.fileSizeBytes)),
          mimeType: clampStr(data.mimeType || 'video/mp4', 60),
          jobStatus: data.jobStatus,
          processorMessage: clampStr(data.processorMessage || '', 400),
          uploadedBy: uid,
          createdAt: ts,
          updatedAt: ts,
        };
        if (data.storedFileName) uploadDoc.storedFileName = clampStr(data.storedFileName, 200);
        if (data.analysisResult) uploadDoc.analysisResult = data.analysisResult;
        if (data.analyzedAt) uploadDoc.analyzedAt = clampStr(data.analyzedAt, 40);

        batch.set(doc(db, 'businesses', bId, 'cctv_uploads', id), uploadDoc);

        const notifId = generateSafeId('notif');
        const statusTitle =
          data.jobStatus === 'completed'
            ? `Analisa CV Selesai: ${clampStr(data.cameraName || 'Kamera', 80)}`
            : `Rekaman CCTV Diunggah: ${clampStr(data.cameraName || 'Kamera', 80)}`;
        const statusMsg =
          data.jobStatus === 'completed' && data.analysisResult
            ? `${clampStr(data.fileName, 100)}: ${data.analysisResult.peopleCount} orang terdeteksi, okupansi ${data.analysisResult.occupancyPercent}%.`
            : `File ${clampStr(data.fileName, 120)} tersimpan (${data.jobStatus}).`;

        batch.set(doc(db, 'businesses', bId, 'notifications', notifId), {
          id: notifId,
          businessId: bId,
          outletId: data.outletId,
          ownerUid: oUid,
          memberUids,
          type: 'cctv',
          title: statusTitle,
          message: clampStr(statusMsg, 400),
          isRead: false,
          createdAt: ts,
          updatedAt: ts,
        });
        await batch.commit();
        return id;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `businesses/${bId}/cctv_uploads/${id}`);
      }
    },
    [bizId, ownerUid, firebaseUser, memberUids]
  );

  const updateCctvUploadRecord = useCallback(
    async (
      uploadId: string,
      updates: {
        jobStatus: CctvUpload['jobStatus'];
        processorMessage?: string;
        analysisResult?: CctvAnalysisResult;
        analyzedAt?: string;
        storedFileName?: string;
      }
    ) => {
      const { bizId: bId } = requireContext();
      const payload: Record<string, unknown> = {
        jobStatus: updates.jobStatus,
        updatedAt: serverTimestamp(),
      };
      if (updates.processorMessage !== undefined) {
        payload.processorMessage = clampStr(updates.processorMessage, 400);
      }
      if (updates.analysisResult !== undefined) {
        payload.analysisResult = updates.analysisResult;
      }
      if (updates.analyzedAt !== undefined) {
        payload.analyzedAt = clampStr(updates.analyzedAt, 40);
      }
      if (updates.storedFileName !== undefined) {
        payload.storedFileName = clampStr(updates.storedFileName, 200);
      }

      try {
        await updateDoc(doc(db, 'businesses', bId, 'cctv_uploads', uploadId), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `businesses/${bId}/cctv_uploads/${uploadId}`);
      }
    },
    [bizId, ownerUid, firebaseUser]
  );

  const deleteCctvUpload = useCallback(
    async (uploadId: string) => {
      const { bizId: bId } = requireContext();
      try {
        await deleteDoc(doc(db, 'businesses', bId, 'cctv_uploads', uploadId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `businesses/${bId}/cctv_uploads/${uploadId}`);
      }
    },
    [bizId, ownerUid, firebaseUser]
  );

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      const { bizId: bId } = requireContext();
      try {
        await updateDoc(doc(db, 'businesses', bId, 'notifications', notificationId), {
          isRead: true,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `businesses/${bId}/notifications/${notificationId}`);
      }
    },
    [bizId, ownerUid, firebaseUser]
  );

  const markAllNotificationsRead = useCallback(async () => {
    const { bizId: bId } = requireContext();
    const unread = notifications.filter((n) => !n.isRead);
    if (!unread.length) return;
    try {
      const batch = writeBatch(db);
      for (const n of unread) {
        batch.update(doc(db, 'businesses', bId, 'notifications', n.id), {
          isRead: true,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `businesses/${bId}/notifications`);
    }
  }, [bizId, ownerUid, firebaseUser, notifications]);

  const updateBusinessSettings = useCallback(
    async (updates: Record<string, unknown>) => {
      const { bizId: bId } = requireContext();
      try {
        await updateDoc(doc(db, 'businesses', bId), {
          ...updates,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `businesses/${bId}`);
      }
    },
    [bizId, ownerUid, firebaseUser]
  );

  // Sync updated memberUids across mutable/sync-enabled subcollections so newly invited members can query workspace data
  const propagateMemberUids = useCallback(
    async (bId: string, nextMembers: string[]) => {
      const collectionsToSync: Array<{ col: string; ids: string[] }> = [
        { col: 'outlets', ids: outlets.map((x) => x.id) },
        { col: 'employees', ids: employees.map((x) => x.id) },
        { col: 'categories', ids: categories.map((x) => x.id) },
        { col: 'products', ids: products.map((x) => x.id) },
        { col: 'ingredients', ids: ingredients.map((x) => x.id) },
        { col: 'suppliers', ids: suppliers.map((x) => x.id) },
        { col: 'purchases', ids: purchases.map((x) => x.id) },
        { col: 'stock_movements', ids: stockMovements.map((x) => x.id) },
        { col: 'transactions', ids: transactions.map((x) => x.id) },
        { col: 'expenses', ids: expenses.map((x) => x.id) },
        { col: 'shifts', ids: shifts.map((x) => x.id) },
        { col: 'attendance', ids: attendance.map((x) => x.id) },
        { col: 'operational_tasks', ids: operationalTasks.map((x) => x.id) },
        { col: 'cctv_cameras', ids: cctvCameras.map((x) => x.id) },
        { col: 'cctv_uploads', ids: cctvUploads.map((x) => x.id) },
        { col: 'notifications', ids: notifications.map((x) => x.id) },
      ];

      const refs: Array<ReturnType<typeof doc>> = [];
      for (const item of collectionsToSync) {
        for (const docId of item.ids) {
          refs.push(doc(db, 'businesses', bId, item.col, docId));
        }
      }

      const CHUNK_SIZE = 400;
      for (let i = 0; i < refs.length; i += CHUNK_SIZE) {
        const chunk = refs.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        const ts = serverTimestamp();
        for (const r of chunk) {
          batch.update(r, { memberUids: nextMembers, updatedAt: ts });
        }
        await batch.commit();
      }
    },
    [
      outlets,
      employees,
      categories,
      products,
      ingredients,
      suppliers,
      purchases,
      stockMovements,
      transactions,
      expenses,
      shifts,
      attendance,
      operationalTasks,
      cctvCameras,
      cctvUploads,
      notifications,
    ]
  );

  const inviteBusinessMemberByUid = useCallback(
    async (payload: InviteMemberPayload) => {
      const { bizId: bId, ownerUid: oUid, uid, userName } = requireContext();
      const targetUid = payload.memberUid.trim();
      if (!/^[a-zA-Z0-9_-]{4,128}$/.test(targetUid)) {
        throw new Error('Firebase UID anggota tidak valid (harus alfanumerik, 4–128 karakter).');
      }
      if (memberUids.length >= 50 && !memberUids.includes(targetUid)) {
        throw new Error('Batas maksimum 50 anggota per workspace telah tercapai.');
      }

      const nextMembers = Array.from(new Set([oUid, ...memberUids, targetUid]));
      const nextRoles: Record<string, Exclude<UserRole, 'SUPER_ADMIN'>> = {
        ...(activeBusiness?.memberRoles || {}),
        [oUid]: 'OWNER',
        [targetUid]: payload.role,
      };

      try {
        await updateDoc(doc(db, 'businesses', bId), {
          memberUids: nextMembers,
          memberRoles: nextRoles,
          updatedAt: serverTimestamp(),
        });

        await propagateMemberUids(bId, nextMembers);

        const existingEmp = employees.find((e) => e.userUid === targetUid);
        const ts = serverTimestamp();
        if (existingEmp) {
          await updateDoc(doc(db, 'businesses', bId, 'employees', existingEmp.id), {
            name: clampStr(payload.name, 120),
            position: clampStr(payload.position, 80),
            role: payload.role,
            outletId: payload.outletId,
            email: clampStr(payload.email || existingEmp.email || '', 200),
            phone: clampStr(payload.phone || existingEmp.phone || '', 40),
            status: 'active',
            memberUids: nextMembers,
            updatedAt: ts,
          });
        } else {
          const empId = generateSafeId('emp');
          await setDoc(doc(db, 'businesses', bId, 'employees', empId), {
            id: empId,
            businessId: bId,
            ownerUid: oUid,
            memberUids: nextMembers,
            userUid: targetUid,
            name: clampStr(payload.name, 120),
            email: clampStr(payload.email || '', 200),
            phone: clampStr(payload.phone || '', 40),
            position: clampStr(payload.position, 80),
            role: payload.role,
            outletId: payload.outletId,
            status: 'active',
            createdAt: ts,
            updatedAt: ts,
          });
        }

        const logId = generateSafeId('audit');
        await setDoc(doc(db, 'businesses', bId, 'audit_logs', logId), {
          id: logId,
          businessId: bId,
          ownerUid: oUid,
          memberUids: nextMembers,
          action: 'MEMBER_INVITED',
          entityType: 'employee',
          entityId: targetUid,
          details: clampStr(`Menambahkan anggota ${payload.name} (${targetUid}) dengan peran ${payload.role}`, 500),
          actorUid: uid,
          actorName: clampStr(userName, 120),
          createdAt: ts,
          updatedAt: ts,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `businesses/${bId}`);
      }
    },
    [bizId, ownerUid, firebaseUser, userProfile?.name, memberUids, activeBusiness?.memberRoles, employees, propagateMemberUids]
  );

  const updateBusinessMemberRole = useCallback(
    async (targetUid: string, role: Exclude<UserRole, 'SUPER_ADMIN'>) => {
      const { bizId: bId, ownerUid: oUid, uid, userName } = requireContext();
      if (targetUid === oUid) {
        throw new Error('Peran pemilik utama bisnis tidak dapat diubah.');
      }

      const nextRoles: Record<string, Exclude<UserRole, 'SUPER_ADMIN'>> = {
        ...(activeBusiness?.memberRoles || {}),
        [targetUid]: role,
      };

      try {
        await updateDoc(doc(db, 'businesses', bId), {
          memberRoles: nextRoles,
          updatedAt: serverTimestamp(),
        });
        const emp = employees.find((e) => e.userUid === targetUid);
        if (emp) {
          await updateDoc(doc(db, 'businesses', bId, 'employees', emp.id), {
            role,
            updatedAt: serverTimestamp(),
          });
        }
        const logId = generateSafeId('audit');
        await setDoc(doc(db, 'businesses', bId, 'audit_logs', logId), {
          id: logId,
          businessId: bId,
          ownerUid: oUid,
          memberUids,
          action: 'MEMBER_ROLE_UPDATED',
          entityType: 'employee',
          entityId: targetUid,
          details: clampStr(`Peran anggota ${targetUid} diperbarui ke ${role}`, 500),
          actorUid: uid,
          actorName: clampStr(userName, 120),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `businesses/${bId}`);
      }
    },
    [bizId, ownerUid, firebaseUser, userProfile?.name, memberUids, activeBusiness?.memberRoles, employees]
  );

  const removeBusinessMember = useCallback(
    async (targetUid: string) => {
      const { bizId: bId, ownerUid: oUid, uid, userName } = requireContext();
      if (targetUid === oUid) {
        throw new Error('Pemilik utama tidak dapat dihapus dari workspace.');
      }

      const nextMembers = memberUids.filter((m) => m !== targetUid);
      if (!nextMembers.includes(oUid)) nextMembers.unshift(oUid);

      const nextRoles = { ...(activeBusiness?.memberRoles || {}) };
      delete nextRoles[targetUid];

      try {
        await updateDoc(doc(db, 'businesses', bId), {
          memberUids: nextMembers,
          memberRoles: nextRoles,
          updatedAt: serverTimestamp(),
        });
        await propagateMemberUids(bId, nextMembers);
        const emp = employees.find((e) => e.userUid === targetUid);
        if (emp) {
          await updateDoc(doc(db, 'businesses', bId, 'employees', emp.id), {
            status: 'inactive',
            memberUids: nextMembers,
            updatedAt: serverTimestamp(),
          });
        }
        const logId = generateSafeId('audit');
        await setDoc(doc(db, 'businesses', bId, 'audit_logs', logId), {
          id: logId,
          businessId: bId,
          ownerUid: oUid,
          memberUids: nextMembers,
          action: 'MEMBER_REMOVED',
          entityType: 'employee',
          entityId: targetUid,
          details: clampStr(`Mencabut akses anggota ${targetUid}`, 500),
          actorUid: uid,
          actorName: clampStr(userName, 120),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `businesses/${bId}`);
      }
    },
    [bizId, ownerUid, firebaseUser, userProfile?.name, memberUids, activeBusiness?.memberRoles, employees, propagateMemberUids]
  );

  return (
    <BusinessDataContext.Provider
      value={{
        loadingData,
        dataError,
        outlets,
        employees,
        categories,
        products,
        ingredients,
        suppliers,
        purchases,
        stockMovements,
        transactions,
        expenses,
        shifts,
        attendance,
        operationalTasks,
        aiInsights,
        cctvCameras,
        cctvUploads,
        notifications,
        auditLogs,
        currentMemberRole,
        checkoutPosTransaction,
        createPendingOrder,
        completePendingTransaction,
        updateTransactionStatus,
        saveOutlet,
        saveCategory,
        saveProduct,
        saveIngredient,
        saveSupplier,
        recordPurchaseAndStockIn,
        adjustIngredientStock,
        saveEmployee,
        saveShift,
        deleteShift,
        clockInEmployee,
        clockOutAttendance,
        saveExpense,
        deleteExpense,
        saveOperationalTask,
        deleteOperationalTask,
        saveAiInsight,
        saveCctvCamera,
        deleteCctvCamera,
        createCctvUploadRecord,
        updateCctvUploadRecord,
        deleteCctvUpload,
        markNotificationRead,
        markAllNotificationsRead,
        updateBusinessSettings,
        inviteBusinessMemberByUid,
        updateBusinessMemberRole,
        removeBusinessMember,
      }}
    >
      {children}
    </BusinessDataContext.Provider>
  );
}
