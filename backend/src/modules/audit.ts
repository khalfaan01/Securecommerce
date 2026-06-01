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
import { authenticate, rbacGate } from '../middleware';
import { AuditLogger } from '../services/auditService';
import { logger } from '../config/logger';

// =============================================
// Validation Schemas
// =============================================

const auditQuerySchema = z.object({
  page: z.string().optional().transform(val => parseInt(val || '1')),
  limit: z.string().optional().transform(val => parseInt(val || '50')),
  userId: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  severity: z.string().optional(),
  success: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  ip: z.string().optional(),
  correlationId: z.string().optional(),
  sort: z.enum(['timestamp', 'severity']).optional().default('timestamp'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

// =============================================
// Audit Controller
// =============================================

class AuditController {
  
  /**
   * Get audit logs with filtering (Auditor/Admin only)
   */
  static async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const query = auditQuerySchema.parse(req.query);
      const { 
        page, limit, userId, action, resource, severity, success, 
        startDate, endDate, ip, correlationId, sort, order 
      } = query;
      
      // Build filter
      const filter: any = {};
      
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        filter.userId = userId;
      }
      
      if (action) {
        filter.action = action;
      }
      
      if (resource) {
        filter.resource = resource;
      }
      
      if (severity) {
        filter.severity = severity;
      }
      
      if (success !== undefined) {
        filter.success = success;
      }
      
      if (ip) {
        filter.ip = ip;
      }
      
      if (correlationId) {
        filter.correlationId = correlationId;
      }
      
      // Date range filter
      if (startDate || endDate) {
        filter.timestamp = {};
        if (startDate) filter.timestamp.$gte = new Date(startDate);
        if (endDate) filter.timestamp.$lte = new Date(endDate);
      }
      
      // Execute query
      const total = await models.AuditLog.countDocuments(filter);
      const logs = await models.AuditLog.find(filter)
        .populate('userId', 'email firstName lastName')
        .sort({ [sort]: order === 'asc' ? 1 : -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      
      res.json(ApiResponse.paginated(logs, page, limit, total));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get audit log by ID
   */
  static async getAuditLog(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid audit log ID');
      }
      
      const log = await models.AuditLog.findById(id)
        .populate('userId', 'email firstName lastName');
      
      if (!log) {
        throw ApiError.notFound('Audit log not found');
      }
      
      res.json(ApiResponse.success({ log }));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get failed login attempts by IP
   */
  static async getFailedLoginsByIp(req: Request, res: Response, next: NextFunction) {
    try {
      const { hours } = req.query;
      const lookbackHours = parseInt(hours as string) || 24;
      
      const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
      
      const failedLogins = await models.AuditLog.aggregate([
        {
          $match: {
            action: AuditAction.LOGIN_FAILED,
            success: false,
            timestamp: { $gte: since },
          },
        },
        {
          $group: {
            _id: '$ip',
            count: { $sum: 1 },
            lastAttempt: { $max: '$timestamp' },
            attempts: {
              $push: {
                userId: '$userId',
                timestamp: '$timestamp',
                userAgent: '$userAgent',
              },
            },
          },
        },
        {
          $match: {
            count: { $gte: 3 }, // At least 3 failed attempts
          },
        },
        {
          $sort: { count: -1 },
        },
        {
          $limit: 100,
        },
      ]);
      
      // Format response for the security dashboard
      const result = failedLogins.map(entry => ({
        ip: entry._id,
        count: entry.count,
        lastAttempt: entry.lastAttempt,
        recentAttempts: entry.attempts
          .sort((a: any, b: any) => b.timestamp - a.timestamp)
          .slice(0, 5),
      }));
      
      res.json(ApiResponse.success({
        ipAddresses: result,
        totalUniqueIps: result.length,
        lookbackHours,
        threshold: 3,
      }));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get audit summary/statistics
   */
  static async getAuditSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { hours } = req.query;
      const lookbackHours = parseInt(hours as string) || 24;
      const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
      
      // Total events
      const totalEvents = await models.AuditLog.countDocuments({
        timestamp: { $gte: since },
      });
      
      // Events by severity
      const eventsBySeverity = await models.AuditLog.aggregate([
        { $match: { timestamp: { $gte: since } } },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]);
      
      // Events by action
      const eventsByAction = await models.AuditLog.aggregate([
        { $match: { timestamp: { $gte: since } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]);
      
      // Events by resource
      const eventsByResource = await models.AuditLog.aggregate([
        { $match: { timestamp: { $gte: since } } },
        { $group: { _id: '$resource', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);
      
      // Failed vs successful
      const successRate = await models.AuditLog.aggregate([
        { $match: { timestamp: { $gte: since } } },
        { $group: { _id: '$success', count: { $sum: 1 } } },
      ]);
      
      // Hourly trend
      const hourlyTrend = await models.AuditLog.aggregate([
        { $match: { timestamp: { $gte: since } } },
        {
          $group: {
            _id: {
              year: { $year: '$timestamp' },
              month: { $month: '$timestamp' },
              day: { $dayOfMonth: '$timestamp' },
              hour: { $hour: '$timestamp' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } },
      ]);
      
      res.json(ApiResponse.success({
        totalEvents,
        lookbackHours,
        eventsBySeverity: eventsBySeverity.reduce((acc: any, curr: any) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {}),
        eventsByAction: eventsByAction.reduce((acc: any, curr: any) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {}),
        eventsByResource: eventsByResource.reduce((acc: any, curr: any) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {}),
        successRate: {
          successful: successRate.find((s: any) => s._id === true)?.count || 0,
          failed: successRate.find((s: any) => s._id === false)?.count || 0,
        },
        hourlyTrend: hourlyTrend.map((h: any) => ({
          hour: `${h._id.month}/${h._id.day} ${h._id.hour}:00`,
          count: h.count,
        })),
      }));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get user activity timeline
   */
  static async getUserActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const { hours } = req.query;
      const lookbackHours = parseInt(hours as string) || 24;
      
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw ApiError.badRequest('Invalid user ID');
      }
      
      const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
      
      const activity = await models.AuditLog.find({
        userId,
        timestamp: { $gte: since },
      })
        .sort({ timestamp: -1 })
        .limit(100);
      
      // Get summary stats for the user
      const stats = await models.AuditLog.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId), timestamp: { $gte: since } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);
      
      res.json(ApiResponse.success({
        userId,
        activity,
        summary: stats,
        totalActions: activity.length,
        lookbackHours,
      }));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Search audit logs (advanced)
   */
  static async searchAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const { q, page = 1, limit = 50 } = req.query;
      
      if (!q) {
        throw ApiError.badRequest('Search query is required');
      }
      
      const searchQuery = q as string;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      
      // Search across multiple fields
      const filter = {
        $or: [
          { action: { $regex: searchQuery, $options: 'i' } },
          { resource: { $regex: searchQuery, $options: 'i' } },
          { resourceId: searchQuery },
          { 'details': { $regex: searchQuery, $options: 'i' } },
          { correlationId: searchQuery },
        ],
      };
      
      const total = await models.AuditLog.countDocuments(filter);
      const results = await models.AuditLog.find(filter)
        .populate('userId', 'email firstName lastName')
        .sort({ timestamp: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);
      
      res.json(ApiResponse.paginated(results, pageNum, limitNum, total));
      
    } catch (error) {
      next(error);
    }
  }
}

// =============================================
// Audit Routes
// =============================================

const router = Router();

// All audit routes require Auditor or Admin role
router.use(authenticate);
router.use(rbacGate(UserRole.AUDITOR, UserRole.ADMIN));

// Get audit logs with filtering
router.get('/logs', AuditController.getAuditLogs);

// Search audit logs
router.get('/search', AuditController.searchAuditLogs);

// Get audit summary/statistics
router.get('/summary', AuditController.getAuditSummary);

// Get failed login map
router.get('/failed-logins', AuditController.getFailedLoginsByIp);

// Get single audit log
router.get('/logs/:id', AuditController.getAuditLog);

// Get user activity
router.get('/user-activity/:userId', AuditController.getUserActivity);

export default router;