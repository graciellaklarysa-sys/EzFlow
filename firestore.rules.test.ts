/**
 * Phase 0: Firestore Rules Security Test Suite (Dirty Dozen Verification)
 * Run with Firebase Emulator (@firebase/rules-unit-testing) when emulator is active.
 */

export const DIRTY_DOZEN_TESTS = [
  {
    name: '1. Shadow Field Injection on User Create (SUPER_ADMIN role escalation)',
    path: '/users/attacker_uid',
    operation: 'create',
    payload: {
      uid: 'attacker_uid',
      name: 'Attacker',
      email: 'attacker@example.com',
      role: 'SUPER_ADMIN',
      onboardingCompleted: false,
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Cross-Tenant Read on Business Transactions',
    path: '/businesses/biz_A/transactions',
    operation: 'list',
    actor: 'user_B',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Oversized ID Poisoning (>128 chars)',
    path: `/businesses/${'a'.repeat(150)}`,
    operation: 'create',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Fake Timestamp Backdating on Transaction Create',
    path: '/businesses/biz_A/transactions/tx_1',
    operation: 'create',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Owner Hijack on Business Update',
    path: '/businesses/biz_A',
    operation: 'update',
    payload: { ownerUid: 'attacker_uid' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Negative Inventory Injection',
    path: '/businesses/biz_A/ingredients/ing_1',
    operation: 'update',
    payload: { stock: -50 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. Unverified Email Write Attempt',
    path: '/businesses/biz_A/expenses/exp_1',
    operation: 'create',
    authClaims: { email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Ghost Field on Product Update',
    path: '/businesses/biz_A/products/prod_1',
    operation: 'update',
    payload: { price: 25000, adminOverride: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. Empty Items Array Bypass on Transaction Create',
    path: '/businesses/biz_A/transactions/tx_2',
    operation: 'create',
    payload: { items: [] },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Audit Log Tampering (Update/Delete)',
    path: '/businesses/biz_A/audit_logs/log_1',
    operation: 'delete',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. PII Leak via Users List Query',
    path: '/users',
    operation: 'list',
    actor: 'regular_user',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Terminal Transaction Price Alteration',
    path: '/businesses/biz_A/transactions/tx_completed',
    operation: 'update',
    payload: { total: 100, status: 'completed' },
    expected: 'PERMISSION_DENIED',
  },
];
