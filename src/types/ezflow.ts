export type UserRole = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'CASHIER' | 'STAFF';

export type AppView =
  | 'dashboard'
  | 'pos'
  | 'inventory'
  | 'menu'
  | 'employees'
  | 'finance'
  | 'operations'
  | 'ai'
  | 'cctv'
  | 'reports'
  | 'settings';

export type PaymentMethod = 'Tunai' | 'QRIS' | 'Debit' | 'Transfer Bank';
export type TransactionStatus = 'pending' | 'completed' | 'cancelled' | 'refunded';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  activeBusinessId?: string;
  onboardingCompleted: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Business {
  id: string;
  name: string;
  category: string;
  description?: string;
  ownerName: string;
  ownerUid: string;
  memberUids: string[];
  memberRoles?: Record<string, Exclude<UserRole, 'SUPER_ADMIN'>>;
  businessEmail?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  currency: string;
  timezone: string;
  outletCount?: number;
  operatingHours?: string;
  taxPercent: number;
  serviceChargePercent: number;
  paymentMethods?: PaymentMethod[];
  lowStockThreshold: number;
  openingHour?: string;
  closingHour?: string;
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Outlet {
  id: string;
  businessId: string;
  ownerUid: string;
  memberUids: string[];
  name: string;
  address: string;
  contactNumber?: string;
  operatingHours?: string;
  tableCount: number;
  capacity: number;
  isActive: boolean;
  isArchived?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Employee {
  id: string;
  businessId: string;
  ownerUid: string;
  memberUids: string[];
  userUid?: string;
  name: string;
  email?: string;
  phone?: string;
  position: string;
  role: Exclude<UserRole, 'SUPER_ADMIN'>;
  outletId: string;
  status: 'active' | 'inactive';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Category {
  id: string;
  businessId: string;
  ownerUid: string;
  memberUids: string[];
  name: string;
  sortOrder: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RecipeItem {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
}

export interface Product {
  id: string;
  businessId: string;
  ownerUid: string;
  memberUids: string[];
  name: string;
  categoryId: string;
  categoryName?: string;
  price: number;
  cogs: number;
  imageUrl?: string;
  recipe: RecipeItem[];
  isAvailable: boolean;
  isArchived: boolean;
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Ingredient {
  id: string;
  businessId: string;
  outletId: string;
  ownerUid: string;
  memberUids: string[];
  name: string;
  itemType: 'raw_material' | 'finished_good';
  unit: string;
  stock: number;
  minStock: number;
  costPerUnit: number;
  supplierId?: string;
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Supplier {
  id: string;
  businessId: string;
  ownerUid: string;
  memberUids: string[];
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Purchase {
  id: string;
  businessId: string;
  outletId: string;
  ownerUid: string;
  memberUids: string[];
  supplierId?: string;
  supplierName?: string;
  ingredientId: string;
  ingredientName?: string;
  quantity: number;
  totalCost: number;
  purchasedAt: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type StockMovementType =
  | 'sale_deduction'
  | 'purchase_in'
  | 'adjustment'
  | 'refund_restore'
  | 'waste';

export interface StockMovement {
  id: string;
  businessId: string;
  outletId: string;
  ownerUid: string;
  memberUids: string[];
  ingredientId: string;
  ingredientName?: string;
  movementType: StockMovementType;
  quantityDelta: number;
  unit: string;
  referenceId?: string;
  reason?: string;
  userUid: string;
  userName?: string;
  occurredAt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TransactionItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCogs: number;
  lineTotal: number;
  notes?: string;
}

export interface Transaction {
  id: string;
  businessId: string;
  outletId: string;
  outletName?: string;
  ownerUid: string;
  memberUids: string[];
  receiptNumber: string;
  items: TransactionItem[];
  subtotal: number;
  discount?: number;
  taxAmount?: number;
  serviceChargeAmount?: number;
  total: number;
  estimatedCogs?: number;
  paymentMethod: PaymentMethod;
  amountPaid?: number;
  changeAmount?: number;
  status: TransactionStatus;
  notes?: string;
  cashierUid: string;
  cashierName?: string;
  occurredAt: string;
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Expense {
  id: string;
  businessId: string;
  outletId: string;
  ownerUid: string;
  memberUids: string[];
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
  paymentMethod?: string;
  createdBy: string;
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Shift {
  id: string;
  businessId: string;
  outletId: string;
  ownerUid: string;
  memberUids: string[];
  employeeId: string;
  employeeName?: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Attendance {
  id: string;
  businessId: string;
  outletId: string;
  ownerUid: string;
  memberUids: string[];
  employeeId: string;
  employeeName?: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  hoursWorked?: number;
  status: 'clocked_in' | 'clocked_out';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OperationalTask {
  id: string;
  businessId: string;
  outletId: string;
  ownerUid: string;
  memberUids: string[];
  title: string;
  category: 'opening' | 'closing' | 'cleaning' | 'maintenance';
  assignedToId?: string;
  assignedToName?: string;
  dueDate?: string;
  status: 'pending' | 'in_progress' | 'completed';
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AiInsight {
  id: string;
  businessId: string;
  outletId?: string;
  ownerUid: string;
  memberUids: string[];
  moduleType: string;
  title: string;
  summary: string;
  confidence?: string;
  createdBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type CctvCameraSourceType =
  | 'webcam'
  | 'http_snapshot'
  | 'hls_stream'
  | 'mjpeg_stream'
  | 'rtsp'
  | 'upload_only';

export interface CctvZoneAnalysis {
  zoneName: string;
  peopleCount: number;
  occupancyPercent: number;
  status: 'optimal' | 'padat' | 'longgar';
  note: string;
}

export interface CctvTimelinePoint {
  timestampLabel: string;
  peopleCount: number;
  occupancyPercent: number;
  queueCount: number;
  activityNote: string;
}

export interface CctvAnalysisResult {
  summary: string;
  videoDurationSec: number;
  framesAnalyzed: number;
  peopleCount: number;
  peakPeopleCount: number;
  occupiedSeats: number;
  estimatedTotalSeats: number;
  occupancyPercent: number;
  queueCount: number;
  estimatedQueueMinutes: number;
  crowdDensity: 'sepi' | 'sedang' | 'ramai' | 'padat';
  zones: CctvZoneAnalysis[];
  timeline: CctvTimelinePoint[];
  observations: string[];
  recommendations: string[];
  confidenceNote: string;
}

export interface CctvCamera {
  id: string;
  businessId: string;
  outletId: string;
  ownerUid: string;
  memberUids: string[];
  name: string;
  locationArea: string;
  retentionDays: number;
  privacyNoticeEnabled?: boolean;
  sourceType?: CctvCameraSourceType;
  streamUrl?: string;
  deviceLabel?: string;
  connectionStatus?: 'connected' | 'standby' | 'error';
  tableCapacity?: number;
  lastAnalyzedAt?: string;
  lastSummary?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CctvUpload {
  id: string;
  businessId: string;
  outletId: string;
  ownerUid: string;
  memberUids: string[];
  cameraId: string;
  cameraName?: string;
  fileName: string;
  storedFileName?: string;
  fileSizeBytes: number;
  mimeType?: string;
  jobStatus: 'uploaded' | 'queued' | 'awaiting_processor' | 'processing' | 'completed' | 'failed';
  processorMessage?: string;
  analysisResult?: CctvAnalysisResult;
  analyzedAt?: string;
  uploadedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface NotificationItem {
  id: string;
  businessId: string;
  outletId?: string;
  ownerUid: string;
  memberUids: string[];
  type: 'low_stock' | 'stockout' | 'transaction' | 'attendance' | 'task' | 'ai' | 'cctv';
  title: string;
  message: string;
  isRead: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AuditLog {
  id: string;
  businessId: string;
  ownerUid: string;
  memberUids: string[];
  action: string;
  entityType?: string;
  entityId?: string;
  details?: string;
  actorUid: string;
  actorName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}
