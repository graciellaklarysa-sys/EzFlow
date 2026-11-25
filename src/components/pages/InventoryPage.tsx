import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownUp, Plus, Search, Truck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusinessData } from '../../context/BusinessDataContext';
import { formatAppError } from '../../lib/firebase';
import { formatDateTimeID, formatIDR, formatNumberID } from '../../lib/format';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import type { Ingredient, Supplier } from '../../types/ezflow';

export function InventoryPage() {
  const { activeOutletId } = useAuth();
  const {
    outlets,
    ingredients,
    suppliers,
    purchases,
    stockMovements,
    saveIngredient,
    saveSupplier,
    recordPurchaseAndStockIn,
    adjustIngredientStock,
  } = useBusinessData();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'stock' | 'movements' | 'purchases' | 'suppliers'>('stock');
  const [search, setSearch] = useState('');
  const [filterAlert, setFilterAlert] = useState<'all' | 'low'>('all');

  // Ingredient Modal
  const [ingModalOpen, setIngModalOpen] = useState(false);
  const [editingIng, setEditingIng] = useState<Ingredient | null>(null);
  const [ingName, setIngName] = useState('');
  const [ingType, setIngType] = useState<'raw_material' | 'finished_good'>('raw_material');
  const [ingUnit, setIngUnit] = useState('gram');
  const [ingStock, setIngStock] = useState(0);
  const [ingMinStock, setIngMinStock] = useState(100);
  const [ingCost, setIngCost] = useState(0);
  const [ingOutletId, setIngOutletId] = useState('');
  const [ingSupplierId, setIngSupplierId] = useState('');

  // Stock-In Purchase Modal
  const [purchaseModalIng, setPurchaseModalIng] = useState<Ingredient | null>(null);
  const [purSupplierId, setPurSupplierId] = useState('');
  const [purQty, setPurQty] = useState(0);
  const [purTotalCost, setPurTotalCost] = useState(0);
  const [purRecordExp, setPurRecordExp] = useState(true);

  // Adjustment Modal
  const [adjModalIng, setAdjModalIng] = useState<Ingredient | null>(null);
  const [adjType, setAdjType] = useState<'adjustment' | 'waste'>('adjustment');
  const [adjDelta, setAdjDelta] = useState(0);
  const [adjReason, setAdjReason] = useState('');

  // Supplier Modal
  const [supModalOpen, setSupModalOpen] = useState(false);
  const [editingSup, setEditingSup] = useState<Supplier | null>(null);
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supAddress, setSupAddress] = useState('');

  const [busy, setBusy] = useState(false);
  const activeOutlets = outlets.filter((o) => !o.isArchived);

  const visibleIngredients = useMemo(() => {
    return ingredients.filter((i) => {
      if (activeOutletId !== 'ALL' && i.outletId !== activeOutletId) return false;
      if (filterAlert === 'low' && i.stock > i.minStock) return false;
      if (search.trim() && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [ingredients, activeOutletId, filterAlert, search]);

  // Consumption velocity over last 14 days for restock recommendation
  const consumptionMap = useMemo(() => {
    const map = new Map<string, number>();
    const cutoff = Date.now() - 14 * 86400000;
    for (const m of stockMovements) {
      if (activeOutletId !== 'ALL' && m.outletId !== activeOutletId) continue;
      if (m.movementType === 'sale_deduction' && new Date(m.occurredAt).getTime() >= cutoff) {
        map.set(m.ingredientId, (map.get(m.ingredientId) || 0) + Math.abs(m.quantityDelta));
      }
    }
    return map;
  }, [stockMovements, activeOutletId]);

  const filteredMovements = useMemo(
    () => stockMovements.filter((m) => activeOutletId === 'ALL' || m.outletId === activeOutletId),
    [stockMovements, activeOutletId]
  );

  const filteredPurchases = useMemo(
    () => purchases.filter((p) => activeOutletId === 'ALL' || p.outletId === activeOutletId),
    [purchases, activeOutletId]
  );

  const totalValuation = visibleIngredients.reduce((s, i) => s + i.stock * i.costPerUnit, 0);
  const lowCount = visibleIngredients.filter((i) => i.stock <= i.minStock).length;

  const openIngModal = (ing?: Ingredient) => {
    if (ing) {
      setEditingIng(ing);
      setIngName(ing.name);
      setIngType(ing.itemType);
      setIngUnit(ing.unit);
      setIngStock(ing.stock);
      setIngMinStock(ing.minStock);
      setIngCost(ing.costPerUnit);
      setIngOutletId(ing.outletId);
      setIngSupplierId(ing.supplierId || '');
    } else {
      setEditingIng(null);
      setIngName('');
      setIngType('raw_material');
      setIngUnit('gram');
      setIngStock(0);
      setIngMinStock(100);
      setIngCost(0);
      setIngOutletId(activeOutletId !== 'ALL' ? activeOutletId : activeOutlets[0]?.id || '');
      setIngSupplierId(suppliers[0]?.id || '');
    }
    setIngModalOpen(true);
  };

  const handleSaveIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingName.trim() || !ingOutletId) {
      showToast('Nama bahan dan outlet wajib diisi.', 'error');
      return;
    }
    setBusy(true);
    try {
      await saveIngredient(
        {
          outletId: ingOutletId,
          name: ingName,
          itemType: ingType,
          unit: ingUnit,
          stock: Math.max(0, ingStock),
          minStock: Math.max(0, ingMinStock),
          costPerUnit: Math.max(0, ingCost),
          supplierId: ingSupplierId,
        },
        editingIng?.id
      );
      showToast(editingIng ? 'Data bahan baku diperbarui.' : 'Bahan baku baru ditambahkan.', 'success');
      setIngModalOpen(false);
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menyimpan bahan baku.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseModalIng || purQty <= 0) {
      showToast('Jumlah stok masuk harus lebih dari 0.', 'error');
      return;
    }
    setBusy(true);
    try {
      const sup = suppliers.find((s) => s.id === purSupplierId);
      await recordPurchaseAndStockIn({
        ingredient: purchaseModalIng,
        supplier: sup,
        quantity: purQty,
        totalCost: Math.max(0, purTotalCost),
        recordExpense: purRecordExp,
      });
      showToast(`Stok masuk ${purQty} ${purchaseModalIng.unit} berhasil dicatat.`, 'success');
      setPurchaseModalIng(null);
    } catch (err) {
      showToast(formatAppError(err, 'Gagal mencatat stok masuk.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjModalIng || adjDelta === 0) {
      showToast('Nilai penyesuaian tidak boleh 0.', 'error');
      return;
    }
    setBusy(true);
    try {
      await adjustIngredientStock({
        ingredient: adjModalIng,
        delta: adjDelta,
        movementType: adjType,
        reason: adjReason,
      });
      showToast('Penyesuaian stok berhasil disimpan.', 'success');
      setAdjModalIng(null);
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menyesuaikan stok.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const openSupModal = (sup?: Supplier) => {
    if (sup) {
      setEditingSup(sup);
      setSupName(sup.name);
      setSupContact(sup.contactName || '');
      setSupPhone(sup.phone || '');
      setSupEmail(sup.email || '');
      setSupAddress(sup.address || '');
    } else {
      setEditingSup(null);
      setSupName('');
      setSupContact('');
      setSupPhone('');
      setSupEmail('');
      setSupAddress('');
    }
    setSupModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim()) {
      showToast('Nama pemasok wajib diisi.', 'error');
      return;
    }
    setBusy(true);
    try {
      await saveSupplier(
        {
          name: supName,
          contactName: supContact,
          phone: supPhone,
          email: supEmail,
          address: supAddress,
        },
        editingSup?.id
      );
      showToast('Data pemasok disimpan.', 'success');
      setSupModalOpen(false);
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menyimpan pemasok.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Item Inventaris</p>
          <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">{visibleIngredients.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Valuasi Persediaan (Harga Beli)</p>
          <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">{formatIDR(totalValuation)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Perlu Restock Segera</p>
          <p className={`text-xl font-bold tabular-nums mt-1 ${lowCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {lowCount} item
          </p>
        </div>
      </div>

      {/* Navigation & Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-lg text-xs font-medium">
          {[
            { id: 'stock', label: 'Stok Bahan & Produk' },
            { id: 'movements', label: 'Riwayat Pergerakan' },
            { id: 'purchases', label: 'Pembelian Stok Masuk' },
            { id: 'suppliers', label: 'Pemasok' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                tab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {tab === 'suppliers' ? (
            <button
              type="button"
              onClick={() => openSupModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Tambah Pemasok
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openIngModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Tambah Bahan / Item
            </button>
          )}
        </div>
      </div>

      {/* Tab Content */}
      {tab === 'stock' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari bahan baku..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
              />
            </div>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setFilterAlert('all')}
                className={`px-3 py-1.5 rounded-lg border font-medium ${
                  filterAlert === 'all' ? 'bg-blue-50 border-blue-600 text-blue-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                Semua Item
              </button>
              <button
                type="button"
                onClick={() => setFilterAlert('low')}
                className={`px-3 py-1.5 rounded-lg border font-medium ${
                  filterAlert === 'low' ? 'bg-amber-50 border-amber-500 text-amber-800' : 'border-slate-200 text-slate-600'
                }`}
              >
                Stok Menipis / Habis ({lowCount})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">Nama Item</th>
                  <th className="py-2.5 px-3 font-medium">Outlet</th>
                  <th className="py-2.5 px-3 font-medium text-right">Stok Saat Ini</th>
                  <th className="py-2.5 px-3 font-medium text-right">Min. Batas</th>
                  <th className="py-2.5 px-3 font-medium text-right">Harga/Unit</th>
                  <th className="py-2.5 px-3 font-medium text-right">Rekomendasi Restock</th>
                  <th className="py-2.5 pl-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleIngredients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                      Belum ada bahan baku tercatat. Klik &ldquo;Tambah Bahan / Item&rdquo; untuk memulai.
                    </td>
                  </tr>
                ) : (
                  visibleIngredients.map((ing) => {
                    const isOut = ing.stock <= 0;
                    const isLow = ing.stock > 0 && ing.stock <= ing.minStock;
                    const outletName = outlets.find((o) => o.id === ing.outletId)?.name || '-';
                    const used14d = consumptionMap.get(ing.id) || 0;
                    const suggestedRestock =
                      ing.stock <= ing.minStock ? Math.max(ing.minStock * 2 - ing.stock, used14d) : 0;

                    return (
                      <tr key={ing.id} className="hover:bg-slate-50">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            {(isOut || isLow) && (
                              <AlertTriangle className={`w-4 h-4 shrink-0 ${isOut ? 'text-red-600' : 'text-amber-600'}`} />
                            )}
                            <div>
                              <p className="font-semibold text-slate-900">{ing.name}</p>
                              <p className="text-[11px] text-slate-400">
                                {ing.itemType === 'raw_material' ? 'Bahan Baku' : 'Produk Jadi'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600">{outletName}</td>
                        <td
                          className={`py-3 px-3 text-right font-semibold tabular-nums ${
                            isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-slate-900'
                          }`}
                        >
                          {formatNumberID(ing.stock)} {ing.unit}
                        </td>
                        <td className="py-3 px-3 text-right text-xs text-slate-500 tabular-nums">
                          {formatNumberID(ing.minStock)} {ing.unit}
                        </td>
                        <td className="py-3 px-3 text-right text-xs text-slate-700 tabular-nums">
                          {formatIDR(ing.costPerUnit)}
                        </td>
                        <td className="py-3 px-3 text-right text-xs tabular-nums">
                          {suggestedRestock > 0 ? (
                            <span className="font-semibold text-amber-700">
                              +{formatNumberID(Math.ceil(suggestedRestock))} {ing.unit}
                            </span>
                          ) : (
                            <span className="text-slate-400">Aman</span>
                          )}
                        </td>
                        <td className="py-3 pl-3 text-right space-x-2 whitespace-nowrap text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setPurchaseModalIng(ing);
                              setPurSupplierId(ing.supplierId || suppliers[0]?.id || '');
                              setPurQty(Math.max(1, ing.minStock));
                              setPurTotalCost(Math.max(0, ing.minStock * ing.costPerUnit));
                            }}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            Stok Masuk
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAdjModalIng(ing);
                              setAdjType('adjustment');
                              setAdjDelta(0);
                              setAdjReason('');
                            }}
                            className="font-medium text-slate-600 hover:underline"
                          >
                            Sesuaikan
                          </button>
                          <button
                            type="button"
                            onClick={() => openIngModal(ing)}
                            className="font-medium text-slate-600 hover:underline"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'movements' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <ArrowDownUp className="w-4 h-4 text-blue-600" />
            Riwayat Pergerakan Stok
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2.5 pr-4 font-medium">Waktu</th>
                <th className="py-2.5 px-3 font-medium">Bahan / Item</th>
                <th className="py-2.5 px-3 font-medium">Jenis</th>
                <th className="py-2.5 px-3 font-medium text-right">Perubahan</th>
                <th className="py-2.5 px-3 font-medium">Keterangan</th>
                <th className="py-2.5 pl-3 font-medium">Petugas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                    Belum ada pergerakan stok tercatat.
                  </td>
                </tr>
              ) : (
                filteredMovements.slice(0, 100).map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 text-xs">
                    <td className="py-2.5 pr-4 text-slate-500 tabular-nums">{formatDateTimeID(m.occurredAt)}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{m.ingredientName}</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {m.movementType === 'sale_deduction'
                        ? 'Pemotongan POS'
                        : m.movementType === 'purchase_in'
                          ? 'Stok Masuk'
                          : m.movementType === 'refund_restore'
                            ? 'Pengembalian Refund'
                            : m.movementType === 'waste'
                              ? 'Susut / Rusak'
                              : 'Penyesuaian'}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-semibold tabular-nums ${
                        m.quantityDelta >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {m.quantityDelta >= 0 ? `+${formatNumberID(m.quantityDelta)}` : formatNumberID(m.quantityDelta)}{' '}
                      {m.unit}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{m.reason || '-'}</td>
                    <td className="py-2.5 pl-3 text-slate-600">{m.userName || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'purchases' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Catatan Pembelian Restock</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2.5 pr-4 font-medium">Tanggal</th>
                <th className="py-2.5 px-3 font-medium">Bahan</th>
                <th className="py-2.5 px-3 font-medium">Pemasok</th>
                <th className="py-2.5 px-3 font-medium text-right">Jumlah</th>
                <th className="py-2.5 pl-3 font-medium text-right">Total Biaya</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                    Belum ada riwayat pembelian. Gunakan tombol &ldquo;Stok Masuk&rdquo; pada daftar bahan.
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 text-xs">
                    <td className="py-2.5 pr-4 text-slate-500 tabular-nums">{formatDateTimeID(p.purchasedAt)}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{p.ingredientName}</td>
                    <td className="py-2.5 px-3 text-slate-600">{p.supplierName || '-'}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-800">{formatNumberID(p.quantity)}</td>
                    <td className="py-2.5 pl-3 text-right font-semibold tabular-nums text-slate-900">
                      {formatIDR(p.totalCost)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'suppliers' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          {suppliers.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">Belum ada pemasok terdaftar.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suppliers.map((sup) => (
                <div key={sup.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-blue-600 shrink-0" />
                      <h4 className="text-sm font-semibold text-slate-900">{sup.name}</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => openSupModal(sup)}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="text-xs text-slate-600">Kontak: {sup.contactName || '-'}</p>
                  <p className="text-xs text-slate-500 tabular-nums">{sup.phone || '-'} · {sup.email || '-'}</p>
                  <p className="text-xs text-slate-500">{sup.address || '-'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ingredient Create/Edit Modal */}
      <Modal
        open={ingModalOpen}
        onClose={() => setIngModalOpen(false)}
        title={editingIng ? 'Edit Bahan / Item Inventaris' : 'Tambah Bahan / Item Inventaris'}
      >
        <form onSubmit={handleSaveIngredient} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Nama Bahan / Produk *</label>
            <input
              type="text"
              required
              value={ingName}
              onChange={(e) => setIngName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Outlet *</label>
              <select
                value={ingOutletId}
                onChange={(e) => setIngOutletId(e.target.value)}
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
              <label className="block font-medium text-slate-700 mb-1">Jenis Item</label>
              <select
                value={ingType}
                onChange={(e) => setIngType(e.target.value as 'raw_material' | 'finished_good')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="raw_material">Bahan Baku</option>
                <option value="finished_good">Produk Jadi</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Satuan *</label>
              <select
                value={ingUnit}
                onChange={(e) => setIngUnit(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="gram">gram</option>
                <option value="ml">ml</option>
                <option value="unit">unit</option>
                <option value="pcs">pcs</option>
                <option value="kg">kg</option>
                <option value="liter">liter</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Stok Awal</label>
              <input
                type="number"
                min={0}
                step="any"
                value={ingStock}
                onChange={(e) => setIngStock(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Batas Minimum</label>
              <input
                type="number"
                min={0}
                step="any"
                value={ingMinStock}
                onChange={(e) => setIngMinStock(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Harga Modal per Satuan (Rp)</label>
              <input
                type="number"
                min={0}
                value={ingCost}
                onChange={(e) => setIngCost(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Pemasok Utama</label>
              <select
                value={ingSupplierId}
                onChange={(e) => setIngSupplierId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="">-- Opsional --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIngModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg">
              Batal
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg">
              {busy ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Purchase Stock-In Modal */}
      <Modal
        open={Boolean(purchaseModalIng)}
        onClose={() => setPurchaseModalIng(null)}
        title="Catat Pembelian / Stok Masuk"
        subtitle={purchaseModalIng?.name}
      >
        {purchaseModalIng && (
          <form onSubmit={handleConfirmPurchase} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Pemasok</label>
              <select
                value={purSupplierId}
                onChange={(e) => setPurSupplierId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Pembelian Langsung</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Jumlah Masuk ({purchaseModalIng.unit})</label>
                <input
                  type="number"
                  min={0.1}
                  step="any"
                  required
                  value={purQty}
                  onChange={(e) => setPurQty(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Total Biaya Pembelian (Rp)</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={purTotalCost}
                  onChange={(e) => setPurTotalCost(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={purRecordExp}
                onChange={(e) => setPurRecordExp(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Catat otomatis ke Pengeluaran Keuangan (kategori Bahan Baku)</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPurchaseModalIng(null)} className="px-4 py-2 border border-slate-300 rounded-lg">
                Batal
              </button>
              <button type="submit" disabled={busy} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg">
                {busy ? 'Memproses...' : 'Simpan Stok Masuk'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Stock Adjustment Modal */}
      <Modal
        open={Boolean(adjModalIng)}
        onClose={() => setAdjModalIng(null)}
        title="Penyesuaian Stok Manual"
        subtitle={adjModalIng ? `${adjModalIng.name} (Saat ini: ${adjModalIng.stock} ${adjModalIng.unit})` : ''}
      >
        {adjModalIng && (
          <form onSubmit={handleConfirmAdjustment} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Jenis Penyesuaian</label>
              <select
                value={adjType}
                onChange={(e) => setAdjType(e.target.value as 'adjustment' | 'waste')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="adjustment">Stock Opname / Koreksi (+/-)</option>
                <option value="waste">Barang Rusak / Terbuang (-)</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Perubahan Jumlah ({adjModalIng.unit}) — gunakan angka negatif untuk pengurangan
              </label>
              <input
                type="number"
                step="any"
                required
                value={adjDelta}
                onChange={(e) => setAdjDelta(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Alasan *</label>
              <input
                type="text"
                required
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                placeholder="Contoh: Selisih stock opname sore"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAdjModalIng(null)} className="px-4 py-2 border border-slate-300 rounded-lg">
                Batal
              </button>
              <button type="submit" disabled={busy} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg">
                {busy ? 'Menyimpan...' : 'Simpan Penyesuaian'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Supplier Modal */}
      <Modal
        open={supModalOpen}
        onClose={() => setSupModalOpen(false)}
        title={editingSup ? 'Edit Pemasok' : 'Tambah Pemasok'}
      >
        <form onSubmit={handleSaveSupplier} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Nama Perusahaan Pemasok *</label>
            <input
              type="text"
              required
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Nama Kontak</label>
              <input
                type="text"
                value={supContact}
                onChange={(e) => setSupContact(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Nomor Telepon</label>
              <input
                type="text"
                value={supPhone}
                onChange={(e) => setSupPhone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={supEmail}
              onChange={(e) => setSupEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Alamat</label>
            <input
              type="text"
              value={supAddress}
              onChange={(e) => setSupAddress(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setSupModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg">
              Batal
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg">
              {busy ? 'Menyimpan...' : 'Simpan Pemasok'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
