import { Request } from 'express';
import { Document } from 'mongoose';

// =============================================
// Express Type Extensions
// =============================================

/**
 * Extended Express Request with authenticated user
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: UserRole;
        sessionId: string;
        mfaVerified?: boolean;
      };
      correlationId?: string;
    }
  }
}

// =============================================
// Enums
// =============================================

export enum UserRole {
  CUSTOMER = 'customer',
  ADMIN = 'admin',
  AUDITOR = 'auditor',
}

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  FLAGGED = 'flagged', // Flagged for fraud review
  REJECTED = 'rejected', // Rejected by fraud detection
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum AuditAction {
  // Authentication events
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  MFA_SETUP = 'mfa_setup',
  MFA_VERIFY = 'mfa_verify',
  PASSWORD_RESET = 'password_reset',
  REFRESH_TOKEN = 'refresh_token',
  REFRESH_TOKEN_REUSE = 'refresh_token_reuse', // Security: token reuse detection
  
  // User management
  USER_REGISTER = 'user_register',
  USER_UPDATE = 'user_update',
  USER_DELETE = 'user_delete',
  USER_DISABLE = 'user_disable',
  USER_ENABLE = 'user_enable',
  
  // Commerce operations
  PRODUCT_CREATE = 'product_create',
  PRODUCT_UPDATE = 'product_update',
  PRODUCT_DELETE = 'product_delete',
  ORDER_CREATE = 'order_create',
  ORDER_UPDATE = 'order_update',
  ORDER_CANCEL = 'order_cancel',
  CART_UPDATE = 'cart_update',
  
  // Admin operations
  ADMIN_MASS_DELETE = 'admin_mass_delete',
  ADMIN_BULK_OPERATION = 'admin_bulk_operation',
  ADMIN_CONFIG_CHANGE = 'admin_config_change',
  
  // Security events
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  FRAUD_DETECTED = 'fraud_detected',
}

export enum ThreatSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum FraudRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// =============================================
// User Types
// =============================================

export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  isVerified: boolean;
  mfaEnabled: boolean;
  mfaSecret?: string;
  mfaRecoveryCodes?: string[];
  lastLogin?: Date;
  lastLoginIp?: string;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  refreshTokens: IRefreshToken[];
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  hasRole(role: UserRole): boolean;
  isLocked(): boolean;
}

export interface IRefreshToken {
  token: string;
  expiresAt: Date;
  createdAt: Date;
  replacedBy?: string;
  isRevoked: boolean;
}

export interface UserSession {
  userId: string;
  sessionId: string;
  ip: string;
  userAgent: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

// =============================================
// Product & Commerce Types
// =============================================

export interface IProduct extends Document {
  name: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  categoryId: string;
  images: string[];
  inventory: number;
  sku: string;
  isActive: boolean;
  tags: string[];
  averageRating: number;
  reviewCount: number;
  createdBy: string; // User ID
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICategory extends Document {
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  isActive: boolean;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICart extends Document {
  userId?: string;
  sessionId: string;
  items: ICartItem[];
  totalAmount: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface IOrder extends Document {
  orderNumber: string;
  userId: string;
  items: IOrderItem[];
  shippingAddress: IAddress;
  billingAddress: IAddress;
  paymentInfo: IPaymentInfo;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fraudCheck?: IFraudCheckResult;
  trackingNumber?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface IAddress {
  fullName: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone?: string;
}

export interface IPaymentInfo {
  method: 'card' | 'paypal' | 'stripe';
  transactionId?: string;
  last4?: string;
  brand?: string;
}

// =============================================
// Fraud Detection Types
// =============================================

export interface IFraudCheckRequest {
  transactionId: string;
  orderData: {
    orderId: string;
    userId: string;
    amount: number;
    itemCount: number;
    shippingAddress: IAddress;
    billingAddress: IAddress;
    paymentMethod: string;
  };
  userData: {
    userId: string;
    age?: number;
    accountAge?: number; // in days
    recentOrders: number; // last 24 hours
    totalOrders: number;
    addressMatch: boolean; // shipping === billing
  };
  metadata: {
    timestamp: Date;
    ipAddress: string;
    userAgent: string;
    hourOfDay: number;
    dayOfWeek: number;
  };
}

export interface IFraudCheckResult {
  transactionId: string;
  riskScore: number; // 0 to 1
  riskLevel: FraudRiskLevel;
  isFraudulent: boolean;
  reasons: string[];
  model: string; // 'random_forest_v1'
  requiredAction?: 'auto_reject' | 'manual_review' | 'allow';
  processedAt: Date;
}

export interface IFraudAlert {
  alertId: string;
  orderId: string;
  userId: string;
  riskScore: number;
  riskLevel: FraudRiskLevel;
  reasons: string[];
  status: 'open' | 'reviewing' | 'resolved';
  assignedTo?: string;
  resolution?: 'approved' | 'rejected' | 'refunded';
  createdAt: Date;
  updatedAt: Date;
}

// =============================================
// Audit & Security Types
// =============================================

export interface IAuditLog extends Document {
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  ip: string;
  userAgent?: string;
  success: boolean;
  details?: Record<string, any>;
  severity: ThreatSeverity;
  correlationId?: string;
  timestamp: Date;
}

export interface IThreatAlert extends Document {
  ruleId: string;
  ruleName: string;
  severity: ThreatSeverity;
  sourceIp?: string;
  userId?: string;
  action: string;
  details: Record<string, any>;
  count: number;
  isResolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRateLimitRecord {
  ip: string;
  endpoint: string;
  hits: number;
  windowStart: Date;
  blocked: boolean;
  blockedUntil?: Date;
}

// =============================================
// API Request/Response Types
// =============================================

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface SearchQuery extends PaginationQuery {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  tags?: string[];
}

// =============================================
// Configuration Types
// =============================================

export interface SecurityConfig {
  maxFailedLoginAttempts: number;
  loginBlockDuration: number; // minutes
  mfaRequiredRoles: UserRole[];
  passwordMinLength: number;
  passwordRequirements: {
    uppercase: boolean;
    lowercase: boolean;
    numbers: boolean;
    specialChars: boolean;
  };
  tokenRefreshRotation: boolean;
  auditRetentionDays: number;
}

export interface FraudConfig {
  enabled: boolean;
  autoRejectThreshold: number; // 0-1, e.g., 0.9
  manualReviewThreshold: number; // 0-1, e.g., 0.7
  maxOrdersPerHour: number;
  redisTimeout: number; // milliseconds
  modelVersion: string;
}

// =============================================
// Session / Cache Types
// =============================================

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  expiresAt: Date;
  createdAt: Date;
}

export interface SessionData {
  userId: string;
  email: string;
  role: UserRole;
  mfaVerified: boolean;
  ip: string;
  userAgent: string;
}

// =============================================
// Webhook / Event Types
// =============================================

export interface WebhookPayload {
  event: string;
  data: Record<string, any>;
  timestamp: Date;
  signature?: string;
}

export interface FraudDetectionWebhook extends WebhookPayload {
  event: 'fraud.alert' | 'fraud.resolved' | 'fraud.threshold_update';
  data: {
    alertId: string;
    orderId: string;
    riskScore: number;
    resolution?: string;
    updatedThreshold?: number;
  };
}

// =============================================
// Utility Types for Type Safety
// =============================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[P] extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : DeepPartial<T[P]>;
};

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export type WithoutRequired<T, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P] };

export type NonNullableProps<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

export { ApiResponse, ApiError, JWTUtils, PasswordUtils, MFAUtils, SecurityHelpers, TokenGenerator, ValidationHelpers } from './utils';
