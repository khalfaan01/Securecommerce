// =============================================
// User Types
// =============================================

export enum UserRole {
  CUSTOMER = 'customer',
  ADMIN = 'admin',
  AUDITOR = 'auditor',
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  isVerified: boolean;
  mfaEnabled: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  sessionId: string;
  expiresIn: number;
  requireMfa?: boolean;
  mfaSessionToken?: string;
}

// =============================================
// Product Types
// =============================================

export interface Product {
  _id: string;
  name: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  categoryId: string | Category;
  images: string[];
  inventory: number;
  sku: string;
  isActive: boolean;
  tags: string[];
  averageRating: number;
  reviewCount: number;
  inStock: boolean;
  discountPercentage: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  isActive: boolean;
  productCount: number;
  children?: Category[];
  subcategories?: Category[];
}

// =============================================
// Cart Types
// =============================================

export interface CartItem {
  _id: string;
  productId: string | Product;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface Cart {
  _id: string;
  userId?: string;
  sessionId: string;
  items: CartItem[];
  totalAmount: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================
// Order Types
// =============================================

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  FLAGGED = 'flagged',
  REJECTED = 'rejected',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export interface Address {
  fullName: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone?: string;
}

export interface PaymentInfo {
  method: 'card' | 'paypal' | 'stripe';
  transactionId?: string;
  last4?: string;
  brand?: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface FraudCheckResult {
  transactionId: string;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  isFraudulent: boolean;
  reasons: string[];
  model: string;
  requiredAction: 'allow' | 'manual_review' | 'auto_reject';
  processedAt: string;
}

export interface Order {
  _id: string;
  orderNumber: string;
  userId: string | User;
  items: OrderItem[];
  shippingAddress: Address;
  billingAddress: Address;
  paymentInfo: PaymentInfo;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fraudCheck?: FraudCheckResult;
  trackingNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
}

// =============================================
// Security & Audit Types
// =============================================

export enum ThreatSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AuditAction {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  MFA_SETUP = 'mfa_setup',
  MFA_VERIFY = 'mfa_verify',
  PASSWORD_RESET = 'password_reset',
  USER_REGISTER = 'user_register',
  USER_DELETE = 'user_delete',
  ORDER_CREATE = 'order_create',
  ORDER_CANCEL = 'order_cancel',
  PRODUCT_DELETE = 'product_delete',
  ADMIN_MASS_DELETE = 'admin_mass_delete',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  FRAUD_DETECTED = 'fraud_detected',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
}

export interface AuditLog {
  _id: string;
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
  timestamp: string;
}

export interface ThreatAlert {
  _id: string;
  ruleId: string;
  ruleName: string;
  severity: ThreatSeverity;
  sourceIp?: string;
  userId?: string;
  action: string;
  details: Record<string, any>;
  count: number;
  isResolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FraudAlert {
  _id: string;
  alertId: string;
  orderId: string | Order;
  userId: string | User;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
  status: 'open' | 'reviewing' | 'resolved';
  assignedTo?: string;
  resolution?: 'approved' | 'rejected' | 'refunded';
  createdAt: string;
  updatedAt: string;
}

// =============================================
// Analytics Types
// =============================================

export interface AnalyticsSummary {
  totalRevenue: number;
  totalOrders: number;
  totalUsers: number;
  averageOrderValue: number;
  revenueByPeriod: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  topProducts: Array<{
    productId: string;
    name: string;
    totalSold: number;
    revenue: number;
  }>;
  ordersByStatus: Record<OrderStatus, number>;
  fraudStats: {
    totalFlagged: number;
    totalRejected: number;
    averageRiskScore: number;
  };
}

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

// =============================================
// API Response Types
// =============================================

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: PaginationMeta;
  error?: string;
  details?: any;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

// =============================================
// Component Prop Types
// =============================================

export interface LayoutProps {
  children: React.ReactNode;
}

export interface ProductCardProps {
  product: Product;
  onAddToCart?: (productId: string) => void;
}

export interface OrderCardProps {
  order: Order;
  showActions?: boolean;
  onCancel?: (orderId: string) => void;
}

export interface ChartProps {
  data: ChartDataPoint[];
  title: string;
  type?: 'bar' | 'line' | 'pie' | 'area';
  height?: number;
}

export interface StatusBadgeProps {
  status: string;
  type: 'order' | 'payment' | 'fraud' | 'threat';
}