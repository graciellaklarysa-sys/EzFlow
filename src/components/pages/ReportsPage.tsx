import { useMemo, useState } from 'react';
import { Calendar, Download, FileBarChart, Printer } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusinessData } from '../../context/BusinessDataContext';
import { useToast } from '../ui/Toast';
import {
  exportToCsv,
  formatDateTimeID,
  formatIDR,
  formatNumberID,
  getMakassarDateString,
} from '../../lib/format';
import { computeBusinessMetrics, resolveDateRange, type DateFilterKey } from '../../lib/metrics';

type ReportType =
  | 'sales'
  | 'transactions'
  | 'products'
  | 'inventory'
  | 'employees'
  | 'expenses'
  | 'profitability'
  | 'cctv';

const REPORT_OPTIONS: Array<{ id: ReportType; label: string }> = [
  { id: 'sales', label: 'Laporan Penjualan' },
  { id: 'transactions', label: 'Laporan Transaksi' },
  { id: 'products', label: 'Performa Produk' },
  { id: 'inventory', label: 'Inventaris & Stok' },
  { id: 'employees', label: 'Karyawan & Absensi' },
  { id: 'expenses', label: 'Pengeluaran' },
  { id: 'profitability', label: 'Profitabilitas' },
  { id: 'cctv', label: 'Analitik CCTV (Sampel)' },
];

export function ReportsPage() {
  const { activeBusiness, activeOutletId, setActiveOutletId } = useAuth();
  const {
    outlets,
    transactions,
    expenses,
    ingredients,
    products,
    employees,
    attendance,
    operationalTasks,
    stockMovements,
  } = useBusinessData();
  const { showToast } = useToast();

  const [reportType, setReportType] = useState<ReportType>('sales');
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

  const activeOutlets = outlets.filter((o) => !o.isArchived);
  const selectedOutletName =
    activeOutletId === 'ALL'
      ? 'Semua Outlet'
      : outlets.find((o) => o.id === activeOutletId)?.name || 'Outlet Terpilih';

  const inRange = (isoOrDate: string) => {
    const day = isoOrDate.includes('T') ? getMakassarDateString(new Date(isoOrDate)) : isoOrDate.slice(0, 10);
    return day >= dateRange.startDate && day <= dateRange.endDate;
  };
  const matchOutlet = (id: string) => activeOutletId === 'ALL' || id === activeOutletId;

  const filteredTx = useMemo(
    () => transactions.filter((t) => matchOutlet(t.outletId) && inRange(t.occurredAt)),
    [transactions, activeOutletId, dateRange]
  );

  const filteredExpenses = useMemo(
    () => expenses.filter((e) => matchOutlet(e.outletId) && inRange(e.expenseDate)),
    [expenses, activeOutletId, dateRange]
  );

  const filteredIngredients = useMemo(
    () => ingredients.filter((i) => matchOutlet(i.outletId)),
    [ingredients, activeOutletId]
  );

  const filteredEmployees = useMemo(
    () => employees.filter((e) => matchOutlet(e.outletId)),
    [employees, activeOutletId]
  );

  // Build tabular dataset dynamically per report type
  const reportData = useMemo((): {
    title: string;
    subtitle: string;
    headers: string[];
    rows: Array<Array<string | number>>;
    summaryItems: Array<{ label: string; value: string }>;
  } => {
    if (reportType === 'sales') {
      return {
        title: 'Laporan Penjualan Harian',
        subtitle: `${selectedOutletName} · ${dateRange.startDate} s.d. ${dateRange.endDate}`,
        summaryItems: [
          { label: 'Total Pendapatan', value: formatIDR(metrics.totalRevenue) },
          { label: 'Transaksi Selesai', value: formatNumberID(metrics.transactionCount) },
          { label: 'Rata-rata Order', value: formatIDR(metrics.averageOrderValue) },
        ],
        headers: ['Tanggal', 'Jumlah Transaksi', 'Pendapatan (IDR)', 'Pengeluaran (IDR)', 'Selisih Arus Kas'],
        rows: metrics.dailySalesTrend.map((d) => [
          d.date,
          d.transactions,
          d.revenue,
          d.expenses,
          d.revenue - d.expenses,
        ]),
      };
    }

    if (reportType === 'transactions') {
      return {
        title: 'Laporan Detail Transaksi POS',
        subtitle: `${selectedOutletName} · ${dateRange.startDate} s.d. ${dateRange.endDate}`,
        summaryItems: [
          { label: 'Total Catatan', value: formatNumberID(filteredTx.length) },
          { label: 'Nominal Selesai', value: formatIDR(metrics.totalRevenue) },
          {
            label: 'Refund / Batal',
            value: formatNumberID(filteredTx.filter((t) => t.status === 'cancelled' || t.status === 'refunded').length),
          },
        ],
        headers: ['No. Nota', 'Waktu', 'Outlet', 'Kasir', 'Metode', 'Total (IDR)', 'Status'],
        rows: filteredTx.map((t) => [
          t.receiptNumber,
          formatDateTimeID(t.occurredAt),
          t.outletName || '-',
          t.cashierName || '-',
          t.paymentMethod,
          t.total,
          t.status,
        ]),
      };
    }

    if (reportType === 'products') {
      return {
        title: 'Laporan Performa Produk & Margin',
        subtitle: `${selectedOutletName} · ${dateRange.startDate} s.d. ${dateRange.endDate}`,
        summaryItems: [
          { label: 'Produk Terjual', value: formatNumberID(metrics.topProducts.reduce((s, p) => s + p.qtySold, 0)) },
          { label: 'Produk Terlaris', value: metrics.topProducts[0]?.name || '-' },
          { label: 'Margin Kotor Rata-rata', value: `${metrics.grossMarginPercent.toFixed(1)}%` },
        ],
        headers: ['Nama Produk', 'Unit Terjual', 'Pendapatan (IDR)', 'Estimasi HPP (IDR)', 'Laba Kotor (IDR)', 'Margin (%)'],
        rows: metrics.topProducts.map((p) => [
          p.name,
          p.qtySold,
          p.revenue,
          p.cogs,
          p.grossProfit,
          Number(p.marginPercent.toFixed(1)),
        ]),
      };
    }

    if (reportType === 'inventory') {
      return {
        title: 'Laporan Inventaris & Valuasi Stok',
        subtitle: `${selectedOutletName} · Posisi stok per hari ini`,
        summaryItems: [
          { label: 'Total Item Bahan', value: formatNumberID(filteredIngredients.length) },
          { label: 'Stok Menipis/Habis', value: formatNumberID(metrics.lowStockIngredients.length + metrics.outOfStockIngredients.length) },
          { label: 'Total Valuasi Stok', value: formatIDR(metrics.inventoryValuation) },
        ],
        headers: ['Nama Bahan', 'Tipe', 'Stok Tersedia', 'Ambang Min.', 'Satuan', 'Harga/Unit (IDR)', 'Nilai Stok (IDR)'],
        rows: filteredIngredients.map((i) => [
          i.name,
          i.itemType === 'raw_material' ? 'Bahan Baku' : 'Produk Jadi',
          i.stock,
          i.minStock,
          i.unit,
          i.costPerUnit,
          Math.round(i.stock * i.costPerUnit),
        ]),
      };
    }

    if (reportType === 'employees') {
      return {
        title: 'Laporan Karyawan & Jam Kerja Absensi',
        subtitle: `${selectedOutletName} · ${dateRange.startDate} s.d. ${dateRange.endDate}`,
        summaryItems: [
          { label: 'Total Karyawan', value: formatNumberID(filteredEmployees.length) },
          {
            label: 'Karyawan Aktif',
            value: formatNumberID(filteredEmployees.filter((e) => e.status === 'active').length),
          },
          {
            label: 'Catatan Absensi',
            value: formatNumberID(attendance.filter((a) => matchOutlet(a.outletId) && inRange(a.date)).length),
          },
        ],
        headers: ['Nama Karyawan', 'Jabatan', 'Peran', 'Outlet', 'Total Absen', 'Total Jam Kerja'],
        rows: filteredEmployees.map((emp) => {
          const empAtt = attendance.filter(
            (a) => a.employeeId === emp.id && inRange(a.date)
          );
          const hours = empAtt.reduce((s, a) => s + (a.hoursWorked || 0), 0);
          const outletName = outlets.find((o) => o.id === emp.outletId)?.name || '-';
          return [emp.name, emp.position, emp.role, outletName, empAtt.length, Number(hours.toFixed(2))];
        }),
      };
    }

    if (reportType === 'expenses') {
      return {
        title: 'Laporan Pengeluaran Operasional',
        subtitle: `${selectedOutletName} · ${dateRange.startDate} s.d. ${dateRange.endDate}`,
        summaryItems: [
          { label: 'Total Pengeluaran', value: formatIDR(metrics.totalExpenses) },
          { label: 'Jumlah Catatan', value: formatNumberID(filteredExpenses.length) },
          { label: 'Kategori Terbesar', value: metrics.expenseByCategory[0]?.category || '-' },
        ],
        headers: ['Tanggal', 'Kategori', 'Deskripsi', 'Metode', 'Nominal (IDR)'],
        rows: filteredExpenses.map((e) => [
          e.expenseDate,
          e.category,
          e.description,
          e.paymentMethod || 'Tunai',
          e.amount,
        ]),
      };
    }

    if (reportType === 'profitability') {
      return {
        title: 'Laporan Profitabilitas (Aktual vs Estimasi HPP)',
        subtitle: `${selectedOutletName} · ${dateRange.startDate} s.d. ${dateRange.endDate}`,
        summaryItems: [
          { label: 'Pendapatan Aktual', value: formatIDR(metrics.totalRevenue) },
          { label: 'Estimasi Laba Kotor', value: formatIDR(metrics.estimatedGrossProfit) },
          { label: 'Estimasi Laba Bersih', value: formatIDR(metrics.estimatedNetProfit) },
        ],
        headers: ['Komponen Laporan', 'Kategori', 'Nilai (IDR)', 'Persentase thd Pendapatan'],
        rows: [
          ['Pendapatan Penjualan Selesai', 'Aktual', Math.round(metrics.totalRevenue), '100.0%'],
          [
            'Harga Pokok Penjualan (Resep)',
            'Estimasi HPP',
            Math.round(metrics.estimatedCogs),
            metrics.totalRevenue > 0 ? `${((metrics.estimatedCogs / metrics.totalRevenue) * 100).toFixed(1)}%` : '0.0%',
          ],
          ['Laba Kotor (Gross Profit)', 'Estimasi', Math.round(metrics.estimatedGrossProfit), `${metrics.grossMarginPercent.toFixed(1)}%`],
          [
            'Total Pengeluaran Operasional',
            'Aktual Tercatat',
            Math.round(metrics.totalExpenses),
            metrics.totalRevenue > 0 ? `${((metrics.totalExpenses / metrics.totalRevenue) * 100).toFixed(1)}%` : '0.0%',
          ],
          [
            'Laba Bersih Operasional (Net Profit)',
            'Estimasi',
            Math.round(metrics.estimatedNetProfit),
            metrics.totalRevenue > 0 ? `${((metrics.estimatedNetProfit / metrics.totalRevenue) * 100).toFixed(1)}%` : '0.0%',
          ],
        ],
      };
    }

    // CCTV Sample Report
    return {
      title: 'Laporan Analitik CCTV & Okupansi (Data Sampel / Demo)',
      subtitle: `${selectedOutletName} · Simulasi kapabilitas analitik Computer Vision`,
      summaryItems: [
        { label: 'Okupansi Rata-rata (Demo)', value: '64%' },
        { label: 'Rata-rata Dwell Time (Demo)', value: '55 menit' },
        { label: 'Perputaran Meja (Demo)', value: '3,3x / hari' },
      ],
      headers: ['Zona Area (Sampel Demo)', 'Kapasitas Kursi', 'Terisi', 'Okupansi (%)', 'Dwell Time (Mnt)', 'Turnover/Hari'],
      rows: [
        ['Meja Bar & Window (M1–M4)', 12, 11, '92%', 38, '6.2x'],
        ['Area Kerja Indoor (M5–M10)', 20, 17, '85%', 84, '3.1x'],
        ['Teras Outdoor Utara (M11–M14)', 16, 6, '38%', 45, '2.4x'],
        ['Sudut Lounge Belakang (M15–M16)', 8, 2, '25%', 52, '1.5x'],
      ],
    };
  }, [
    reportType,
    selectedOutletName,
    dateRange,
    metrics,
    filteredTx,
    filteredIngredients,
    filteredEmployees,
    filteredExpenses,
    attendance,
    outlets,
  ]);

  const handleExportCsv = () => {
    const filename = `EzFlow_${reportType}_${dateRange.startDate}_${dateRange.endDate}.csv`;
    exportToCsv(filename, reportData.headers, reportData.rows);
    showToast(`File ${filename} berhasil diunduh.`, 'success');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Controls Toolbar (hidden on print) */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <FileBarChart className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Pusat Laporan & Ekspor Data</h2>
              <p className="text-xs text-slate-500">Pilih jenis laporan, rentang tanggal, lalu ekspor ke CSV atau PDF/Cetak.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activeOutletId}
              onChange={(e) => setActiveOutletId(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white"
            >
              <option value="ALL">Semua Outlet ({activeOutlets.length})</option>
              {activeOutlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
            >
              <Download className="w-4 h-4" />
              Ekspor CSV
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
            >
              <Printer className="w-4 h-4" />
              Cetak / PDF
            </button>
          </div>
        </div>

        {/* Report Type Selector + Date Filter */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap gap-1.5">
            {REPORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setReportType(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  reportType === opt.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs font-medium">
              {(
                [
                  { key: 'today', label: 'Hari Ini' },
                  { key: '7d', label: '7 Hari' },
                  { key: '30d', label: '30 Hari' },
                  { key: 'custom', label: 'Kustom' },
                ] as const
              ).map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setDateFilter(b.key)}
                  className={`px-2.5 py-1 rounded-md ${
                    dateFilter === b.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {dateFilter === 'custom' && (
              <div className="flex items-center gap-1.5 text-xs">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded-lg"
                />
                <span>–</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded-lg"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Printable Report Surface */}
      <div className="print-area bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
              {activeBusiness?.name || 'EzFlow'} · Laporan Resmi Operasional
            </p>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5">{reportData.title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{reportData.subtitle}</p>
          </div>
          <p className="text-xs text-slate-400 tabular-nums">
            Dicetak: {getMakassarDateString(new Date())}
          </p>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {reportData.summaryItems.map((item) => (
            <div key={item.label} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="text-lg font-bold text-slate-900 tabular-nums mt-1">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Data Table */}
        {reportData.rows.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            Tidak ada data yang tersedia untuk laporan dan periode terpilih.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  {reportData.headers.map((h) => (
                    <th key={h} className="py-2.5 px-3 first:pl-0 last:pr-0 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50">
                    {row.map((cell, cIdx) => {
                      const header = reportData.headers[cIdx] || '';
                      const isIdr = header.includes('(IDR)');
                      const isNumeric = typeof cell === 'number';
                      return (
                        <td
                          key={cIdx}
                          className={`py-2.5 px-3 first:pl-0 last:pr-0 text-slate-800 ${
                            isNumeric ? 'tabular-nums font-medium' : ''
                          }`}
                        >
                          {isIdr && isNumeric ? formatIDR(cell) : isNumeric ? formatNumberID(cell) : String(cell)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
