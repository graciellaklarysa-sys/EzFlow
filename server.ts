import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import net from 'net';
import dns from 'dns/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const execFileAsync = promisify(execFile);

const PORT = 3000;
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

// Load Firebase public config for server-side ID token verification via Identity Toolkit
interface FirebasePublicConfig {
  projectId?: string;
  apiKey?: string;
}

let firebasePublicConfig: FirebasePublicConfig = {};
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebasePublicConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (err) {
  console.warn('Gagal membaca firebase-applet-config.json:', err);
}

interface AuthenticatedRequest extends Request {
  authUser?: {
    uid: string;
    email: string;
    emailVerified: boolean;
  };
}

async function requireFirebaseAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Autentikasi diperlukan. Silakan masuk terlebih dahulu.' });
    return;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken || idToken.length > 8192) {
    res.status(401).json({ error: 'Token sesi tidak valid.' });
    return;
  }

  if (!firebasePublicConfig.apiKey) {
    res.status(503).json({ error: 'Konfigurasi Firebase server belum tersedia.' });
    return;
  }

  try {
    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebasePublicConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!verifyRes.ok) {
      res.status(401).json({ error: 'Sesi autentikasi tidak valid atau telah kedaluwarsa.' });
      return;
    }

    const payload = (await verifyRes.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = payload.users?.[0];
    if (!user?.localId || !user?.email) {
      res.status(401).json({ error: 'Akun pengguna tidak ditemukan.' });
      return;
    }
    if (!user.emailVerified) {
      res.status(403).json({ error: 'Email akun belum terverifikasi. Harap verifikasi email terlebih dahulu.' });
      return;
    }

    req.authUser = {
      uid: user.localId,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
    };
    next();
  } catch (err) {
    console.error('Auth verification error:', err);
    res.status(500).json({ error: 'Gagal memverifikasi token autentikasi.' });
  }
}

// First-Run Admin Bootstrap (scrypt in-memory fallback when EZFLOW_ADMIN_PASSCODE env is unset)
let claimedAdminRecord: { salt: string; hash: string; claimedAt: string } | null = null;

function verifySecretString(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
  });
});

app.get('/api/auth/admin-bootstrap/status', (_req, res) => {
  const envConfigured = Boolean(process.env.EZFLOW_ADMIN_PASSCODE && process.env.EZFLOW_ADMIN_PASSCODE.trim().length > 0);
  res.json({
    configuredViaEnv: envConfigured,
    claimed: envConfigured || Boolean(claimedAdminRecord),
    claimedAt: claimedAdminRecord?.claimedAt ?? null,
  });
});

app.post('/api/auth/admin-bootstrap/claim', (req, res) => {
  const envPasscode = process.env.EZFLOW_ADMIN_PASSCODE?.trim();
  if (envPasscode) {
    res.status(409).json({ error: 'Passcode admin sudah dikonfigurasi melalui variabel lingkungan server.' });
    return;
  }
  if (claimedAdminRecord) {
    res.status(409).json({ error: 'Kredensial admin awal sudah diklaim sebelumnya.' });
    return;
  }

  const { passcode } = req.body as { passcode?: unknown };
  if (typeof passcode !== 'string' || passcode.length < 12 || passcode.length > 128) {
    res.status(400).json({ error: 'Passcode admin harus berupa teks minimal 12 karakter.' });
    return;
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
  claimedAdminRecord = {
    salt,
    hash: derived,
    claimedAt: new Date().toISOString(),
  };

  res.json({ ok: true, claimedAt: claimedAdminRecord.claimedAt });
});

app.post('/api/auth/admin-bootstrap/verify', (req, res) => {
  const { passcode } = req.body as { passcode?: unknown };
  if (typeof passcode !== 'string' || !passcode) {
    res.status(400).json({ error: 'Passcode wajib diisi.' });
    return;
  }

  const envPasscode = process.env.EZFLOW_ADMIN_PASSCODE?.trim();
  if (envPasscode) {
    const valid = verifySecretString(passcode, envPasscode);
    if (!valid) {
      res.status(403).json({ error: 'Passcode admin tidak cocok.' });
      return;
    }
    res.json({ ok: true, source: 'env' });
    return;
  }

  if (!claimedAdminRecord) {
    res.status(404).json({ error: 'Admin awal belum diklaim. Silakan klaim passcode admin terlebih dahulu.' });
    return;
  }

  const derived = crypto.scryptSync(passcode, claimedAdminRecord.salt, 64);
  const stored = Buffer.from(claimedAdminRecord.hash, 'hex');
  if (derived.length !== stored.length || !crypto.timingSafeEqual(derived, stored)) {
    res.status(403).json({ error: 'Passcode admin tidak cocok.' });
    return;
  }

  res.json({ ok: true, source: 'claimed' });
});

// Server-side Gemini client
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi pada panel Secrets server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// AI Business Assistant Chat Endpoint
app.post('/api/ai/chat', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { question, businessName, outletName, periodLabel, metricsSnapshot, history } = req.body as {
      question?: unknown;
      businessName?: unknown;
      outletName?: unknown;
      periodLabel?: unknown;
      metricsSnapshot?: unknown;
      history?: Array<{ role: 'user' | 'model'; text: string }>;
    };

    if (typeof question !== 'string' || !question.trim() || question.length > 2000) {
      res.status(400).json({ error: 'Pertanyaan harus berupa teks 1–2000 karakter.' });
      return;
    }
    if (!metricsSnapshot || typeof metricsSnapshot !== 'object') {
      res.status(400).json({ error: 'Data metrik bisnis tidak valid.' });
      return;
    }

    const ai = getGeminiClient();
    const safeBiz = typeof businessName === 'string' ? businessName.slice(0, 120) : 'Bisnis F&B';
    const safeOutlet = typeof outletName === 'string' ? outletName.slice(0, 120) : 'Semua Outlet';
    const safePeriod = typeof periodLabel === 'string' ? periodLabel.slice(0, 80) : 'Periode Terpilih';

    const systemInstruction = `Anda adalah EzFlow AI Business Assistant untuk bisnis F&B Indonesia bernama "${safeBiz}" (Outlet: ${safeOutlet}, Periode: ${safePeriod}).
ATURAN KETAT:
1. Gunakan Bahasa Indonesia yang profesional, ringkas, dan praktis untuk pemilik UMKM F&B.
2. DILARANG KERAS mengarang angka, persentase, atau statistik yang tidak ada di dalam JSON DATA TERSTRUKTUR di bawah ini.
3. Jika data tidak mencukupi (misalnya 0 transaksi atau tidak ada data historis), nyatakan dengan jujur bahwa data belum mencukupi dan sarankan langkah pengumpulan data.
4. Bedakan secara eksplisit antara [Fakta Data] dan [Estimasi / Rekomendasi].
5. Format mata uang dalam Rupiah (Rp).

JSON DATA TERSTRUKTUR AKTUAL:
${JSON.stringify(metricsSnapshot).slice(0, 24000)}`;

    const safeHistory = Array.isArray(history)
      ? history
          .slice(-6)
          .filter((h) => h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string')
          .map((h) => ({
            role: h.role,
            parts: [{ text: h.text.slice(0, 1500) }],
          }))
      : [];

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: [
        ...safeHistory,
        { role: 'user', parts: [{ text: question.trim() }] },
      ],
      config: {
        systemInstruction,
      },
    });

    const answer = response.text?.trim();
    if (!answer) {
      res.status(502).json({ error: 'Model AI tidak mengembalikan jawaban.' });
      return;
    }

    res.json({ answer });
  } catch (err) {
    console.error('Gemini chat error:', err);
    const msg = err instanceof Error ? err.message : 'Gagal menghubungi layanan Gemini AI.';
    res.status(500).json({ error: msg });
  }
});

// Structured AI Insights Endpoint (Forecasting, Menu, Inventory, Promotions, Summary)
app.post('/api/ai/analyze', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { moduleType, businessName, outletName, periodLabel, metricsSnapshot } = req.body as {
      moduleType?: unknown;
      businessName?: unknown;
      outletName?: unknown;
      periodLabel?: unknown;
      metricsSnapshot?: unknown;
    };

    const allowedModules = ['forecasting', 'menu', 'inventory', 'promotions', 'summary'];
    if (typeof moduleType !== 'string' || !allowedModules.includes(moduleType)) {
      res.status(400).json({ error: 'Tipe modul AI tidak valid.' });
      return;
    }
    if (!metricsSnapshot || typeof metricsSnapshot !== 'object') {
      res.status(400).json({ error: 'Snapshot data bisnis wajib disertakan.' });
      return;
    }

    const ai = getGeminiClient();
    const safeBiz = typeof businessName === 'string' ? businessName.slice(0, 120) : 'Bisnis F&B';
    const safeOutlet = typeof outletName === 'string' ? outletName.slice(0, 120) : 'Semua Outlet';
    const safePeriod = typeof periodLabel === 'string' ? periodLabel.slice(0, 80) : 'Periode Terpilih';

    const modulePrompts: Record<string, string> = {
      forecasting: 'Analisis tren penjualan historis, jam ramai (peak hours), jam sepi (slow periods), dan buat komentar proyeksi permintaan. Tandai semua proyeksi secara eksplisit sebagai Estimasi AI dan cantumkan keterbatasan data.',
      menu: 'Analisis performa menu: produk terlaris, kurang laku, margin tertinggi, margin rendah, serta rekomendasi optimasi menu, penyesuaian harga, bundling, dan penempatan menu.',
      inventory: 'Analisis konsumsi bahan baku, potensi kehabisan stok (stockout), pemborosan, dan prioritas restock berdasarkan data stok dan ambang batas minimum aktual.',
      promotions: 'Identifikasi periode sepi dan rekomendasikan kampanye promosi (happy hour, bundling, diskon terarah, program loyalitas) berdasarkan data aktual.',
      summary: 'Buat ringkasan eksekutif bisnis (ringkasan kinerja pendapatan, pengeluaran, laba kotor estimasi, stok kritis, dan 3 prioritas tindakan pemilik).',
    };

    const systemInstruction = `Anda adalah Analis Bisnis F&B AI di platform EzFlow untuk "${safeBiz}" (Outlet: ${safeOutlet}, Periode: ${safePeriod}).
TUGAS: ${modulePrompts[moduleType]}
ATURAN WAJIB:
- Gunakan Bahasa Indonesia profesional.
- HANYA gunakan angka yang ada pada JSON DATA AKTUAL di bawah ini. Jangan pernah mengarang angka statistik baru.
- Jika transaksi masih sedikit atau kosong, jelaskan keterbatasan tersebut dalam kolom limitations.
- Setiap rekomendasi harus memiliki masalah bisnis, data pendukung dari JSON, aksi yang disarankan, manfaat yang diharapkan, dan tingkat keyakinan (Tinggi / Sedang / Rendah).

JSON DATA AKTUAL:
${JSON.stringify(metricsSnapshot).slice(0, 24000)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Hasilkan analisis terstruktur untuk modul ${moduleType} berdasarkan data bisnis aktual.`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING, description: 'Ringkasan utama 1 kalimat.' },
            dataPeriod: { type: Type.STRING, description: 'Periode data yang dianalisis.' },
            factualHighlights: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Poin fakta numerik yang langsung diambil dari data aktual.',
            },
            estimatesAndTrends: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Estimasi atau interpretasi tren (harus ditandai sebagai estimasi).',
            },
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  businessProblem: { type: Type.STRING },
                  supportingData: { type: Type.STRING },
                  suggestedAction: { type: Type.STRING },
                  expectedBenefit: { type: Type.STRING },
                  confidenceLevel: { type: Type.STRING },
                },
              },
            },
            limitations: { type: Type.STRING, description: 'Catatan keterbatasan data.' },
          },
        },
      },
    });

    const rawText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawText);
    res.json({ result: parsed });
  } catch (err) {
    console.error('Gemini analyze error:', err);
    const msg = err instanceof Error ? err.message : 'Gagal menghasilkan analisis AI.';
    res.status(500).json({ error: msg });
  }
});

// Secure CCTV Video Upload Directory & Multer Setup
const CCTV_UPLOAD_BASE = path.resolve(process.cwd(), 'uploads', 'cctv');
fs.mkdirSync(CCTV_UPLOAD_BASE, { recursive: true });

const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/x-m4v',
]);

const cctvUploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, CCTV_UPLOAD_BASE);
    },
    filename: (_req, file, cb) => {
      const safeExt = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.mp4';
      const generatedName = `cctv_${Date.now()}_${crypto.randomUUID()}${safeExt}`;
      const resolved = path.resolve(CCTV_UPLOAD_BASE, generatedName);
      if (!resolved.startsWith(CCTV_UPLOAD_BASE + path.sep)) {
        cb(new Error('Path file tidak valid.'), '');
        return;
      }
      cb(null, generatedName);
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const validExt = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'].includes(ext);
    if (!ALLOWED_VIDEO_MIMES.has(file.mimetype) && !validExt) {
      cb(new Error('Format video tidak didukung. Gunakan MP4, WebM, MOV, AVI, atau MKV.'));
      return;
    }
    cb(null, true);
  },
});

// SSRF protection helpers for remote camera URLs
function isBlockedIpAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true; // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // multicast & reserved
    return false;
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
    if (normalized.startsWith('fe80:') || normalized.startsWith('ff')) return true; // link-local / multicast
    if (normalized.startsWith('::ffff:')) {
      return isBlockedIpAddress(normalized.slice('::ffff:'.length));
    }
    return false;
  }
  return true;
}

async function validateExternalCameraUrl(rawUrl: string): Promise<
  | { ok: true; url: URL }
  | { ok: false; isPrivateLan?: boolean; error: string }
> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: 'Format URL kamera tidak valid. Gunakan awalan https://, http://, atau rtsp://.' };
  }

  const allowedProtocols = new Set(['http:', 'https:', 'rtsp:', 'rtsps:']);
  if (!allowedProtocols.has(parsed.protocol)) {
    return { ok: false, error: 'Protokol tidak didukung. Gunakan http://, https://, atau rtsp://.' };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) {
    return { ok: false, error: 'Hostname kamera tidak boleh kosong.' };
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return {
      ok: false,
      isPrivateLan: true,
      error:
        'Alamat kamera lokal/LAN tidak dapat diambil langsung oleh server cloud. Gunakan mode "Snapshot Langsung Browser (LAN)" atau hubungkan via USB/Capture Card atau unggah klip rekaman.',
    };
  }

  if (net.isIP(host)) {
    if (isBlockedIpAddress(host)) {
      return {
        ok: false,
        isPrivateLan: true,
        error:
          'IP jaringan lokal/privat (mis. 192.168.x.x atau 10.x.x.x) tidak bisa diakses langsung dari server cloud. Gunakan mode "Snapshot Langsung Browser (LAN)" pada jaringan Wi-Fi yang sama, DDNS publik, atau unggah rekaman.',
      };
    }
    return { ok: true, url: parsed };
  }

  try {
    const records = await dns.lookup(host, { all: true });
    if (!records || records.length === 0) {
      return { ok: false, error: `Hostname kamera "${host}" tidak dapat di-resolve.` };
    }
    for (const rec of records) {
      if (isBlockedIpAddress(rec.address)) {
        return {
          ok: false,
          isPrivateLan: true,
          error:
            'Hostname kamera mengarah ke jaringan privat/internal. Gunakan mode Snapshot Langsung Browser (LAN) atau hubungkan kamera via publik/DDNS.',
        };
      }
    }
  } catch {
    return { ok: false, error: `Gagal memeriksa alamat DNS kamera "${host}". Pastikan URL dapat diakses.` };
  }

  return { ok: true, url: parsed };
}

function resolveSafeCctvFile(storedFileName: string): string | null {
  if (!storedFileName || !/^[a-zA-Z0-9_.\-]+$/.test(storedFileName) || storedFileName.includes('..')) {
    return null;
  }
  const resolved = path.resolve(CCTV_UPLOAD_BASE, storedFileName);
  if (!resolved.startsWith(CCTV_UPLOAD_BASE + path.sep)) {
    return null;
  }
  return resolved;
}

async function probeVideoDurationSec(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', filePath],
      { timeout: 8000 }
    );
    const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
    const dur = Number(parsed.format?.duration);
    return Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 0;
  } catch {
    return 0;
  }
}

async function extractVideoKeyframes(
  filePath: string,
  durationSec: number
): Promise<Array<{ timestampLabel: string; mimeType: string; dataBase64: string }>> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ezflow_cv_'));
  const frames: Array<{ timestampLabel: string; mimeType: string; dataBase64: string }> = [];
  try {
    const targetCount = durationSec >= 30 ? 8 : durationSec >= 10 ? 6 : durationSec >= 3 ? 4 : 2;
    const effectiveDur = Math.max(durationSec, 1);

    for (let i = 0; i < targetCount; i++) {
      const seekSec = Math.min(
        Math.max(0, effectiveDur - 0.3),
        Number(((effectiveDur * i) / (targetCount - 1)).toFixed(2))
      );
      const outPath = path.join(tempDir, `frame_${i}.jpg`);
      try {
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-ss',
            String(seekSec),
            '-i',
            filePath,
            '-frames:v',
            '1',
            '-vf',
            "scale='min(1280,iw)':-2",
            '-q:v',
            '4',
            outPath,
          ],
          { timeout: 10000 }
        );
        if (fs.existsSync(outPath)) {
          const buf = fs.readFileSync(outPath);
          if (buf.length > 0) {
            const mins = Math.floor(seekSec / 60);
            const secs = Math.floor(seekSec % 60);
            const label = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            frames.push({
              timestampLabel: label,
              mimeType: 'image/jpeg',
              dataBase64: buf.toString('base64'),
            });
          }
        }
      } catch {
        // Ignore single-frame seek misses near end of clip
      }
    }
    return frames;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runGeminiCctvVision(params: {
  frames: Array<{ timestampLabel: string; mimeType: string; dataBase64: string }>;
  cameraName: string;
  locationArea: string;
  outletName: string;
  tableCapacity?: number;
  videoDurationSec: number;
  isLiveSnapshot?: boolean;
}) {
  const ai = getGeminiClient();
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  params.frames.forEach((frame, idx) => {
    parts.push({
      text: `Frame ${idx + 1} (Waktu: ${frame.timestampLabel}):`,
    });
    parts.push({
      inlineData: {
        mimeType: frame.mimeType,
        data: frame.dataBase64,
      },
    });
  });

  const capHint =
    typeof params.tableCapacity === 'number' && params.tableCapacity > 0
      ? `Kapasitas referensi area kamera ini adalah ${params.tableCapacity} kursi.`
      : 'Estimasi jumlah total kursi berdasarkan kursi/meja yang terlihat pada visual.';

  parts.push({
    text: `Analisa visual Computer Vision untuk outlet "${params.outletName}", kamera "${params.cameraName}" (Area: ${params.locationArea}). ${capHint}
Tipe input: ${params.isLiveSnapshot ? 'Snapshot Kamera Langsung' : `Rekaman Video (${params.videoDurationSec} detik, ${params.frames.length} frame sampel)`}.

ATURAN WAJIB:
1. Hitung HANYA orang, kursi terisi, dan antrean yang benar-benar terlihat di frame. Jika area kosong atau gelap, kembalikan 0 dan jelaskan jujur di summary & confidenceNote.
2. DILARANG melakukan pengenalan wajah atau menyebut identitas pribadi siapa pun (zero facial recognition).
3. Gunakan Bahasa Indonesia yang ringkas dan operasional untuk pemilik/manajer F&B.
4. Untuk setiap frame sampel, isi array timeline dengan jumlah orang, estimasi persentase okupansi, estimasi antrean, dan catatan aktivitas singkat.
5. Kelompokkan pengamatan area menjadi 1–4 zona logis pada array zones (misal: Area Duduk Utama, Area Kasir, Meja Bar/Jendela, Pintu Masuk).`,
  });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      systemInstruction:
        'Anda adalah mesin Computer Vision Analitik Spasial untuk industri F&B di platform EzFlow. Keluarkan hanya JSON terstruktur sesuai skema.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: 'Ringkasan kondisi aktual pada rekaman/frame dalam 1-2 kalimat.' },
          peopleCount: { type: Type.INTEGER, description: 'Rata-rata atau jumlah orang terdeteksi pada frame.' },
          peakPeopleCount: { type: Type.INTEGER, description: 'Jumlah orang tertinggi yang terlihat dalam 1 frame.' },
          occupiedSeats: { type: Type.INTEGER, description: 'Estimasi jumlah kursi yang sedang ditempati.' },
          estimatedTotalSeats: { type: Type.INTEGER, description: 'Estimasi total kursi terlihat atau kapasitas referensi.' },
          occupancyPercent: { type: Type.INTEGER, description: 'Persentase okupansi kursi (0-100).' },
          queueCount: { type: Type.INTEGER, description: 'Jumlah orang yang mengantre di kasir/bar.' },
          estimatedQueueMinutes: { type: Type.NUMBER, description: 'Estimasi waktu tunggu antrean dalam menit.' },
          crowdDensity: { type: Type.STRING, description: 'Harus salah satu dari: sepi, sedang, ramai, padat' },
          zones: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                zoneName: { type: Type.STRING },
                peopleCount: { type: Type.INTEGER },
                occupancyPercent: { type: Type.INTEGER },
                status: { type: Type.STRING, description: 'Salah satu dari: optimal, padat, longgar' },
                note: { type: Type.STRING },
              },
            },
          },
          timeline: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                timestampLabel: { type: Type.STRING },
                peopleCount: { type: Type.INTEGER },
                occupancyPercent: { type: Type.INTEGER },
                queueCount: { type: Type.INTEGER },
                activityNote: { type: Type.STRING },
              },
            },
          },
          observations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Temuan operasional konkret dari visual.',
          },
          recommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Rekomendasi tindakan langsung untuk tim outlet.',
          },
          confidenceNote: { type: Type.STRING, description: 'Catatan sudut pandang, pencahayaan, atau keterbatasan frame.' },
        },
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
  const densityRaw = String(parsed.crowdDensity || 'sepi').toLowerCase();
  const crowdDensity = (['sepi', 'sedang', 'ramai', 'padat'].includes(densityRaw)
    ? densityRaw
    : 'sepi') as 'sepi' | 'sedang' | 'ramai' | 'padat';

  const clampInt = (val: unknown, min: number, max: number) => {
    const num = Number(val);
    return Number.isFinite(num) ? Math.max(min, Math.min(max, Math.round(num))) : min;
  };

  const zones = Array.isArray(parsed.zones)
    ? parsed.zones.slice(0, 6).map((z: Record<string, unknown>) => {
        const st = String(z?.status || 'optimal').toLowerCase();
        return {
          zoneName: String(z?.zoneName || params.locationArea).slice(0, 100),
          peopleCount: clampInt(z?.peopleCount, 0, 500),
          occupancyPercent: clampInt(z?.occupancyPercent, 0, 100),
          status: (['optimal', 'padat', 'longgar'].includes(st) ? st : 'optimal') as 'optimal' | 'padat' | 'longgar',
          note: String(z?.note || '').slice(0, 220),
        };
      })
    : [];

  const timeline = Array.isArray(parsed.timeline)
    ? parsed.timeline.slice(0, 12).map((t: Record<string, unknown>, idx: number) => ({
        timestampLabel: String(t?.timestampLabel || params.frames[idx]?.timestampLabel || `F${idx + 1}`).slice(0, 30),
        peopleCount: clampInt(t?.peopleCount, 0, 500),
        occupancyPercent: clampInt(t?.occupancyPercent, 0, 100),
        queueCount: clampInt(t?.queueCount, 0, 200),
        activityNote: String(t?.activityNote || '').slice(0, 180),
      }))
    : [];

  return {
    summary: String(parsed.summary || 'Analisa visual selesai.').slice(0, 500),
    videoDurationSec: params.videoDurationSec,
    framesAnalyzed: params.frames.length,
    peopleCount: clampInt(parsed.peopleCount, 0, 500),
    peakPeopleCount: clampInt(parsed.peakPeopleCount ?? parsed.peopleCount, 0, 500),
    occupiedSeats: clampInt(parsed.occupiedSeats, 0, 500),
    estimatedTotalSeats: clampInt(parsed.estimatedTotalSeats || params.tableCapacity || 0, 0, 500),
    occupancyPercent: clampInt(parsed.occupancyPercent, 0, 100),
    queueCount: clampInt(parsed.queueCount, 0, 200),
    estimatedQueueMinutes: Math.max(0, Math.min(120, Number(Number(parsed.estimatedQueueMinutes || 0).toFixed(1)))),
    crowdDensity,
    zones,
    timeline,
    observations: Array.isArray(parsed.observations)
      ? parsed.observations.slice(0, 6).map((x) => String(x).slice(0, 220))
      : [],
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.slice(0, 6).map((x) => String(x).slice(0, 220))
      : [],
    confidenceNote: String(parsed.confidenceNote || 'Analisa dihasilkan dari frame kamera tanpa pengenalan wajah.').slice(0, 300),
  };
}

app.get('/api/cctv/processor-status', requireFirebaseAuth, (_req, res) => {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  res.json({
    connected: geminiConfigured,
    mode: geminiConfigured ? 'gemini_vision_active' : 'missing_gemini_key',
    engine: 'Gemini 4 Vision + FFmpeg Keyframe Pipeline',
    message: geminiConfigured
      ? 'Pipeline Computer Vision aktif dan siap menghubungkan kamera langsung (Webcam/USB, Snapshot/Stream IP) maupun menganalisa rekaman video CCTV.'
      : 'GEMINI_API_KEY belum dikonfigurasi pada panel Secrets server sehingga analisa Computer Vision belum dapat dijalankan.',
    targetCapabilities: [
      'Penghitungan Pengunjung & Antrean',
      'Okupansi Kursi & Utilisasi Meja',
      'Kepadatan Area & Heatmap Zona',
      'Analisa Timeline Rekaman Video',
      'Live Snapshot Webcam / Kamera IP',
      'Zero Facial Recognition (Privasi Terjaga)',
    ],
  });
});

app.post('/api/cctv/upload', requireFirebaseAuth, (req: AuthenticatedRequest, res) => {
  cctvUploadMiddleware.single('video')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal mengunggah video CCTV.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'File video wajib dipilih.' });
      return;
    }

    res.json({
      ok: true,
      storedFileName: req.file.filename,
      originalName: req.file.originalname.slice(0, 160),
      fileSizeBytes: req.file.size,
      mimeType: req.file.mimetype || 'video/mp4',
      jobStatus: 'uploaded',
      processorMessage: 'Video berhasil diunggah ke penyimpanan aman server dan siap dianalisa oleh Computer Vision.',
    });
  });
});

app.get('/api/cctv/video/:storedFileName', requireFirebaseAuth, (req: AuthenticatedRequest, res) => {
  const filePath = resolveSafeCctvFile(String(req.params.storedFileName || ''));
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File rekaman video tidak ditemukan di server.' });
    return;
  }
  res.sendFile(filePath);
});

app.post('/api/cctv/analyze', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { storedFileName, cameraName, locationArea, outletName, tableCapacity } = req.body as {
      storedFileName?: unknown;
      cameraName?: unknown;
      locationArea?: unknown;
      outletName?: unknown;
      tableCapacity?: unknown;
    };

    if (typeof storedFileName !== 'string') {
      res.status(400).json({ error: 'Nama file video tersimpan (storedFileName) wajib disertakan.' });
      return;
    }

    const filePath = resolveSafeCctvFile(storedFileName);
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File rekaman video tidak ditemukan di server. Silakan unggah ulang video.' });
      return;
    }

    const durationSec = await probeVideoDurationSec(filePath);
    const frames = await extractVideoKeyframes(filePath, durationSec);
    if (frames.length === 0) {
      res.status(422).json({
        error: 'Gagal mengekstrak frame dari file video. Pastikan video tidak korup dan berformat MP4, WebM, MOV, AVI, atau MKV.',
      });
      return;
    }

    const analysisResult = await runGeminiCctvVision({
      frames,
      cameraName: typeof cameraName === 'string' && cameraName.trim() ? cameraName.slice(0, 120) : 'Kamera CCTV',
      locationArea: typeof locationArea === 'string' && locationArea.trim() ? locationArea.slice(0, 120) : 'Area Outlet',
      outletName: typeof outletName === 'string' && outletName.trim() ? outletName.slice(0, 120) : 'Outlet',
      tableCapacity: typeof tableCapacity === 'number' ? tableCapacity : undefined,
      videoDurationSec: durationSec,
      isLiveSnapshot: false,
    });

    res.json({
      ok: true,
      analysisResult,
      analyzedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('CCTV video analyze error:', err);
    const msg = err instanceof Error ? err.message : 'Gagal menganalisa video CCTV dengan Computer Vision.';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/cctv/analyze-frame', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { imageDataUrl, cameraName, locationArea, outletName, tableCapacity } = req.body as {
      imageDataUrl?: unknown;
      cameraName?: unknown;
      locationArea?: unknown;
      outletName?: unknown;
      tableCapacity?: unknown;
    };

    if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: 'Snapshot gambar kamera tidak valid.' });
      return;
    }
    const match = imageDataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      res.status(400).json({ error: 'Format gambar harus JPEG, PNG, atau WebP base64.' });
      return;
    }
    const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
    const dataBase64 = match[2];
    if (dataBase64.length > 8 * 1024 * 1024) {
      res.status(400).json({ error: 'Ukuran frame snapshot melebihi batas maksimum.' });
      return;
    }

    const analysisResult = await runGeminiCctvVision({
      frames: [
        {
          timestampLabel: 'Live Snapshot',
          mimeType,
          dataBase64,
        },
      ],
      cameraName: typeof cameraName === 'string' && cameraName.trim() ? cameraName.slice(0, 120) : 'Kamera Langsung',
      locationArea: typeof locationArea === 'string' && locationArea.trim() ? locationArea.slice(0, 120) : 'Area Outlet',
      outletName: typeof outletName === 'string' && outletName.trim() ? outletName.slice(0, 120) : 'Outlet',
      tableCapacity: typeof tableCapacity === 'number' ? tableCapacity : undefined,
      videoDurationSec: 0,
      isLiveSnapshot: true,
    });

    res.json({
      ok: true,
      analysisResult,
      analyzedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('CCTV live frame analyze error:', err);
    const msg = err instanceof Error ? err.message : 'Gagal menganalisa snapshot kamera.';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/cctv/capture-remote-frame', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { streamUrl, analyze, cameraName, locationArea, outletName, tableCapacity } = req.body as {
      streamUrl?: unknown;
      analyze?: unknown;
      cameraName?: unknown;
      locationArea?: unknown;
      outletName?: unknown;
      tableCapacity?: unknown;
    };

    if (typeof streamUrl !== 'string' || !streamUrl.trim() || streamUrl.length > 500) {
      res.status(400).json({ error: 'URL stream atau snapshot kamera wajib diisi.' });
      return;
    }

    const validation = await validateExternalCameraUrl(streamUrl);
    if (!validation.ok) {
      res.status(validation.isPrivateLan ? 422 : 400).json({
        error: validation.error,
        isPrivateLan: Boolean(validation.isPrivateLan),
      });
      return;
    }

    const targetUrl = validation.url.toString();
    let jpegBuffer: Buffer | null = null;
    let contentMime = 'image/jpeg';

    if (validation.url.protocol === 'http:' || validation.url.protocol === 'https:') {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        const snapRes = await fetch(targetUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { Accept: 'image/*,application/vnd.apple.mpegurl,*/*' },
        });
        clearTimeout(timer);

        const ctype = (snapRes.headers.get('content-type') || '').toLowerCase();
        if (snapRes.ok && ctype.startsWith('image/')) {
          const arr = Buffer.from(await snapRes.arrayBuffer());
          if (arr.length > 0 && arr.length <= 6 * 1024 * 1024) {
            jpegBuffer = arr;
            contentMime = ctype.includes('png') ? 'image/png' : ctype.includes('webp') ? 'image/webp' : 'image/jpeg';
          }
        }
      } catch {
        // Fall through to ffmpeg stream frame extraction
      }
    }

    if (!jpegBuffer) {
      try {
        const ffmpegArgs =
          validation.url.protocol === 'rtsp:' || validation.url.protocol === 'rtsps:'
            ? ['-y', '-rtsp_transport', 'tcp', '-i', targetUrl, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-']
            : ['-y', '-i', targetUrl, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'];
        const { stdout } = await execFileAsync('ffmpeg', ffmpegArgs, {
          timeout: 12000,
          encoding: 'buffer',
          maxBuffer: 8 * 1024 * 1024,
        });
        if (stdout && stdout.length > 0) {
          jpegBuffer = stdout;
          contentMime = 'image/jpeg';
        }
      } catch (ffErr) {
        console.warn('Remote ffmpeg capture failed:', ffErr instanceof Error ? ffErr.message : ffErr);
      }
    }

    if (!jpegBuffer || jpegBuffer.length === 0) {
      res.status(502).json({
        error:
          'Tidak dapat mengambil frame dari URL kamera tersebut. Pastikan kamera online, publik, tidak terblokir firewall, dan mendukung RTSP/HLS/MJPEG/HTTP Snapshot.',
      });
      return;
    }

    const frameBase64 = jpegBuffer.toString('base64');
    const frameDataUrl = `data:${contentMime};base64,${frameBase64}`;

    if (!analyze) {
      res.json({ ok: true, frameDataUrl });
      return;
    }

    const analysisResult = await runGeminiCctvVision({
      frames: [
        {
          timestampLabel: 'Remote Stream Frame',
          mimeType: contentMime,
          dataBase64: frameBase64,
        },
      ],
      cameraName: typeof cameraName === 'string' && cameraName.trim() ? cameraName.slice(0, 120) : 'Kamera Jaringan',
      locationArea: typeof locationArea === 'string' && locationArea.trim() ? locationArea.slice(0, 120) : 'Area Outlet',
      outletName: typeof outletName === 'string' && outletName.trim() ? outletName.slice(0, 120) : 'Outlet',
      tableCapacity: typeof tableCapacity === 'number' ? tableCapacity : undefined,
      videoDurationSec: 0,
      isLiveSnapshot: true,
    });

    res.json({
      ok: true,
      frameDataUrl,
      analysisResult,
      analyzedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Capture remote camera frame error:', err);
    const msg = err instanceof Error ? err.message : 'Gagal menghubungkan ke kamera jarak jauh.';
    res.status(500).json({ error: msg });
  }
});

// Secure Menu Product Image Upload Directory & Static Serving
const MENU_UPLOAD_BASE = path.resolve(process.cwd(), 'uploads', 'menu');
fs.mkdirSync(MENU_UPLOAD_BASE, { recursive: true });
app.use('/uploads/menu', express.static(MENU_UPLOAD_BASE));

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const menuImageUploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, MENU_UPLOAD_BASE);
    },
    filename: (_req, file, cb) => {
      const safeExt = IMAGE_MIME_TO_EXT[file.mimetype] || '.jpg';
      const generatedName = `menu_${Date.now()}_${crypto.randomUUID()}${safeExt}`;
      const resolved = path.resolve(MENU_UPLOAD_BASE, generatedName);
      if (!resolved.startsWith(MENU_UPLOAD_BASE + path.sep)) {
        cb(new Error('Path gambar tidak valid.'), '');
        return;
      }
      cb(null, generatedName);
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIMES.has(file.mimetype)) {
      cb(new Error('Format gambar tidak didukung. Gunakan JPG, PNG, atau WebP.'));
      return;
    }
    cb(null, true);
  },
});

app.post('/api/menu/upload-image', requireFirebaseAuth, (req: AuthenticatedRequest, res) => {
  menuImageUploadMiddleware.single('image')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal mengunggah gambar menu.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'File gambar wajib dipilih.' });
      return;
    }

    res.json({
      ok: true,
      imageUrl: `/uploads/menu/${req.file.filename}`,
      originalName: req.file.originalname.slice(0, 120),
      fileSizeBytes: req.file.size,
      mimeType: req.file.mimetype,
    });
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EzFlow server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start EzFlow server:', err);
  process.exit(1);
});
