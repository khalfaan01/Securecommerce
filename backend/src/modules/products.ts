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
  IProduct 
} from '../types';
import { authenticate, rbacGate, validate, sanitizeInput, auditAction } from '../middleware';
import { AuditLogger } from '../services/auditService';
import { logger } from '../config/logger';

// =============================================
// Validation Schemas
// =============================================

const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(200),
  description: z.string().min(1, 'Description is required').max(5000),
  price: z.number().min(0, 'Price must be positive'),
  compareAtPrice: z.number().min(0).optional().nullable(),
  categoryId: z.string().min(1, 'Category is required'),
  images: z.array(z.string().url('Invalid image URL')).max(10).default([]),
  inventory: z.number().int().min(0).default(0),
  sku: z.string().optional(),
  tags: z.array(z.string()).max(20).default([]),
  isActive: z.boolean().default(true),
});

const updateProductSchema = createProductSchema.partial();

const productQuerySchema = z.object({
  page: z.string().optional().transform(val => parseInt(val || '1')),
  limit: z.string().optional().transform(val => parseInt(val || '20')),
  sort: z.enum(['price', 'name', 'createdAt', 'averageRating', 'inventory']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  search: z.string().optional(),
  category: z.string().optional(),
  minPrice: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  maxPrice: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  tags: z.string().optional().transform(val => val ? val.split(',') : undefined),
  inStock: z.string().optional().transform(val => val === 'true'),
  isActive: z.string().optional().transform(val => val === 'true'),
});

// =============================================
// Product Controller
// =============================================

class ProductController {
  
  /**
   * Get all products with filtering, search, and pagination
   */
  static async getProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const query = productQuerySchema.parse(req.query);
      const { page, limit, sort, order, search, category, minPrice, maxPrice, tags, inStock, isActive } = query;
      
      // Build filter
      const filter: any = {};
      
      // Only show active products for non-admin users
      if (!req.user || req.user!.role === UserRole.CUSTOMER) {
        filter.isActive = true;
      } else if (isActive !== undefined) {
        filter.isActive = isActive;
      }
      
      // Text search
      if (search) {
        filter.$text = { $search: search };
      }
      
      // Category filter
      if (category && mongoose.Types.ObjectId.isValid(category)) {
        filter.categoryId = category;
      }
      
      // Price range
      if (minPrice !== undefined || maxPrice !== undefined) {
        filter.price = {};
        if (minPrice !== undefined) filter.price.$gte = minPrice;
        if (maxPrice !== undefined) filter.price.$lte = maxPrice;
      }
      
      // Tags filter
      if (tags && tags.length > 0) {
        filter.tags = { $in: tags };
      }
      
      // In stock filter
      if (inStock) {
        filter.inventory = { $gt: 0 };
      }
      
      // Execute query
      const total = await models.Product.countDocuments(filter);
      const products = await models.Product.find(filter)
        .populate('categoryId', 'name slug')
        .sort({ [sort]: order === 'asc' ? 1 : -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      
      res.json(ApiResponse.paginated(products, page, limit, total));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get single product by ID
   */
  static async getProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid product ID');
      }
      
      const product = await models.Product.findById(id)
        .populate('categoryId', 'name slug')
        .populate('createdBy', 'firstName lastName email');
      
      if (!product) {
        throw ApiError.notFound('Product not found');
      }
      
      // Check if product is active for non-admin users
      if (!product.isActive && (!req.user || req.user!.role === UserRole.CUSTOMER)) {
        throw ApiError.notFound('Product not found');
      }
      
      res.json(ApiResponse.success(product));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Create new product (Admin only)
   */
  static async createProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = createProductSchema.parse(req.body);
      
      // Verify category exists
      const category = await models.Category.findById(validatedData.categoryId);
      if (!category) {
        throw ApiError.badRequest('Category not found');
      }
      
      // Check for duplicate SKU if provided
      if (validatedData.sku) {
        const existingProduct = await models.Product.findOne({ sku: validatedData.sku });
        if (existingProduct) {
          throw ApiError.badRequest('Product with this SKU already exists');
        }
      }
      
      // Create product
      const product = new models.Product({
        ...validatedData,
        createdBy: req.user!.userId,
      });
      
      await product.save();
      
      // Audit log
      await AuditLogger.log({
        userId: req.user!.userId,
        action: AuditAction.PRODUCT_CREATE,
        resource: 'product',
        resourceId: product._id.toString(),
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        details: { 
          name: product.name,
          price: product.price,
          categoryId: product.categoryId,
          sku: product.sku,
        },
      });
      
      logger.info('Product created', {
        productId: product._id,
        name: product.name,
        userId: req.user!.userId,
      });
      
      res.status(201).json(ApiResponse.success(product, 'Product created successfully'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Update product (Admin only)
   */
  static async updateProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const validatedData = updateProductSchema.parse(req.body);
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid product ID');
      }
      
      const product = await models.Product.findById(id);
      
      if (!product) {
        throw ApiError.notFound('Product not found');
      }
      
      // If category changed, verify new category exists
      if (validatedData.categoryId && validatedData.categoryId !== product.categoryId.toString()) {
        const category = await models.Category.findById(validatedData.categoryId);
        if (!category) {
          throw ApiError.badRequest('Category not found');
        }
      }
      
      // Update fields
      Object.assign(product, {
        ...validatedData,
        updatedBy: req.user!.userId,
      });
      
      await product.save();
      
      // Audit log
      await AuditLogger.log({
        userId: req.user!.userId,
        action: AuditAction.PRODUCT_UPDATE,
        resource: 'product',
        resourceId: product._id.toString(),
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        details: { 
          updatedFields: Object.keys(validatedData),
          sku: product.sku,
        },
      });
      
      res.json(ApiResponse.success(product, 'Product updated successfully'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Delete product (Admin only)
   */
  static async deleteProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid product ID');
      }
      
      const product = await models.Product.findById(id);
      
      if (!product) {
        throw ApiError.notFound('Product not found');
      }
      
      // Soft delete - deactivate instead of removing
      product.isActive = false;
      product.updatedBy = req.user!.userId;
      await product.save();
      
      // Threat detection: Check for mass deletions
      const recentDeletes = await models.AuditLog.countDocuments({
        action: AuditAction.PRODUCT_DELETE,
        'details.userId': req.user!.userId,
        timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
      });
      
      if (recentDeletes >= 3) {
        await models.ThreatAlert.create({
          ruleId: 'mass_delete',
          ruleName: 'Mass Product Deletion',
          severity: ThreatSeverity.HIGH,
          userId: req.user!.userId,
          action: 'admin_mass_delete',
          details: {
            productId: id,
            productName: product.name,
            deleteCount: recentDeletes + 1,
            timeWindow: '5 minutes',
          },
          count: recentDeletes + 1,
        });
        
        logger.warn('Mass product deletion detected', {
          userId: req.user!.userId,
          count: recentDeletes + 1,
        });
      }
      
      // Audit log
      await AuditLogger.log({
        userId: req.user!.userId,
        action: AuditAction.PRODUCT_DELETE,
        resource: 'product',
        resourceId: id,
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: recentDeletes >= 3 ? ThreatSeverity.HIGH : ThreatSeverity.MEDIUM,
        details: { 
          name: product.name,
          sku: product.sku,
          recentDeletesInWindow: recentDeletes,
        },
      });
      
      res.json(ApiResponse.success(null, 'Product deleted successfully'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Bulk update product inventory
   */
  static async bulkUpdateInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const schema = z.object({
        updates: z.array(z.object({
          productId: z.string(),
          quantity: z.number().int(),
        })).max(100),
      });
      
      const { updates } = schema.parse(req.body);
      
      const results = await Promise.all(
        updates.map(async ({ productId, quantity }) => {
          const product = await models.Product.findByIdAndUpdate(
            productId,
            { $inc: { inventory: quantity }, updatedBy: req.user!.userId },
            { new: true }
          );
          
          return { productId, success: !!product, newInventory: product?.inventory };
        })
      );
      
      // Audit log for bulk operation
      await AuditLogger.log({
        userId: req.user!.userId,
        action: AuditAction.ADMIN_BULK_OPERATION,
        resource: 'product',
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: updates.length > 20 ? ThreatSeverity.MEDIUM : ThreatSeverity.LOW,
        details: { 
          operation: 'bulk_inventory_update',
          count: updates.length,
          results: results.filter(r => r.success).length,
        },
      });
      
      res.json(ApiResponse.success(results, `Updated ${results.filter(r => r.success).length} products`));
      
    } catch (error) {
      next(error);
    }
  }
}

// =============================================
// Product Routes
// =============================================

const router = Router();

// Public routes
router.get('/', ProductController.getProducts);
router.get('/:id', ProductController.getProduct);

// Admin routes
router.post(
  '/',
  authenticate,
  rbacGate(UserRole.ADMIN),
  sanitizeInput,
  validate(createProductSchema),
  ProductController.createProduct
);

router.put(
  '/:id',
  authenticate,
  rbacGate(UserRole.ADMIN),
  sanitizeInput,
  ProductController.updateProduct
);

router.delete(
  '/:id',
  authenticate,
  rbacGate(UserRole.ADMIN),
  ProductController.deleteProduct
);

router.post(
  '/bulk/inventory',
  authenticate,
  rbacGate(UserRole.ADMIN),
  sanitizeInput,
  ProductController.bulkUpdateInventory
);

export default router;