import mongoose, { Schema, Model, Document, Query } from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import config from '../config';
import { 
  UserRole, 
  OrderStatus, 
  PaymentStatus, 
  AuditAction, 
  ThreatSeverity, 
  FraudRiskLevel,
  IUser,
  IRefreshToken,
  IProduct,
  ICategory,
  ICart,
  ICartItem,
  IOrder,
  IOrderItem,
  IAddress,
  IPaymentInfo,
  IAuditLog,
  IThreatAlert,
  IFraudCheckResult,
  IFraudAlert,
  UserSession
} from '../types';

// =============================================
// Base Plugin: Timestamps
// =============================================

const timestampsPlugin = (schema: Schema) => {
  schema.set('timestamps', true);
};

// =============================================
// User Schema
// =============================================

const RefreshTokenSchema = new Schema<IRefreshToken>({
  token: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  replacedBy: {
    type: String,
    default: null,
  },
  isRevoked: {
    type: Boolean,
    default: false,
  },
});

const UserSchema = new Schema<IUser>({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      message: 'Invalid email format',
    },
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false, // Never return password by default
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters'],
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters'],
  },
  role: {
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.CUSTOMER,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  mfaEnabled: {
    type: Boolean,
    default: false,
  },
  mfaSecret: {
    type: String,
    select: false,
    default: null,
  },
  mfaRecoveryCodes: {
    type: [String],
    select: false,
    default: [],
  },
  lastLogin: {
    type: Date,
    default: null,
  },
  lastLoginIp: {
    type: String,
    default: null,
  },
  failedLoginAttempts: {
    type: Number,
    default: 0,
  },
  lockedUntil: {
    type: Date,
    default: null,
  },
  refreshTokens: {
    type: [RefreshTokenSchema],
    default: [],
  },
}, {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret) => {
      delete (ret as any).password;
      delete (ret as any).mfaSecret;
      delete (ret as any).mfaRecoveryCodes;
      delete (ret as any).refreshTokens;
      delete (ret as any).__v;
      return ret;
    },
  },
});

// Indexes for security queries
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1, role: 1 });
UserSchema.index({ 'refreshTokens.token': 1 });
UserSchema.index({ failedLoginAttempts: 1, lockedUntil: 1 });

// Pre-save hook: Hash password before saving
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(config.security.bcryptRounds);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Instance method: Compare password
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Instance method: Check user role
UserSchema.methods.hasRole = function (role: UserRole): boolean {
  return this.role === role;
};

// Instance method: Check if account is locked
UserSchema.methods.isLocked = function (): boolean {
  if (!this.lockedUntil) return false;
  return this.lockedUntil > new Date();
};

// Static method: Find by refresh token
UserSchema.statics.findByRefreshToken = function (token: string) {
  return this.findOne({
    'refreshTokens.token': token,
    'refreshTokens.isRevoked': false,
    'refreshTokens.expiresAt': { $gt: new Date() },
  });
};

// =============================================
// Product Schema
// =============================================

const ProductSchema = new Schema<IProduct>({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Product name cannot exceed 200 characters'],
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    maxlength: [5000, 'Description cannot exceed 5000 characters'],
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative'],
  },
  compareAtPrice: {
    type: Number,
    min: [0, 'Compare at price cannot be negative'],
    default: null,
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Category is required'],
  } as any,
  images: {
    type: [String],
    default: [],
    validate: {
      validator: (images: string[]) => images.length <= 10,
      message: 'Maximum 10 images allowed',
    },
  },
  inventory: {
    type: Number,
    required: true,
    min: [0, 'Inventory cannot be negative'],
    default: 0,
  },
  sku: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  tags: {
    type: [String],
    default: [],
  },
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  reviewCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  } as any,
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  } as any,
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for product queries
ProductSchema.index({ name: 'text', description: 'text', tags: 'text' }); // Full-text search
ProductSchema.index({ categoryId: 1, isActive: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ sku: 1 }, { unique: true });
ProductSchema.index({ averageRating: -1 });
ProductSchema.index({ createdAt: -1 });

// Virtual: Calculate discount percentage
ProductSchema.virtual('discountPercentage').get(function () {
  const doc = this as any;
  if (doc.compareAtPrice && doc.compareAtPrice > doc.price) {
    return Math.round(((doc.compareAtPrice - doc.price) / doc.compareAtPrice) * 100);
  }
  return 0;
});

// Virtual: Check if in stock
ProductSchema.virtual('inStock').get(function () {
  return (this as any).inventory > 0;
});

// Pre-save hook: Auto-generate SKU if not provided
ProductSchema.pre('save', function (next) {
  const doc = this as any;
  if (!doc.sku) {
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    doc.sku = `SKU-${random}`;
  }
  next();
});

// Middleware: Update category product count on save
ProductSchema.post('save', async function () {
  const Category = mongoose.model('Category');
  const doc = this as any;
  await Category.findByIdAndUpdate(doc.categoryId, {
    productCount: await mongoose.model('Product').countDocuments({ 
      categoryId: doc.categoryId, 
      isActive: true 
    }),
  });
});

// Middleware: Update category product count on delete
ProductSchema.post('deleteOne', { document: true, query: false }, async function () {
  const Category = mongoose.model('Category');
  const doc = this as any;
  await Category.findByIdAndUpdate(doc.categoryId, {
    productCount: await mongoose.model('Product').countDocuments({ 
      categoryId: doc.categoryId, 
      isActive: true 
    }),
  });
});

// =============================================
// Category Schema
// =============================================

const CategorySchema = new Schema<ICategory>({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    unique: true,
    maxlength: [100, 'Category name cannot exceed 100 characters'],
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  description: {
    type: String,
    maxlength: [1000, 'Description cannot exceed 1000 characters'],
    default: '',
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null,
  } as any,
  isActive: {
    type: Boolean,
    default: true,
  },
  productCount: {
    type: Number,
    default: 0,
    min: 0,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
CategorySchema.index({ slug: 1 }, { unique: true });
CategorySchema.index({ parentId: 1 });
CategorySchema.index({ isActive: 1 });

// Virtual: Get subcategories
CategorySchema.virtual('subcategories', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parentId',
});

// Pre-save hook: Generate slug from name
CategorySchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = (this as any).name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  next();
});

// =============================================
// Cart Schema
// =============================================

const CartItemSchema = new Schema<ICartItem>({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  } as any,
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1'],
    max: [100, 'Quantity cannot exceed 100'],
  },
  image: {
    type: String,
    default: null,
  },
});

const CartSchema = new Schema<ICart>({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  } as any,
  sessionId: {
    type: String,
    required: true,
  },
  items: {
    type: [CartItemSchema],
    default: [],
  },
  totalAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
}, {
  timestamps: true,
});

// Indexes
CartSchema.index({ userId: 1 });
CartSchema.index({ sessionId: 1 });
CartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for automatic cleanup

// Pre-save hook: Calculate total amount and update timestamps
CartSchema.pre('save', function (next) {
  this.totalAmount = this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  
  // Extend cart expiry by 7 days on update
  this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  next();
});

// Instance method: Add item to cart
CartSchema.methods.addItem = function (productId: string, name: string, price: number, quantity: number = 1) {
  const existingItem = this.items.find(
    (item: ICartItem) => item.productId.toString() === productId
  );

  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    this.items.push({ productId, name, price, quantity } as any);
  }
};

// Instance method: Remove item from cart
CartSchema.methods.removeItem = function (productId: string) {
  this.items = this.items.filter(
    (item: ICartItem) => item.productId.toString() !== productId
  );
};

// =============================================
// Order Schema
// =============================================

const OrderItemSchema = new Schema<IOrderItem>({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  } as any,
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  image: {
    type: String,
    default: null,
  },
});

const AddressSchema = new Schema<IAddress>({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [100, 'Full name cannot exceed 100 characters'],
  },
  street: {
    type: String,
    required: [true, 'Street address is required'],
    trim: true,
    maxlength: [200, 'Street address cannot exceed 200 characters'],
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true,
    maxlength: [100, 'City cannot exceed 100 characters'],
  },
  state: {
    type: String,
    required: [true, 'State is required'],
    trim: true,
    maxlength: [100, 'State cannot exceed 100 characters'],
  },
  zipCode: {
    type: String,
    required: [true, 'ZIP code is required'],
    trim: true,
    validate: {
      validator: (zip: string) => /^\d{5}(-\d{4})?$/.test(zip),
      message: 'Invalid ZIP code format',
    },
  },
  country: {
    type: String,
    required: [true, 'Country is required'],
    trim: true,
    default: 'US',
    maxlength: [100, 'Country cannot exceed 100 characters'],
  },
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: (phone: string) => !phone || /^\+?[\d\s-()]{10,}$/.test(phone),
      message: 'Invalid phone number format',
    },
    default: null,
  },
});

const PaymentInfoSchema = new Schema<IPaymentInfo>({
  method: {
    type: String,
    enum: ['card', 'paypal', 'stripe'],
    required: true,
  },
  transactionId: {
    type: String,
    default: null,
  },
  last4: {
    type: String,
    validate: {
      validator: (val: string) => !val || /^\d{4}$/.test(val),
      message: 'Last 4 digits must be exactly 4 numbers',
    },
    default: null,
  },
  brand: {
    type: String,
    enum: ['visa', 'mastercard', 'amex', 'discover', null],
    default: null,
  },
});

const FraudCheckResultSchema = new Schema<IFraudCheckResult>({
  transactionId: String,
  riskScore: Number,
  riskLevel: {
    type: String,
    enum: Object.values(FraudRiskLevel),
  },
  isFraudulent: Boolean,
  reasons: [String],
  model: String,
  requiredAction: {
    type: String,
    enum: ['auto_reject', 'manual_review', 'allow'],
  },
  processedAt: Date,
});

const OrderSchema = new Schema<IOrder>({
  orderNumber: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  } as any,
  items: {
    type: [OrderItemSchema],
    required: true,
    validate: {
      validator: (items: IOrderItem[]) => items.length > 0,
      message: 'Order must have at least one item',
    },
  },
  shippingAddress: {
    type: AddressSchema,
    required: true,
  },
  billingAddress: {
    type: AddressSchema,
    required: true,
  },
  paymentInfo: {
    type: PaymentInfoSchema,
    required: true,
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
  tax: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  shipping: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  total: {
    type: Number,
    required: true,
    min: 0,
  },
  status: {
    type: String,
    enum: Object.values(OrderStatus),
    default: OrderStatus.PENDING,
  },
  paymentStatus: {
    type: String,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.PENDING,
  },
  fraudCheck: {
    type: FraudCheckResultSchema,
    default: null,
  },
  trackingNumber: {
    type: String,
    default: null,
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    default: null,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for order queries
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ orderNumber: 1 }, { unique: true });
OrderSchema.index({ status: 1 });
OrderSchema.index({ paymentStatus: 1 });
OrderSchema.index({ 'fraudCheck.riskScore': -1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ 'fraudCheck.isFraudulent': 1, status: 1 });

// Pre-save hook: Generate order number
OrderSchema.pre('save', function (next) {
  const doc = this as any;
  if (!doc.orderNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    doc.orderNumber = `ORD-${timestamp}-${random}`;
  }
  next();
});

// Virtual: Calculate item count
OrderSchema.virtual('itemCount').get(function () {
  return (this as any).items.reduce((sum: number, item: IOrderItem) => sum + item.quantity, 0);
});

// Static method: Get order velocity for user (last 24 hours)
OrderSchema.statics.getUserOrderVelocity = async function (userId: string): Promise<number> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.countDocuments({
    userId,
    createdAt: { $gte: twentyFourHoursAgo },
  });
};

// =============================================
// Audit Log Schema (Security-critical)
// =============================================

const AuditLogSchema = new Schema<IAuditLog>({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  } as any,
  action: {
    type: String,
    enum: Object.values(AuditAction),
    required: true,
  },
  resource: {
    type: String,
    required: true,
  },
  resourceId: {
    type: String,
    default: null,
  },
  ip: {
    type: String,
    required: true,
  },
  userAgent: {
    type: String,
    default: null,
  },
  success: {
    type: Boolean,
    required: true,
  },
  details: {
    type: Schema.Types.Mixed,
    default: {},
  },
  severity: {
    type: String,
    enum: Object.values(ThreatSeverity),
    required: true,
    default: ThreatSeverity.LOW,
  },
  correlationId: {
    type: String,
    default: null,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
  },
}, {
  // Audit logs should never be updated, only inserted
  // No timestamps to prevent modification tracking
});

// Indexes for security queries
AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ ip: 1, timestamp: -1 });
AuditLogSchema.index({ severity: 1, timestamp: -1 });
AuditLogSchema.index({ correlationId: 1 });
AuditLogSchema.index({ success: 1, action: 1 });
AuditLogSchema.index({ resource: 1, timestamp: -1 });

// Compound indexes for common security queries
AuditLogSchema.index({ action: 1, ip: 1, timestamp: -1 });
AuditLogSchema.index({ userId: 1, action: 1, success: 1 });

// TTL index: Automatically delete old audit logs after retention period
AuditLogSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: (config.security as any).auditRetentionDays || 90 * 24 * 60 * 60 }
);

// Static method: Get failed login attempts from IP
AuditLogSchema.statics.getFailedLoginsFromIp = async function (
  ip: string, 
  minutes: number = 15
): Promise<number> {
  const since = new Date(Date.now() - minutes * 60 * 1000);
  return this.countDocuments({
    ip,
    action: AuditAction.LOGIN_FAILED,
    success: false,
    timestamp: { $gte: since },
  });
};

// Static method: Get user activity summary
AuditLogSchema.statics.getUserActivitySummary = async function (
  userId: string,
  hours: number = 24
): Promise<any> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const pipeline = [
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: since },
      },
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        lastOccurrence: { $max: '$timestamp' },
      },
    },
    {
      $sort: { count: -1 as const },
    },
  ];

  return this.aggregate(pipeline);
};

// Prevent updates to audit logs (immutable)
AuditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    const error = new Error('Audit logs cannot be modified');
    return next(error);
  }
  next();
});

AuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
  throw new Error('Audit logs cannot be modified');
});

// =============================================
// Threat Alert Schema (Security Monitoring)
// =============================================

const ThreatAlertSchema = new Schema<IThreatAlert>({
  ruleId: {
    type: String,
    required: true,
  },
  ruleName: {
    type: String,
    required: true,
  },
  severity: {
    type: String,
    enum: Object.values(ThreatSeverity),
    required: true,
  },
  sourceIp: {
    type: String,
    default: null,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  } as any,
  action: {
    type: String,
    required: true,
  },
  details: {
    type: Schema.Types.Mixed,
    required: true,
  },
  count: {
    type: Number,
    default: 1,
  },
  isResolved: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Indexes for threat analysis
ThreatAlertSchema.index({ ruleId: 1, createdAt: -1 });
ThreatAlertSchema.index({ severity: 1, isResolved: 1 });
ThreatAlertSchema.index({ sourceIp: 1, createdAt: -1 });
ThreatAlertSchema.index({ userId: 1, createdAt: -1 });
ThreatAlertSchema.index({ isResolved: 1, createdAt: -1 });
ThreatAlertSchema.index({ createdAt: -1 });

// TTL index: Auto-delete resolved low-severity alerts after 30 days
ThreatAlertSchema.index(
  { createdAt: 1 },
  { 
    expireAfterSeconds: 30 * 24 * 60 * 60,
    partialFilterExpression: { 
      isResolved: true, 
      severity: { $in: [ThreatSeverity.LOW, ThreatSeverity.MEDIUM] } 
    },
  }
);

// Static method: Get unresolved critical alerts
ThreatAlertSchema.statics.getCriticalAlerts = async function () {
  return this.find({
    severity: { $in: [ThreatSeverity.HIGH, ThreatSeverity.CRITICAL] },
    isResolved: false,
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  }).sort({ createdAt: -1 }).limit(50);
};

// =============================================
// Fraud Alert Schema (Fraud Review Queue)
// =============================================

const FraudAlertSchema = new Schema<IFraudAlert>({
  alertId: {
    type: String,
    required: true,
    unique: true,
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
  } as any,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  } as any,
  riskScore: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
  },
  riskLevel: {
    type: String,
    enum: Object.values(FraudRiskLevel),
    required: true,
  },
  reasons: {
    type: [String],
    required: true,
  },
  status: {
    type: String,
    enum: ['open', 'reviewing', 'resolved'],
    default: 'open',
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  } as any,
  resolution: {
    type: String,
    enum: ['approved', 'rejected', 'refunded', null],
    default: null,
  },
}, {
  timestamps: true,
});

// Indexes for fraud review queue
FraudAlertSchema.index({ alertId: 1 }, { unique: true });
FraudAlertSchema.index({ orderId: 1 });
FraudAlertSchema.index({ userId: 1 });
FraudAlertSchema.index({ riskScore: -1 });
FraudAlertSchema.index({ riskLevel: 1, status: 1 });
FraudAlertSchema.index({ status: 1, createdAt: -1 });
FraudAlertSchema.index({ assignedTo: 1, status: 1 });

// Pre-save hook: Generate alert ID
FraudAlertSchema.pre('save', function (next) {
  const doc = this as any;
  if (!doc.alertId) {
    doc.alertId = `FRAUD-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }
  next();
});

// Static method: Get pending review queue
FraudAlertSchema.statics.getPendingReviewQueue = async function (limit: number = 50) {
  return this.find({
    status: { $in: ['open', 'reviewing'] },
  })
    .sort({ riskScore: -1, createdAt: -1 })
    .limit(limit)
    .populate('orderId', 'orderNumber total status createdAt')
    .populate('userId', 'email firstName lastName');
};

// =============================================
// Session Schema (For rate limiting & tracking)
// =============================================

const SessionSchema = new Schema<UserSession>({
  userId: {
    type: String,
    required: true,
  },
  sessionId: {
    type: String,
    required: true,
    unique: true,
  },
  ip: {
    type: String,
    required: true,
  },
  userAgent: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

// TTL index: Auto-delete expired sessions
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ userId: 1, isActive: 1 });
SessionSchema.index({ ip: 1 });

// =============================================
// Rate Limit Tracking Schema
// =============================================

const RateLimitSchema = new Schema({
  ip: {
    type: String,
    required: true,
  },
  endpoint: {
    type: String,
    required: true,
  },
  hits: {
    type: Number,
    default: 0,
  },
  windowStart: {
    type: Date,
    required: true,
  },
  blocked: {
    type: Boolean,
    default: false,
  },
  blockedUntil: {
    type: Date,
    default: null,
  },
});

RateLimitSchema.index({ ip: 1, endpoint: 1 });
RateLimitSchema.index({ windowStart: 1 }, { expireAfterSeconds: 900 }); // 15 min TTL

// =============================================
// Model Registration
// =============================================

// Prevent model recompilation in development (hot reloading)
const models = {
  User: mongoose.models.User || mongoose.model<IUser>('User', UserSchema),
  Product: mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema),
  Category: mongoose.models.Category || mongoose.model<ICategory>('Category', CategorySchema),
  Cart: mongoose.models.Cart || mongoose.model<ICart>('Cart', CartSchema),
  Order: mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema),
  AuditLog: mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema),
  ThreatAlert: mongoose.models.ThreatAlert || mongoose.model<IThreatAlert>('ThreatAlert', ThreatAlertSchema),
  FraudAlert: mongoose.models.FraudAlert || mongoose.model<IFraudAlert>('FraudAlert', FraudAlertSchema),
  Session: mongoose.models.Session || mongoose.model<UserSession>('Session', SessionSchema),
  RateLimit: mongoose.models.RateLimit || mongoose.model('RateLimit', RateLimitSchema),
};

// =============================================
// Database Connection Helper
// =============================================

export const connectDatabase = async (): Promise<void> => {
  const mongoURI = config.database.uri;
  
  try {
    await mongoose.connect(mongoURI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    
    console.log(' MongoDB connected successfully');
    
    // Create indexes (some indexes might not be created automatically in production)
    if (process.env.NODE_ENV === 'development') {
      await Promise.all(
        Object.values(models).map((model: any) => model.createIndexes())
      );
      console.log(' Database indexes created');
    }
    
  } catch (error) {
    console.error(' MongoDB connection error:', error);
    process.exit(1);
  }
  
  // Connection event handlers
  mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error);
  });
  
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Attempting to reconnect...');
  });
  
  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
  });
};

// Graceful shutdown
export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
  console.log('MongoDB disconnected gracefully');
};

// Export all models
export default models;