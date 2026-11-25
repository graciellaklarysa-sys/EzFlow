import React, { useMemo, useRef, useState } from 'react';
import { Archive, Edit2, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusinessData } from '../../context/BusinessDataContext';
import { formatAppError } from '../../lib/firebase';
import { formatIDR } from '../../lib/format';
import { resolveIngredientForOutlet } from '../../lib/posStock';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { ImageWithFallback } from '../ui/ImageWithFallback';
import type { Product, RecipeItem } from '../../types/ezflow';

const PRESET_IMAGES = [
  { label: 'Tanpa Foto', url: '' },
  { label: 'Kopi Susu Gula Aren', url: '/src/assets/images/menu_kopi_susu_1795496136547.jpg' },
  { label: 'Café Latte', url: '/src/assets/images/menu_cafe_latte_1795496136727.jpg' },
  { label: 'Matcha Latte', url: '/src/assets/images/menu_matcha_latte_1795496136795.jpg' },
  { label: 'Butter Croissant', url: '/src/assets/images/menu_butter_croissant_1795496137255.jpg' },
  { label: 'Chicken Sandwich', url: '/src/assets/images/menu_chicken_sandwich_1795496137915.jpg' },
];

export function MenuPage() {
  const { activeOutletId, getIdToken } = useAuth();
  const { categories, products, ingredients, currentMemberRole, saveCategory, saveProduct } = useBusinessData();
  const { showToast } = useToast();

  const canManage = ['SUPER_ADMIN', 'OWNER', 'MANAGER'].includes(currentMemberRole);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [showArchived, setShowArchived] = useState(false);

  // Category Modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catName, setCatName] = useState('');

  // Product Modal
  const [prodModalOpen, setProdModalOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState(0);
  const [manualCogs, setManualCogs] = useState(0);
  const [imageUrl, setImageUrl] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Deduplicate ingredients by normalized name (preferring the active outlet's ingredient) for clean recipe selection
  const uniqueIngredients = useMemo(() => {
    const map = new Map<string, (typeof ingredients)[0]>();
    for (const ing of ingredients) {
      const key = ing.name.trim().toLowerCase() || ing.id;
      const existing = map.get(key);
      if (
        !existing ||
        (activeOutletId !== 'ALL' && ing.outletId === activeOutletId && existing.outletId !== activeOutletId)
      ) {
        map.set(key, ing);
      }
    }
    return Array.from(map.values());
  }, [ingredients, activeOutletId]);

  const recipeCalculatedCogs = useMemo(() => {
    return recipe.reduce((sum, r) => {
      const ing =
        resolveIngredientForOutlet(ingredients, r, activeOutletId) ||
        ingredients.find((i) => i.id === r.ingredientId);
      return sum + (ing?.costPerUnit || 0) * r.quantity;
    }, 0);
  }, [recipe, ingredients, activeOutletId]);

  const effectiveCogs = recipe.length > 0 ? Math.round(recipeCalculatedCogs) : manualCogs;

  const visibleProducts = products.filter((p) => {
    if (!showArchived && p.isArchived) return false;
    if (showArchived && !p.isArchived) return false;
    if (selectedCategory !== 'ALL' && p.categoryId !== selectedCategory) return false;
    if (search.trim() && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openProductModal = (prod?: Product) => {
    if (prod) {
      setEditingProd(prod);
      setName(prod.name);
      setCategoryId(prod.categoryId);
      setPrice(prod.price);
      setManualCogs(prod.cogs);
      setImageUrl(prod.imageUrl || '');
      setIsAvailable(prod.isAvailable);
      setRecipe(prod.recipe || []);
    } else {
      setEditingProd(null);
      setName('');
      setCategoryId(categories[0]?.id || '');
      setPrice(25000);
      setManualCogs(8000);
      setImageUrl('');
      setIsAvailable(true);
      setRecipe([]);
    }
    setProdModalOpen(true);
  };

  const handleAddRecipeRow = () => {
    const firstIng = uniqueIngredients[0];
    if (!firstIng) {
      showToast('Tambahkan bahan baku di menu Inventaris terlebih dahulu.', 'error');
      return;
    }
    setRecipe((prev) => [
      ...prev,
      { ingredientId: firstIng.id, ingredientName: firstIng.name, quantity: 1, unit: firstIng.unit },
    ]);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId) {
      showToast('Nama menu dan kategori wajib diisi.', 'error');
      return;
    }
    if (price < 0 || recipe.some((r) => r.quantity <= 0)) {
      showToast('Harga jual dan takaran bahan resep harus valid (> 0).', 'error');
      return;
    }
    setBusy(true);
    try {
      const cat = categories.find((c) => c.id === categoryId);
      await saveProduct(
        {
          name,
          categoryId,
          categoryName: cat?.name || 'Menu',
          price: Math.max(0, price),
          cogs: Math.max(0, effectiveCogs),
          imageUrl,
          recipe,
          isAvailable,
          isArchived: editingProd?.isArchived ?? false,
        },
        editingProd?.id
      );
      showToast(editingProd ? 'Menu berhasil diperbarui.' : 'Menu baru berhasil ditambahkan.', 'success');
      setProdModalOpen(false);
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menyimpan menu.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleArchive = async (prod: Product) => {
    try {
      await saveProduct(
        {
          name: prod.name,
          categoryId: prod.categoryId,
          categoryName: prod.categoryName,
          price: prod.price,
          cogs: prod.cogs,
          imageUrl: prod.imageUrl,
          recipe: prod.recipe,
          isAvailable: prod.isAvailable,
          isArchived: !prod.isArchived,
        },
        prod.id
      );
      showToast(prod.isArchived ? 'Menu dipulihkan.' : 'Menu diarsipkan.', 'info');
    } catch (err) {
      showToast(formatAppError(err, 'Gagal mengubah status arsip.'), 'error');
    }
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('Format foto tidak didukung. Gunakan file JPG, PNG, atau WebP.', 'error');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Ukuran foto maksimum adalah 5 MB.', 'error');
      e.target.value = '';
      return;
    }

    setUploadingImage(true);
    try {
      const token = await getIdToken();
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/menu/upload-image', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const json = (await res.json()) as { imageUrl?: string; error?: string };
      if (!res.ok || !json.imageUrl) {
        throw new Error(json.error || 'Gagal mengunggah foto produk.');
      }
      setImageUrl(json.imageUrl);
      showToast('Foto produk berhasil diunggah.', 'success');
    } catch (err) {
      showToast(formatAppError(err, 'Gagal mengunggah foto produk.'), 'error');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setBusy(true);
    try {
      await saveCategory(catName, categories.length + 1);
      setCatName('');
      setCatModalOpen(false);
      showToast('Kategori menu ditambahkan.', 'success');
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menambah kategori.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari produk menu..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm bg-white"
          >
            <option value="ALL">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className={`px-3 py-2 rounded-lg border text-xs font-medium ${
              showArchived ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 text-slate-600'
            }`}
          >
            {showArchived ? 'Menampilkan Arsip' : 'Lihat Arsip'}
          </button>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCatModalOpen(true)}
              className="px-3.5 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
            >
              + Kategori
            </button>
            <button
              type="button"
              onClick={() => openProductModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Tambah Menu
            </button>
          </div>
        )}
      </div>

      {/* Menu Table & Cards */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 bg-slate-50">
                <th className="py-3 px-4 font-medium">Menu</th>
                <th className="py-3 px-3 font-medium">Kategori</th>
                <th className="py-3 px-3 font-medium text-right">Harga Jual</th>
                <th className="py-3 px-3 font-medium text-right">HPP (COGS)</th>
                <th className="py-3 px-3 font-medium text-right">Laba Kotor</th>
                <th className="py-3 px-3 font-medium text-right">Margin</th>
                <th className="py-3 px-3 font-medium">Resep</th>
                <th className="py-3 px-3 font-medium">Status</th>
                {canManage && <th className="py-3 px-4 font-medium text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-xs text-slate-400">
                    Belum ada produk menu pada filter ini.
                  </td>
                </tr>
              ) : (
                visibleProducts.map((p) => {
                  const grossProfit = p.price - p.cogs;
                  const marginPct = p.price > 0 ? (grossProfit / p.price) * 100 : 0;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                            <ImageWithFallback
                              src={p.imageUrl}
                              alt={p.name}
                              categoryName={p.categoryName}
                              className="w-11 h-11 object-cover"
                            />
                          </div>
                          <span className="font-semibold text-slate-900">{p.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600">{p.categoryName || '-'}</td>
                      <td className="py-3 px-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatIDR(p.price)}
                      </td>
                      <td className="py-3 px-3 text-right text-xs tabular-nums text-slate-600">
                        {formatIDR(p.cogs)}
                      </td>
                      <td className="py-3 px-3 text-right text-xs font-semibold tabular-nums text-emerald-700">
                        {formatIDR(grossProfit)}
                      </td>
                      <td className="py-3 px-3 text-right text-xs tabular-nums">
                        <span
                          className={`font-semibold ${
                            marginPct >= 60 ? 'text-emerald-600' : marginPct >= 40 ? 'text-blue-600' : 'text-amber-600'
                          }`}
                        >
                          {marginPct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-500">
                        {p.recipe?.length ? `${p.recipe.length} bahan` : 'Tanpa resep'}
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <span className={p.isAvailable ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                          {p.isAvailable ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      {canManage && (
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                          <button
                            type="button"
                            onClick={() => openProductModal(p)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleArchive(p)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
                          >
                            <Archive className="w-3.5 h-3.5" /> {p.isArchived ? 'Pulihkan' : 'Arsip'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Modal */}
      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title="Tambah Kategori Menu">
        <form onSubmit={handleSaveCategory} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Nama Kategori *</label>
            <input
              type="text"
              required
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="Contoh: Signature Cold Brew"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCatModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg">
              Batal
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg">
              Simpan
            </button>
          </div>
        </form>
      </Modal>

      {/* Product & Recipe Builder Modal */}
      <Modal
        open={prodModalOpen}
        onClose={() => setProdModalOpen(false)}
        title={editingProd ? 'Edit Produk & Resep' : 'Tambah Produk Menu'}
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Nama Produk *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Kategori *</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Harga Jual (Rp) *</label>
              <input
                type="number"
                min={0}
                required
                value={price}
                onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                HPP / Biaya Resep (Rp) {recipe.length > 0 && '— Dihitung otomatis'}
              </label>
              <input
                type="number"
                min={0}
                disabled={recipe.length > 0}
                value={effectiveCogs}
                onChange={(e) => setManualCogs(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums disabled:bg-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div className="space-y-2">
              <label className="block font-medium text-slate-700">Foto Produk (Unggah atau Pilih Preset)</label>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 shrink-0 bg-slate-50">
                  <ImageWithFallback
                    src={imageUrl}
                    alt={name || 'Preview'}
                    categoryName={categories.find((c) => c.id === categoryId)?.name}
                    className="w-14 h-14 object-cover"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <select
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {imageUrl && !PRESET_IMAGES.some((p) => p.url === imageUrl) && (
                      <option value={imageUrl}>Foto Unggahan Kustom</option>
                    )}
                    {PRESET_IMAGES.map((img) => (
                      <option key={img.label} value={img.url}>
                        {img.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploadingImage}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingImage ? 'Mengunggah...' : 'Unggah Foto Baru'}
                    </button>
                    {imageUrl && (
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        className="text-[11px] text-slate-500 hover:text-red-600"
                      >
                        Hapus Foto
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2 pt-6 cursor-pointer">
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span className="font-medium text-slate-700">Tersedia untuk dijual di POS</span>
            </label>
          </div>

          {/* Recipe Builder */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-slate-900">Komposisi Resep (Pemotongan Stok Otomatis)</h4>
                <p className="text-[11px] text-slate-500">
                  Setiap penjualan 1 porsi di kasir akan memotong bahan-bahan berikut dari inventaris outlet.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddRecipeRow}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-100"
              >
                + Bahan
              </button>
            </div>

            {recipe.length === 0 ? (
              <p className="text-[11px] text-slate-400 py-2">Belum ada bahan resep terpasang.</p>
            ) : (
              <div className="space-y-2">
                {recipe.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={row.ingredientId}
                      onChange={(e) => {
                        const ing = uniqueIngredients.find((i) => i.id === e.target.value);
                        if (!ing) return;
                        setRecipe((prev) =>
                          prev.map((r, i) =>
                            i === idx
                              ? { ...r, ingredientId: ing.id, ingredientName: ing.name, unit: ing.unit }
                              : r
                          )
                        );
                      }}
                      className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                    >
                      {uniqueIngredients.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name} ({ing.unit})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0.01}
                      step="any"
                      value={row.quantity}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setRecipe((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, quantity: Number.isFinite(val) ? Math.max(0, val) : 0 } : r))
                        );
                      }}
                      className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white tabular-nums"
                    />
                    <span className="w-12 text-slate-600">{row.unit}</span>
                    <button
                      type="button"
                      onClick={() => setRecipe((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 flex flex-wrap justify-between gap-2 text-[11px]">
              <span className="text-slate-600">
                Estimasi Laba Kotor: <strong className="text-emerald-700">{formatIDR(price - effectiveCogs)}</strong>
              </span>
              <span className="text-slate-600">
                Margin Kotor:{' '}
                <strong className="text-blue-700">
                  {price > 0 ? (((price - effectiveCogs) / price) * 100).toFixed(1) : '0.0'}%
                </strong>
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setProdModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg">
              Batal
            </button>
            <button type="submit" disabled={busy} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg">
              {busy ? 'Menyimpan...' : 'Simpan Menu'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
