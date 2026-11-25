import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  Briefcase,
  Camera,
  CheckCheck,
  ChevronDown,
  ClipboardCheck,
  Coffee,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  Sparkles,
  Users,
  Video,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusinessData } from '../../context/BusinessDataContext';
import { formatAppError } from '../../lib/firebase';
import { EzFlowLogo } from '../ui/EzFlowLogo';
import { useToast } from '../ui/Toast';
import type { AppView, UserRole } from '../../types/ezflow';

interface NavItem {
  id: AppView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  allowedRoles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Ringkasan', icon: LayoutDashboard, allowedRoles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'CASHIER'] },
  { id: 'pos', label: 'Kasir / POS', icon: ShoppingCart, allowedRoles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'CASHIER'] },
  { id: 'inventory', label: 'Inventaris', icon: Package, allowedRoles: ['SUPER_ADMIN', 'OWNER', 'MANAGER'] },
  { id: 'menu', label: 'Manajemen Menu', icon: Coffee, allowedRoles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'CASHIER'] },
  { id: 'employees', label: 'Karyawan & Shift', icon: Users, allowedRoles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'STAFF'] },
  { id: 'finance', label: 'Keuangan', icon: Wallet, allowedRoles: ['SUPER_ADMIN', 'OWNER', 'MANAGER'] },
  { id: 'operations', label: 'Operasional', icon: ClipboardCheck, allowedRoles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'CASHIER', 'STAFF'] },
  { id: 'ai', label: 'AI Insights', icon: Sparkles, allowedRoles: ['SUPER_ADMIN', 'OWNER', 'MANAGER'] },
  { id: 'reports', label: 'Laporan', icon: FileBarChart, allowedRoles: ['SUPER_ADMIN', 'OWNER', 'MANAGER'] },
  { id: 'settings', label: 'Pengaturan', icon: Settings, allowedRoles: ['SUPER_ADMIN', 'OWNER', 'MANAGER'] },
];

const VIEW_LABELS: Record<AppView, string> = {
  dashboard: 'Ringkasan',
  pos: 'Kasir / POS',
  inventory: 'Inventaris',
  menu: 'Manajemen Menu',
  employees: 'Karyawan & Shift',
  finance: 'Keuangan',
  operations: 'Operasional',
  ai: 'AI Insights',
  cctv: 'CCTV Analytics',
  reports: 'Laporan',
  settings: 'Pengaturan',
};

const CCTV_ALLOWED_ROLES: UserRole[] = ['SUPER_ADMIN', 'OWNER', 'MANAGER'];

interface AppShellProps {
  currentView: AppView;
  onSelectView: (view: AppView) => void;
  children: React.ReactNode;
}

export function AppShell({ currentView, onSelectView, children }: AppShellProps) {
  const {
    activeBusiness,
    businesses,
    selectBusiness,
    activeOutletId,
    setActiveOutletId,
    userProfile,
    firebaseUser,
    logout,
  } = useAuth();
  const {
    outlets,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    currentMemberRole,
    cctvCameras,
    cctvUploads,
  } = useBusinessData();
  const { showToast } = useToast();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const visibleNavItems = NAV_ITEMS.filter((item) => item.allowedRoles.includes(currentMemberRole));
  const canAccessCctv = CCTV_ALLOWED_ROLES.includes(currentMemberRole);
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const activeOutlets = outlets.filter((o) => !o.isArchived);
  const activeViewLabel = VIEW_LABELS[currentView] || 'EzFlow';
  const filteredCamCount =
    activeOutletId === 'ALL'
      ? cctvCameras.length
      : cctvCameras.filter((c) => c.outletId === activeOutletId).length;
  const filteredUploadCount =
    activeOutletId === 'ALL'
      ? cctvUploads.length
      : cctvUploads.filter((u) => u.outletId === activeOutletId).length;

  const roleLabels: Record<UserRole, string> = {
    SUPER_ADMIN: 'Super Admin',
    OWNER: 'Pemilik (Owner)',
    MANAGER: 'Manajer Outlet',
    CASHIER: 'Kasir',
    STAFF: 'Staf Operasional',
  };

  return (
    <div className="min-h-screen bg-[#F4F6FA] flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Midnight Navy Command Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-[#0B1324] text-slate-200 border-r border-slate-800/90 flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-sky-400 to-amber-400 shrink-0" />

        {/* Brand */}
        <div className="h-16 px-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => {
              onSelectView(visibleNavItems[0]?.id || 'dashboard');
              setMobileMenuOpen(false);
            }}
            className="flex items-center gap-3 min-w-0 text-left group"
          >
            <EzFlowLogo size="md" tone="dark" className="group-hover:scale-[1.03] transition-transform duration-150" />
            <div className="min-w-0">
              <p className="font-display text-base font-extrabold tracking-tight text-white leading-none">EzFlow</p>
              <p className="text-[11px] text-slate-400 truncate mt-1">{activeBusiness?.name || 'Workspace'}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white"
            aria-label="Tutup menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectView(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all duration-150 whitespace-nowrap ${
                  active
                    ? 'bg-gradient-to-r from-blue-600/25 to-blue-500/10 text-white font-semibold border border-blue-400/25 shadow-xs'
                    : 'text-slate-300/90 hover:bg-white/[0.06] hover:text-white border border-transparent'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </span>
                {active && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
              </button>
            );
          })}
        </nav>

        {/* Bottom Business / Role Summary */}
        <div className="p-3.5 border-t border-white/10 bg-white/[0.03] shrink-0">
          {businesses.length > 1 && (
            <div className="mb-2.5">
              <label className="block text-[11px] font-medium text-slate-400 mb-1 px-1">Ganti Bisnis</label>
              <select
                value={activeBusiness?.id || ''}
                onChange={(e) =>
                  selectBusiness(e.target.value).catch((err) =>
                    showToast(formatAppError(err, 'Gagal mengganti workspace bisnis.'), 'error')
                  )
                }
                className="w-full px-2.5 py-1.5 text-xs border border-white/15 rounded-lg bg-[#111C33] text-slate-100"
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="px-1.5 py-1 flex items-center justify-between text-xs text-slate-300">
            <span className="truncate font-medium">{roleLabels[currentMemberRole]}</span>
            {activeBusiness?.isDemo && <span className="text-[11px] font-semibold text-amber-400">Demo</span>}
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 text-slate-600 hover:bg-slate-100 rounded-lg"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex items-center gap-2 text-sm">
              <span className="hidden sm:inline text-slate-400 font-medium truncate max-w-[160px]">
                {activeBusiness?.name || 'EzFlow'}
              </span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate tracking-tight">
                {activeViewLabel}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Active Outlet Selector */}
            <div className="flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-slate-400 hidden sm:block" />
              <select
                aria-label="Pilih Outlet Aktif"
                value={activeOutletId}
                onChange={(e) => setActiveOutletId(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs sm:text-sm font-medium text-slate-700 bg-white max-w-[160px] sm:max-w-[220px] truncate hover:border-slate-300 transition-colors"
              >
                <option value="ALL">Semua Outlet ({activeOutlets.length})</option>
                {activeOutlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  setProfileOpen(false);
                }}
                aria-label="Notifikasi"
                className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">Notifikasi ({unreadCount} baru)</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          markAllNotificationsRead().catch((err) =>
                            showToast(formatAppError(err, 'Gagal memperbarui notifikasi.'), 'error')
                          )
                        }
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Tandai semua dibaca
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">Belum ada notifikasi saat ini.</div>
                    ) : (
                      notifications.slice(0, 20).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            if (!n.isRead) {
                              markNotificationRead(n.id).catch((err) =>
                                showToast(formatAppError(err, 'Gagal menandai notifikasi.'), 'error')
                              );
                            }
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                            n.isRead ? 'bg-white' : 'bg-blue-50/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-xs font-semibold ${n.isRead ? 'text-slate-700' : 'text-slate-900'}`}>
                              {n.title}
                            </p>
                            {!n.isRead && <span className="text-[10px] font-semibold text-blue-600 shrink-0">Baru</span>}
                          </div>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{n.message}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(!profileOpen);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-600 to-blue-800 text-white text-xs font-bold flex items-center justify-center">
                  {(userProfile?.name || firebaseUser?.email || 'U').slice(0, 1).toUpperCase()}
                </div>
                <span className="hidden md:inline text-xs font-medium text-slate-800 max-w-[120px] truncate">
                  {userProfile?.name || firebaseUser?.displayName || 'Pengguna'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {userProfile?.name || firebaseUser?.displayName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{firebaseUser?.email}</p>
                    <p className="text-[11px] font-medium text-blue-600 mt-1">{roleLabels[currentMemberRole]}</p>
                  </div>
                  <div className="p-1.5">
                    {visibleNavItems.some((i) => i.id === 'settings') && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectView('settings');
                          setProfileOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
                      >
                        <Settings className="w-4 h-4 text-slate-400" />
                        Pengaturan Akun & Bisnis
                      </button>
                    )}
                    {visibleNavItems.some((i) => i.id === 'reports') && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectView('reports');
                          setProfileOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
                      >
                        <BarChart3 className="w-4 h-4 text-slate-400" />
                        Laporan & Ekspor
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        logout().catch((err) =>
                          showToast(formatAppError(err, 'Gagal keluar dari sesi.'), 'error')
                        );
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <LogOut className="w-4 h-4" />
                      Keluar dari Sesi
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto space-y-5">
          {canAccessCctv && (
            <section
              aria-label="Akses Cepat CCTV Analytics"
              className="no-print relative overflow-hidden rounded-xl border border-slate-800 bg-[#0B1324] ez-dark-grid text-white px-4 py-3.5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-16 w-64 h-64 rounded-full bg-gradient-to-br from-blue-600/20 via-amber-500/10 to-transparent blur-2xl"
              />
              <div className="relative flex items-center gap-4 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400/20 to-blue-500/20 border border-amber-400/35 text-amber-300 flex items-center justify-center shrink-0">
                  <Video className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <span className="font-display text-[15px] font-bold tracking-tight text-white">
                      CCTV Analytics
                    </span>
                    <span className="text-slate-500" aria-hidden="true">·</span>
                    <span className="text-xs font-medium text-amber-300">
                      Computer Vision & Pemantauan Okupansi Outlet
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 tabular-nums flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <span className="inline-flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-sky-400" />
                      {filteredCamCount} kamera terdaftar
                    </span>
                    <span className="text-slate-600" aria-hidden="true">·</span>
                    <span>{filteredUploadCount} rekaman / analisa tersimpan</span>
                  </p>
                </div>
              </div>

              <div className="relative flex items-center gap-2 shrink-0">
                {currentView === 'cctv' ? (
                  <button
                    type="button"
                    onClick={() => onSelectView('dashboard')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Kembali ke Ringkasan
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectView('cctv')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap shrink-0 shadow-xs"
                  >
                    <Video className="w-3.5 h-3.5" />
                    Buka CCTV Analytics
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </section>
          )}

          <div>{children}</div>
        </main>
      </div>
    </div>
  );
}
