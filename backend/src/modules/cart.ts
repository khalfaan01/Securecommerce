import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';

import models from '../models';
import { 
  ApiError, 
  ApiResponse, 
  AuditAction, 
  ThreatSeverity 
} from '../types';
import { authenticate, validate, sanitizeInput } from '../middleware';
import { AuditLogger } from '../services/auditService';

// =============================================
// Validation Schemas
// =============================================

const addItemSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(100, 'Quantity cannot exceed 100'),
});

const updateItemSchema = z.object({
  quantity: z.number().int().min(0, 'Quantity cannot be negative').max(100),
});

const cartSessionSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required').optional(),
});

// =============================================
// Cart Controller
// =============================================

class CartController {
  
  /**
   * Get current user's cart
   */
  static async getCart(req: Request, res: Response, next: NextFunction) {
    try {
      let cart: any;
      const userId = req.user?.userId;
      const sessionId = req.headers['x-session-id'] as string || req.query.sessionId as string;
      
      if (userId) {
        // Get user cart
        cart = await models.Cart.findOne({ userId });
        
        // If user has a session cart, merge them
        if (sessionId) {
          const sessionCart = await models.Cart.findOne({ sessionId, userId: null });
          if (sessionCart && sessionCart.items.length > 0) {
            if (cart) {
              // Merge items
              sessionCart.items.forEach((sessionItem: any) => {
                const existingItem = cart.items.find(
                  (item: any) => item.productId.toString() === sessionItem.productId.toString()
                );
                if (existingItem) {
                  existingItem.quantity += sessionItem.quantity;
                } else {
                  cart.items.push(sessionItem);
                }
              });
              await cart.save();
            } else {
              // Convert session cart to user cart
              sessionCart.userId = userId;
              await sessionCart.save();
              cart = sessionCart;
            }
            
            // Delete session cart after merge
            await models.Cart.findByIdAndDelete(sessionCart._id);
          }
        }
      } else if (sessionId) {
        // Get session cart
        cart = await models.Cart.findOne({ sessionId, userId: null });
      }
      
      if (!cart) {
        // Create new cart
        cart = new models.Cart({
          userId: userId || null,
          sessionId: sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          items: [],
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        await cart.save();
      }
      
      // Populate product details
      const populatedCart = await models.Cart.findById(cart._id)
        .populate({
          path: 'items.productId',
          select: 'name price images inventory isActive',
        });
      
      res.json(ApiResponse.success(populatedCart));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Add item to cart
   */
  static async addItem(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = addItemSchema.parse(req.body);
      const userId = req.user?.userId;
      const sessionId = (req.headers['x-session-id'] as string) || `session_${Date.now()}`;
      
      // Verify product exists and is active
      const product = await models.Product.findById(validatedData.productId);
      
      if (!product || !product.isActive) {
        throw ApiError.notFound('Product not found or unavailable');
      }
      
      // Check inventory
      if (product.inventory < validatedData.quantity) {
        throw ApiError.badRequest(`Only ${product.inventory} items available in stock`);
      }
      
      // Find or create cart
      let cart: any;
      if (userId) {
        cart = await models.Cart.findOne({ userId });
      } else {
        cart = await models.Cart.findOne({ sessionId, userId: null });
      }
      
      if (!cart) {
        cart = new models.Cart({
          userId: userId || null,
          sessionId,
          items: [],
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }
      
      // Check if item already in cart
      const existingItem = cart.items.find(
        (item: any) => item.productId.toString() === validatedData.productId
      );
      
      if (existingItem) {
        // Check total quantity doesn't exceed inventory
        if (existingItem.quantity + validatedData.quantity > product.inventory) {
          throw ApiError.badRequest('Cannot add more than available inventory');
        }
        existingItem.quantity += validatedData.quantity;
      } else {
        cart.items.push({
          productId: validatedData.productId,
          name: product.name,
          price: product.price,
          quantity: validatedData.quantity,
          image: product.images[0] || null,
        });
      }
      
      await cart.save();
      
      // Populate product details for response
      const populatedCart = await models.Cart.findById(cart._id)
        .populate({
          path: 'items.productId',
          select: 'name price images inventory isActive',
        });
      
      // Audit log for cart update
      await AuditLogger.log({
        userId: req.user?.userId,
        action: AuditAction.CART_UPDATE,
        resource: 'cart',
        resourceId: cart._id.toString(),
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        details: { 
          productId: validatedData.productId,
          quantity: validatedData.quantity,
          totalItems: cart.items.length,
          totalAmount: cart.totalAmount,
        },
      });
      
      res.json(ApiResponse.success(populatedCart, 'Item added to cart'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Update item quantity
   */
  static async updateItem(req: Request, res: Response, next: NextFunction) {
    try {
      const { itemId } = req.params;
      const { quantity } = updateItemSchema.parse(req.body);
      const userId = req.user?.userId;
      const sessionId = req.headers['x-session-id'] as string;
      
      // Find cart
      let cart: any;
      if (userId) {
        cart = await models.Cart.findOne({ userId });
      } else {
        cart = await models.Cart.findOne({ sessionId, userId: null });
      }
      
      if (!cart) {
        throw ApiError.notFound('Cart not found');
      }
      
      // Find item in cart
      const itemIndex = cart.items.findIndex(
        (item: any) => (item as any)._id.toString() === itemId
      );
      
      if (itemIndex === -1) {
        throw ApiError.notFound('Item not found in cart');
      }
      
      if (quantity === 0) {
        // Remove item from cart
        cart.items.splice(itemIndex, 1);
      } else {
        // Check inventory
        const product = await models.Product.findById(cart.items[itemIndex].productId);
        if (product && quantity > product.inventory) {
          throw ApiError.badRequest(`Only ${product.inventory} items available`);
        }
        
        cart.items[itemIndex].quantity = quantity;
      }
      
      await cart.save();
      
      const populatedCart = await models.Cart.findById(cart._id)
        .populate({
          path: 'items.productId',
          select: 'name price images inventory isActive',
        });
      
      res.json(ApiResponse.success(populatedCart, 'Cart updated'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Remove item from cart
   */
  static async removeItem(req: Request, res: Response, next: NextFunction) {
    try {
      const { itemId } = req.params;
      const userId = req.user?.userId;
      const sessionId = req.headers['x-session-id'] as string;
      
      let cart: any;
      if (userId) {
        cart = await models.Cart.findOne({ userId });
      } else {
        cart = await models.Cart.findOne({ sessionId, userId: null });
      }
      
      if (!cart) {
        throw ApiError.notFound('Cart not found');
      }
      
      // Remove item
      cart.items = cart.items.filter(
        (item: any) => (item as any)._id.toString() !== itemId
      );
      
      await cart.save();
      
      const populatedCart = await models.Cart.findById(cart._id)
        .populate({
          path: 'items.productId',
          select: 'name price images inventory isActive',
        });
      
      res.json(ApiResponse.success(populatedCart, 'Item removed from cart'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Clear entire cart
   */
  static async clearCart(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      const sessionId = req.headers['x-session-id'] as string;
      
      let cart: any;
      if (userId) {
        cart = await models.Cart.findOne({ userId });
      } else {
        cart = await models.Cart.findOne({ sessionId, userId: null });
      }
      
      if (cart) {
        cart.items = [];
        cart.totalAmount = 0;
        await cart.save();
      }
      
      res.json(ApiResponse.success(null, 'Cart cleared'));
      
    } catch (error) {
      next(error);
    }
  }
}

// =============================================
// Cart Routes
// =============================================

const router = Router();

// All routes need at minimum a session identifier
router.get('/', CartController.getCart);
router.post('/items', sanitizeInput, validate(addItemSchema), CartController.addItem);
router.put('/items/:itemId', sanitizeInput, validate(updateItemSchema), CartController.updateItem);
router.delete('/items/:itemId', CartController.removeItem);
router.delete('/', CartController.clearCart);

export default router;