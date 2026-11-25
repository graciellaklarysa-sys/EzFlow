import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Search,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusinessData } from '../../context/BusinessDataContext';
import { formatAppError } from '../../lib/firebase';
import { computeRemainingProducibleMap, validateCartStockAvailability } from '../../lib/posStock';
import { formatDateTimeID, formatIDR } from '../../lib/format';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { ImageWithFallback } from '../ui/ImageWithFallback';
import type { PaymentMethod, Product, Transaction, TransactionStatus } from '../../types/ezflow';

interface CartLine {
  product: Product;
  quantity: number;
  notes?: string;
}

export function PosPage() {
  const { activeBusiness, activeOutletId, setActiveOutletId } = useAuth();
  const {
    outlets,
    categories,
    products,
    ingredients,
    transactions,
    checkoutPosTransaction,
    createPendingOrder,
    completePendingTransaction,
    updateTransactionStatus,
  } = useBusinessData();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'pos' | 'history'>('pos');
  const [selectedCat, setSelectedCat] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [orderNotes, setOrderNotes] = useState('');

  // Checkout Modal (supports both new cart checkout & settling a pending order)
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [settlingTx, setSettlingTx] = useState<Transaction | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Tunai');
  const [amountPaid, setAmountPaid] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Receipt & History Modals
  const [receiptTx, setReceiptTx] = useState<Transaction | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState<'ALL' | TransactionStatus>('ALL');
  const [refundTarget, setRefundTarget] = useState<{ tx: Transaction; targetStatus: 'cancelled' | 'refunded' } | null>(
    null
  );
  const [refundReason, setRefundReason] = useState('');

  const activeOutlets = outlets.filter((o) => !o.isArchived && o.isActive);
  const posOutlet =
    activeOutletId !== 'ALL'
      ? activeOutlets.find((o) => o.id === activeOutletId) || activeOutlets[0]
      : activeOutlets[0];

  // Calculate remaining additional units of each product taking shared ingredients already in cart into account
  const remainingProducibleMap = useMemo(
    () => computeRemainingProducibleMap(products, ingredients, cart, posOutlet?.id),
    [products, ingredients, cart, posOutlet]
  );

  const visibleProducts = products.filter((p) => {
    if (p.isArchived || !p.isAvailable) return false;
    if (selectedCat !== 'ALL' && p.categoryId !== selectedCat) return false;
    if (searchTerm.trim() && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const subtotal = cart.reduce((s, l) => s + l.product.price * l.quantity, 0);
  const safeDiscount = Math.max(0, Math.min(discount, subtotal));
  const taxable = Math.max(0, subtotal - safeDiscount);
  const taxPercent = activeBusiness?.taxPercent ?? 10;
  const servicePercent = activeBusiness?.serviceChargePercent ?? 5;
  const taxAmount = Math.round((taxable * taxPercent) / 100);
  const serviceAmount = Math.round((taxable * servicePercent) / 100);
  const grandTotal = taxable + taxAmount + serviceAmount;

  const addToCart = (product: Product) => {
    const existingIdx = cart.findIndex((c) => c.product.id === product.id);
    const candidateCart =
      existingIdx >= 0
        ? cart.map((c, idx) => (idx === existingIdx ? { ...c, quantity: c.quantity + 1 } : c))
        : [...cart, { product, quantity: 1 }];

    const check = validateCartStockAvailability(candidateCart, ingredients, posOutlet?.id);
    if (!check.ok) {
      showToast(check.error || `Stok bahan untuk "${product.name}" tidak mencukupi.`, 'error');
      return;
    }
    setCart(candidateCart);
  };

  const updateCartQty = (productId: string, delta: number) => {
    const target = cart.find((c) => c.product.id === productId);
    if (!target) return;
    const nextQty = target.quantity + delta;
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((c) => c.product.id !== productId));
      return;
    }
    const candidateCart = cart.map((c) => (c.product.id === productId ? { ...c, quantity: nextQty } : c));
    if (delta > 0) {
      const check = validateCartStockAvailability(candidateCart, ingredients, posOutlet?.id);
      if (!check.ok) {
        showToast(check.error || 'Stok bahan baku tidak mencukupi.', 'error');
        return;
      }
    }
    setCart(candidateCart);
  };

  const openCheckout = () => {
    if (!posOutlet) {
      showToast('Tidak ada outlet aktif yang tersedia.', 'error');
      return;
    }
    if (!cart.length) return;
    setSettlingTx(null);
    setAmountPaid(grandTotal);
    setPaymentMethod((activeBusiness?.paymentMethods?.[0] as PaymentMethod) || 'Tunai');
    setCheckoutOpen(true);
  };

  const openSettlePending = (tx: Transaction) => {
    setSettlingTx(tx);
    setAmountPaid(tx.total);
    setPaymentMethod((tx.paymentMethod as PaymentMethod) || (activeBusiness?.paymentMethods?.[0] as PaymentMethod) || 'Tunai');
    setCheckoutOpen(true);
  };

  const handleSavePendingOrder = async () => {
    if (!posOutlet || !cart.length || submitting) return;
    setSubmitting(true);
    try {
      const tx = await createPendingOrder({
        outletId: posOutlet.id,
        outletName: posOutlet.name,
        items: cart,
        discount: safeDiscount,
        taxPercent,
        serviceChargePercent: servicePercent,
        paymentMethod: (activeBusiness?.paymentMethods?.[0] as PaymentMethod) || 'Tunai',
        amountPaid: 0,
        notes: orderNotes,
      });
      setCart([]);
      setDiscount(0);
      setOrderNotes('');
      setReceiptTx(tx);
      showToast(`Pesanan tertunda ${tx.receiptNumber} disimpan (stok belum dipotong).`, 'info');
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menyimpan pesanan tertunda.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const modalTotal = settlingTx ? settlingTx.total : grandTotal;
  const modalOutletLabel = settlingTx ? settlingTx.outletName || posOutlet?.name || '-' : posOutlet?.name || '-';

  const handleConfirmPayment = async () => {
    if (submitting) return;
    if (paymentMethod === 'Tunai' && amountPaid < modalTotal) {
      showToast('Jumlah uang tunai masih kurang dari total tagihan.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (settlingTx) {
        const completed = await completePendingTransaction(
          settlingTx,
          paymentMethod,
          paymentMethod === 'Tunai' ? amountPaid : settlingTx.total,
          settlingTx.notes
        );
        setSettlingTx(null);
        setCheckoutOpen(false);
        setReceiptTx(completed);
        showToast(`Pelunasan ${completed.receiptNumber} berhasil & stok otomatis terpotong.`, 'success');
      } else {
        if (!posOutlet) return;
        const tx = await checkoutPosTransaction({
          outletId: posOutlet.id,
          outletName: posOutlet.name,
          items: cart,
          discount: safeDiscount,
          taxPercent,
          serviceChargePercent: servicePercent,
          paymentMethod,
          amountPaid: paymentMethod === 'Tunai' ? amountPaid : grandTotal,
          notes: orderNotes,
        });
        setCart([]);
        setDiscount(0);
        setOrderNotes('');
        setCheckoutOpen(false);
        setReceiptTx(tx);
        showToast(`Transaksi ${tx.receiptNumber} berhasil & stok otomatis terpotong.`, 'success');
      }
    } catch (err) {
      showToast(formatAppError(err, 'Gagal memproses transaksi.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmRefund = async () => {
    if (!refundTarget || submitting) return;
    setSubmitting(true);
    try {
      const wasCompleted = refundTarget.tx.status === 'completed';
      await updateTransactionStatus(refundTarget.tx, refundTarget.targetStatus, refundReason);
      showToast(
        wasCompleted
          ? `Transaksi ${refundTarget.tx.receiptNumber} berstatus ${
              refundTarget.targetStatus === 'refunded' ? 'Direfund' : 'Dibatalkan'
            } & stok bahan telah dikembalikan.`
          : `Pesanan tertunda ${refundTarget.tx.receiptNumber} dibatalkan.`,
        'success'
      );
      setRefundTarget(null);
      setRefundReason('');
    } catch (err) {
      showToast(formatAppError(err, 'Gagal memperbarui status transaksi.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const outletFilteredHistory = transactions.filter(
    (tx) => activeOutletId === 'ALL' || tx.outletId === activeOutletId
  );

  const filteredHistory = outletFilteredHistory.filter((tx) => {
    if (historyStatus !== 'ALL' && tx.status !== historyStatus) return false;
    if (
      historySearch.trim() &&
      !tx.receiptNumber.toLowerCase().includes(historySearch.toLowerCase()) &&
      !tx.items.some((i) => i.productName.toLowerCase().includes(historySearch.toLowerCase()))
    ) {
      return false;
    }
    return true;
  });

  const allowedMethods: PaymentMethod[] =
    activeBusiness?.paymentMethods && activeBusiness.paymentMethods.length > 0
      ? activeBusiness.paymentMethods
      : ['Tunai', 'QRIS', 'Debit', 'Transfer Bank'];

  return (
    <div className="space-y-4">
      {/* Mode Tabs & Outlet Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-medium">
          <button
            type="button"
            onClick={() => setTab('pos')}
            className={`px-3.5 py-1.5 rounded-md transition-colors ${
              tab === 'pos' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Terminal Kasir
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`px-3.5 py-1.5 rounded-md transition-colors ${
              tab === 'history' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Riwayat Transaksi ({outletFilteredHistory.length})
          </button>
        </div>

        {posOutlet && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Kasir Outlet:</span>
            <select
              value={posOutlet.id}
              onChange={(e) => setActiveOutletId(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg font-semibold text-slate-900 bg-slate-50"
            >
              {activeOutlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {tab === 'pos' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Product Catalog */}
          <div className="lg:col-span-8 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Cari menu kopi, pastry, atau makanan..."
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCat('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    selectedCat === 'ALL'
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Semua Menu
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCat(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      selectedCat === cat.id
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {visibleProducts.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                Tidak ada menu tersedia untuk filter saat ini. Tambahkan produk di Manajemen Menu.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {visibleProducts.map((product) => {
                  const maxAvail = remainingProducibleMap.get(product.id) ?? 0;
                  const inCartQty = cart.find((c) => c.product.id === product.id)?.quantity || 0;
                  const outOfStock = maxAvail <= 0;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => addToCart(product)}
                      className={`text-left bg-white border rounded-xl overflow-hidden transition-all flex flex-col ${
                        outOfStock
                          ? 'border-slate-200 opacity-60 cursor-not-allowed'
                          : 'border-slate-200 hover:border-blue-500 hover:shadow-sm cursor-pointer'
                      }`}
                    >
                      <ImageWithFallback
                        src={product.imageUrl}
                        alt={product.name}
                        categoryName={product.categoryName}
                        className="w-full h-32 object-cover"
                      />
                      <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                        <div>
                          <p className="text-[11px] text-slate-400 truncate">{product.categoryName || 'Menu'}</p>
                          <h4 className="text-sm font-semibold text-slate-900 line-clamp-2 mt-0.5">{product.name}</h4>
                        </div>
                        <div className="flex items-center justify-between gap-1 pt-1">
                          <span className="text-sm font-bold text-blue-600 tabular-nums">
                            {formatIDR(product.price)}
                          </span>
                          <span
                            className={`text-[11px] font-medium tabular-nums ${
                              outOfStock ? 'text-red-600' : maxAvail <= 10 ? 'text-amber-600' : 'text-slate-400'
                            }`}
                          >
                            {outOfStock
                              ? inCartQty > 0
                                ? 'Maks. di Keranjang'
                                : 'Stok Habis'
                              : maxAvail < 999
                                ? `Sisa ${maxAvail}`
                                : 'Tersedia'}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Cart & Calculation */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 sticky top-20 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Pesanan Saat Ini</h3>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs text-red-600 hover:underline"
                >
                  Kosongkan
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                Pilih item menu di sebelah kiri untuk memulai transaksi baru.
              </div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {cart.map((line) => (
                  <div key={line.product.id} className="pb-3 border-b border-slate-100 last:border-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">{line.product.name}</p>
                        <p className="text-[11px] text-slate-500 tabular-nums">{formatIDR(line.product.price)}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateCartQty(line.product.id, -1)}
                          className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-semibold tabular-nums">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(line.product.id, 1)}
                          className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCart((p) => p.filter((c) => c.product.id !== line.product.id))}
                          className="p-1 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Catatan item (mis. es sedikit)..."
                      value={line.notes || ''}
                      onChange={(e) =>
                        setCart((prev) =>
                          prev.map((c) => (c.product.id === line.product.id ? { ...c, notes: e.target.value } : c))
                        )
                      }
                      className="w-full px-2 py-1 text-[11px] border border-slate-200 rounded bg-slate-50"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-slate-200 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Diskon Pesanan (Rp)</label>
                <input
                  type="number"
                  min={0}
                  max={subtotal}
                  value={discount}
                  onChange={(e) => setDiscount(Math.min(subtotal, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Catatan Pesanan / Meja</label>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Contoh: Meja 4 - Dine in"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="space-y-1.5 pt-2 text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-medium">{formatIDR(subtotal)}</span>
                </div>
                {safeDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Diskon</span>
                    <span className="tabular-nums">-{formatIDR(safeDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Pajak ({taxPercent}%)</span>
                  <span className="tabular-nums">{formatIDR(taxAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Service Charge ({servicePercent}%)</span>
                  <span className="tabular-nums">{formatIDR(serviceAmount)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Total Tagihan</span>
                  <span className="tabular-nums text-blue-600">{formatIDR(grandTotal)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={cart.length === 0 || submitting}
                onClick={handleSavePendingOrder}
                className="py-2.5 px-3 border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold rounded-lg hover:bg-amber-100 disabled:opacity-40 transition-colors"
              >
                Simpan Pending
              </button>
              <button
                type="button"
                disabled={cart.length === 0 || submitting}
                onClick={openCheckout}
                className="py-2.5 px-3 bg-blue-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                Proses Pembayaran
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* TRANSACTION HISTORY */
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Cari nomor struk atau menu..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(['ALL', 'completed', 'pending', 'cancelled', 'refunded'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setHistoryStatus(st)}
                  className={`px-3 py-1.5 rounded-lg border font-medium ${
                    historyStatus === st
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {st === 'ALL'
                    ? 'Semua'
                    : st === 'completed'
                      ? 'Selesai'
                      : st === 'pending'
                        ? 'Tertunda'
                        : st === 'cancelled'
                          ? 'Dibatalkan'
                          : 'Refund'}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">No. Struk</th>
                  <th className="py-2.5 px-3 font-medium">Waktu</th>
                  <th className="py-2.5 px-3 font-medium">Outlet</th>
                  <th className="py-2.5 px-3 font-medium">Metode</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium text-right">Total</th>
                  <th className="py-2.5 pl-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                      Belum ada transaksi yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-4 font-mono text-xs font-semibold text-slate-900">
                        {tx.receiptNumber}
                        {tx.isDemo && <span className="ml-1.5 text-[10px] font-sans text-blue-600">Demo</span>}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 tabular-nums">
                        {formatDateTimeID(tx.occurredAt)}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-700">{tx.outletName || '-'}</td>
                      <td className="py-3 px-3 text-xs text-slate-700">{tx.paymentMethod}</td>
                      <td className="py-3 px-3 text-xs">
                        <span
                          className={`font-semibold ${
                            tx.status === 'completed'
                              ? 'text-emerald-600'
                              : tx.status === 'pending'
                                ? 'text-amber-600'
                                : tx.status === 'refunded'
                                  ? 'text-orange-600'
                                  : 'text-red-600'
                          }`}
                        >
                          {tx.status === 'completed'
                            ? 'Selesai'
                            : tx.status === 'refunded'
                              ? 'Refund'
                              : tx.status === 'cancelled'
                                ? 'Batal'
                                : 'Tertunda'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatIDR(tx.total)}
                      </td>
                      <td className="py-3 pl-3 text-right space-x-2.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setReceiptTx(tx)}
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          Struk
                        </button>
                        {tx.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openSettlePending(tx)}
                              className="text-xs font-semibold text-emerald-600 hover:underline"
                            >
                              Bayar
                            </button>
                            <button
                              type="button"
                              onClick={() => setRefundTarget({ tx, targetStatus: 'cancelled' })}
                              className="text-xs font-medium text-red-600 hover:underline"
                            >
                              Batalkan
                            </button>
                          </>
                        )}
                        {tx.status === 'completed' && (
                          <button
                            type="button"
                            onClick={() => setRefundTarget({ tx, targetStatus: 'refunded' })}
                            className="text-xs font-medium text-amber-600 hover:underline"
                          >
                            Refund
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
      )}

      {/* Payment Confirmation Modal */}
      <Modal
        open={checkoutOpen}
        onClose={() => {
          if (!submitting) {
            setCheckoutOpen(false);
            setSettlingTx(null);
          }
        }}
        title={settlingTx ? `Pelunasan Order ${settlingTx.receiptNumber}` : 'Konfirmasi Pembayaran'}
        subtitle={`Outlet: ${modalOutletLabel}`}
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">Total yang Harus Dibayar</span>
            <span className="text-xl font-bold text-blue-600 tabular-nums">{formatIDR(modalTotal)}</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Pilih Metode Pembayaran</label>
            <div className="grid grid-cols-2 gap-2">
              {allowedMethods.map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2.5 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                    paymentMethod === method
                      ? 'bg-blue-50 border-blue-600 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod !== 'Tunai' ? (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Pencatatan {paymentMethod} dalam mode demo — transaksi dicatat sebagai metode {paymentMethod} tanpa koneksi payment gateway aktif.
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Uang Diterima (Tunai)</label>
                <input
                  type="number"
                  min={0}
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold tabular-nums"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([modalTotal, 50000, 100000, 200000])).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmountPaid(preset)}
                    className="px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-slate-50 hover:bg-slate-100 tabular-nums"
                  >
                    {preset === modalTotal ? 'Uang Pas' : formatIDR(preset)}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs">
                <span className="font-medium text-emerald-800">Kembalian</span>
                <span className="text-sm font-bold text-emerald-700 tabular-nums">
                  {formatIDR(Math.max(0, amountPaid - modalTotal))}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setCheckoutOpen(false);
                setSettlingTx(null);
              }}
              className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirmPayment}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Memproses & Memotong Stok...' : settlingTx ? 'Lunasi & Potong Stok' : 'Selesaikan Transaksi'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Receipt Modal */}
      <Modal
        open={Boolean(receiptTx)}
        onClose={() => setReceiptTx(null)}
        title="Struk Transaksi"
        subtitle={receiptTx?.receiptNumber}
        maxWidthClass="max-w-md"
      >
        {receiptTx && (
          <div className="space-y-4 text-xs">
            <div className="text-center border-b border-dashed border-slate-300 pb-3">
              <div
                className={`inline-flex items-center gap-1.5 font-semibold mb-1 ${
                  receiptTx.status === 'completed'
                    ? 'text-emerald-600'
                    : receiptTx.status === 'pending'
                      ? 'text-amber-600'
                      : 'text-red-600'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {receiptTx.status === 'completed'
                    ? 'Pembayaran Berhasil'
                    : receiptTx.status === 'pending'
                      ? 'Pesanan Tertunda (Open Bill)'
                      : receiptTx.status === 'refunded'
                        ? 'Transaksi Direfund'
                        : 'Transaksi Dibatalkan'}
                </span>
              </div>
              <p className="text-sm font-bold text-slate-900">{activeBusiness?.name}</p>
              <p className="text-slate-500">{receiptTx.outletName}</p>
              <p className="text-slate-400 mt-1 tabular-nums">{formatDateTimeID(receiptTx.occurredAt)}</p>
              {receiptTx.notes && <p className="text-slate-500 mt-0.5">{receiptTx.notes}</p>}
            </div>

            <div className="space-y-2 border-b border-dashed border-slate-300 pb-3">
              {receiptTx.items.map((item, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">
                      {item.productName} × {item.quantity}
                    </p>
                    {item.notes && <p className="text-[11px] text-slate-400">Catatan: {item.notes}</p>}
                  </div>
                  <span className="tabular-nums font-medium text-slate-900">{formatIDR(item.lineTotal)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatIDR(receiptTx.subtotal)}</span>
              </div>
              {(receiptTx.discount || 0) > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Diskon</span>
                  <span className="tabular-nums">-{formatIDR(receiptTx.discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Pajak</span>
                <span className="tabular-nums">{formatIDR(receiptTx.taxAmount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Service Charge</span>
                <span className="tabular-nums">{formatIDR(receiptTx.serviceChargeAmount || 0)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-slate-900 pt-2 border-t border-slate-200">
                <span>Total ({receiptTx.paymentMethod})</span>
                <span className="tabular-nums">{formatIDR(receiptTx.total)}</span>
              </div>
              {receiptTx.paymentMethod === 'Tunai' && (
                <>
                  <div className="flex justify-between">
                    <span>Dibayar</span>
                    <span className="tabular-nums">{formatIDR(receiptTx.amountPaid || receiptTx.total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kembalian</span>
                    <span className="tabular-nums">{formatIDR(receiptTx.changeAmount || 0)}</span>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak Struk
              </button>
              <button
                type="button"
                onClick={() => setReceiptTx(null)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
              >
                <Receipt className="w-3.5 h-3.5" />
                Selesai
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Refund / Cancel Confirmation Modal */}
      <Modal
        open={Boolean(refundTarget)}
        onClose={() => !submitting && setRefundTarget(null)}
        title={
          refundTarget?.tx.status === 'pending'
            ? 'Konfirmasi Pembatalan Pesanan Tertunda'
            : 'Konfirmasi Refund / Pembatalan'
        }
        subtitle={refundTarget?.tx.receiptNumber}
      >
        {refundTarget && (
          <div className="space-y-4 text-xs">
            {refundTarget.tx.status === 'pending' ? (
              <p className="text-slate-600 leading-relaxed">
                Membatalkan pesanan tertunda <span className="font-semibold">{refundTarget.tx.receiptNumber}</span> senilai{' '}
                <span className="font-semibold">{formatIDR(refundTarget.tx.total)}</span> akan menutup open bill ini tanpa memotong stok bahan baku.
              </p>
            ) : (
              <>
                <p className="text-slate-600 leading-relaxed">
                  Mengubah status transaksi <span className="font-semibold">{refundTarget.tx.receiptNumber}</span> senilai{' '}
                  <span className="font-semibold">{formatIDR(refundTarget.tx.total)}</span> akan mempertahankan catatan historis serta mengembalikan bahan baku resep ke inventaris secara otomatis.
                </p>
                <div className="flex gap-2">
                  {(['refunded', 'cancelled'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setRefundTarget({ ...refundTarget, targetStatus: st })}
                      className={`flex-1 py-2 rounded-lg border font-semibold ${
                        refundTarget.targetStatus === st
                          ? 'bg-amber-50 border-amber-500 text-amber-800'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      {st === 'refunded' ? 'Refund Transaksi' : 'Batalkan Transaksi'}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                {refundTarget.tx.status === 'pending' ? 'Alasan Pembatalan' : 'Alasan Refund / Pembatalan'}
              </label>
              <input
                type="text"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Contoh: Pelanggan membatalkan pesanan"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmRefund}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {submitting
                  ? 'Memproses...'
                  : refundTarget.tx.status === 'pending'
                    ? 'Konfirmasi Pembatalan'
                    : 'Konfirmasi & Kembalikan Stok'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
