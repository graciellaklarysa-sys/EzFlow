import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function reportListenerError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): string {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Listener Error:', JSON.stringify(errInfo));
  return formatAppError(errInfo.error, 'Gagal memuat data dari server database.');
}

export function formatAppError(err: unknown, fallback = 'Terjadi kesalahan sistem. Silakan coba lagi.'): string {
  let raw = err instanceof Error ? err.message : typeof err === 'string' ? err : fallback;
  if (!raw) return fallback;

  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed && typeof parsed.error === 'string') {
        raw = parsed.error;
      }
    } catch {
      // Keep original message if JSON parsing fails
    }
  }

  const lower = raw.toLowerCase();
  if (lower.includes('permission-denied') || lower.includes('missing or insufficient permissions')) {
    return 'Akses ditolak oleh aturan keamanan database. Pastikan akun dan peran Anda memiliki izin untuk tindakan ini.';
  }
  if (lower.includes('unauthenticated') || lower.includes('auth/')) {
    if (lower.includes('too-many-requests')) return 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.';
    if (lower.includes('network-request-failed')) return 'Koneksi internet bermasalah. Periksa jaringan Anda lalu coba lagi.';
    if (lower.includes('popup-closed-by-user')) return 'Jendela login Google ditutup sebelum selesai.';
  }
  if (lower.includes('unavailable') || lower.includes('the client is offline') || lower.includes('failed to get document')) {
    return 'Koneksi ke server database sedang terganggu atau offline. Silakan coba lagi.';
  }
  if (lower.includes('not-found')) {
    return 'Data yang diminta tidak ditemukan di database.';
  }
  if (lower.includes('aborted') || lower.includes('failed-precondition')) {
    return 'Operasi gagal karena perubahan data bersamaan. Silakan muat ulang dan coba lagi.';
  }
  return raw;
}

export async function testFirestoreConnection(): Promise<{ ok: boolean; offline?: boolean }> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firebase configuration error: client is offline.');
      return { ok: false, offline: true };
    }
    return { ok: true };
  }
}
