import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';

import models from '../models';
import {
  ApiError, 
  ApiResponse, 
  UserRole, 
  AuditAction, 
  ThreatSeverity 
} from '../types';
import { authenticate, rbacGate, validate, sanitizeInput } from '../middleware';
import { AuditLogger } from '../services/auditService';

// =============================================
// Validation Schemas
// =============================================

const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100),
  description: z.string().max(1000).optional().default(''),
  parentId: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

const updateCategorySchema = createCategorySchema.partial();

// =============================================
// Category Controller
// =============================================

class CategoryController {
  
  /**
   * Get all categories (hierarchical)
   */
  static async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const { includeInactive } = req.query;
      
      const filter: any = {};
      
      // Only show active categories for customers
      if (!includeInactive || (req.user && req.user!.role === UserRole.CUSTOMER)) {
        filter.isActive = true;
      }
      
      const categories = await models.Category.find(filter)
        .populate('subcategories')
        .sort({ name: 1 });
      
      // Build tree structure
      const categoryTree = categories
        .filter(cat => !cat.parentId)
        .map(cat => {
          const children = categories.filter(c => 
            c.parentId?.toString() === cat._id.toString()
          );
          return {
            ...cat.toObject(),
            children,
          };
        });
      
      res.json(ApiResponse.success(categoryTree));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get single category
   */
  static async getCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid category ID');
      }
      
      const category = await models.Category.findById(id)
        .populate('subcategories');
      
      if (!category) {
        throw ApiError.notFound('Category not found');
      }
      
      // Get product count
      const productCount = await models.Product.countDocuments({
        categoryId: id,
        isActive: true,
      });
      
      res.json(ApiResponse.success({
        ...category.toObject(),
        productCount,
      }));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Create category (Admin only)
   */
  static async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = createCategorySchema.parse(req.body);
      
      // Check for duplicate name
      const existingCategory = await models.Category.findOne({ name: validatedData.name });
      if (existingCategory) {
        throw ApiError.badRequest('Category with this name already exists');
      }
      
      // Verify parent category if provided
      if (validatedData.parentId) {
        const parentCategory = await models.Category.findById(validatedData.parentId);
        if (!parentCategory) {
          throw ApiError.badRequest('Parent category not found');
        }
      }
      
      const category = new models.Category(validatedData);
      await category.save();
      
      await AuditLogger.log({
        userId: req.user!.userId,
        action: AuditAction.PRODUCT_CREATE, // Using generic creation action
        resource: 'category',
        resourceId: category._id.toString(),
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        details: { name: category.name, parentId: category.parentId },
      });
      
      res.status(201).json(ApiResponse.success(category, 'Category created successfully'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Update category (Admin only)
   */
  static async updateCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const validatedData = updateCategorySchema.parse(req.body);
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid category ID');
      }
      
      const category = await models.Category.findById(id);
      
      if (!category) {
        throw ApiError.notFound('Category not found');
      }
      
      // Prevent circular parent references
      if (validatedData.parentId) {
        if (validatedData.parentId === id) {
          throw ApiError.badRequest('Category cannot be its own parent');
        }
        
        // Check for circular reference
        const parentCategory = await models.Category.findById(validatedData.parentId);
        if (parentCategory?.parentId?.toString() === id) {
          throw ApiError.badRequest('Circular parent reference detected');
        }
      }
      
      Object.assign(category, validatedData);
      await category.save();
      
      await AuditLogger.log({
        userId: req.user!.userId,
        action: AuditAction.PRODUCT_UPDATE,
        resource: 'category',
        resourceId: id,
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        details: { updatedFields: Object.keys(validatedData) },
      });
      
      res.json(ApiResponse.success(category, 'Category updated successfully'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Delete category (Admin only)
   */
  static async deleteCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid category ID');
      }
      
      const category = await models.Category.findById(id);
      
      if (!category) {
        throw ApiError.notFound('Category not found');
      }
      
      // Check for products in category
      const productCount = await models.Product.countDocuments({ categoryId: id });
      if (productCount > 0) {
        throw ApiError.badRequest(
          `Cannot delete category with ${productCount} products. Move or delete products first.`
        );
      }
      
      // Check for subcategories
      const subcategoryCount = await models.Category.countDocuments({ parentId: id });
      if (subcategoryCount > 0) {
        throw ApiError.badRequest(
          `Cannot delete category with ${subcategoryCount} subcategories. Remove them first.`
        );
      }
      
      await category.deleteOne();
      
      await AuditLogger.log({
        userId: req.user!.userId,
        action: AuditAction.PRODUCT_DELETE,
        resource: 'category',
        resourceId: id,
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: ThreatSeverity.MEDIUM,
        details: { name: category.name },
      });
      
      res.json(ApiResponse.success(null, 'Category deleted successfully'));
      
    } catch (error) {
      next(error);
    }
  }
}

// =============================================
// Category Routes
// =============================================

const router = Router();

// Public routes
router.get('/', CategoryController.getCategories);
router.get('/:id', CategoryController.getCategory);

// Admin routes
router.post(
  '/',
  authenticate,
  rbacGate(UserRole.ADMIN),
  sanitizeInput,
  validate(createCategorySchema),
  CategoryController.createCategory
);

router.put(
  '/:id',
  authenticate,
  rbacGate(UserRole.ADMIN),
  sanitizeInput,
  CategoryController.updateCategory
);

router.delete(
  '/:id',
  authenticate,
  rbacGate(UserRole.ADMIN),
  CategoryController.deleteCategory
);

export default router;