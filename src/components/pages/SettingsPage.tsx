import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Copy,
  Edit3,
  Plus,
  Shield,
  Sliders,
  Sparkles,
  Store,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusinessData } from '../../context/BusinessDataContext';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { formatAppError } from '../../lib/firebase';
import { clampStr, formatIDR } from '../../lib/format';
import { seedEzFlowCafeDemo } from '../../lib/demoSeed';
import { computeBusinessMetrics, resolveDateRange } from '../../lib/metrics';
import type { Outlet, PaymentMethod, UserRole } from '../../types/ezflow';

type SettingsTab = 'profile' | 'outlets' | 'preferences' | 'account';

const ALL_PAYMENT_METHODS: PaymentMethod[] = ['Tunai', 'QRIS', 'Debit', 'Transfer Bank'];

export function SettingsPage() {
  const {
    firebaseUser,
    userProfile,
    activeBusiness,
    businesses,
    selectBusiness,
    activeOutletId,
    setActiveOutletId,
    effectiveRole,
  } = useAuth();
  const {
    outlets,
    employees,
    transactions,
    expenses,
    ingredients,
    products,
    operationalTasks,
    stockMovements,
    currentMemberRole,
    saveOutlet,
    updateBusinessSettings,
    inviteBusinessMemberByUid,
    updateBusinessMemberRole,
    removeBusinessMember,
  } = useBusinessData();
  const { showToast } = useToast();

  const [tab, setTab] = useState<SettingsTab>('profile');

  // Business Profile state
  const [bizName, setBizName] = useState('');
  const [bizCategory, setBizCategory] = useState('Coffee Shop');
  const [bizDesc, setBizDesc] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [bizEmail, setBizEmail] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizAddress, setBizAddress] = useState('');
  const [bizCity, setBizCity] = useState('');
  const [bizCountry, setBizCountry] = useState('Indonesia');
  const [currency, setCurrency] = useState('IDR');
  const [timezone, setTimezone] = useState('Asia/Makassar');
  const [operatingHours, setOperatingHours] = useState('07:00 - 22:00 WITA');
  const [savingProfile, setSavingProfile] = useState(false);

  // Preferences state
  const [taxPercent, setTaxPercent] = useState(10);
  const [serviceChargePercent, setServiceChargePercent] = useState(5);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(['Tunai', 'QRIS', 'Debit', 'Transfer Bank']);
  const [lowStockThreshold, setLowStockThreshold] = useState(15);
  const [openingHour, setOpeningHour] = useState('07:00');
  const [closingHour, setClosingHour] = useState('22:00');
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Outlet Modal state
  const [outletModalOpen, setOutletModalOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);
  const [oName, setOName] = useState('');
  const [oAddress, setOAddress] = useState('');
  const [oContact, setOContact] = useState('');
  const [oHours, setOHours] = useState('07:00 - 22:00 WITA');
  const [oTables, setOTables] = useState(10);
  const [oCapacity, setOCapacity] = useState(36);
  const [oActive, setOActive] = useState(true);
  const [oArchived, setOArchived] = useState(false);
  const [savingOutlet, setSavingOutlet] = useState(false);

  const [seedingDemo, setSeedingDemo] = useState(false);

  // Team Member Invitation state
  const [inviteUid, setInviteUid] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePosition, setInvitePosition] = useState('Kasir / Barista');
  const [inviteRole, setInviteRole] = useState<Exclude<UserRole, 'SUPER_ADMIN'>>('CASHIER');
  const [inviteOutletId, setInviteOutletId] = useState('');
  const [invitingMember, setInvitingMember] = useState(false);

  useEffect(() => {
    if (!inviteOutletId && outlets.length > 0) {
      setInviteOutletId(outlets[0].id);
    }
  }, [outlets, inviteOutletId]);

  useEffect(() => {
    if (!activeBusiness) return;
    setBizName(activeBusiness.name || '');
    setBizCategory(activeBusiness.category || 'Coffee Shop');
    setBizDesc(activeBusiness.description || '');
    setOwnerName(activeBusiness.ownerName || '');
    setBizEmail(activeBusiness.businessEmail || '');
    setBizPhone(activeBusiness.phone || '');
    setBizAddress(activeBusiness.address || '');
    setBizCity(activeBusiness.city || '');
    setBizCountry(activeBusiness.country || 'Indonesia');
    setCurrency(activeBusiness.currency || 'IDR');
    setTimezone(activeBusiness.timezone || 'Asia/Makassar');
    setOperatingHours(activeBusiness.operatingHours || '07:00 - 22:00 WITA');

    setTaxPercent(activeBusiness.taxPercent ?? 10);
    setServiceChargePercent(activeBusiness.serviceChargePercent ?? 5);
    setPaymentMethods(
      activeBusiness.paymentMethods?.length ? activeBusiness.paymentMethods : ['Tunai', 'QRIS']
    );
    setLowStockThreshold(activeBusiness.lowStockThreshold ?? 15);
    setOpeningHour(activeBusiness.openingHour || '07:00');
    setClosingHour(activeBusiness.closingHour || '22:00');
  }, [activeBusiness]);

  const canEditBusinessSettings = currentMemberRole === 'OWNER' || currentMemberRole === 'SUPER_ADMIN';

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bizName.trim() || !ownerName.trim()) {
      showToast('Nama bisnis dan nama pemilik wajib diisi.', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      await updateBusinessSettings({
        name: clampStr(bizName, 120),
        category: clampStr(bizCategory, 60),
        description: clampStr(bizDesc, 500),
        ownerName: clampStr(ownerName, 120),
        businessEmail: clampStr(bizEmail, 200),
        phone: clampStr(bizPhone, 40),
        address: clampStr(bizAddress, 300),
        city: clampStr(bizCity, 80),
        country: clampStr(bizCountry, 80),
        currency: clampStr(currency || 'IDR', 10),
        timezone: clampStr(timezone || 'Asia/Makassar', 60),
        operatingHours: clampStr(operatingHours, 80),
      });
      showToast('Profil bisnis berhasil diperbarui.', 'success');
    } catch (err) {
      showToast(formatAppError(err, 'Gagal memperbarui profil bisnis.'), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethods.length === 0) {
      showToast('Pilih minimal 1 metode pembayaran aktif.', 'error');
      return;
    }
    setSavingPrefs(true);
    try {
      await updateBusinessSettings({
        taxPercent: Math.max(0, Math.min(100, Number(taxPercent) || 0)),
        serviceChargePercent: Math.max(0, Math.min(100, Number(serviceChargePercent) || 0)),
        paymentMethods,
        lowStockThreshold: Math.max(0, Math.min(100000, Number(lowStockThreshold) || 0)),
        openingHour: clampStr(openingHour, 10),
        closingHour: clampStr(closingHour, 10),
      });
      showToast('Preferensi pajak & operasional berhasil disimpan.', 'success');
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menyimpan preferensi.'), 'error');
    } finally {
      setSavingPrefs(false);
    }
  };

  const openNewOutletModal = () => {
    setEditingOutlet(null);
    setOName('');
    setOAddress('');
    setOContact('');
    setOHours(activeBusiness?.operatingHours || '07:00 - 22:00 WITA');
    setOTables(10);
    setOCapacity(32);
    setOActive(true);
    setOArchived(false);
    setOutletModalOpen(true);
  };

  const openEditOutletModal = (o: Outlet) => {
    setEditingOutlet(o);
    setOName(o.name);
    setOAddress(o.address);
    setOContact(o.contactNumber || '');
    setOHours(o.operatingHours || '07:00 - 22:00 WITA');
    setOTables(o.tableCount);
    setOCapacity(o.capacity);
    setOActive(o.isActive);
    setOArchived(Boolean(o.isArchived));
    setOutletModalOpen(true);
  };

  const handleSaveOutlet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oName.trim() || !oAddress.trim()) {
      showToast('Nama dan alamat outlet wajib diisi.', 'error');
      return;
    }
    setSavingOutlet(true);
    try {
      await saveOutlet(
        {
          name: oName.trim(),
          address: oAddress.trim(),
          contactNumber: oContact.trim(),
          operatingHours: oHours.trim(),
          tableCount: Math.max(0, Math.round(Number(oTables) || 0)),
          capacity: Math.max(0, Math.round(Number(oCapacity) || 0)),
          isActive: oActive,
          isArchived: oArchived,
        },
        editingOutlet?.id
      );
      showToast(editingOutlet ? 'Data outlet diperbarui.' : 'Outlet baru berhasil ditambahkan.', 'success');
      setOutletModalOpen(false);
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menyimpan data outlet.'), 'error');
    } finally {
      setSavingOutlet(false);
    }
  };

  const togglePaymentMethod = (method: PaymentMethod) => {
    setPaymentMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    );
  };

  const handleCopyUid = async () => {
    if (!firebaseUser?.uid) return;
    try {
      await navigator.clipboard.writeText(firebaseUser.uid);
      showToast('UID akun berhasil disalin ke clipboard.', 'success');
    } catch {
      showToast(`UID Anda: ${firebaseUser.uid}`, 'info');
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUid.trim() || !inviteName.trim()) {
      showToast('Firebase UID dan nama anggota wajib diisi.', 'error');
      return;
    }
    setInvitingMember(true);
    try {
      await inviteBusinessMemberByUid({
        memberUid: inviteUid.trim(),
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        position: invitePosition.trim() || 'Staf',
        role: inviteRole,
        outletId: inviteOutletId || outlets[0]?.id || '',
      });
      setInviteUid('');
      setInviteName('');
      setInviteEmail('');
      showToast('Anggota tim berhasil ditambahkan dan hak akses diperbarui.', 'success');
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menambahkan anggota tim.'), 'error');
    } finally {
      setInvitingMember(false);
    }
  };

  const handleSeedAnotherDemo = async () => {
    if (!firebaseUser) return;
    setSeedingDemo(true);
    try {
      const res = await seedEzFlowCafeDemo({
        uid: firebaseUser.uid,
        userName: userProfile?.name || firebaseUser.displayName || 'Owner EzFlow',
        userEmail: firebaseUser.email || 'owner@ezflow.demo',
        isSuperAdmin: effectiveRole === 'SUPER_ADMIN',
      });
      await selectBusiness(res.businessId);
      showToast('Workspace demo EzFlow Café baru berhasil dibuat dan diaktifkan.', 'success');
    } catch (err) {
      showToast(formatAppError(err, 'Gagal membuat demo EzFlow Café.'), 'error');
    } finally {
      setSeedingDemo(false);
    }
  };

  const outletMetrics = computeBusinessMetrics({
    transactions,
    expenses,
    ingredients,
    products,
    tasks: operationalTasks,
    outlets,
    stockMovements,
    dateRange: resolveDateRange('30d'),
    outletId: 'ALL',
  });

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'profile', label: 'Profil Bisnis', icon: Building2 },
            { id: 'outlets', label: 'Outlet & Multi-Cabang', icon: Store },
            { id: 'preferences', label: 'Preferensi & Pajak', icon: Sliders },
            { id: 'account', label: 'Workspace, Peran & Demo', icon: Shield },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                tab === item.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* 1. PROFIL BISNIS */}
      {tab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Identitas & Profil Bisnis</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Informasi usaha ini tampil pada nota POS, laporan operasional, dan konteks asisten AI.
              </p>
            </div>
            {!canEditBusinessSettings && (
              <span className="text-xs font-medium text-amber-700">Hanya Owner / Super Admin yang dapat mengubah profil bisnis</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Bisnis</label>
              <input
                type="text"
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kategori Usaha</label>
              <select
                value={bizCategory}
                onChange={(e) => setBizCategory(e.target.value)}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-50"
              >
                <option value="Coffee Shop">Coffee Shop</option>
                <option value="Café & Resto">Café & Resto</option>
                <option value="Bakery & Pastry">Bakery & Pastry</option>
                <option value="Restoran UMKM">Restoran UMKM</option>
                <option value="Minuman Kekinian">Minuman Kekinian</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Deskripsi Usaha</label>
              <textarea
                rows={2}
                value={bizDesc}
                onChange={(e) => setBizDesc(e.target.value)}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Pemilik</label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email Bisnis</label>
              <input
                type="email"
                value={bizEmail}
                onChange={(e) => setBizEmail(e.target.value)}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nomor Telepon</label>
              <input
                type="text"
                value={bizPhone}
                onChange={(e) => setBizPhone(e.target.value)}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Jam Operasional Umum</label>
              <input
                type="text"
                value={operatingHours}
                onChange={(e) => setOperatingHours(e.target.value)}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Pusat</label>
              <input
                type="text"
                value={bizAddress}
                onChange={(e) => setBizAddress(e.target.value)}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kota / Kabupaten</label>
              <input
                type="text"
                value={bizCity}
                onChange={(e) => setBizCity(e.target.value)}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Negara</label>
              <input
                type="text"
                value={bizCountry}
                onChange={(e) => setBizCountry(e.target.value)}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Mata Uang</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-50"
              >
                <option value="IDR">IDR (Rupiah Indonesia)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Zona Waktu</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-50"
              >
                <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
              </select>
            </div>
          </div>

          {canEditBusinessSettings && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {savingProfile ? 'Menyimpan...' : 'Simpan Profil Bisnis'}
              </button>
            </div>
          )}
        </form>
      )}

      {/* 2. OUTLET & MULTI-CABANG */}
      {tab === 'outlets' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <h3 className="text-base font-bold text-slate-900">Daftar Outlet & Cabang</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kelola beberapa cabang sekaligus atau fokuskan tampilan ke salah satu outlet.
                </p>
              </div>
              {canEditBusinessSettings ? (
                <button
                  type="button"
                  onClick={openNewOutletModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Outlet Baru
                </button>
              ) : (
                <span className="text-xs text-slate-500">Pengelolaan cabang hanya untuk Pemilik (Owner)</span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {outlets.map((o) => {
                const isSelected = activeOutletId === o.id;
                return (
                  <div key={o.id} className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">{o.name}</h4>
                          <p className="text-xs text-slate-500 mt-0.5">{o.address}</p>
                        </div>
                        <span
                          className={`text-[11px] font-semibold shrink-0 ${
                            o.isArchived ? 'text-slate-400' : o.isActive ? 'text-emerald-600' : 'text-amber-600'
                          }`}
                        >
                          {o.isArchived ? 'Diarsipkan' : o.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-2.5 tabular-nums">
                        {o.tableCount} meja · Kapasitas {o.capacity} kursi · {o.operatingHours || '07:00 - 22:00'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setActiveOutletId(isSelected ? 'ALL' : o.id)}
                        className={`text-xs font-semibold ${
                          isSelected ? 'text-emerald-700' : 'text-blue-600 hover:underline'
                        }`}
                      >
                        {isSelected ? 'Fokus Outlet Ini (Klik untuk Semua)' : 'Fokuskan Outlet Ini'}
                      </button>
                      {canEditBusinessSettings && (
                        <button
                          type="button"
                          onClick={() => openEditOutletModal(o)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Ubah
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {outletMetrics.outletComparison.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h4 className="text-sm font-bold text-slate-900 mb-3">Perbandingan Kinerja Outlet (30 Hari Terakhir)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2 pr-4 font-medium">Outlet</th>
                      <th className="py-2 px-4 font-medium text-right">Transaksi</th>
                      <th className="py-2 px-4 font-medium text-right">Pendapatan</th>
                      <th className="py-2 pl-4 font-medium text-right">Pengeluaran</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {outletMetrics.outletComparison.map((row) => (
                      <tr key={row.outletId}>
                        <td className="py-2.5 pr-4 font-medium text-slate-900">{row.outletName}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums">{row.transactions}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums font-semibold">{formatIDR(row.revenue)}</td>
                        <td className="py-2.5 pl-4 text-right tabular-nums">{formatIDR(row.expenses)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. PREFERENSI & PAJAK */}
      {tab === 'preferences' && (
        <form onSubmit={handleSavePreferences} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-900">Preferensi POS, Pajak & Ambang Stok</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pengaturan ini otomatis diterapkan saat kasir memproses pembayaran dan saat memantau stok rendah.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Pajak / PB1 (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={taxPercent}
                onChange={(e) => setTaxPercent(Number(e.target.value))}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Service Charge (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={serviceChargePercent}
                onChange={(e) => setServiceChargePercent(Number(e.target.value))}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ambang Default Stok Menipis</label>
              <input
                type="number"
                min={0}
                max={100000}
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(Number(e.target.value))}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Jam Buka Standar</label>
              <input
                type="time"
                value={openingHour}
                onChange={(e) => setOpeningHour(e.target.value)}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Jam Tutup Standar</label>
              <input
                type="time"
                value={closingHour}
                onChange={(e) => setClosingHour(e.target.value)}
                disabled={!canEditBusinessSettings}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Metode Pembayaran Aktif di Kasir</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ALL_PAYMENT_METHODS.map((m) => (
                <label
                  key={m}
                  className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={paymentMethods.includes(m)}
                    onChange={() => togglePaymentMethod(m)}
                    disabled={!canEditBusinessSettings}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>

          {canEditBusinessSettings && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingPrefs}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {savingPrefs ? 'Menyimpan...' : 'Simpan Preferensi'}
              </button>
            </div>
          )}
        </form>
      )}

      {/* 4. WORKSPACE, PERAN & DEMO */}
      {tab === 'account' && (
        <div className="space-y-6">
          {/* Demo Workspace Switcher / Creator */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Lingkungan Demo & Multi-Bisnis</h3>
              <p className="text-xs text-slate-500 mt-1">
                Anda terhubung dengan {businesses.length} workspace bisnis. Buat ulang atau tambahkan akun demo EzFlow Café kapan saja untuk pengujian.
              </p>
            </div>
            <button
              type="button"
              disabled={seedingDemo}
              onClick={handleSeedAnotherDemo}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              {seedingDemo ? 'Membuat Demo...' : 'Buat Workspace Demo: EzFlow Café'}
            </button>
          </div>

          {/* Super Admin / Multi-Business Switcher */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h4 className="text-sm font-bold text-slate-900 mb-3">
              {effectiveRole === 'SUPER_ADMIN'
                ? 'Direktori Workspace Platform (Akses Super Admin)'
                : 'Workspace Bisnis Anda'}
            </h4>
            <div className="divide-y divide-slate-100">
              {businesses.map((b) => {
                const isCurrent = b.id === activeBusiness?.id;
                return (
                  <div key={b.id} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">{b.name}</p>
                        {b.isDemo && <span className="text-[11px] font-medium text-blue-600">Demo</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {b.category} · Pemilik: {b.ownerName} · {b.city || 'Indonesia'}
                      </p>
                    </div>
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                        Aktif
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          selectBusiness(b.id).catch((err) =>
                            showToast(formatAppError(err, 'Gagal membuka workspace.'), 'error')
                          )
                        }
                        className="px-3 py-1.5 text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 shrink-0"
                      >
                        Buka Workspace
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Team Members & UID Invitations */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Anggota Tim & Undangan Berbasis UID</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Berikan akses workspace ke manajer, kasir, atau staf yang telah memiliki akun EzFlow terverifikasi.
                </p>
              </div>
              {firebaseUser && (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
                  <span className="text-slate-500">UID Anda:</span>
                  <code className="font-mono text-slate-900 max-w-[160px] truncate">{firebaseUser.uid}</code>
                  <button
                    type="button"
                    onClick={handleCopyUid}
                    className="inline-flex items-center gap-1 text-blue-600 font-semibold hover:underline"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Salin
                  </button>
                </div>
              )}
            </div>

            {canEditBusinessSettings && activeBusiness && (
              <form onSubmit={handleInviteMember} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
                <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-blue-600" />
                  Tambahkan Anggota ke {activeBusiness.name}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Firebase UID Pengguna *</label>
                    <input
                      type="text"
                      required
                      value={inviteUid}
                      onChange={(e) => setInviteUid(e.target.value)}
                      placeholder="Tempel UID pengguna terverifikasi"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                    <input
                      type="text"
                      required
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Contoh: Ayu Lestari"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Email (Opsional)</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="ayu@kopi.id"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Jabatan</label>
                    <input
                      type="text"
                      value={invitePosition}
                      onChange={(e) => setInvitePosition(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Peran RBAC</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as Exclude<UserRole, 'SUPER_ADMIN'>)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="MANAGER">MANAGER</option>
                      <option value="CASHIER">CASHIER</option>
                      <option value="STAFF">STAFF</option>
                      <option value="OWNER">OWNER (Co-Owner)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Outlet Penugasan</label>
                    <select
                      value={inviteOutletId}
                      onChange={(e) => setInviteOutletId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      {outlets.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={invitingMember}
                    className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {invitingMember ? 'Menyinkronkan Akses...' : 'Undang & Beri Akses'}
                  </button>
                </div>
              </form>
            )}

            {activeBusiness && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2 pr-4 font-medium">Anggota</th>
                      <th className="py-2 px-3 font-medium">UID Akun</th>
                      <th className="py-2 px-3 font-medium">Outlet</th>
                      <th className="py-2 px-3 font-medium">Peran Workspace</th>
                      {canEditBusinessSettings && <th className="py-2 pl-3 font-medium text-right">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeBusiness.memberUids.map((mUid) => {
                      const isPrimaryOwner = mUid === activeBusiness.ownerUid;
                      const empMatch = employees.find((e) => e.userUid === mUid);
                      const roleValue: Exclude<UserRole, 'SUPER_ADMIN'> = isPrimaryOwner
                        ? 'OWNER'
                        : activeBusiness.memberRoles?.[mUid] || empMatch?.role || 'STAFF';
                      const outletLabel = empMatch
                        ? outlets.find((o) => o.id === empMatch.outletId)?.name || 'Semua Outlet'
                        : 'Semua Outlet';

                      return (
                        <tr key={mUid} className="hover:bg-slate-50">
                          <td className="py-2.5 pr-4 font-semibold text-slate-900">
                            {isPrimaryOwner
                              ? activeBusiness.ownerName || 'Pemilik Utama'
                              : empMatch?.name || 'Anggota Terdaftar'}
                            {mUid === firebaseUser?.uid && (
                              <span className="ml-1.5 text-[11px] font-medium text-blue-600">(Anda)</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">{mUid}</td>
                          <td className="py-2.5 px-3 text-slate-600">{outletLabel}</td>
                          <td className="py-2.5 px-3">
                            {canEditBusinessSettings && !isPrimaryOwner ? (
                              <select
                                value={roleValue}
                                onChange={(e) =>
                                  updateBusinessMemberRole(mUid, e.target.value as Exclude<UserRole, 'SUPER_ADMIN'>)
                                    .then(() => showToast('Peran anggota diperbarui.', 'success'))
                                    .catch((err) => showToast(formatAppError(err, 'Gagal mengubah peran.'), 'error'))
                                }
                                className="px-2 py-1 border border-slate-300 rounded-md bg-white font-semibold text-slate-800"
                              >
                                <option value="OWNER">OWNER</option>
                                <option value="MANAGER">MANAGER</option>
                                <option value="CASHIER">CASHIER</option>
                                <option value="STAFF">STAFF</option>
                              </select>
                            ) : (
                              <span className="font-mono font-semibold text-blue-700">{roleValue}</span>
                            )}
                          </td>
                          {canEditBusinessSettings && (
                            <td className="py-2.5 pl-3 text-right">
                              {!isPrimaryOwner && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeBusinessMember(mUid)
                                      .then(() => showToast('Akses anggota dicabut.', 'info'))
                                      .catch((err) =>
                                        showToast(formatAppError(err, 'Gagal mencabut akses.'), 'error')
                                      )
                                  }
                                  className="inline-flex items-center gap-1 text-red-600 hover:underline font-medium"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Cabut
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* RBAC Matrix Reference */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h4 className="text-sm font-bold text-slate-900 mb-3">Matriks Hak Akses Berbasis Peran (RBAC)</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-4 font-medium">Peran</th>
                    <th className="py-2 px-4 font-medium">Cakupan Akses Utama</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">SUPER_ADMIN</td>
                    <td className="py-2.5 px-4">Kelola seluruh akun bisnis, lingkungan demo, dan konfigurasi tingkat platform.</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">OWNER</td>
                    <td className="py-2.5 px-4">Akses penuh bisnis sendiri, manajemen cabang/outlet, keuangan, karyawan, laporan, dan AI Insights.</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">MANAGER</td>
                    <td className="py-2.5 px-4">Operasional outlet, inventaris, jadwal shift, approval tugas, dan laporan manajerial.</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">CASHIER</td>
                    <td className="py-2.5 px-4">Kasir POS, pemrosesan pembayaran, lihat daftar menu, dan checklist operasional.</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-semibold text-slate-900">STAFF</td>
                    <td className="py-2.5 px-4">Checklist operasional harian, melihat jadwal shift, dan absensi masuk/keluar.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Outlet Add/Edit Modal */}
      <Modal
        open={outletModalOpen}
        onClose={() => setOutletModalOpen(false)}
        title={editingOutlet ? 'Ubah Data Outlet' : 'Tambah Outlet Baru'}
      >
        <form onSubmit={handleSaveOutlet} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Outlet</label>
            <input
              type="text"
              value={oName}
              onChange={(e) => setOName(e.target.value)}
              placeholder="Contoh: EzFlow Café — Seminyak"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Outlet</label>
            <input
              type="text"
              value={oAddress}
              onChange={(e) => setOAddress(e.target.value)}
              placeholder="Jl. Kayu Aya No. 15, Seminyak, Bali"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kontak Outlet</label>
              <input
                type="text"
                value={oContact}
                onChange={(e) => setOContact(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Jam Operasional</label>
              <input
                type="text"
                value={oHours}
                onChange={(e) => setOHours(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Jumlah Meja</label>
              <input
                type="number"
                min={0}
                value={oTables}
                onChange={(e) => setOTables(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Kapasitas Kursi</label>
              <input
                type="number"
                min={0}
                value={oCapacity}
                onChange={(e) => setOCapacity(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={oActive}
                onChange={(e) => setOActive(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              Outlet sedang beroperasi (Aktif)
            </label>
            {editingOutlet && (
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={oArchived}
                  onChange={(e) => setOArchived(e.target.checked)}
                  className="rounded border-slate-300 text-red-600"
                />
                Arsipkan outlet ini
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOutletModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={savingOutlet}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {savingOutlet ? 'Menyimpan...' : 'Simpan Outlet'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
