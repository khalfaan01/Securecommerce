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
  FraudRiskLevel 
} from '../types';
import { authenticate, rbacGate, validate } from '../middleware';
import { AuditLogger } from '../services/auditService';
import { logger } from '../config/logger';

// =============================================
// Validation Schemas
// =============================================

const resolveAlertSchema = z.object({
  resolution: z.enum(['approved', 'rejected', 'refunded']),
  notes: z.string().max(500).optional(),
});

const assignAlertSchema = z.object({
  assignedTo: z.string().min(1, 'User ID is required'),
});

const alertQuerySchema = z.object({
  page: z.string().optional().transform(val => parseInt(val || '1')),
  limit: z.string().optional().transform(val => parseInt(val || '20')),
  status: z.enum(['open', 'reviewing', 'resolved']).optional(),
  riskLevel: z.nativeEnum(FraudRiskLevel).optional(),
  assignedTo: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// =============================================
// Fraud Controller
// =============================================

class FraudController {
  
  /**
   * Get fraud alerts (review queue)
   */
  static async getFraudAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const query = alertQuerySchema.parse(req.query);
      const { page, limit, status, riskLevel, assignedTo, startDate, endDate } = query;
      
      const filter: any = {};
      
      if (status) {
        filter.status = status;
      }
      
      if (riskLevel) {
        filter.riskLevel = riskLevel;
      }
      
      if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
        filter.assignedTo = assignedTo;
      }
      
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }
      
      const total = await models.FraudAlert.countDocuments(filter);
      const alerts = await models.FraudAlert.find(filter)
        .populate('orderId', 'orderNumber total status createdAt')
        .populate('userId', 'email firstName lastName')
        .populate('assignedTo', 'email firstName lastName')
        .sort({ riskScore: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
      
      res.json(ApiResponse.paginated(alerts, page, limit, total));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get single fraud alert
   */
  static async getFraudAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid alert ID');
      }
      
      const alert = await models.FraudAlert.findById(id)
        .populate('orderId')
        .populate('userId', 'email firstName lastName')
        .populate('assignedTo', 'email firstName lastName');
      
      if (!alert) {
        throw ApiError.notFound('Fraud alert not found');
      }
      
      // Get related audit logs
      const relatedLogs = await models.AuditLog.find({
        userId: alert.userId,
        timestamp: { 
          $gte: new Date(alert.createdAt.getTime() - 60 * 60 * 1000), // 1 hour before
          $lte: new Date(alert.createdAt.getTime() + 60 * 60 * 1000), // 1 hour after
        },
      })
        .sort({ timestamp: -1 })
        .limit(20);
      
      res.json(ApiResponse.success({
        alert,
        relatedLogs,
      }));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Assign fraud alert to a user (for review)
   */
  static async assignAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { assignedTo } = assignAlertSchema.parse(req.body);
      
      if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
        throw ApiError.badRequest('Invalid user ID for assignment');
      }
      
      // Verify the assignee exists and has proper role
      const assignee = await models.User.findById(assignedTo);
      
      if (!assignee) {
        throw ApiError.notFound('Assignee user not found');
      }
      
      if (assignee.role !== UserRole.ADMIN && assignee.role !== UserRole.AUDITOR) {
        throw ApiError.badRequest('Can only assign to Admin or Auditor roles');
      }
      
      const alert = await models.FraudAlert.findById(id);
      
      if (!alert) {
        throw ApiError.notFound('Fraud alert not found');
      }
      
      alert.assignedTo = new mongoose.Types.ObjectId(assignedTo);
      alert.status = 'reviewing';
      await alert.save();
      
      await AuditLogger.log({
        userId: req.user!.userId,
        action: AuditAction.ORDER_UPDATE,
        resource: 'fraud_alert',
        resourceId: id,
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        details: {
          alertId: alert.alertId,
          assignedTo,
          previousAssignee: alert.assignedTo,
        },
      });
      
      res.json(ApiResponse.success({ alert }, 'Alert assigned successfully'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Resolve fraud alert
   */
  static async resolveAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { resolution, notes } = resolveAlertSchema.parse(req.body);
      
      const alert = await models.FraudAlert.findById(id);
      
      if (!alert) {
        throw ApiError.notFound('Fraud alert not found');
      }
      
      // Store old values for audit
      const oldResolution = alert.resolution;
      const oldStatus = alert.status;
      
      // Update alert
      alert.resolution = resolution;
      alert.status = 'resolved';
      await alert.save();
      
      // Update the associated order based on resolution
      if (alert.orderId) {
        const order = await models.Order.findById(alert.orderId);
        
        if (order) {
          switch (resolution) {
            case 'approved':
              order.status = OrderStatus.CONFIRMED;
              break;
            case 'rejected':
              order.status = OrderStatus.REJECTED;
              break;
            case 'refunded':
              order.status = OrderStatus.CANCELLED;
              order.paymentStatus = 'refunded' as any;
              break;
          }
          
          await order.save();
        }
      }
      
      await AuditLogger.log({
        userId: req.user!.userId,
        action: AuditAction.ORDER_UPDATE,
        resource: 'fraud_alert',
        resourceId: id,
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: ThreatSeverity.HIGH,
        details: {
          alertId: alert.alertId,
          resolution,
          previousResolution: oldResolution,
          previousStatus: oldStatus,
          notes,
        },
      });
      
      logger.info('Fraud alert resolved', {
        alertId: alert.alertId,
        resolution,
        resolverId: req.user!.userId,
      });
      
      res.json(ApiResponse.success({ alert }, 'Alert resolved successfully'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get threat alerts
   */
  static async getThreatAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = '1', limit = '20', severity, isResolved, startDate, endDate } = req.query;
      
      const filter: any = {};
      
      if (severity) {
        filter.severity = severity;
      }
      
      if (isResolved !== undefined) {
        filter.isResolved = isResolved === 'true';
      }
      
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate as string);
        if (endDate) filter.createdAt.$lte = new Date(endDate as string);
      }
      
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      
      const total = await models.ThreatAlert.countDocuments(filter);
      const alerts = await models.ThreatAlert.find(filter)
        .populate('userId', 'email firstName lastName')
        .sort({ severity: -1, createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);
      
      res.json(ApiResponse.paginated(alerts, pageNum, limitNum, total));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get single threat alert
   */
  static async getThreatAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest('Invalid threat alert ID');
      }
      
      const alert = await models.ThreatAlert.findById(id)
        .populate('userId', 'email firstName lastName');
      
      if (!alert) {
        throw ApiError.notFound('Threat alert not found');
      }
      
      res.json(ApiResponse.success({ alert }));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Resolve threat alert
   */
  static async resolveThreatAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      const alert = await models.ThreatAlert.findById(id);
      
      if (!alert) {
        throw ApiError.notFound('Threat alert not found');
      }
      
      alert.isResolved = true;
      await alert.save();
      
      await AuditLogger.log({
        userId: req.user!.userId,
        action: AuditAction.ORDER_UPDATE,
        resource: 'threat_alert',
        resourceId: id,
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        severity: ThreatSeverity.MEDIUM,
        details: {
          ruleId: alert.ruleId,
          ruleName: alert.ruleName,
        },
      });
      
      res.json(ApiResponse.success({ alert }, 'Threat alert resolved'));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get fraud detection statistics
   */
  static async getFraudStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { days = 30 } = req.query;
      const startDate = new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000);
      
      // Alert statistics
      const totalAlerts = await models.FraudAlert.countDocuments({
        createdAt: { $gte: startDate },
      });
      
      const openAlerts = await models.FraudAlert.countDocuments({
        status: 'open',
      });
      
      const reviewingAlerts = await models.FraudAlert.countDocuments({
        status: 'reviewing',
      });
      
      const resolvedAlerts = await models.FraudAlert.countDocuments({
        status: 'resolved',
        createdAt: { $gte: startDate },
      });
      
      // Risk score distribution
      const riskScoreDistribution = await models.FraudAlert.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: '$riskLevel',
            count: { $sum: 1 },
          },
        },
      ]);
      
      // Resolution breakdown
      const resolutionBreakdown = await models.FraudAlert.aggregate([
        { $match: { status: 'resolved', createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: '$resolution',
            count: { $sum: 1 },
          },
        },
      ]);
      
      // Top fraudsters (users with most alerts)
      const topFraudsters = await models.FraudAlert.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: '$userId',
            alertCount: { $sum: 1 },
            avgRiskScore: { $avg: '$riskScore' },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        {
          $project: {
            alertCount: 1,
            avgRiskScore: 1,
            email: '$user.email',
            firstName: '$user.firstName',
            lastName: '$user.lastName',
          },
        },
        { $sort: { alertCount: -1 } },
        { $limit: 10 },
      ]);
      
      res.json(ApiResponse.success({
        period: { days: parseInt(days as string), startDate },
        alerts: {
          total: totalAlerts,
          open: openAlerts,
          reviewing: reviewingAlerts,
          resolved: resolvedAlerts,
        },
        riskScoreDistribution: riskScoreDistribution.reduce((acc: any, curr: any) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {}),
        resolutionBreakdown: resolutionBreakdown.reduce((acc: any, curr: any) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {}),
        topFraudsters,
        modelVersion: 'random_forest_v1',
      }));
      
    } catch (error) {
      next(error);
    }
  }
}

// =============================================
// Fraud Routes
// =============================================

const router = Router();

// All fraud routes require Auditor or Admin role
router.use(authenticate);
router.use(rbacGate(UserRole.AUDITOR, UserRole.ADMIN));

// Fraud alerts
router.get('/alerts', FraudController.getFraudAlerts);
router.get('/alerts/:id', FraudController.getFraudAlert);
router.put('/alerts/:id/assign', validate(assignAlertSchema), FraudController.assignAlert);
router.put('/alerts/:id/resolve', validate(resolveAlertSchema), FraudController.resolveAlert);

// Threat alerts
router.get('/threats', FraudController.getThreatAlerts);
router.get('/threats/:id', FraudController.getThreatAlert);
router.put('/threats/:id/resolve', FraudController.resolveThreatAlert);

// Fraud statistics
router.get('/stats', FraudController.getFraudStats);

export default router;