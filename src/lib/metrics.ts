import type {
  Expense,
  Ingredient,
  OperationalTask,
  Outlet,
  PaymentMethod,
  Product,
  StockMovement,
  Transaction,
} from '../types/ezflow';
import { getMakassarDateString, getMakassarHour } from './format';

export type DateFilterKey = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export function resolveDateRange(filter: DateFilterKey, customRange?: DateRange): DateRange {
  const now = new Date();
  const today = getMakassarDateString(now);

  if (filter === 'today') {
    return { startDate: today, endDate: today };
  }
  if (filter === 'yesterday') {
    const y = new Date(now.getTime() - 24 * 3600 * 1000);
    const yStr = getMakassarDateString(y);
    return { startDate: yStr, endDate: yStr };
  }
  if (filter === '7d') {
    const d7 = new Date(now.getTime() - 6 * 24 * 3600 * 1000);
    return { startDate: getMakassarDateString(d7), endDate: today };
  }
  if (filter === '30d') {
    const d30 = new Date(now.getTime() - 29 * 24 * 3600 * 1000);
    return { startDate: getMakassarDateString(d30), endDate: today };
  }
  const start = customRange?.startDate || today;
  const end = customRange?.endDate || today;
  return start <= end ? { startDate: start, endDate: end } : { startDate: end, endDate: start };
}

export function shiftDateRangePrevious(range: DateRange): DateRange {
  const start = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);
  const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)) + 1);
  const prevEnd = new Date(start.getTime() - 24 * 3600 * 1000);
  const prevStart = new Date(prevEnd.getTime() - (diffDays - 1) * 24 * 3600 * 1000);
  return {
    startDate: prevStart.toISOString().slice(0, 10),
    endDate: prevEnd.toISOString().slice(0, 10),
  };
}

export interface ComputedBusinessMetrics {
  period: DateRange;
  totalRevenue: number;
  previousRevenue: number;
  revenueDeltaPercent: number | null;
  transactionCount: number;
  averageOrderValue: number;
  estimatedCogs: number;
  estimatedGrossProfit: number;
  grossMarginPercent: number;
  totalExpenses: number;
  estimatedNetProfit: number;
  lowStockIngredients: Ingredient[];
  outOfStockIngredients: Ingredient[];
  inventoryValuation: number;
  topProducts: Array<{
    productId: string;
    name: string;
    qtySold: number;
    revenue: number;
    cogs: number;
    grossProfit: number;
    marginPercent: number;
  }>;
  leastSellingProducts: Array<{
    productId: string;
    name: string;
    qtySold: number;
    revenue: number;
    marginPercent: number;
  }>;
  dailySalesTrend: Array<{
    date: string;
    revenue: number;
    transactions: number;
    expenses: number;
  }>;
  hourlyDistribution: Array<{
    hour: string;
    transactions: number;
    revenue: number;
  }>;
  paymentBreakdown: Array<{
    method: PaymentMethod;
    count: number;
    amount: number;
  }>;
  expenseByCategory: Array<{
    category: string;
    amount: number;
  }>;
  taskCompletion: {
    total: number;
    completed: number;
    pending: number;
  };
  outletComparison: Array<{
    outletId: string;
    outletName: string;
    revenue: number;
    transactions: number;
    expenses: number;
  }>;
}

export function computeBusinessMetrics(params: {
  transactions: Transaction[];
  expenses: Expense[];
  ingredients: Ingredient[];
  products: Product[];
  tasks: OperationalTask[];
  outlets: Outlet[];
  stockMovements: StockMovement[];
  dateRange: DateRange;
  outletId: string; // 'ALL' or specific outletId
}): ComputedBusinessMetrics {
  const { transactions, expenses, ingredients, products, tasks, outlets, dateRange, outletId } = params;

  const inRange = (isoDate: string, range: DateRange) => {
    const day = isoDate.includes('T') ? getMakassarDateString(new Date(isoDate)) : isoDate.slice(0, 10);
    return day >= range.startDate && day <= range.endDate;
  };

  const matchOutlet = (id: string) => outletId === 'ALL' || id === outletId;

  const completedTx = transactions.filter(
    (tx) => tx.status === 'completed' && matchOutlet(tx.outletId) && inRange(tx.occurredAt, dateRange)
  );

  const prevRange = shiftDateRangePrevious(dateRange);
  const prevCompletedTx = transactions.filter(
    (tx) => tx.status === 'completed' && matchOutlet(tx.outletId) && inRange(tx.occurredAt, prevRange)
  );

  const totalRevenue = completedTx.reduce((sum, tx) => sum + tx.total, 0);
  const previousRevenue = prevCompletedTx.reduce((sum, tx) => sum + tx.total, 0);
  const revenueDeltaPercent =
    previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : null;

  const transactionCount = completedTx.length;
  const averageOrderValue = transactionCount > 0 ? totalRevenue / transactionCount : 0;

  const estimatedCogs = completedTx.reduce((sum, tx) => {
    if (typeof tx.estimatedCogs === 'number') return sum + tx.estimatedCogs;
    return (
      sum +
      tx.items.reduce((itemSum, item) => itemSum + (item.unitCogs || 0) * item.quantity, 0)
    );
  }, 0);

  const estimatedGrossProfit = totalRevenue - estimatedCogs;
  const grossMarginPercent = totalRevenue > 0 ? (estimatedGrossProfit / totalRevenue) * 100 : 0;

  const filteredExpenses = expenses.filter(
    (e) => matchOutlet(e.outletId) && inRange(e.expenseDate, dateRange)
  );
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const estimatedNetProfit = estimatedGrossProfit - totalExpenses;

  const outletIngredients = ingredients.filter((i) => matchOutlet(i.outletId));
  const outOfStockIngredients = outletIngredients.filter((i) => i.stock <= 0);
  const lowStockIngredients = outletIngredients.filter((i) => i.stock > 0 && i.stock <= i.minStock);
  const inventoryValuation = outletIngredients.reduce((sum, i) => sum + i.stock * i.costPerUnit, 0);

  // Product aggregation
  const prodStats = new Map<
    string,
    { productId: string; name: string; qtySold: number; revenue: number; cogs: number }
  >();

  for (const p of products.filter((pr) => !pr.isArchived)) {
    prodStats.set(p.id, { productId: p.id, name: p.name, qtySold: 0, revenue: 0, cogs: 0 });
  }

  for (const tx of completedTx) {
    for (const item of tx.items) {
      const existing = prodStats.get(item.productId) || {
        productId: item.productId,
        name: item.productName,
        qtySold: 0,
        revenue: 0,
        cogs: 0,
      };
      existing.qtySold += item.quantity;
      existing.revenue += item.lineTotal;
      existing.cogs += (item.unitCogs || 0) * item.quantity;
      prodStats.set(item.productId, existing);
    }
  }

  const allProductPerf = Array.from(prodStats.values()).map((p) => {
    const grossProfit = p.revenue - p.cogs;
    const prodRef = products.find((pr) => pr.id === p.productId);
    const fallbackMargin =
      prodRef && prodRef.price > 0 ? ((prodRef.price - prodRef.cogs) / prodRef.price) * 100 : 0;
    const marginPercent = p.revenue > 0 ? (grossProfit / p.revenue) * 100 : fallbackMargin;
    return { ...p, grossProfit, marginPercent };
  });

  const topProducts = [...allProductPerf]
    .filter((p) => p.qtySold > 0)
    .sort((a, b) => b.qtySold - a.qtySold || b.revenue - a.revenue);

  const leastSellingProducts = [...allProductPerf]
    .sort((a, b) => a.qtySold - b.qtySold || a.revenue - b.revenue)
    .slice(0, 5);

  // Daily trend across dateRange
  const dayMap = new Map<string, { date: string; revenue: number; transactions: number; expenses: number }>();
  const startDt = new Date(`${dateRange.startDate}T00:00:00Z`);
  const endDt = new Date(`${dateRange.endDate}T00:00:00Z`);
  for (let d = new Date(startDt); d <= endDt && dayMap.size < 60; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { date: key, revenue: 0, transactions: 0, expenses: 0 });
  }

  for (const tx of completedTx) {
    const key = getMakassarDateString(new Date(tx.occurredAt));
    const entry = dayMap.get(key) || { date: key, revenue: 0, transactions: 0, expenses: 0 };
    entry.revenue += tx.total;
    entry.transactions += 1;
    dayMap.set(key, entry);
  }
  for (const exp of filteredExpenses) {
    const key = exp.expenseDate.slice(0, 10);
    const entry = dayMap.get(key) || { date: key, revenue: 0, transactions: 0, expenses: 0 };
    entry.expenses += exp.amount;
    dayMap.set(key, entry);
  }
  const dailySalesTrend = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Hourly distribution (07:00 - 22:00)
  const hourBuckets = Array.from({ length: 16 }, (_, idx) => {
    const h = idx + 7;
    return {
      hourNum: h,
      hour: `${String(h).padStart(2, '0')}:00`,
      transactions: 0,
      revenue: 0,
    };
  });
  for (const tx of completedTx) {
    const h = getMakassarHour(tx.occurredAt);
    const bucket = hourBuckets.find((b) => b.hourNum === h);
    if (bucket) {
      bucket.transactions += 1;
      bucket.revenue += tx.total;
    }
  }

  // Payment breakdown
  const payMethods: PaymentMethod[] = ['Tunai', 'QRIS', 'Debit', 'Transfer Bank'];
  const paymentBreakdown = payMethods.map((method) => {
    const list = completedTx.filter((t) => t.paymentMethod === method);
    return {
      method,
      count: list.length,
      amount: list.reduce((s, t) => s + t.total, 0),
    };
  });

  // Expense by category
  const expCatMap = new Map<string, number>();
  for (const exp of filteredExpenses) {
    expCatMap.set(exp.category, (expCatMap.get(exp.category) || 0) + exp.amount);
  }
  const expenseByCategory = Array.from(expCatMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Tasks
  const outletTasks = tasks.filter((t) => matchOutlet(t.outletId));
  const completedTaskCount = outletTasks.filter((t) => t.status === 'completed').length;

  // Multi-outlet comparison (using same dateRange, ignoring single outletId filter)
  const outletComparison = outlets
    .filter((o) => !o.isArchived)
    .map((o) => {
      const oTx = transactions.filter(
        (tx) => tx.status === 'completed' && tx.outletId === o.id && inRange(tx.occurredAt, dateRange)
      );
      const oExp = expenses.filter((e) => e.outletId === o.id && inRange(e.expenseDate, dateRange));
      return {
        outletId: o.id,
        outletName: o.name,
        revenue: oTx.reduce((s, t) => s + t.total, 0),
        transactions: oTx.length,
        expenses: oExp.reduce((s, e) => s + e.amount, 0),
      };
    });

  return {
    period: dateRange,
    totalRevenue,
    previousRevenue,
    revenueDeltaPercent,
    transactionCount,
    averageOrderValue,
    estimatedCogs,
    estimatedGrossProfit,
    grossMarginPercent,
    totalExpenses,
    estimatedNetProfit,
    lowStockIngredients,
    outOfStockIngredients,
    inventoryValuation,
    topProducts,
    leastSellingProducts,
    dailySalesTrend,
    hourlyDistribution: hourBuckets.map(({ hour, transactions: t, revenue }) => ({
      hour,
      transactions: t,
      revenue,
    })),
    paymentBreakdown,
    expenseByCategory,
    taskCompletion: {
      total: outletTasks.length,
      completed: completedTaskCount,
      pending: outletTasks.length - completedTaskCount,
    },
    outletComparison,
  };
}
