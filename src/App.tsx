import { useEffect, useState } from 'react';
import { AlertCircle, WifiOff } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BusinessDataProvider, useBusinessData } from './context/BusinessDataContext';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import { AppShell } from './components/layout/AppShell';
import { EzFlowLogo } from './components/ui/EzFlowLogo';
import { DashboardPage } from './components/pages/DashboardPage';
import { PosPage } from './components/pages/PosPage';
import { InventoryPage } from './components/pages/InventoryPage';
import { MenuPage } from './components/pages/MenuPage';
import { EmployeesPage } from './components/pages/EmployeesPage';
import { FinancePage } from './components/pages/FinancePage';
import { OperationsPage } from './components/pages/OperationsPage';
import { AiInsightsPage } from './components/pages/AiInsightsPage';
import { CctvAnalyticsPage } from './components/pages/CctvAnalyticsPage';
import { ReportsPage } from './components/pages/ReportsPage';
import { SettingsPage } from './components/pages/SettingsPage';
import type { AppView, UserRole } from './types/ezflow';

const ROLE_ALLOWED_VIEWS: Record<UserRole, AppView[]> = {
  SUPER_ADMIN: ['dashboard', 'pos', 'inventory', 'menu', 'employees', 'finance', 'operations', 'ai', 'cctv', 'reports', 'settings'],
  OWNER: ['dashboard', 'pos', 'inventory', 'menu', 'employees', 'finance', 'operations', 'ai', 'cctv', 'reports', 'settings'],
  MANAGER: ['dashboard', 'pos', 'inventory', 'menu', 'employees', 'finance', 'operations', 'ai', 'cctv', 'reports', 'settings'],
  CASHIER: ['dashboard', 'pos', 'menu', 'operations'],
  STAFF: ['operations', 'employees'],
};

function AuthenticatedWorkspace() {
  const { connectionOffline, authDataError } = useAuth();
  const { currentMemberRole, dataError } = useBusinessData();
  const allowedViews = ROLE_ALLOWED_VIEWS[currentMemberRole] || ROLE_ALLOWED_VIEWS.OWNER;

  const [currentView, setCurrentView] = useState<AppView>(() =>
    currentMemberRole === 'STAFF' ? 'operations' : 'dashboard'
  );

  useEffect(() => {
    if (!allowedViews.includes(currentView)) {
      setCurrentView(allowedViews[0] || 'operations');
    }
  }, [allowedViews, currentView]);

  const handleNavigate = (view: AppView) => {
    if (allowedViews.includes(view)) {
      setCurrentView(view);
    }
  };

  return (
    <AppShell currentView={currentView} onSelectView={handleNavigate}>
      {connectionOffline && (
        <div className="mb-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
          <span>Koneksi ke server database sedang offline. Data akan tersinkronisasi kembali saat jaringan pulih.</span>
        </div>
      )}
      {(authDataError || dataError) && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
          <span>{authDataError || dataError}</span>
        </div>
      )}

      {currentView === 'dashboard' && <DashboardPage onNavigate={handleNavigate} />}
      {currentView === 'pos' && <PosPage />}
      {currentView === 'inventory' && <InventoryPage />}
      {currentView === 'menu' && <MenuPage />}
      {currentView === 'employees' && <EmployeesPage />}
      {currentView === 'finance' && <FinancePage />}
      {currentView === 'operations' && <OperationsPage />}
      {currentView === 'ai' && <AiInsightsPage />}
      {currentView === 'cctv' && <CctvAnalyticsPage />}
      {currentView === 'reports' && <ReportsPage />}
      {currentView === 'settings' && <SettingsPage />}
    </AppShell>
  );
}

function AppContent() {
  const { firebaseUser, userProfile, activeBusiness, loadingAuth, loadingBusinesses } = useAuth();

  if (loadingAuth || (firebaseUser?.emailVerified && loadingBusinesses && !activeBusiness)) {
    return (
      <div className="min-h-screen bg-[#F5F7FB] flex flex-col items-center justify-center p-6">
        <EzFlowLogo size="xl" className="mb-4" />
        <p className="text-sm font-semibold text-slate-900">Memuat Workspace EzFlow...</p>
        <p className="text-xs text-slate-500 mt-1">Run Smarter. Flow Better.</p>
      </div>
    );
  }

  if (!firebaseUser || !firebaseUser.emailVerified || !activeBusiness || userProfile?.onboardingCompleted === false) {
    return <OnboardingFlow />;
  }

  return (
    <BusinessDataProvider>
      <AuthenticatedWorkspace />
    </BusinessDataProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
