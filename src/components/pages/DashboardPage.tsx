import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Package,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useBusinessData } from '../../context/BusinessDataContext';
import { formatIDR, formatNumberID, getMakassarDateString } from '../../lib/format';
import { computeBusinessMetrics, resolveDateRange, type DateFilterKey } from '../../lib/metrics';
import type { AppView } from '../../types/ezflow';

export function DashboardPage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { activeOutletId } = useAuth();
  const { transactions, expenses, ingredients, products, operationalTasks, outlets, stockMovements, loadingData } =
    useBusinessData();

  const [dateFilter, setDateFilter] = useState<DateFilterKey>('30d');
  const [customStart, setCustomStart] = useState(() => getMakassarDateString(new Date(Date.now() - 6 * 86400000)));
  const [customEnd, setCustomEnd] = useState(() => getMakassarDateString(new Date()));

  const dateRange = useMemo(
    () => resolveDateRange(dateFilter, { startDate: customStart, endDate: customEnd }),
    [dateFilter, customStart, customEnd]
  );

  const metrics = useMemo(
    () =>
      computeBusinessMetrics({
        transactions,
        expenses,
        ingredients,
        products,
        tasks: operationalTasks,
        outlets,
        stockMovements,
        dateRange,
        outletId: activeOutletId,
      }),
    [transactions, expenses, ingredients, products, operationalTasks, outlets, stockMovements, dateRange, activeOutletId]
  );

  const pendingCount = useMemo(
    () =>
      transactions.filter(
        (t) => t.status === 'pending' && (activeOutletId === 'ALL' || t.outletId === activeOutletId)
      ).length,
    [transactions, activeOutletId]
  );

  const selectedOutletName =
    activeOutletId === 'ALL'
      ? 'Semua Outlet'
      : outlets.find((o) => o.id === activeOutletId)?.name || 'Outlet Terpilih';

  const hasDemoData = transactions.some((t) => t.isDemo) || expenses.some((e) => e.isDemo);

  return (
    <div className="space-y-6">
      {/* Executive Header & Period Selector */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            Ringkasan Performa Bisnis
          </h2>
          <p className="text-xs text-slate-500 mt-1 tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium text-slate-700">{selectedOutletName}</span>
            <span aria-hidden="true">·</span>
            <span>Periode {dateRange.startDate} s.d. {dateRange.endDate}</span>
            {hasDemoData && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-blue-700 font-medium">Data sampel demo</span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100/90 p-1 rounded-lg text-xs font-medium border border-slate-200/70">
            {(
              [
                { key: 'today', label: 'Hari Ini' },
                { key: 'yesterday', label: 'Kemarin' },
                { key: '7d', label: '7 Hari' },
                { key: '30d', label: '30 Hari' },
                { key: 'custom', label: 'Kustom' },
              ] as const
            ).map((btn) => (
              <button
                key={btn.key}
                type="button"
                onClick={() => setDateFilter(btn.key)}
                className={`px-3 py-1.5 rounded-md transition-all duration-150 whitespace-nowrap ${
                  dateFilter === btn.key
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
              />
              <span className="text-slate-400">–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI Strip: Featured Midnight Revenue Card + 4 Crisp Surface Cards */}
      {loadingData && transactions.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard
            featured
            label="Total Pendapatan"
            value={formatIDR(metrics.totalRevenue)}
            subtext={
              metrics.revenueDeltaPercent !== null
                ? `${metrics.revenueDeltaPercent >= 0 ? '+' : ''}${metrics.revenueDeltaPercent.toFixed(1)}% vs periode lalu`
                : 'Penjualan berstatus selesai'
            }
            trend={metrics.revenueDeltaPercent}
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <KpiCard
            label="Jumlah Transaksi"
            value={formatNumberID(metrics.transactionCount)}
            subtext={pendingCount > 0 ? `Selesai · ${pendingCount} tertunda` : 'Transaksi selesai'}
            iconTone="bg-blue-50 text-blue-600"
            icon={<Receipt className="w-4 h-4" />}
          />
          <KpiCard
            label="Rata-rata Pesanan"
            value={formatIDR(metrics.averageOrderValue)}
            subtext="Average Order Value"
            iconTone="bg-indigo-50 text-indigo-600"
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <KpiCard
            label="Estimasi Laba Kotor"
            value={formatIDR(metrics.estimatedGrossProfit)}
            subtext={`Margin ${metrics.grossMarginPercent.toFixed(1)}% (HPP resep)`}
            iconTone="bg-emerald-50 text-emerald-600"
            icon={<Wallet className="w-4 h-4" />}
          />
          <KpiCard
            label="Total Pengeluaran"
            value={formatIDR(metrics.totalExpenses)}
            subtext="Beban operasional tercatat"
            iconTone="bg-amber-50 text-amber-600"
            icon={<Wallet className="w-4 h-4" />}
          />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sales & Expense Trend */}
        <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Tren Pendapatan & Pengeluaran Harian
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Dihitung langsung dari transaksi selesai dan pengeluaran tercatat
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block" />
                Pendapatan
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
                Pengeluaran
              </span>
            </div>
          </div>
          {metrics.dailySalesTrend.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">
              Belum ada data pada rentang tanggal terpilih.
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.dailySalesTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.14} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickFormatter={(v) => String(v).slice(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1000)}rb`}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
                      fontSize: '12px',
                    }}
                    formatter={(value: unknown, name: unknown) => [
                      formatIDR(Number(value)),
                      name === 'revenue' ? 'Pendapatan' : 'Pengeluaran',
                    ]}
                    labelFormatter={(label) => `Tanggal: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#revGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    stroke="#D97706"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#expGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Best Selling Products */}
        <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">Produk Terlaris</h3>
              <p className="text-xs text-slate-500 mt-0.5">Berdasarkan unit & omzet terjual</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('menu')}
              className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap"
            >
              Lihat Menu
            </button>
          </div>
          {metrics.topProducts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-xs text-slate-400">
              <p>Belum ada penjualan produk pada periode ini.</p>
              <button
                type="button"
                onClick={() => onNavigate('pos')}
                className="mt-3 px-3.5 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
              >
                Buka Kasir POS
              </button>
            </div>
          ) : (
            <div className="space-y-3.5 flex-1">
              {(() => {
                const topSlice = metrics.topProducts.slice(0, 6);
                const maxRevenue = Math.max(...topSlice.map((p) => p.revenue), 1);
                return topSlice.map((prod, idx) => {
                  const pct = Math.max(6, Math.round((prod.revenue / maxRevenue) * 100));
                  return (
                    <div
                      key={prod.productId}
                      className="space-y-1.5 pb-3 border-b border-slate-100 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-2.5">
                          <span
                            className={`w-6 h-6 rounded-md text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums ${
                              idx === 0
                                ? 'bg-[#0B1324] text-amber-400'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate">{prod.name}</p>
                            <p className="text-[11px] text-slate-500 tabular-nums">
                              {prod.qtySold} terjual · Margin {prod.marginPercent.toFixed(0)}%
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-slate-900 tabular-nums shrink-0">
                          {formatIDR(prod.revenue)}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-600 to-amber-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Inventory Alerts, Operational Status & Payment Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Inventory Alerts */}
        <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h3 className="font-display text-sm font-bold text-slate-900">Peringatan Inventaris</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Kelola Stok
            </button>
          </div>
          {metrics.outOfStockIngredients.length === 0 && metrics.lowStockIngredients.length === 0 ? (
            <div className="py-6 text-center text-xs font-medium text-emerald-700 bg-emerald-50/70 rounded-lg border border-emerald-200/80">
              Semua stok bahan baku berada di atas batas minimum.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {metrics.outOfStockIngredients.map((ing) => (
                <div key={ing.id} className="py-2.5 flex items-center justify-between gap-2 first:pt-1 last:pb-1">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-red-900 truncate">{ing.name}</p>
                    <p className="text-[11px] text-red-700 tabular-nums">Stok habis (0 {ing.unit})</p>
                  </div>
                  <span className="text-[11px] font-bold text-red-600 shrink-0">Kritis</span>
                </div>
              ))}
              {metrics.lowStockIngredients.map((ing) => (
                <div key={ing.id} className="py-2.5 flex items-center justify-between gap-2 first:pt-1 last:pb-1">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{ing.name}</p>
                    <p className="text-[11px] text-amber-700 tabular-nums">
                      Sisa {ing.stock} {ing.unit} · Min {ing.minStock} {ing.unit}
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-amber-600 shrink-0">Menipis</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Daily Operations Status */}
        <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <h3 className="font-display text-sm font-bold text-slate-900">Status Operasional Harian</h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('operations')}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Checklist
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="font-display text-2xl font-extrabold text-slate-900 tabular-nums">
                  {metrics.taskCompletion.completed} / {metrics.taskCompletion.total}
                </span>
                <span className="text-xs text-slate-500">Tugas selesai</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all"
                  style={{
                    width: `${
                      metrics.taskCompletion.total > 0
                        ? Math.round((metrics.taskCompletion.completed / metrics.taskCompletion.total) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="divide-y divide-slate-100 pt-1">
                {(() => {
                  const outletTasks = operationalTasks.filter(
                    (t) => activeOutletId === 'ALL' || t.outletId === activeOutletId
                  );
                  if (outletTasks.length === 0) {
                    return <p className="text-xs text-slate-400 py-2">Belum ada tugas untuk outlet ini.</p>;
                  }
                  return outletTasks.slice(0, 4).map((t) => (
                    <div key={t.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <span className={`truncate ${t.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {t.title}
                      </span>
                      <span
                        className={`text-[11px] font-semibold shrink-0 ${
                          t.status === 'completed'
                            ? 'text-emerald-600'
                            : t.status === 'in_progress'
                              ? 'text-blue-600'
                              : 'text-amber-600'
                        }`}
                      >
                        {t.status === 'completed' ? 'Selesai' : t.status === 'in_progress' ? 'Proses' : 'Tertunda'}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" /> Nilai Stok Saat Ini
            </span>
            <span className="font-bold text-slate-900 tabular-nums">{formatIDR(metrics.inventoryValuation)}</span>
          </div>
        </div>

        {/* Payment Method Breakdown */}
        <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6">
          <h3 className="font-display text-sm font-bold text-slate-900 mb-1">Metode Pembayaran</h3>
          <p className="text-xs text-slate-500 mb-4">Distribusi nilai transaksi selesai</p>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.paymentBreakdown} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="method"
                  tick={{ fontSize: 11, fill: '#334155' }}
                  width={90}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip formatter={(val: unknown) => formatIDR(Number(val))} />
                <Bar dataKey="amount" fill="#2563EB" radius={[0, 6, 6, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Multi-Outlet Comparison Table */}
      {metrics.outletComparison.length > 1 && (
        <div className="bg-white border border-slate-200/90 rounded-xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">Perbandingan Performa Antar Outlet</h3>
              <p className="text-xs text-slate-500 mt-0.5">Periode {dateRange.startDate} s.d. {dateRange.endDate}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-semibold">Nama Outlet</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Transaksi</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Pendapatan</th>
                  <th className="py-2.5 pl-4 font-semibold text-right">Pengeluaran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.outletComparison.map((row) => (
                  <tr key={row.outletId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 pr-4 font-semibold text-slate-900">{row.outletName}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-700">{row.transactions}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-900">
                      {formatIDR(row.revenue)}
                    </td>
                    <td className="py-3 pl-4 text-right tabular-nums text-slate-700">{formatIDR(row.expenses)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtext,
  trend,
  icon,
  iconTone = 'bg-slate-100 text-slate-700',
  featured = false,
}: {
  label: string;
  value: string;
  subtext: string;
  trend?: number | null;
  icon: React.ReactNode;
  iconTone?: string;
  featured?: boolean;
}) {
  if (featured) {
    return (
      <div className="ez-card-interactive relative overflow-hidden bg-[#0B1324] ez-dark-grid border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-8 w-28 h-28 rounded-full bg-blue-500/20 blur-xl"
        />
        <div className="relative flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-semibold text-slate-300">{label}</span>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-amber-400/15 border border-amber-400/30 text-amber-300">
            {icon}
          </div>
        </div>
        <p className="relative font-display text-xl sm:text-2xl font-extrabold text-white tabular-nums tracking-tight">
          {value}
        </p>
        <div className="relative mt-2 flex items-center gap-1 text-[11px] text-slate-300">
          {typeof trend === 'number' &&
            (trend >= 0 ? (
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5 text-red-400 shrink-0" />
            ))}
          <span className="truncate">{subtext}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ez-card-interactive bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconTone}`}>
          {icon}
        </div>
      </div>
      <p className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
        {typeof trend === 'number' &&
          (trend >= 0 ? (
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <ArrowDownRight className="w-3.5 h-3.5 text-red-600 shrink-0" />
          ))}
        <span className="truncate">{subtext}</span>
      </div>
    </div>
  );
}
