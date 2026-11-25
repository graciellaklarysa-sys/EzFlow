import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  reportListenerError,
  testFirestoreConnection,
} from '../lib/firebase';
import { clampStr } from '../lib/format';
import type { Business, UserProfile, UserRole } from '../types/ezflow';

interface AuthContextValue {
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  businesses: Business[];
  activeBusiness: Business | null;
  activeOutletId: string;
  setActiveOutletId: (outletId: string) => void;
  loadingAuth: boolean;
  loadingBusinesses: boolean;
  connectionOffline: boolean;
  authDataError: string | null;
  effectiveRole: UserRole;
  signInWithGoogle: () => Promise<void>;
  registerWithEmail: (name: string, email: string, password: string) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  sendResetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  selectBusiness: (businessId: string) => Promise<void>;
  getIdToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

const SUPER_ADMIN_EMAILS = new Set(['graciellaklarysa@gmail.com', 'admin@ezflow.demo']);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<string>('');
  const [activeOutletId, setActiveOutletId] = useState<string>('ALL');
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [connectionOffline, setConnectionOffline] = useState(false);
  const [authDataError, setAuthDataError] = useState<string | null>(null);

  useEffect(() => {
    testFirestoreConnection().then((res) => {
      if (res.offline) setConnectionOffline(true);
    });
  }, []);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setUserProfile(null);
        setBusinesses([]);
        setActiveBusinessId('');
        setActiveOutletId('ALL');
        setAuthDataError(null);
        setLoadingAuth(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        const email = (user.email || '').toLowerCase();
        const isSuper = Boolean(user.emailVerified) && SUPER_ADMIN_EMAILS.has(email);

        if (!snap.exists()) {
          const initialProfile: UserProfile = {
            uid: user.uid,
            name: clampStr(user.displayName || email.split('@')[0] || 'Pengguna EzFlow', 120),
            email: clampStr(email, 200),
            role: isSuper ? 'SUPER_ADMIN' : 'OWNER',
            onboardingCompleted: false,
          };
          await setDoc(userRef, {
            ...initialProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setUserProfile(initialProfile);
        } else {
          const data = snap.data() as UserProfile;
          setUserProfile(data);
          if (data.activeBusinessId) {
            setActiveBusinessId(data.activeBusinessId);
          }
        }
        setAuthDataError(null);
      } catch (err) {
        setAuthDataError(reportListenerError(err, OperationType.GET, `users/${user.uid}`));
      } finally {
        setLoadingAuth(false);
      }
    });

    return () => unsub();
  }, []);

  // Subscribe to user profile updates
  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) {
          const profile = snap.data() as UserProfile;
          setUserProfile(profile);
          if (profile.activeBusinessId && !activeBusinessId) {
            setActiveBusinessId(profile.activeBusinessId);
          }
          setAuthDataError(null);
        }
      },
      (err) => setAuthDataError(reportListenerError(err, OperationType.GET, `users/${firebaseUser.uid}`))
    );
    return () => unsub();
  }, [firebaseUser, activeBusinessId]);

  // Subscribe to authorized businesses
  useEffect(() => {
    if (!firebaseUser) {
      setBusinesses([]);
      return;
    }

    setLoadingBusinesses(true);
    const email = (firebaseUser.email || '').toLowerCase();
    const isSuper = Boolean(firebaseUser.emailVerified) && SUPER_ADMIN_EMAILS.has(email);

    const bizQuery = isSuper
      ? query(collection(db, 'businesses'))
      : query(collection(db, 'businesses'), where('memberUids', 'array-contains', firebaseUser.uid));

    const unsub = onSnapshot(
      bizQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Business);
        setBusinesses(list);
        setActiveBusinessId((prev) => {
          if (prev && list.some((b) => b.id === prev)) return prev;
          if (userProfile?.activeBusinessId && list.some((b) => b.id === userProfile.activeBusinessId)) {
            return userProfile.activeBusinessId;
          }
          return list[0]?.id || '';
        });
        setAuthDataError(null);
        setLoadingBusinesses(false);
      },
      (err) => {
        setLoadingBusinesses(false);
        setAuthDataError(reportListenerError(err, OperationType.LIST, 'businesses'));
      }
    );

    return () => unsub();
  }, [firebaseUser, userProfile?.activeBusinessId]);

  const activeBusiness = businesses.find((b) => b.id === activeBusinessId) || businesses[0] || null;

  const effectiveRole: UserRole = (() => {
    const email = (firebaseUser?.email || '').toLowerCase();
    if ((Boolean(firebaseUser?.emailVerified) && SUPER_ADMIN_EMAILS.has(email)) || userProfile?.role === 'SUPER_ADMIN') {
      return 'SUPER_ADMIN';
    }
    if (activeBusiness && firebaseUser) {
      if (activeBusiness.ownerUid === firebaseUser.uid) {
        return 'OWNER';
      }
      const mappedRole = activeBusiness.memberRoles?.[firebaseUser.uid];
      if (mappedRole) {
        return mappedRole;
      }
    }
    return userProfile?.role || 'OWNER';
  })();

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const registerWithEmail = useCallback(async (name: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(cred.user, { displayName: clampStr(name, 120) });
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const sendResetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const selectBusiness = useCallback(
    async (businessId: string) => {
      setActiveBusinessId(businessId);
      setActiveOutletId('ALL');
      if (firebaseUser) {
        try {
          await updateDoc(doc(db, 'users', firebaseUser.uid), {
            activeBusinessId: businessId,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `users/${firebaseUser.uid}`);
        }
      }
    },
    [firebaseUser]
  );

  const getIdToken = useCallback(async () => {
    if (!auth.currentUser) throw new Error('Sesi autentikasi tidak ditemukan.');
    return auth.currentUser.getIdToken();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        businesses,
        activeBusiness,
        activeOutletId,
        setActiveOutletId,
        loadingAuth,
        loadingBusinesses,
        connectionOffline,
        authDataError,
        effectiveRole,
        signInWithGoogle,
        registerWithEmail,
        loginWithEmail,
        sendResetPassword,
        logout,
        selectBusiness,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
