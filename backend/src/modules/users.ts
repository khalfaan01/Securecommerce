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
import { logger } from '../config/logger';

// =============================================
// Validation Schemas
// =============================================

const updateUserSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  isActive: z.boolean().optional(),
  role: z.nativeEnum(UserRole).optional(),
});

const userQuerySchema = z.object({
  page: z.string().optional().transform(val => parseInt(val || '1')),
  limit: z.string().optional().transform(val => parseInt(val || '20')),
  role: z.string().optional(),
  isActive: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
  search: z.string().optional(),
});

// =============================================
// User Controller
// =============================================

class UserController {
  
  /**
   * Get all users (Admin/Auditor only)
   */
  static async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const query = userQuerySchema.parse(req.query);
      const { page, limit, role, isActive, search } = query;
      
      const filter: any = {};
      
      if (role) {
        filter.role = role;
      }
      
      if (isActive !== undefined) {
        filter.isActive = isActive;
      }
      
      if (search) {
        filter.$or = [
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
        ];
      }
      
      const total = await models.User.countDocuments(filter);
      const users = await models.User.find(filter)
        .select('-password -mfaSecret -mfaRecoveryCodes -refreshTokens')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      
      res.json(ApiResponse.paginated(users, page, limit, total));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get single user by ID
   */
  static async getUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      // Users can only view their own profile (except admins)
      if (req.user!.role !== UserRole.ADMIN && req.user!.role !== UserRole.AUDITOR) {
        if (id !== req.user!.userId) {
          throw ApiError.forbidden('Access denied');
        }
      }
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid user ID');
      }
      
      const user = await models.User.findById(id)
        .select('-password -mfaSecret -mfaRecoveryCodes -refreshTokens');
      
      if (!user) {
        throw ApiError.notFound('User not found');
      }
      
      res.json(ApiResponse.success({ user }));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Update user (Admin only)
   */
  static async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const validatedData = updateUserSchema.parse(req.body);
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid user ID');
      }
      
      // Prevent admins from modifying their own role
      if (id === req.user!.userId && validatedData.role) {
        throw ApiError.badRequest('Cannot modify your own role');
      }
      
      const user = await models.User.findById(id);
      
      if (!user) {
        throw ApiError.notFound('User not found');
      }
      
      // Update fields
      const oldValues = {
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
      };
      
      Object.assign(user, validatedData);
      await user.save();
      
      // Audit log for sensitive changes
      if (validatedData.role || validatedData.isActive !== undefined) {
        await AuditLogger.log({
          userId: req.user!.userId,
          action: validatedData.isActive === false ? AuditAction.USER_DISABLE :
                  validatedData.isActive === true ? AuditAction.USER_ENABLE :
                  AuditAction.USER_UPDATE,
          resource: 'user',
          resourceId: id,
          ip: req.ip || '0.0.0.0',
          userAgent: req.get('user-agent'),
          success: true,
          severity: ThreatSeverity.MEDIUM,
          details: {
            changes: {
              role: validatedData.role ? { from: oldValues.role, to: validatedData.role } : undefined,
              status: validatedData.isActive !== undefined ? 
                { from: oldValues.isActive, to: validatedData.isActive } : undefined,
            },
          },
        });
      }
      
      logger.info('User updated', {
        adminId: req.user!.userId,
        targetUserId: id,
        changes: validatedData,
      });
      
      res.json(ApiResponse.success({ user }, 'User updated successfully'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Delete user (Admin only - soft delete)
   */
  static async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid user ID');
      }
      
      // Prevent self-deletion
      if (id === req.user!.userId) {
        throw ApiError.badRequest('Cannot delete your own account');
      }
      
      const user = await models.User.findById(id);
      
      if (!user) {
        throw ApiError.notFound('User not found');
      }
      
      // Soft delete - deactivate user
      user.isActive = false;
      
      // Revoke all refresh tokens
      user.refreshTokens.forEach((token: any) => { token.isRevoked = true; });
      
      await user.save();
      
      // Threat detection: Check for mass deletions
      const recentDeletes = await models.AuditLog.countDocuments({
        action: AuditAction.USER_DELETE,
        'details.adminId': req.user!.userId,
        timestamp: { $gte: new Date(Date.now() - 10 * 60 * 1000) }, // Last 10 minutes
      });
      
      if (recentDeletes >= 3) {
        await models.ThreatAlert.create({
          ruleId: 'mass_user_delete',
          ruleName: 'Mass User Deletion',
          severity: ThreatSeverity.CRITICAL,
          userId: req.user!.userId,
          action: 'admin_mass_delete',
          details: {
            targetUserId: id,
            targetEmail: user.email,
            deleteCount: recentDeletes + 1,
            timeWindow: '10 minutes',
          },
          count: recentDeletes + 1,
        });
        
        logger.warn('CRITICAL: Mass user deletion detected', {
          adminId: req.user!.userId,
          count: recentDeletes + 1,
        });
      }
      
      await AuditLogger.log({
        userId: req.user!.userId,
        action: AuditAction.USER_DELETE,
        resource: 'user',
        resourceId: id,
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: recentDeletes >= 3 ? ThreatSeverity.CRITICAL : ThreatSeverity.HIGH,
        details: {
          targetEmail: user.email,
          adminId: req.user!.userId,
          recentDeletesInWindow: recentDeletes,
        },
      });
      
      res.json(ApiResponse.success(null, 'User deleted (deactivated) successfully'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get user statistics (Admin/Auditor)
   */
  static async getUserStats(req: Request, res: Response, next: NextFunction) {
    try {
      const totalUsers = await models.User.countDocuments();
      const activeUsers = await models.User.countDocuments({ isActive: true });
      const usersByRole = await models.User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]);
      
      const mfaEnabled = await models.User.countDocuments({ mfaEnabled: true });
      
      // New users in last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const newUsersLast30Days = await models.User.countDocuments({
        createdAt: { $gte: thirtyDaysAgo },
      });
      
      // Users with failed login attempts
      const usersWithFailedLogins = await models.User.countDocuments({
        failedLoginAttempts: { $gt: 0 },
      });
      
      res.json(ApiResponse.success({
        totalUsers,
        activeUsers,
        usersByRole: usersByRole.reduce((acc: any, curr: any) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {}),
        mfaEnabled,
        mfaAdoptionRate: totalUsers > 0 ? ((mfaEnabled / totalUsers) * 100).toFixed(1) : 0,
        newUsersLast30Days,
        usersWithFailedLogins,
      }));
      
    } catch (error) {
      next(error);
    }
  }
}

// =============================================
// User Routes
// =============================================

const router = Router();

// All user routes require authentication
router.use(authenticate);

// Get user stats (Admin/Auditor only)
router.get(
  '/stats',
  rbacGate(UserRole.ADMIN, UserRole.AUDITOR),
  UserController.getUserStats
);

// Get all users (Admin/Auditor only)
router.get(
  '/',
  rbacGate(UserRole.ADMIN, UserRole.AUDITOR),
  UserController.getUsers
);

// Get single user
router.get('/:id', UserController.getUser);

// Update user (Admin only)
router.put(
  '/:id',
  rbacGate(UserRole.ADMIN),
  sanitizeInput,
  validate(updateUserSchema),
  UserController.updateUser
);

// Delete user (Admin only)
router.delete(
  '/:id',
  rbacGate(UserRole.ADMIN),
  UserController.deleteUser
);

export default router;