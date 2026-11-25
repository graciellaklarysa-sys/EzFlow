import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Coffee,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Sliders,
  Sparkles,
  Store,
  UserCheck,
} from 'lucide-react';
import { doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { EzFlowLogo } from '../ui/EzFlowLogo';
import { db, formatAppError } from '../../lib/firebase';
import { clampStr, generateSafeId } from '../../lib/format';
import { seedEzFlowCafeDemo } from '../../lib/demoSeed';
import type { PaymentMethod } from '../../types/ezflow';

type OnboardingStep = 'welcome' | 'auth' | 'business' | 'outlet' | 'preferences' | 'complete';
type AuthTab = 'register' | 'login' | 'forgot';

export function OnboardingFlow() {
  const {
    firebaseUser,
    userProfile,
    businesses,
    signInWithGoogle,
    registerWithEmail,
    loginWithEmail,
    sendResetPassword,
    logout,
    selectBusiness,
  } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [authTab, setAuthTab] = useState<AuthTab>('register');
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showProviderGuide, setShowProviderGuide] = useState(false);

  // Admin bootstrap modal state
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminStatus, setAdminStatus] = useState<{ configuredViaEnv: boolean; claimed: boolean } | null>(null);
  const [adminPasscodeInput, setAdminPasscodeInput] = useState('');
  const [adminActionBusy, setAdminActionBusy] = useState(false);

  // Step 2: Auth Form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(true);

  // Step 3: Business Profile
  const [bizName, setBizName] = useState('');
  const [bizCategory, setBizCategory] = useState('Coffee Shop');
  const [bizDesc, setBizDesc] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [bizEmail, setBizEmail] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizAddress, setBizAddress] = useState('');
  const [bizCity, setBizCity] = useState('Denpasar, Bali');
  const [bizCountry, setBizCountry] = useState('Indonesia');
  const [currency, setCurrency] = useState('IDR');
  const [timezone, setTimezone] = useState('Asia/Makassar');
  const [outletCount, setOutletCount] = useState(1);
  const [operatingHours, setOperatingHours] = useState('08:00 - 22:00 WITA');

  // Step 4: First Outlet
  const [outletName, setOutletName] = useState('Outlet Utama');
  const [outletAddress, setOutletAddress] = useState('');
  const [outletContact, setOutletContact] = useState('');
  const [outletHours, setOutletHours] = useState('08:00 - 22:00 WITA');
  const [tableCount, setTableCount] = useState(10);
  const [capacity, setCapacity] = useState(36);

  // Step 5: Preferences
  const [taxPercent, setTaxPercent] = useState(10);
  const [serviceChargePercent, setServiceChargePercent] = useState(5);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(['Tunai', 'QRIS', 'Debit', 'Transfer Bank']);
  const [lowStockThreshold, setLowStockThreshold] = useState(15);
  const [openingHour, setOpeningHour] = useState('08:00');
  const [closingHour, setClosingHour] = useState('22:00');

  const [createdBizId, setCreatedBizId] = useState('');

  // Auto-advance when authenticated (no email verification confirmation required)
  useEffect(() => {
    if (!firebaseUser) return;
    const fallbackName =
      firebaseUser.displayName || userProfile?.name || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Pemilik Bisnis');
    setOwnerName((prev) => prev || fallbackName);
    setBizEmail((prev) => prev || firebaseUser.email || '');
    if (businesses.length === 0 && (step === 'welcome' || step === 'auth')) {
      setStep('business');
    } else if (
      businesses.length > 0 &&
      userProfile?.onboardingCompleted === false &&
      (step === 'welcome' || step === 'auth')
    ) {
      setCreatedBizId((prev) => prev || businesses[0].id);
      setStep('complete');
    }
  }, [firebaseUser, userProfile?.name, userProfile?.onboardingCompleted, businesses, step]);

  const loadAdminBootstrapStatus = async () => {
    try {
      const r = await fetch('/api/auth/admin-bootstrap/status');
      if (r.ok) {
        const data = await r.json();
        setAdminStatus(data);
      }
    } catch {
      setAdminStatus(null);
    }
  };

  const handleOpenAdminModal = () => {
    setAdminModalOpen(true);
    loadAdminBootstrapStatus();
  };

  const handleClaimAdminPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasscodeInput.length < 12) {
      showToast('Passcode admin minimal 12 karakter.', 'error');
      return;
    }
    setAdminActionBusy(true);
    try {
      const res = await fetch('/api/auth/admin-bootstrap/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: adminPasscodeInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengklaim passcode admin.');
      showToast('Passcode admin pertama kali berhasil ditetapkan di server.', 'success');
      setAdminPasscodeInput('');
      loadAdminBootstrapStatus();
    } catch (err) {
      showToast(formatAppError(err, 'Gagal klaim admin.'), 'error');
    } finally {
      setAdminActionBusy(false);
    }
  };

  const passwordValid = password.length >= 6;

  const handleGoogleLogin = async () => {
    setBusy(true);
    setAuthError('');
    setShowProviderGuide(false);
    try {
      await signInWithGoogle();
      showToast('Berhasil masuk dengan akun Google.', 'success');
    } catch (err) {
      const msg = formatAppError(err, 'Gagal masuk dengan Google.');
      setAuthError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setShowProviderGuide(false);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setAuthError('Format alamat email tidak valid.');
      return;
    }

    if (authTab === 'forgot') {
      setBusy(true);
      try {
        await sendResetPassword(email);
        showToast('Tautan reset kata sandi telah dikirim ke email Anda.', 'success');
        setAuthTab('login');
      } catch (err) {
        setAuthError(mapFirebaseAuthError(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (authTab === 'register') {
      if (!passwordValid) {
        setAuthError('Kata sandi minimal 6 karakter.');
        return;
      }
      if (!acceptedTerms) {
        setAuthError('Anda harus menyetujui Syarat & Ketentuan EzFlow.');
        return;
      }

      const displayName = fullName.trim() || email.trim().split('@')[0] || 'Pemilik Bisnis';
      setBusy(true);
      try {
        await registerWithEmail(displayName, email, password);
        showToast('Akun dibuat! Anda langsung masuk tanpa perlu konfirmasi email.', 'success');
      } catch (err) {
        const mapped = mapFirebaseAuthError(err);
        setAuthError(mapped);
        if (err instanceof Error && err.message.includes('operation-not-allowed')) {
          setShowProviderGuide(true);
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    // Login
    if (!password) {
      setAuthError('Kata sandi wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      await loginWithEmail(email, password);
      showToast('Berhasil masuk ke akun EzFlow.', 'success');
    } catch (err) {
      const mapped = mapFirebaseAuthError(err);
      setAuthError(mapped);
      if (err instanceof Error && err.message.includes('operation-not-allowed')) {
        setShowProviderGuide(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLoadDemoCafe = async () => {
    if (!firebaseUser) return;
    setBusy(true);
    try {
      const { businessId } = await seedEzFlowCafeDemo({
        uid: firebaseUser.uid,
        userName: userProfile?.name || firebaseUser.displayName || 'Owner EzFlow Café',
        userEmail: firebaseUser.email || 'owner@ezflowcafe.id',
        isSuperAdmin: userProfile?.role === 'SUPER_ADMIN',
      });
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        activeBusinessId: businessId,
        onboardingCompleted: true,
        updatedAt: serverTimestamp(),
      });
      await selectBusiness(businessId);
      showToast('Demo Workspace "EzFlow Café" siap digunakan!', 'success');
    } catch (err) {
      showToast(formatAppError(err, 'Gagal memuat demo workspace.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteOnboarding = async (directToDashboard = false) => {
    if (!firebaseUser) return;
    if (!bizName.trim()) {
      showToast('Nama bisnis wajib diisi.', 'error');
      return;
    }
    setBusy(true);
    const bizId = generateSafeId('biz');
    const outId = generateSafeId('out');
    const catId = generateSafeId('cat');
    const empId = generateSafeId('emp');
    const uid = firebaseUser.uid;
    const memberUids = [uid];
    const resolvedOwnerName =
      ownerName.trim() || firebaseUser.displayName || userProfile?.name || firebaseUser.email?.split('@')[0] || 'Pemilik';
    const resolvedOutletName = outletName.trim() || 'Outlet Utama';

    try {
      // Create Business doc FIRST
      await setDoc(doc(db, 'businesses', bizId), {
        id: bizId,
        name: clampStr(bizName, 120),
        category: clampStr(bizCategory, 60),
        description: clampStr(bizDesc, 500),
        ownerName: clampStr(resolvedOwnerName, 120),
        ownerUid: uid,
        memberUids,
        businessEmail: clampStr(bizEmail, 200),
        phone: clampStr(bizPhone, 40),
        address: clampStr(bizAddress, 300),
        city: clampStr(bizCity, 80),
        country: clampStr(bizCountry, 80),
        currency: clampStr(currency, 10),
        timezone: clampStr(timezone, 60),
        outletCount: Math.max(1, Math.round(outletCount)),
        operatingHours: clampStr(operatingHours, 80),
        taxPercent: Number(taxPercent),
        serviceChargePercent: Number(serviceChargePercent),
        paymentMethods: paymentMethods.length ? paymentMethods : ['Tunai'],
        lowStockThreshold: Number(lowStockThreshold),
        openingHour: clampStr(openingHour, 10),
        closingHour: clampStr(closingHour, 10),
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const batch = writeBatch(db);
      const ts = serverTimestamp();

      batch.set(doc(db, 'businesses', bizId, 'outlets', outId), {
        id: outId,
        businessId: bizId,
        ownerUid: uid,
        memberUids,
        name: clampStr(resolvedOutletName, 120),
        address: clampStr(outletAddress || bizAddress || bizCity || 'Indonesia', 300),
        contactNumber: clampStr(outletContact || bizPhone, 40),
        operatingHours: clampStr(outletHours || operatingHours, 80),
        tableCount: Math.max(0, Math.round(tableCount)),
        capacity: Math.max(0, Math.round(capacity)),
        isActive: true,
        isArchived: false,
        createdAt: ts,
        updatedAt: ts,
      });

      batch.set(doc(db, 'businesses', bizId, 'categories', catId), {
        id: catId,
        businessId: bizId,
        ownerUid: uid,
        memberUids,
        name: 'Menu Utama',
        sortOrder: 1,
        createdAt: ts,
        updatedAt: ts,
      });

      batch.set(doc(db, 'businesses', bizId, 'employees', empId), {
        id: empId,
        businessId: bizId,
        ownerUid: uid,
        memberUids,
        userUid: uid,
        name: clampStr(resolvedOwnerName, 120),
        email: clampStr(firebaseUser.email || '', 200),
        phone: clampStr(bizPhone, 40),
        position: 'Pemilik Bisnis',
        role: 'OWNER',
        outletId: outId,
        status: 'active',
        createdAt: ts,
        updatedAt: ts,
      });

      batch.update(doc(db, 'users', uid), {
        activeBusinessId: bizId,
        ...(directToDashboard ? { onboardingCompleted: true } : {}),
        updatedAt: ts,
      });

      await batch.commit();
      setCreatedBizId(bizId);
      if (directToDashboard) {
        await selectBusiness(bizId);
        showToast('Workspace bisnis siap! Membuka dasbor...', 'success');
      } else {
        setStep('complete');
        showToast('Workspace bisnis berhasil dibuat!', 'success');
      }
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menyimpan konfigurasi workspace bisnis.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleFinishToDashboard = async () => {
    if (!firebaseUser) return;
    setBusy(true);
    try {
      const targetBizId = createdBizId || businesses[0]?.id || '';
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        ...(targetBizId ? { activeBusinessId: targetBizId } : {}),
        onboardingCompleted: true,
        updatedAt: serverTimestamp(),
      });
      if (targetBizId) {
        await selectBusiness(targetBizId);
      }
    } catch (err) {
      showToast(formatAppError(err, 'Gagal masuk ke dasbor. Silakan coba lagi.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const togglePaymentMethod = (m: PaymentMethod) => {
    setPaymentMethods((prev) =>
      prev.includes(m) ? (prev.length > 1 ? prev.filter((x) => x !== m) : prev) : [...prev, m]
    );
  };

  const stepOrder: OnboardingStep[] = ['welcome', 'auth', 'business', 'outlet', 'preferences', 'complete'];
  const currentIdx = stepOrder.indexOf(step);

  return (
    <div className="min-h-screen bg-[#F4F6FA] ez-dot-grid flex flex-col justify-between">
      {/* Top 3-Zone Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-6 py-3.5 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setStep('welcome')}
            className="flex items-center gap-3 text-left group whitespace-nowrap shrink-0"
          >
            <EzFlowLogo size="md" className="group-hover:border-blue-300 transition-colors" />
            <span className="font-display text-lg font-extrabold tracking-tight text-slate-900">EzFlow</span>
          </button>

          <p className="hidden md:block text-xs font-medium text-slate-500 whitespace-nowrap truncate">
            Run Smarter. Flow Better.
          </p>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleOpenAdminModal}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Setup Admin Demo
            </button>
            {firebaseUser && (
              <button
                type="button"
                onClick={logout}
                className="text-xs font-semibold text-slate-600 hover:text-red-600 px-3 py-2 whitespace-nowrap shrink-0"
              >
                Keluar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-5xl">
          {/* Step Progress Indicator (Steps 2-6) */}
          {step !== 'welcome' && (
            <div className="mb-6 bg-white border border-slate-200/90 rounded-xl px-5 py-3.5 shadow-2xs">
              <div className="flex items-center justify-between gap-2 text-xs overflow-x-auto">
                {[
                  { key: 'auth', label: '01. Akun' },
                  { key: 'business', label: '02. Profil Bisnis' },
                  { key: 'outlet', label: '03. Outlet Pertama' },
                  { key: 'preferences', label: '04. Preferensi' },
                  { key: 'complete', label: '05. Selesai' },
                ].map((item, idx) => {
                  const active = currentIdx === idx + 1;
                  const done = currentIdx > idx + 1;
                  return (
                    <div key={item.key} className="flex items-center gap-2.5 shrink-0">
                      <span
                        className={`font-semibold whitespace-nowrap ${
                          active ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        {item.label}
                      </span>
                      {idx < 4 && <span className="text-slate-300 hidden sm:inline">/</span>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2.5 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-amber-500 transition-all duration-200"
                  style={{ width: `${Math.max(15, Math.min(100, (currentIdx / 5) * 100))}%` }}
                />
              </div>
            </div>
          )}

          {/* STEP 1: WELCOME SCREEN */}
          {step === 'welcome' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
              <div className="h-1 w-full bg-gradient-to-r from-blue-700 via-sky-500 to-amber-500" />
              <div className="p-7 sm:p-12 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
                <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                  <div className="space-y-5">
                    <div className="flex items-center gap-3.5">
                      <EzFlowLogo size="lg" />
                      <div>
                        <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span>Platform Operasi F&B UMKM Indonesia</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Kasir POS · Stok Resep · Keuangan · AI & CCTV Vision
                        </p>
                      </div>
                    </div>

                    <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.08] text-balance">
                      Run Smarter.{' '}
                      <span className="bg-gradient-to-r from-blue-700 via-blue-600 to-amber-500 bg-clip-text text-transparent">
                        Flow Better.
                      </span>
                    </h1>
                    <p className="text-slate-600 text-[15px] leading-relaxed max-w-xl">
                      EzFlow menyatukan kasir POS, pemotongan stok berbasis resep otomatis, keuangan,
                      manajemen karyawan, kecerdasan bisnis Gemini AI, dan analitik CCTV Computer Vision dalam satu pusat kendali.
                    </p>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleGoogleLogin}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 shadow-xs"
                      >
                        Masuk Cepat dengan Google
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthTab('login');
                          setStep('auth');
                        }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 text-slate-800 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                      >
                        Masuk Email
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthTab('register');
                          setStep('auth');
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0B1324] text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        Daftar Baru
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">
                      Tanpa verifikasi email atau langkah rumit — langsung masuk dan mulai kelola bisnis Anda.
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-5 relative overflow-hidden bg-[#0B1324] ez-dark-grid text-white rounded-xl p-6 sm:p-7 flex flex-col justify-between space-y-5 border border-slate-800">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-12 -top-12 w-44 h-44 rounded-full bg-gradient-to-br from-blue-500/25 via-amber-400/15 to-transparent blur-2xl"
                  />
                  <div className="relative flex items-center gap-3 pb-4 border-b border-white/10">
                    <div className="w-10 h-10 rounded-lg bg-amber-400/15 border border-amber-400/35 text-amber-300 flex items-center justify-center shrink-0">
                      <Coffee className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-display text-sm font-bold text-white">Lingkungan Demo: EzFlow Café</p>
                      <p className="text-xs text-slate-400">Bali · Mata uang IDR · Multi-Outlet</p>
                    </div>
                  </div>

                  {/* Visual Flow Wave Illustration */}
                  <div className="relative rounded-lg bg-white/[0.04] border border-white/10 p-3.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-300 mb-2">
                      <span>Alur Terpadu Outlet</span>
                      <span className="font-mono text-amber-300 tabular-nums">POS → Stok → AI → CCTV</span>
                    </div>
                    <svg viewBox="0 0 260 44" className="w-full h-10 overflow-visible" aria-hidden="true">
                      <defs>
                        <linearGradient id="ezWave" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#3B82F6" />
                          <stop offset="65%" stopColor="#38BDF8" />
                          <stop offset="100%" stopColor="#FBBF24" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M2 34 C 42 32, 54 12, 92 18 C 128 24, 146 8, 184 14 C 216 19, 232 6, 258 4"
                        fill="none"
                        stroke="url(#ezWave)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <circle cx="92" cy="18" r="3.5" fill="#38BDF8" />
                      <circle cx="184" cy="14" r="3.5" fill="#60A5FA" />
                      <circle cx="256" cy="4" r="4" fill="#FBBF24" />
                    </svg>
                  </div>

                  <ul className="relative space-y-3 text-xs text-slate-200 flex-1">
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>POS & pemotongan stok bahan baku atomik per resep</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Laporan laba kotor, HPP, dan pengeluaran tercatat</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Asisten AI Gemini berbasis data bisnis aktual</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>CCTV Analytics kamera langsung, video upload & CV</span>
                    </li>
                  </ul>
                  <div className="relative pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Siap pakai untuk 1 atau banyak outlet</span>
                    <span className="font-semibold text-amber-300">IDR · WITA</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: ACCOUNT REGISTRATION / SIGN IN / FORGOT */}
          {step === 'auth' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm max-w-lg mx-auto">
              <div className="flex items-center justify-between mb-6">
                <button
                  type="button"
                  onClick={() => setStep('welcome')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  <ArrowLeft className="w-4 h-4" /> Kembali
                </button>
                <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab('register');
                      setAuthError('');
                    }}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      authTab === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Daftar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab('login');
                      setAuthError('');
                    }}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      authTab === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Masuk
                  </button>
                </div>
              </div>

              <h2 className="text-xl font-bold text-slate-900 mb-1">
                {authTab === 'register'
                  ? 'Buat Akun EzFlow'
                  : authTab === 'login'
                    ? 'Masuk ke EzFlow'
                    : 'Reset Kata Sandi'}
              </h2>
              <p className="text-sm text-slate-500 mb-5">
                {authTab === 'register'
                  ? 'Daftarkan akun pemilik untuk membuat workspace bisnis Anda.'
                  : authTab === 'login'
                    ? 'Masuk dengan akun terdaftar atau gunakan Google untuk akses instan.'
                    : 'Masukkan email akun untuk menerima tautan pemulihan kata sandi.'}
              </p>

              {/* Google Sign In */}
              <button
                type="button"
                disabled={busy}
                onClick={handleGoogleLogin}
                className="w-full py-2.5 px-4 bg-[#0B1324] text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 mb-5"
              >
                <span>Lanjutkan dengan Google (1 Klik, Tanpa Konfirmasi Email)</span>
              </button>

              <div className="relative flex py-2 items-center mb-5">
                <div className="grow border-t border-slate-200" />
                <span className="shrink mx-3 text-xs text-slate-400">atau gunakan email</span>
                <div className="grow border-t border-slate-200" />
              </div>

              {authError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {authError}
                </div>
              )}

              {showProviderGuide && (
                <div className="mb-4 p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                  <p className="font-semibold">Login Email/Password belum aktif di proyek ini.</p>
                  <p>Anda bisa langsung masuk dalam 1 klik dengan Google tanpa perlu mengatur Firebase Console:</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleGoogleLogin}
                    className="px-3.5 py-2 bg-[#0B1324] text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    Masuk Instan dengan Google
                  </button>
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authTab === 'register' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap (Opsional)</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Contoh: Budi Santoso"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@bisnisanda.id"
                      required
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {authTab !== 'forgot' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Kata Sandi</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={authTab === 'register' ? 'Minimal 6 karakter' : 'Masukkan kata sandi'}
                        required
                        className="w-full pl-9 pr-9 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {authTab === 'register' && (
                      <p className={`mt-1.5 text-[11px] ${passwordValid ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                        {passwordValid ? 'Kata sandi siap digunakan' : 'Minimal 6 karakter, tanpa perlu verifikasi email.'}
                      </p>
                    )}
                  </div>
                )}

                {authTab === 'register' && (
                  <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      Saya menyetujui Syarat & Ketentuan serta Kebijakan Privasi penggunaan platform EzFlow.
                    </span>
                  </label>
                )}

                {authTab === 'login' && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setAuthTab('forgot')}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      Lupa kata sandi?
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {busy
                    ? 'Memproses...'
                    : authTab === 'register'
                      ? 'Daftar & Langsung Masuk'
                      : authTab === 'login'
                        ? 'Masuk ke Akun'
                        : 'Kirim Tautan Reset'}
                </button>

                {authTab === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => setAuthTab('login')}
                    className="w-full text-xs text-slate-500 hover:text-slate-900 py-1"
                  >
                    Kembali ke halaman masuk
                  </button>
                )}
              </form>
            </div>
          )}

          {/* STEP 3: BUSINESS PROFILE SETUP */}
          {step === 'business' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2 text-blue-600 text-xs font-semibold mb-1">
                    <Building2 className="w-4 h-4" />
                    <span>Setup Cepat Workspace</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Profil Bisnis Anda</h2>
                  <p className="text-sm text-slate-500">Isi nama bisnis lalu langsung masuk dasbor, atau coba Demo EzFlow Café dalam 1 klik.</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleLoadDemoCafe}
                  className="px-4 py-2.5 bg-[#0B1324] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {busy ? 'Menyiapkan Demo...' : 'Masuk Demo: EzFlow Café (1 Klik)'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nama Bisnis *</label>
                  <input
                    type="text"
                    value={bizName}
                    onChange={(e) => setBizName(e.target.value)}
                    placeholder="Contoh: Kopi Senja Nusantara"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kategori Bisnis *</label>
                  <select
                    value={bizCategory}
                    onChange={(e) => setBizCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="Coffee Shop">Coffee Shop</option>
                    <option value="Kafe">Kafe</option>
                    <option value="Restoran">Restoran</option>
                    <option value="Bakery & Pastry">Bakery & Pastry</option>
                    <option value="Minuman & Tea Bar">Minuman & Tea Bar</option>
                    <option value="UMKM Kuliner">UMKM Kuliner</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Deskripsi Singkat Bisnis</label>
                  <textarea
                    rows={2}
                    value={bizDesc}
                    onChange={(e) => setBizDesc(e.target.value)}
                    placeholder="Ceritakan konsep kafe atau restoran Anda..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nama Pemilik *</label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email Bisnis</label>
                  <input
                    type="email"
                    value={bizEmail}
                    onChange={(e) => setBizEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nomor Telepon</label>
                  <input
                    type="text"
                    value={bizPhone}
                    onChange={(e) => setBizPhone(e.target.value)}
                    placeholder="+62 812 xxxx xxxx"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Bisnis</label>
                  <input
                    type="text"
                    value={bizAddress}
                    onChange={(e) => setBizAddress(e.target.value)}
                    placeholder="Jl. Raya Seminyak No. 12"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kota</label>
                  <input
                    type="text"
                    value={bizCity}
                    onChange={(e) => setBizCity(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Negara</label>
                  <input
                    type="text"
                    value={bizCountry}
                    onChange={(e) => setBizCountry(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mata Uang</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="IDR">IDR (Rupiah Indonesia)</option>
                    <option value="USD">USD</option>
                    <option value="SGD">SGD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Zona Waktu</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                    <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                    <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Rencana Jumlah Outlet</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={outletCount}
                    onChange={(e) => setOutletCount(Number(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jam Operasional Umum</label>
                  <input
                    type="text"
                    value={operatingHours}
                    onChange={(e) => setOperatingHours(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!bizName.trim()) {
                      showToast('Nama bisnis wajib diisi.', 'error');
                      return;
                    }
                    if (!outletAddress && bizAddress) setOutletAddress(bizAddress);
                    if (!outletContact && bizPhone) setOutletContact(bizPhone);
                    setStep('outlet');
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50"
                >
                  Atur Detail Outlet & Pajak (Opsional)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleCompleteOnboarding(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy ? 'Menyiapkan Dasbor...' : 'Buat Bisnis & Masuk Dasbor'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: OUTLET SETUP */}
          {step === 'outlet' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm space-y-6">
              <div>
                <div className="flex items-center gap-2 text-blue-600 text-xs font-semibold mb-1">
                  <Store className="w-4 h-4" />
                  <span>Langkah 4 dari 6</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900">Outlet Pertama Anda</h2>
                <p className="text-sm text-slate-500">Anda dapat menambah outlet cabang lainnya kapan saja di menu Pengaturan.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nama Outlet *</label>
                  <input
                    type="text"
                    value={outletName}
                    onChange={(e) => setOutletName(e.target.value)}
                    placeholder="Contoh: Outlet Canggu"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nomor Kontak Outlet</label>
                  <input
                    type="text"
                    value={outletContact}
                    onChange={(e) => setOutletContact(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Lengkap Outlet *</label>
                  <input
                    type="text"
                    value={outletAddress}
                    onChange={(e) => setOutletAddress(e.target.value)}
                    placeholder="Jl. Pantai Berawa No. 10"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jam Operasional Outlet</label>
                  <input
                    type="text"
                    value={outletHours}
                    onChange={(e) => setOutletHours(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Jumlah Meja</label>
                    <input
                      type="number"
                      min={0}
                      value={tableCount}
                      onChange={(e) => setTableCount(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Kapasitas Kursi</label>
                    <input
                      type="number"
                      min={0}
                      value={capacity}
                      onChange={(e) => setCapacity(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep('business')}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  <ArrowLeft className="w-4 h-4" /> Kembali
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!outletName.trim() || !outletAddress.trim()) {
                      showToast('Nama outlet dan alamat outlet wajib diisi.', 'error');
                      return;
                    }
                    setStep('preferences');
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
                >
                  Lanjut ke Preferensi
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: BUSINESS PREFERENCES */}
          {step === 'preferences' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm space-y-6">
              <div>
                <div className="flex items-center gap-2 text-blue-600 text-xs font-semibold mb-1">
                  <Sliders className="w-4 h-4" />
                  <span>Langkah 5 dari 6</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900">Preferensi Bisnis</h2>
                <p className="text-sm text-slate-500">Atur pajak, biaya layanan, metode pembayaran, dan ambang batas stok.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Pajak Restoran / PPN (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Biaya Layanan / Service Charge (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={serviceChargePercent}
                    onChange={(e) => setServiceChargePercent(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Ambang Batas Peringatan Stok Rendah (%)</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(Number(e.target.value) || 10)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Jam Buka</label>
                    <input
                      type="time"
                      value={openingHour}
                      onChange={(e) => setOpeningHour(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Jam Tutup</label>
                    <input
                      type="time"
                      value={closingHour}
                      onChange={(e) => setClosingHour(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-2">Metode Pembayaran Default POS</label>
                  <div className="flex flex-wrap gap-2">
                    {(['Tunai', 'QRIS', 'Debit', 'Transfer Bank'] as PaymentMethod[]).map((method) => {
                      const active = paymentMethods.includes(method);
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => togglePaymentMethod(method)}
                          className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                            active
                              ? 'bg-blue-50 border-blue-600 text-blue-700'
                              : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {method}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep('outlet')}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  <ArrowLeft className="w-4 h-4" /> Kembali
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleCompleteOnboarding(false)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy ? 'Menyimpan Workspace...' : 'Selesaikan Setup'}
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: COMPLETION */}
          {step === 'complete' && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm max-w-lg mx-auto text-center space-y-5">
              <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <UserCheck className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Workspace EzFlow Siap Digunakan!</h2>
              <p className="text-sm text-slate-600">
                Bisnis <span className="font-semibold text-slate-900">{bizName}</span> dan outlet{' '}
                <span className="font-semibold text-slate-900">{outletName}</span> telah dibuat dengan hak akses{' '}
                <span className="font-semibold text-blue-600">OWNER / ADMIN</span>.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={handleFinishToDashboard}
                className="w-full py-2.5 px-5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? 'Membuka Dasbor...' : 'Masuk ke Dasbor'}
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="py-4 px-6 text-center text-xs text-slate-400">
        EzFlow · Platform Manajemen Operasional & Intelijen Bisnis F&B
      </footer>

      {/* Admin Setup & Bootstrap Modal */}
      <Modal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        title="Pengaturan Admin Demo (SUPER_ADMIN)"
        subtitle="Konfigurasi akun administrator secara aman tanpa menyematkan kata sandi di kode frontend."
      >
        <div className="space-y-4 text-sm text-slate-600">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Spesifikasi Akun Demo Administrator</span>
            </div>
            <p>Email: <span className="font-mono font-semibold text-slate-800">admin@ezflow.demo</span></p>
            <p>Peran: <span className="font-mono font-semibold text-slate-800">SUPER_ADMIN</span></p>
            <p className="text-slate-500">
              Catatan: Aktifkan metode login Email/Password di Firebase Console untuk masuk dengan email tersebut, atau masuk dengan akun Google pemilik aplikasi.
            </p>
          </div>

          <div className="p-3.5 rounded-lg border border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900">Status Passcode Server Bootstrap</span>
              <span className={`font-medium ${adminStatus?.claimed ? 'text-emerald-600' : 'text-amber-600'}`}>
                {adminStatus === null
                  ? 'Memeriksa...'
                  : adminStatus.configuredViaEnv
                    ? 'Terkonfigurasi (Env Secret)'
                    : adminStatus.claimed
                      ? 'Sudah Diklaim'
                      : 'Belum Diklaim'}
              </span>
            </div>

            {adminStatus && !adminStatus.claimed && (
              <form onSubmit={handleClaimAdminPasscode} className="space-y-2.5">
                <label className="block text-xs text-slate-600">
                  Tetapkan passcode admin pertama kali (disimpan sebagai hash scrypt di server):
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={adminPasscodeInput}
                      onChange={(e) => setAdminPasscodeInput(e.target.value)}
                      placeholder="Minimal 12 karakter"
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={adminActionBusy}
                    className="px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {adminActionBusy ? 'Menyimpan...' : 'Klaim Admin'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function mapFirebaseAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('email-already-in-use')) return 'Alamat email sudah terdaftar. Silakan masuk atau reset kata sandi.';
  if (raw.includes('invalid-email')) return 'Format alamat email tidak valid.';
  if (raw.includes('weak-password')) return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
  if (raw.includes('wrong-password') || raw.includes('invalid-credential')) return 'Email atau kata sandi salah.';
  if (raw.includes('user-not-found')) return 'Akun dengan email tersebut belum terdaftar.';
  if (raw.includes('operation-not-allowed')) {
    return 'Login Email/Password belum diaktifkan di Firebase Console. Klik tombol Google di atas untuk langsung masuk.';
  }
  if (raw.includes('too-many-requests')) return 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.';
  return raw;
}
