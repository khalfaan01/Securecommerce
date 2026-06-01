import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';

import models from '../models';
import { 
  ApiError, 
  ApiResponse, 
  UserRole, 
  AuditAction, 
  ThreatSeverity,
  OrderStatus,
  PaymentStatus,
  FraudRiskLevel 
} from '../types';
import { authenticate, rbacGate, validate, sanitizeInput } from '../middleware';
import { AuditLogger } from '../services/auditService';
import { logger } from '../config/logger';
import config from '../config';
import { FraudDetectionClient } from '../utils/fraudClient';

// =============================================
// Validation Schemas
// =============================================

const addressSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(100),
  street: z.string().min(1, 'Street address is required').max(200),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code'),
  country: z.string().min(1, 'Country is required').max(100).default('US'),
  phone: z.string().optional().nullable(),
});

const paymentSchema = z.object({
  method: z.enum(['card', 'paypal', 'stripe']),
  transactionId: z.string().optional().nullable(),
  last4: z.string().length(4).optional().nullable(),
  brand: z.enum(['visa', 'mastercard', 'amex', 'discover']).optional().nullable(),
});

const createOrderSchema = z.object({
  shippingAddress: addressSchema,
  billingAddress: addressSchema,
  paymentInfo: paymentSchema,
  notes: z.string().max(1000).optional().nullable(),
});

const updateOrderStatusSchema = z.object({
  status: z.enum([
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ]),
  trackingNumber: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

const orderQuerySchema = z.object({
  page: z.string().optional().transform(val => parseInt(val || '1')),
  limit: z.string().optional().transform(val => parseInt(val || '10')),
  status: z.string().optional(),
  paymentStatus: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// =============================================
// Order Controller
// =============================================

class OrderController {
  
  /**
   * Create order from cart
   */
  static async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const validatedData = createOrderSchema.parse(req.body);
      
      // Get user's cart
      const cart = await models.Cart.findOne({ userId });
      
      if (!cart || cart.items.length === 0) {
        throw ApiError.badRequest('Cart is empty');
      }
      
      // Verify product availability and prices
      const productIds = cart.items.map((item: any) => item.productId);
      const products = await models.Product.find({
        _id: { $in: productIds },
        isActive: true,
      });
      
      // Check for unavailable products
      if (products.length !== cart.items.length) {
        throw ApiError.badRequest('Some products in your cart are no longer available');
      }
      
      // Check inventory levels
      const inventoryErrors: string[] = [];
      for (const item of cart.items) {
        const product = products.find(p => p._id.toString() === item.productId.toString());
        if (product && product.inventory < item.quantity) {
          inventoryErrors.push(
            `${product.name}: only ${product.inventory} available (requested ${item.quantity})`
          );
        }
      }
      
      if (inventoryErrors.length > 0) {
        throw ApiError.badRequest('Insufficient inventory', {
          errors: inventoryErrors,
        });
      }
      
      // Calculate order totals
      const subtotal = cart.totalAmount;
      const tax = parseFloat((subtotal * 0.08).toFixed(2)); // 8% tax rate
      const shipping = subtotal > 50 ? 0 : 9.99; // Free shipping over $50
      const total = parseFloat((subtotal + tax + shipping).toFixed(2));
      
      // == FRAUD DETECTION: Check order with ML service ==
      const isFraudulent = await OrderController.performFraudCheck(
        req,
        userId,
        cart,
        subtotal,
        validatedData
      );
      
      // Create order
      const order = new models.Order({
        userId,
        items: cart.items.map((item: any) => ({
          productId: item.productId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
        })),
        shippingAddress: validatedData.shippingAddress,
        billingAddress: validatedData.billingAddress,
        paymentInfo: validatedData.paymentInfo,
        subtotal,
        tax,
        shipping,
        total,
        status: isFraudulent ? OrderStatus.FLAGGED : OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        notes: validatedData.notes || null,
      });
      
      await order.save();
      
      // Update product inventory
      for (const item of cart.items) {
        await models.Product.findByIdAndUpdate(
          item.productId,
          { $inc: { inventory: -item.quantity } }
        );
      }
      
      // Clear cart after order
      cart.items = [];
      cart.totalAmount = 0;
      await cart.save();
      
      // Simulate payment processing
      const paymentSuccess = Math.random() > 0.1; // 90% success rate
      
      if (paymentSuccess) {
        order.paymentInfo.transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        order.paymentStatus = PaymentStatus.COMPLETED;
        
        if (!isFraudulent) {
          order.status = OrderStatus.CONFIRMED;
        }
      } else {
        order.paymentStatus = PaymentStatus.FAILED;
        order.status = OrderStatus.CANCELLED;
        order.notes = (order.notes || '') + ' Payment failed. Please try again.';
      }
      
      await order.save();
      
      // Audit log
      await AuditLogger.log({
        userId,
        action: AuditAction.ORDER_CREATE,
        resource: 'order',
        resourceId: order._id.toString(),
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: isFraudulent ? ThreatSeverity.HIGH : ThreatSeverity.LOW,
        details: { 
          orderNumber: order.orderNumber,
          total,
          itemCount: order.items.length,
          isFraudulent,
          paymentSuccess,
        },
      });
      
      logger.info('Order created', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        userId,
        total,
        isFraudulent,
      });
      
      res.status(201).json(ApiResponse.success(order, 'Order created successfully'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Perform fraud check using ML service or heuristic rules
   */
  private static async performFraudCheck(
    req: Request,
    userId: string,
    cart: any,
    amount: number,
    orderData: any
  ): Promise<boolean> {
    try {
      // Get user data for fraud detection
      const user = await models.User.findById(userId);
      const recentOrders = await models.Order.countDocuments({
        userId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });
      
      // Check if billing and shipping addresses match
      const addressMatch = 
        orderData.shippingAddress.street === orderData.billingAddress.street &&
        orderData.shippingAddress.city === orderData.billingAddress.city &&
        orderData.shippingAddress.zipCode === orderData.billingAddress.zipCode;
      
      // Prepare fraud check request
      const fraudRequest = {
        transactionId: `TXN-${Date.now()}`,
        orderData: {
          orderId: 'pending',
          userId,
          amount,
          itemCount: cart.items.length,
          shippingAddress: orderData.shippingAddress,
          billingAddress: orderData.billingAddress,
          paymentMethod: orderData.paymentInfo.method,
        },
        userData: {
          userId,
          age: user ? Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 0,
          accountAge: user ? Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 0,
          recentOrders,
          totalOrders: await models.Order.countDocuments({ userId }),
          addressMatch,
        },
        metadata: {
          timestamp: new Date(),
          ipAddress: req.ip || '0.0.0.0',
          userAgent: req.get('user-agent') || 'unknown',
          hourOfDay: new Date().getHours(),
          dayOfWeek: new Date().getDay(),
        },
      };
      
      // Try ML fraud detection service
      try {
        const fraudClient = FraudDetectionClient.getInstance();
        if (fraudClient.isConnected()) {
          const riskScore = await fraudClient.checkTransaction(fraudRequest);
          
          // Store fraud check result
          const fraudCheckResult = {
            transactionId: fraudRequest.transactionId,
            riskScore,
            riskLevel: riskScore > 0.8 ? FraudRiskLevel.CRITICAL :
                      riskScore > 0.6 ? FraudRiskLevel.HIGH :
                      riskScore > 0.4 ? FraudRiskLevel.MEDIUM : FraudRiskLevel.LOW,
            isFraudulent: riskScore > config.security.fraudThreshold,
            reasons: [],
            model: 'random_forest_v1',
            requiredAction: riskScore > 0.8 ? 'auto_reject' :
                           riskScore > config.security.fraudThreshold ? 'manual_review' : 'allow',
            processedAt: new Date(),
          };
          
          // If fraudulent, create fraud alert
          if (fraudCheckResult.isFraudulent) {
            await models.FraudAlert.create({
              orderId: null, // Will be updated after order creation
              userId,
              riskScore,
              riskLevel: fraudCheckResult.riskLevel,
              reasons: [],
              status: riskScore > 0.8 ? 'open' : 'open',
            });
            
            await AuditLogger.log({
              userId,
              action: AuditAction.FRAUD_DETECTED,
              resource: 'order',
              ip: req.ip || '0.0.0.0',
              userAgent: req.get('user-agent'),
              success: true,
              severity: ThreatSeverity.CRITICAL,
              details: {
                riskScore,
                riskLevel: fraudCheckResult.riskLevel,
                requiredAction: fraudCheckResult.requiredAction,
              },
            });
          }
          
          return fraudCheckResult.isFraudulent;
        }
      } catch (error) {
        logger.warn('ML fraud check failed, falling back to heuristic rules', {
          error: (error as Error).message,
        });
      }
      
      // Fallback: Heuristic-based fraud detection
      let riskScore = 0;
      
      // Recent order velocity check
      if (recentOrders > 5) riskScore += 0.3;
      if (recentOrders > 10) riskScore += 0.2;
      
      // High amount transactions (over $1000)
      if (amount > 1000) riskScore += 0.2;
      
      // Address mismatch
      if (!addressMatch) riskScore += 0.1;
      
      // New account with large order
      const accountAge = user ? Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      if (accountAge < 7 && amount > 500) riskScore += 0.2;
      
      // Unusual hours (midnight - 5am)
      const currentHour = new Date().getHours();
      if (currentHour >= 0 && currentHour <= 5) riskScore += 0.1;
      
      const isFraudulent = riskScore > config.security.fraudThreshold;
      
      if (isFraudulent) {
        logger.warn('Heuristic fraud detected', {
          userId,
          riskScore,
          amount,
          accountAge,
          recentOrders,
        });
        
        await AuditLogger.log({
          userId,
          action: AuditAction.FRAUD_DETECTED,
          resource: 'order',
          ip: req.ip || '0.0.0.0',
          userAgent: req.get('user-agent'),
          success: true,
          severity: ThreatSeverity.HIGH,
          details: {
            riskScore,
            detectionMethod: 'heuristic',
            factors: {
              recentOrders,
              amount,
              accountAge,
              addressMatch,
              hour: currentHour,
            },
          },
        });
      }
      
      return isFraudulent;
      
    } catch (error) {
      logger.error('Fraud check failed completely', {
        error: (error as Error).message,
        userId,
      });
      // If fraud check fails, err on the side of caution
      return true; // Flag for manual review
    }
  }
  
  /**
   * Get user's orders
   */
  static async getUserOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const query = orderQuerySchema.parse(req.query);
      const { page, limit, status, startDate, endDate } = query;
      
      const filter: any = { userId: req.user!.userId };
      
      if (status) {
        filter.status = status;
      }
      
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }
      
      const total = await models.Order.countDocuments(filter);
      const orders = await models.Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      
      res.json(ApiResponse.paginated(orders, page, limit, total));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get single order
   */
  static async getOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid order ID');
      }
      
      const order = await models.Order.findById(id);
      
      if (!order) {
        throw ApiError.notFound('Order not found');
      }
      
      // Customers can only view their own orders
      if (req.user!.role === UserRole.CUSTOMER && order.userId.toString() !== req.user!.userId) {
        throw ApiError.forbidden('Access denied');
      }
      
      res.json(ApiResponse.success(order));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get all orders (Admin)
   */
  static async getAllOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const query = orderQuerySchema.parse(req.query);
      const { page, limit, status, paymentStatus, startDate, endDate } = query;
      
      const filter: any = {};
      
      if (status) filter.status = status;
      if (paymentStatus) filter.paymentStatus = paymentStatus;
      
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }
      
      const total = await models.Order.countDocuments(filter);
      const orders = await models.Order.find(filter)
        .populate('userId', 'email firstName lastName')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      
      res.json(ApiResponse.paginated(orders, page, limit, total));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Update order status (Admin)
   */
  static async updateOrderStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const validatedData = updateOrderStatusSchema.parse(req.body);
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid order ID');
      }
      
      const order = await models.Order.findById(id);
      
      if (!order) {
        throw ApiError.notFound('Order not found');
      }
      
      // Validate status transition
      const validTransitions: Record<OrderStatus, OrderStatus[]> = {
        [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
        [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
        [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
        [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
        [OrderStatus.DELIVERED]: [],
        [OrderStatus.CANCELLED]: [],
        [OrderStatus.FLAGGED]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
        [OrderStatus.REJECTED]: [],
      };
      
      if (!(validTransitions as any)[order.status].includes(validatedData.status)) {
        throw ApiError.badRequest(
          `Cannot transition from ${order.status} to ${validatedData.status}`
        );
      }
      
      // Update order
      order.status = validatedData.status;
      if (validatedData.trackingNumber) order.trackingNumber = validatedData.trackingNumber;
      if (validatedData.notes) order.notes = validatedData.notes;
      
      await order.save();
      
      await AuditLogger.log({
        userId: req.user!.userId,
        action: AuditAction.ORDER_UPDATE,
        resource: 'order',
        resourceId: id,
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        details: {
          orderNumber: order.orderNumber,
          oldStatus: order.status,
          newStatus: validatedData.status,
          trackingNumber: validatedData.trackingNumber,
        },
      });
      
      res.json(ApiResponse.success(order, 'Order updated successfully'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Cancel order (Customer or Admin)
   */
  static async cancelOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid order ID');
      }
      
      const order = await models.Order.findById(id);
      
      if (!order) {
        throw ApiError.notFound('Order not found');
      }
      
      // Customers can only cancel their own pending/confirmed orders
      if (req.user!.role === UserRole.CUSTOMER) {
        if (order.userId.toString() !== req.user!.userId) {
          throw ApiError.forbidden('Access denied');
        }
        if (![OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(order.status)) {
          throw ApiError.badRequest('Order cannot be cancelled at this stage');
        }
      }
      
      // Cancel order
      order.status = OrderStatus.CANCELLED;
      await order.save();
      
      // Restore inventory
      for (const item of order.items) {
        await models.Product.findByIdAndUpdate(
          item.productId,
          { $inc: { inventory: item.quantity } }
        );
      }
      
      await AuditLogger.log({
        userId: req.user!.userId,
        action: AuditAction.ORDER_CANCEL,
        resource: 'order',
        resourceId: id,
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        details: {
          orderNumber: order.orderNumber,
          total: order.total,
        },
      });
      
      res.json(ApiResponse.success(order, 'Order cancelled'));
      
    } catch (error) {
      next(error);
    }
  }
}

// =============================================
// Order Routes
// =============================================

const router = Router();

// Customer routes
router.post(
  '/',
  authenticate,
  sanitizeInput,
  validate(createOrderSchema),
  OrderController.createOrder
);

router.get('/my-orders', authenticate, OrderController.getUserOrders);
router.get('/:id', authenticate, OrderController.getOrder);
router.post('/:id/cancel', authenticate, OrderController.cancelOrder);

// Admin routes
router.get(
  '/admin/all',
  authenticate,
  rbacGate(UserRole.ADMIN),
  OrderController.getAllOrders
);

router.put(
  '/:id/status',
  authenticate,
  rbacGate(UserRole.ADMIN),
  sanitizeInput,
  validate(updateOrderStatusSchema),
  OrderController.updateOrderStatus
);

export default router;