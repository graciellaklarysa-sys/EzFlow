import { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookmarkPlus,
  Bot,
  Boxes,
  Coffee,
  History,
  Megaphone,
  Send,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useBusinessData } from '../../context/BusinessDataContext';
import { useToast } from '../ui/Toast';
import { formatAppError } from '../../lib/firebase';
import { formatDateTimeID, formatIDR, formatNumberID } from '../../lib/format';
import { computeBusinessMetrics, resolveDateRange, type DateFilterKey } from '../../lib/metrics';

type AiTab = 'assistant' | 'forecasting' | 'menu' | 'inventory' | 'promotions' | 'summary';

interface AiRecommendationItem {
  title: string;
  businessProblem: string;
  supportingData: string;
  suggestedAction: string;
  expectedBenefit: string;
  confidenceLevel: string;
}

interface StructuredAiResult {
  headline: string;
  dataPeriod: string;
  factualHighlights: string[];
  estimatesAndTrends: string[];
  recommendations: AiRecommendationItem[];
  limitations: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const SUGGESTED_QUESTIONS = [
  'Produk apa yang paling menguntungkan dan paling laris periode ini?',
  'Jam berapa transaksi paling ramai dan kapan jam sepi yang perlu promo?',
  'Bahan baku apa yang paling mendesak untuk di-restock sekarang?',
  'Bagaimana perbandingan pendapatan terhadap pengeluaran operasional saat ini?',
];

export function AiInsightsPage() {
  const { activeBusiness, activeOutletId, getIdToken } = useAuth();
  const {
    transactions,
    expenses,
    ingredients,
    products,
    operationalTasks,
    outlets,
    stockMovements,
    aiInsights,
    saveAiInsight,
  } = useBusinessData();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<AiTab>('assistant');
  const [dateFilter, setDateFilter] = useState<DateFilterKey>('30d');

  // Chat state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');

  // Structured analysis cache per module
  const [analysisByModule, setAnalysisByModule] = useState<Record<string, StructuredAiResult>>({});
  const [analyzingModule, setAnalyzingModule] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string>('');
  const [savingInsight, setSavingInsight] = useState(false);

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

  const selectedOutletName =
    activeOutletId === 'ALL'
      ? 'Semua Outlet'
      : outlets.find((o) => o.id === activeOutletId)?.name || 'Outlet Terpilih';

  const periodLabel = `${dateRange.startDate} s.d. ${dateRange.endDate}`;

  // Grounded JSON payload strictly derived from real computed state
  const metricsSnapshot = useMemo(() => {
    return {
      period: metrics.period,
      outletScope: selectedOutletName,
      currency: activeBusiness?.currency || 'IDR',
      totalRevenue: Math.round(metrics.totalRevenue),
      previousPeriodRevenue: Math.round(metrics.previousRevenue),
      revenueDeltaPercent:
        metrics.revenueDeltaPercent !== null ? Number(metrics.revenueDeltaPercent.toFixed(1)) : null,
      transactionCount: metrics.transactionCount,
      averageOrderValue: Math.round(metrics.averageOrderValue),
      estimatedCogs: Math.round(metrics.estimatedCogs),
      estimatedGrossProfit: Math.round(metrics.estimatedGrossProfit),
      grossMarginPercent: Number(metrics.grossMarginPercent.toFixed(1)),
      totalExpenses: Math.round(metrics.totalExpenses),
      estimatedNetProfit: Math.round(metrics.estimatedNetProfit),
      inventoryValuation: Math.round(metrics.inventoryValuation),
      outOfStockItems: metrics.outOfStockIngredients.map((i) => ({
        name: i.name,
        stock: i.stock,
        minStock: i.minStock,
        unit: i.unit,
      })),
      lowStockItems: metrics.lowStockIngredients.map((i) => ({
        name: i.name,
        stock: i.stock,
        minStock: i.minStock,
        unit: i.unit,
      })),
      topProducts: metrics.topProducts.slice(0, 8).map((p) => ({
        name: p.name,
        qtySold: p.qtySold,
        revenue: Math.round(p.revenue),
        marginPercent: Number(p.marginPercent.toFixed(1)),
      })),
      leastSellingProducts: metrics.leastSellingProducts.slice(0, 5).map((p) => ({
        name: p.name,
        qtySold: p.qtySold,
        revenue: Math.round(p.revenue),
        marginPercent: Number(p.marginPercent.toFixed(1)),
      })),
      hourlyTraffic: metrics.hourlyDistribution.filter((h) => h.transactions > 0),
      dailyTrendSample: metrics.dailySalesTrend.slice(-14),
      expenseByCategory: metrics.expenseByCategory,
      outletComparison: metrics.outletComparison,
      taskCompletion: metrics.taskCompletion,
    };
  }, [metrics, selectedOutletName, activeBusiness?.currency]);

  const handleSendChat = async (questionText?: string) => {
    const q = (questionText ?? chatInput).trim();
    if (!q || chatBusy) return;

    setChatError('');
    const nextHistory: ChatMessage[] = [...chatHistory, { role: 'user', text: q }];
    setChatHistory(nextHistory);
    if (!questionText) setChatInput('');
    setChatBusy(true);

    try {
      const token = await getIdToken();
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question: q,
          businessName: activeBusiness?.name || 'EzFlow Bisnis',
          outletName: selectedOutletName,
          periodLabel,
          metricsSnapshot,
          history: chatHistory.slice(-6),
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Gagal mendapatkan respons AI Assistant.');
      }

      setChatHistory([...nextHistory, { role: 'model', text: payload.answer }]);
    } catch (err) {
      const msg = formatAppError(err, 'Gagal menghubungi layanan AI.');
      setChatError(msg);
      showToast(msg, 'error');
    } finally {
      setChatBusy(false);
    }
  };

  const handleRunAnalysis = async (moduleType: Exclude<AiTab, 'assistant'>) => {
    setAnalysisError('');
    setAnalyzingModule(moduleType);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          moduleType,
          businessName: activeBusiness?.name || 'EzFlow Bisnis',
          outletName: selectedOutletName,
          periodLabel,
          metricsSnapshot,
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Gagal menganalisis data bisnis dengan AI.');
      }

      setAnalysisByModule((prev) => ({
        ...prev,
        [moduleType]: payload.result as StructuredAiResult,
      }));
      showToast('Analisis AI berhasil diperbarui dari data aktual.', 'success');
    } catch (err) {
      const msg = formatAppError(err, 'Gagal menjalankan analisis AI.');
      setAnalysisError(msg);
      showToast(msg, 'error');
    } finally {
      setAnalyzingModule(null);
    }
  };

  const handleSaveToHistory = async (moduleType: Exclude<AiTab, 'assistant'>) => {
    const res = analysisByModule[moduleType];
    if (!res) return;
    setSavingInsight(true);
    try {
      const firstRec = res.recommendations?.[0];
      const summaryLines = [
        res.headline,
        ...(res.factualHighlights || []).slice(0, 3).map((f) => `• ${f}`),
        ...(firstRec ? [`Rekomendasi Utama: ${firstRec.title} — ${firstRec.suggestedAction}`] : []),
      ].join('\n');

      await saveAiInsight({
        outletId: activeOutletId,
        moduleType,
        title: `${moduleLabels[moduleType]} (${periodLabel})`,
        summary: summaryLines,
        confidence: firstRec?.confidenceLevel || 'Sedang',
      });
      showToast('Ringkasan analisis AI berhasil disimpan ke riwayat.', 'success');
    } catch (err) {
      showToast(formatAppError(err, 'Gagal menyimpan insight AI.'), 'error');
    } finally {
      setSavingInsight(false);
    }
  };

  const moduleLabels: Record<AiTab, string> = {
    assistant: 'AI Business Assistant',
    forecasting: 'Sales Forecasting',
    menu: 'Menu Intelligence',
    inventory: 'Inventory Intelligence',
    promotions: 'Rekomendasi Promosi',
    summary: 'Ringkasan Eksekutif AI',
  };

  const tabs: Array<{ id: AiTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'assistant', label: 'AI Assistant', icon: Bot },
    { id: 'forecasting', label: 'Sales Forecasting', icon: TrendingUp },
    { id: 'menu', label: 'Menu Intelligence', icon: Coffee },
    { id: 'inventory', label: 'Inventory Intelligence', icon: Boxes },
    { id: 'promotions', label: 'Rekomendasi Promosi', icon: Megaphone },
    { id: 'summary', label: 'Ringkasan Bisnis AI', icon: Sparkles },
  ];

  const currentStructured = activeTab !== 'assistant' ? analysisByModule[activeTab] : undefined;

  return (
    <div className="space-y-6">
      {/* Header & Grounded Data Scope */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">EzFlow AI Operational Intelligence</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {selectedOutletName} · Periode {periodLabel} · {metrics.transactionCount} transaksi selesai ({formatIDR(metrics.totalRevenue)})
          </p>
        </div>

        <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs font-medium self-start lg:self-auto">
          {(
            [
              { key: 'today', label: 'Hari Ini' },
              { key: '7d', label: '7 Hari' },
              { key: '30d', label: '30 Hari' },
            ] as const
          ).map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setDateFilter(b.key)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                dateFilter === b.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-module Navigation */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setAnalysisError('');
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Grounding Disclaimer */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-900 flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Seluruh analisis AI diproses melalui server menggunakan data transaksi, stok, dan pengeluaran aktual di workspace Anda. Angka historis merupakan fakta database, sedangkan proyeksi ditandai sebagai{' '}
          <span className="font-semibold">Estimasi AI</span>.
        </p>
      </div>

      {/* 1. AI ASSISTANT CHAT */}
      {activeTab === 'assistant' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl flex flex-col h-[560px]">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-slate-900">Asisten Bisnis AI ({activeBusiness?.name})</h3>
              </div>
              {chatHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setChatHistory([])}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Bersihkan Chat
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {chatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                    <Bot className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-900">Tanyakan Kondisi Bisnis Anda</p>
                  <p className="text-xs text-slate-500 mt-1 mb-5">
                    Asisten membaca metrik aktual periode {periodLabel} untuk memberikan jawaban berbasis data.
                  </p>
                  <div className="w-full space-y-2 text-left">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => handleSendChat(q)}
                        className="w-full px-3.5 py-2.5 text-xs text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-lg transition-colors text-left"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                chatHistory.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                        m.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-50 border border-slate-200 text-slate-800'
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))
              )}

              {chatBusy && (
                <div className="flex justify-start">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500">
                    Sedang menganalisis data bisnis Anda...
                  </div>
                </div>
              )}

              {chatError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{chatError}</span>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChat();
              }}
              className="p-3.5 border-t border-slate-200 flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Tulis pertanyaan tentang penjualan, menu, stok, atau profit..."
                className="flex-1 px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={chatBusy || !chatInput.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                Kirim
              </button>
            </form>
          </div>

          {/* Snapshot Grounding Summary */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h4 className="text-sm font-semibold text-slate-900 mb-3">Ringkasan Konteks Data AI</h4>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Pendapatan</span>
                  <span className="font-semibold text-slate-900 tabular-nums">{formatIDR(metrics.totalRevenue)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Transaksi Selesai</span>
                  <span className="font-semibold text-slate-900 tabular-nums">{formatNumberID(metrics.transactionCount)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Estimasi Laba Kotor</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">
                    {formatIDR(metrics.estimatedGrossProfit)} ({metrics.grossMarginPercent.toFixed(1)}%)
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Pengeluaran Tercatat</span>
                  <span className="font-semibold text-slate-900 tabular-nums">{formatIDR(metrics.totalExpenses)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Bahan Stok Kritis/Menipis</span>
                  <span className="font-semibold text-amber-700 tabular-nums">
                    {metrics.outOfStockIngredients.length + metrics.lowStockIngredients.length} item
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h4 className="text-sm font-semibold text-slate-900 mb-2">Contoh Pertanyaan Cepat</h4>
              <div className="space-y-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={chatBusy}
                    onClick={() => handleSendChat(q)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2–6. STRUCTURED INTELLIGENCE MODULES */}
      {activeTab !== 'assistant' && (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{moduleLabels[activeTab]}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Menghasilkan analisis terstruktur berbasis fakta data periode {periodLabel}.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {currentStructured && (
                <button
                  type="button"
                  disabled={savingInsight}
                  onClick={() => handleSaveToHistory(activeTab)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  <BookmarkPlus className="w-4 h-4" />
                  {savingInsight ? 'Menyimpan...' : 'Simpan ke Riwayat'}
                </button>
              )}
              <button
                type="button"
                disabled={analyzingModule === activeTab}
                onClick={() => handleRunAnalysis(activeTab)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {analyzingModule === activeTab ? 'Menganalisis Data...' : currentStructured ? 'Perbarui Analisis AI' : 'Jalankan Analisis AI'}
              </button>
            </div>
          </div>

          {/* Contextual Historical Chart for Forecasting */}
          {activeTab === 'forecasting' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Data Penjualan Historis (Dasar Estimasi)</h4>
                  <p className="text-xs text-slate-500">Pendapatan aktual harian dari transaksi selesai</p>
                </div>
              </div>
              {metrics.dailySalesTrend.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">Belum ada transaksi historis pada rentang ini.</p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={metrics.dailySalesTrend} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => String(v).slice(5)} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}rb`} width={50} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(val: unknown) => [formatIDR(Number(val)), 'Pendapatan Aktual']} />
                      <Area type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2} fill="#DBEAFE" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {analysisError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Analisis AI tidak dapat diselesaikan</p>
                <p className="mt-0.5">{analysisError}</p>
              </div>
            </div>
          )}

          {analyzingModule === activeTab && !currentStructured && (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
              <Sparkles className="w-7 h-7 text-blue-600 mx-auto animate-pulse" />
              <p className="text-sm font-semibold text-slate-900">Menghasilkan {moduleLabels[activeTab]}...</p>
              <p className="text-xs text-slate-500">Gemini sedang meninjau angka penjualan, margin, dan stok aktual.</p>
            </div>
          )}

          {!currentStructured && analyzingModule !== activeTab && (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-900">Belum Ada Analisis untuk Modul Ini</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Klik tombol &ldquo;Jalankan Analisis AI&rdquo; di atas untuk memproses data periode {periodLabel} menjadi rekomendasi terstruktur.
              </p>
            </div>
          )}

          {currentStructured && (
            <div className="space-y-6">
              {/* Headline & Factual vs Estimates */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div>
                  <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">
                    Ringkasan Analisis · {currentStructured.dataPeriod || periodLabel}
                  </p>
                  <h4 className="text-base font-bold text-slate-900 mt-1">{currentStructured.headline}</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                  <div>
                    <h5 className="text-xs font-semibold text-slate-900 mb-2">Fakta Data Aktual</h5>
                    <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                      {(currentStructured.factualHighlights || []).map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5 className="text-xs font-semibold text-slate-900 mb-2">Estimasi AI & Pola Tren</h5>
                    <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                      {(currentStructured.estimatesAndTrends || []).map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {currentStructured.limitations && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5">
                    <span className="font-semibold">Keterbatasan Data: </span>
                    {currentStructured.limitations}
                  </p>
                )}
              </div>

              {/* Actionable Recommendations */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(currentStructured.recommendations || []).map((rec, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h5 className="text-sm font-bold text-slate-900">{rec.title}</h5>
                      <span className="text-[11px] font-semibold text-blue-700 shrink-0">
                        Keyakinan: {rec.confidenceLevel || 'Sedang'}
                      </span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="font-semibold text-slate-700">Masalah Bisnis: </span>
                        <span className="text-slate-600">{rec.businessProblem}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">Data Pendukung: </span>
                        <span className="text-slate-600">{rec.supportingData}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">Aksi Disarankan: </span>
                        <span className="text-slate-900 font-medium">{rec.suggestedAction}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-emerald-700">Manfaat Diharapkan: </span>
                        <span className="text-emerald-800">{rec.expectedBenefit}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Saved AI Insights History */}
          {aiInsights.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-slate-500" />
                <h4 className="text-sm font-semibold text-slate-900">Riwayat Insight AI Tersimpan</h4>
              </div>
              <div className="divide-y divide-slate-100">
                {aiInsights.slice(0, 8).map((ins) => (
                  <div key={ins.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900">{ins.title}</p>
                      <span className="text-[11px] text-slate-500">
                        Keyakinan: {ins.confidence || 'Sedang'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 whitespace-pre-line">{ins.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
