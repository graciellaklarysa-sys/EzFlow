# EzFlow Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Tenant Isolation**: Every business subcollection document (`/businesses/{businessId}/...`) MUST belong to an existing parent `/businesses/{businessId}`, carry matching `businessId` and `ownerUid`, and be readable/writable ONLY by verified members of that business (`ownerUid == request.auth.uid || request.auth.uid in memberUids`) or verified `SUPER_ADMIN`.
2. **Privilege Escalation Prevention**: Users cannot self-assign `role: "SUPER_ADMIN"` in `/users/{userId}` or write to `/admins/{userId}`.
3. **Path & Size Hardening**: All document IDs (`businessId`, `outletId`, `productId`, etc.) must match `^[a-zA-Z0-9_\-]+$` and be `<= 128` chars. Every string and array has strict upper size limits.
4. **Immutable Fields & Temporal Integrity**: `createdAt` must equal `request.time` on create and remain unchanged on update; `updatedAt` must equal `request.time` on create and update; `ownerUid` and `businessId` are immutable after create.
5. **Non-Negative Stock & Terminal Transaction Lock**: Ingredient `stock >= 0`; completed transactions cannot be arbitrarily overwritten except via explicit refund/cancellation transitions that preserve historical amounts and items.
6. **Zero Blanket List Queries**: Every `allow list` rule validates `resource.data` against `request.auth.uid` without `get()` or `exists()` calls.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Shadow Field Injection on User Create**: `{ uid, name, email, role: "SUPER_ADMIN", onboardingCompleted: false, createdAt, updatedAt }` -> Rejected (`role` cannot be `SUPER_ADMIN`).
2. **Cross-Tenant Read**: User B queries `/businesses/biz_A/transactions` where `biz_A` has `ownerUid: "user_A"` and `memberUids: ["user_A"]` -> Rejected (`allow list` checks `resource.data`).
3. **Oversized ID Poisoning**: Creating `/businesses/aaa...200chars...` -> Rejected (`isValidId` rejects > 128 chars).
4. **Fake Timestamp Backdating**: Creating a transaction with `createdAt: Timestamp(2020-01-01)` -> Rejected (`createdAt == request.time`).
5. **Owner Hijack on Update**: Updating `/businesses/{id}` with `{ ownerUid: "attacker" }` -> Rejected (`ownerUid` immutable).
6. **Negative Inventory Injection**: Updating ingredient `{ stock: -50 }` -> Rejected (`stock >= 0`).
7. **Unverified Email Write**: Request with `request.auth.token.email_verified == false` -> Rejected (`isVerified()`).
8. **Ghost Field on Product Update**: Updating product `{ price: 25000, adminOverride: true }` -> Rejected (`affectedKeys().hasOnly(...)` + `isValidProduct`).
9. **Empty Array Type Bypass on Transaction**: Creating transaction with `items: []` -> Rejected (`items.size() > 0 && items[0] is map`).
10. **Audit Log Tampering**: Updating or deleting `/businesses/{id}/audit_logs/{logId}` -> Rejected (`allow update, delete: if false`).
11. **PII Leak via User List**: Non-admin querying `collection(db, 'users')` -> Rejected (`allow list` restricted to `resource.data.uid == request.auth.uid`).
12. **Terminal Transaction Price Alteration**: Updating a `completed` transaction's `total` or `items` -> Rejected (only `status` transition to `refunded`/`cancelled` + `notes` + `updatedAt` allowed; `pending` -> `completed` allows payment settlement fields while still locking `total`, `subtotal`, and `items`).
