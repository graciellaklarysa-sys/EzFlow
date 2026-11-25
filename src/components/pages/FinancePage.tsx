import React, { useMemo, useState } from 'react';
import { Download, Edit2, Plus, Trash2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useBusinessData } from '../../context/BusinessDataContext';
import { formatAppError } from '../../lib/firebase';
import { exportToCsv, formatIDR, getMakassarDateString } from '../../lib/format';
import { computeBusinessMetrics, resolveDateRange, type DateFilterKey } from '../../lib/metrics';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import type { Expense } from '../../types/ezflow';

const EXPENSE_CATEGORIES = [
  'Bahan Baku',
  'Gaji & Upah',
  'Sewa Tempat',
  'Utilitas & Listrik',
  'Pemasaran',
  'Pemeliharaan',
  'Operasional Lainnya',
];

export function FinancePage() {
  const { activeOutletId } = useAuth();
  const {
    outlets,
    transactions,
    expenses,
    ingredients,
    products,
    operationalTasks,
    stockMovements,
    currentMemberRole,
    saveExpense,
    deleteExpense,
  } = useBusinessData();
  const { showToast } = useToast();
  const canDeleteExpense = ['OWNER', 'SUPER_ADMIN'].includes(currentMemberRole);

  const [dateFilter, setDateFilter] = useState<DateFilterKey>('30d');
  const [catFilter, setCatFilter] = useState('ALL');

  // Expense Modal
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [editingExp, setEditingExp] = useState<Expense | null>(null);
  const [expOutletId, setExpOutletId] = useState('');
  const [expCategory, setExpCategory] = useState('Bahan Baku');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState(0);
  const [expDate, setExpDate] = useState(() => getMakassarDateString(new Date()));
  const [expPayMethod, setExpPayMethod] = useState('Transfer Bank');

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [busy, setBusy] = useState(false);

  const activeOutlets = outlets.filter((o) => !o.isArchived);
  const dateRange = useMemo(() => resolveDateRange(dateFilter), [dateFilter]);

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

  const visibleExpenses = expenses.filter((e) => {
    if (activeOutletId !== 'ALL' && e.outletId !== activeOutletId) return false;
    if (catFilter !== 'ALL' && e.category !== catFilter) return false;
    const d = e.expenseDate.slice(0, 10);
    return d >= dateRange.startDate && d <= dateRange.endDate;
  });

  const openExpModal = (exp?: Expense) => {
    if (exp) {
      setEditingExp(exp);
      setExpOutletId(exp.outletId);
      setExpCategory(exp.category);
      setExpDesc(exp.description);
      setExpAmount(exp.amount);
      setExpDate(exp.expenseDate.slice(0, 10));
      setExpPayMethod(exp.paymentMethod || 'Transfer Bank');
    } else {
      setEditingExp(null);
      setExpOutletId(activeOutletId !== 'ALL' ? activeOutletId : activeOutlets[0]?.id || '');
      setExpCategory('Bahan Baku');
      setExpDesc('');
      setExpAmount(0);
      setExpDate(getMakassarDateString(new Date()));
      setExpPayMethod('Transfer Bank');
    }
    setExpModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expDesc.trim() || !expOutletId || expAmount <= 0) {
      showToast('Deskripsi, outlet, dan nominal (>0) wajib diisi.', 'error');
      return;
    }
    setBusy(true);
    try {
      await saveExpense(
        {
          outletId: expOutletId,
          category: expCategory,
          description: expDesc,
          amount: expAmount,
          expenseDate: expDate,
          paymentMethod: expPayMethod,
        },
        editingExp?.id
      );
      showToast(editingExp ? 'Pengeluaran diperbarui.' : 'Pengeluaran baru dicatat.', 'success');
      setExpModalOpen(false);
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menyimpan pengeluaran.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteExpense(deleteTarget);
      showToast('Pengeluaran dihapus dan dicatat ke log audit.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menghapus pengeluaran.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleExportFinanceCsv = () => {
    exportToCsv(
      `ezflow-keuangan-${dateRange.startDate}-${dateRange.endDate}.csv`,
      ['Tanggal', 'Outlet', 'Kategori', 'Deskripsi', 'Metode Bayar', 'Nominal (IDR)'],
      visibleExpenses.map((e) => [
        e.expenseDate,
        outlets.find((o) => o.id === e.outletId)?.name || e.outletId,
        e.category,
        e.description,
        e.paymentMethod || '-',
        e.amount,
      ])
    );
    showToast('Laporan pengeluaran berhasil diekspor ke CSV.', 'success');
  };

  return (
    <div className="space-y-6">
      {/* P&L Reconciliation Strip — Clearly separating Actual Revenue vs Estimated COGS vs Actual Expenses vs Net Estimate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Pendapatan Diakui (Aktual)</p>
          <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">{formatIDR(metrics.totalRevenue)}</p>
          <p className="text-[11px] text-slate-400 mt-1">{metrics.transactionCount} transaksi selesai</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">HPP / COGS Resep (Estimasi)</p>
          <p className="text-xl font-bold text-slate-800 tabular-nums mt-1">{formatIDR(metrics.estimatedCogs)}</p>
          <p className="text-[11px] text-slate-400 mt-1">Berdasarkan biaya resep produk</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Laba Kotor (Estimasi)</p>
          <p className="text-xl font-bold text-emerald-700 tabular-nums mt-1">
            {formatIDR(metrics.estimatedGrossProfit)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Margin {metrics.grossMarginPercent.toFixed(1)}%</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Pengeluaran Tercatat (Aktual)</p>
          <p className="text-xl font-bold text-amber-700 tabular-nums mt-1">{formatIDR(metrics.totalExpenses)}</p>
          <p className="text-[11px] text-slate-400 mt-1">{visibleExpenses.length} catatan biaya</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Estimasi Laba Bersih</p>
          <p
            className={`text-xl font-bold tabular-nums mt-1 ${
              metrics.estimatedNetProfit >= 0 ? 'text-blue-600' : 'text-red-600'
            }`}
          >
            {formatIDR(metrics.estimatedNetProfit)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Laba Kotor − Pengeluaran Aktual</p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-medium">
            {(
              [
                { key: 'today', label: 'Hari Ini' },
                { key: '7d', label: '7 Hari' },
                { key: '30d', label: '30 Hari' },
              ] as const
            ).map((btn) => (
              <button
                key={btn.key}
                type="button"
                onClick={() => setDateFilter(btn.key)}
                className={`px-3 py-1.5 rounded-md ${
                  dateFilter === btn.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
          >
            <option value="ALL">Semua Kategori Pengeluaran</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportFinanceCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" />
            Ekspor CSV
          </button>
          <button
            type="button"
            onClick={() => openExpModal()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Catat Pengeluaran
          </button>
        </div>
      </div>

      {/* Charts + Expense Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Komposisi Pengeluaran per Kategori</h3>
          <p className="text-xs text-slate-500 mb-4">Berdasarkan pengeluaran aktual tercatat</p>
          {metrics.expenseByCategory.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-slate-400">
              Belum ada pengeluaran pada periode ini.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.expenseByCategory} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="category"
                    tick={{ fontSize: 11, fill: '#334155' }}
                    width={110}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip formatter={(val: unknown) => formatIDR(Number(val))} />
                  <Bar dataKey="amount" fill="#D97706" radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Buku Pengeluaran Tercatat</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2.5 pr-3 font-medium">Tanggal</th>
                <th className="py-2.5 px-3 font-medium">Kategori</th>
                <th className="py-2.5 px-3 font-medium">Deskripsi</th>
                <th className="py-2.5 px-3 font-medium text-right">Nominal</th>
                <th className="py-2.5 pl-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {visibleExpenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Belum ada catatan pengeluaran untuk filter ini.
                  </td>
                </tr>
              ) : (
                visibleExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-3 tabular-nums text-slate-600">{exp.expenseDate.slice(0, 10)}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">{exp.category}</td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {exp.description}
                      {exp.isDemo && <span className="ml-1.5 text-[10px] text-blue-600">Demo</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-slate-900">
                      {formatIDR(exp.amount)}
                    </td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => openExpModal(exp)}
                        className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                      {canDeleteExpense && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(exp)}
                          className="text-red-600 hover:underline inline-flex items-center gap-0.5"
                        >
                          <Trash2 className="w-3 h-3" /> Hapus
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expense Modal */}
      <Modal
        open={expModalOpen}
        onClose={() => setExpModalOpen(false)}
        title={editingExp ? 'Edit Catatan Pengeluaran' : 'Catat Pengeluaran Baru'}
      >
        <form onSubmit={handleSaveExpense} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Outlet *</label>
              <select
                value={expOutletId}
                onChange={(e) => setExpOutletId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {activeOutlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Kategori *</label>
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Deskripsi Pengeluaran *</label>
            <input
              type="text"
              required
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              placeholder="Contoh: Pembayaran tagihan listrik PLN bulan ini"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Nominal (Rp) *</label>
              <input
                type="number"
                min={1}
                required
                value={expAmount}
                onChange={(e) => setExpAmount(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Tanggal</label>
              <input
                type="date"
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Metode Bayar</label>
              <select
                value={expPayMethod}
                onChange={(e) => setExpPayMethod(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Transfer Bank">Transfer Bank</option>
                <option value="Tunai">Tunai</option>
                <option value="QRIS">QRIS</option>
                <option value="Debit">Debit</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setExpModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg">
              Batal
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg">
              {busy ? 'Menyimpan...' : 'Simpan Pengeluaran'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Catatan Pengeluaran"
      >
        {deleteTarget && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-600">
              Yakin ingin menghapus pengeluaran <strong>{deleteTarget.description}</strong> senilai{' '}
              <strong>{formatIDR(deleteTarget.amount)}</strong>? Tindakan ini akan dicatat ke dalam riwayat audit.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="px-4 py-2 border border-slate-300 rounded-lg">
                Batal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700"
              >
                {busy ? 'Menghapus...' : 'Hapus Permanen'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
