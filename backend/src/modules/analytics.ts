import { Router, Response, NextFunction } from 'express';
import type { Request } from 'express';
import { ApiResponse, UserRole, OrderStatus } from '../types';
import { authenticate, rbacGate } from '../middleware';
import mongoose from 'mongoose';
import models from '../models';

import { logger } from '../config/logger';

// =============================================
// Analytics Controller
// =============================================

class AnalyticsController {
  
  /**
   * Get analytics summary/dashboard data
   */
  static async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { period = '30d' } = req.query;
      
      // Calculate date ranges
      const now = new Date();
      let periodMs: number;
      
      switch (period) {
        case '7d': periodMs = 7 * 24 * 60 * 60 * 1000; break;
        case '30d': periodMs = 30 * 24 * 60 * 60 * 1000; break;
        case '90d': periodMs = 90 * 24 * 60 * 60 * 1000; break;
        case '1y': periodMs = 365 * 24 * 60 * 60 * 1000; break;
        default: periodMs = 30 * 24 * 60 * 60 * 1000;
      }
      
      const startDate = new Date(now.getTime() - periodMs);
      
      // Get order statistics
      const ordersInPeriod = await models.Order.find({
        createdAt: { $gte: startDate },
      });
      
      const totalRevenue = ordersInPeriod.reduce((sum, order) => 
        order.paymentStatus === 'completed' ? sum + order.total : sum, 0
      );
      
      const totalOrders = ordersInPeriod.length;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / ordersInPeriod.filter(o => o.paymentStatus === 'completed').length : 0;
      
      // Orders by status
      const ordersByStatus = await models.Order.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);
      
      // User statistics
      const totalUsers = await models.User.countDocuments();
      const newUsers = await models.User.countDocuments({
        createdAt: { $gte: startDate },
      });
      
      // Revenue by period
      const dailyRevenue = await models.Order.aggregate([
        { 
          $match: { 
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            paymentStatus: 'completed',
          } 
        },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]);
      
      const weeklyRevenue = await models.Order.aggregate([
        { 
          $match: { 
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            paymentStatus: 'completed',
          } 
        },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]);
      
      // Top selling products
      const topProducts = await models.Order.aggregate([
        { $match: { createdAt: { $gte: startDate }, paymentStatus: 'completed' } },
        { $unwind: '$items' },
        { 
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.name' },
            totalSold: { $sum: '$items.quantity' },
            revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]);
      
      // Revenue trend (daily)
      const revenueTrend = await models.Order.aggregate([
        { 
          $match: { 
            createdAt: { $gte: startDate },
            paymentStatus: 'completed',
          } 
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            revenue: { $sum: '$total' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]);
      
      // Order trend (daily)
      const orderTrend = await models.Order.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]);
      
      // Fraud statistics
      const fraudStats = await models.FraudAlert.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { 
          $group: {
            _id: '$riskLevel',
            count: { $sum: 1 },
            avgScore: { $avg: '$riskScore' },
          },
        },
      ]);
      
      const totalFlagged = await models.Order.countDocuments({
        createdAt: { $gte: startDate },
        status: OrderStatus.FLAGGED,
      });
      
      const totalRejected = await models.Order.countDocuments({
        createdAt: { $gte: startDate },
        status: OrderStatus.REJECTED,
      });
      
      // Average risk score
      const avgRiskAgg = await models.FraudAlert.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: null, avgScore: { $avg: '$riskScore' } } },
      ]);
      
      res.json(ApiResponse.success({
        totalRevenue,
        totalOrders,
        totalUsers,
        newUsers,
        averageOrderValue,
        revenueByPeriod: {
          daily: dailyRevenue[0]?.total || 0,
          weekly: weeklyRevenue[0]?.total || 0,
          monthly: totalRevenue,
        },
        ordersByStatus: ordersByStatus.reduce((acc: any, curr: any) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {}),
        topProducts,
        revenueTrend: revenueTrend.map(r => ({
          date: `${r._id.year}-${String(r._id.month).padStart(2, '0')}-${String(r._id.day).padStart(2, '0')}`,
          revenue: r.revenue,
          orders: r.orders,
        })),
        orderTrend: orderTrend.map(o => ({
          date: `${o._id.year}-${String(o._id.month).padStart(2, '0')}-${String(o._id.day).padStart(2, '0')}`,
          count: o.count,
        })),
        fraudStats: {
          totalFlagged,
          totalRejected,
          byRiskLevel: fraudStats,
          averageRiskScore: avgRiskAgg[0]?.avgScore || 0,
        },
        period,
        generatedAt: new Date().toISOString(),
      }));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get system health metrics
   */
  static async getSystemHealth(req: Request, res: Response, next: NextFunction) {
    try {
      // Get rate limiter hits (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const rateLimiterHits = await models.AuditLog.countDocuments({
        action: 'rate_limit_exceeded',
        timestamp: { $gte: oneHourAgo },
      });
      
      // Active sessions (rough estimate - active users in last 2 hours)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const activeTokens = await models.AuditLog.distinct('userId', {
        action: 'login_success',
        timestamp: { $gte: twoHoursAgo },
      });
      
      // Service connectivity (check if we can query necessary collections)
      const dbStatus = mongoose.connection.readyState === 1;
      
      // Redis status
      let redisStatus = false;
      try {
        const { FraudDetectionClient } = require('../utils/fraudClient');
        redisStatus = FraudDetectionClient.getInstance().isConnected();
      } catch (error) {
        redisStatus = false;
      }
      
      // Recent errors
      const recentErrors = await models.AuditLog.countDocuments({
        success: false,
        severity: { $in: ['high', 'critical'] },
        timestamp: { $gte: oneHourAgo },
      });
      
      // System metrics
      const metrics = {
        rateLimiterHits,
        activeTokens: activeTokens.length,
        serviceStatus: {
          database: dbStatus ? 'connected' : 'disconnected',
          redis: redisStatus ? 'connected' : 'disconnected',
          fraudService: redisStatus ? 'connected' : 'unavailable',
        },
        recentErrors1h: recentErrors,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        nodeVersion: process.version,
        collectionStats: {
          users: await models.User.countDocuments(),
          products: await models.Product.countDocuments(),
          orders: await models.Order.countDocuments(),
          auditLogs: await models.AuditLog.countDocuments(),
          threatAlerts: await models.ThreatAlert.countDocuments({ isResolved: false }),
          fraudAlerts: await models.FraudAlert.countDocuments({ status: 'open' }),
        },
        timestamp: new Date().toISOString(),
      };
      
      res.json(ApiResponse.success(metrics));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get revenue report
   */
  static async getRevenueReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, groupBy = 'daily' } = req.query;
      
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();
      
      let groupFormat: any;
      
      switch (groupBy) {
        case 'hourly':
          groupFormat = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' }, hour: { $hour: '$createdAt' } };
          break;
        case 'weekly':
          groupFormat = { year: { $year: '$createdAt' }, week: { $week: '$createdAt' } };
          break;
        case 'monthly':
          groupFormat = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
          break;
        default: // daily
          groupFormat = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };
      }
      
      const revenueData = await models.Order.aggregate([
        { 
          $match: { 
            createdAt: { $gte: start, $lte: end },
            paymentStatus: 'completed',
          } 
        },
        {
          $group: {
            _id: groupFormat,
            revenue: { $sum: '$total' },
            orders: { $sum: 1 },
            avgOrderValue: { $avg: '$total' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]);
      
      res.json(ApiResponse.success({
        startDate: start,
        endDate: end,
        groupBy,
        data: revenueData,
        summary: {
          totalRevenue: revenueData.reduce((sum: number, r: any) => sum + r.revenue, 0),
          totalOrders: revenueData.reduce((sum: number, r: any) => sum + r.orders, 0),
        },
      }));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get fraud analytics
   */
  static async getFraudAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const { days = 30 } = req.query;
      const startDate = new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000);
      
      // Fraud alerts over time
      const fraudTrend = await models.FraudAlert.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            count: { $sum: 1 },
            avgRiskScore: { $avg: '$riskScore' },
            highRiskCount: {
              $sum: { $cond: [{ $gte: ['$riskScore', 0.7] }, 1, 0] },
            },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]);
      
      // Resolution statistics
      const resolutionStats = await models.FraudAlert.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: '$resolution',
            count: { $sum: 1 },
          },
        },
      ]);
      
      // Average resolution time
      const resolutionTime = await models.FraudAlert.aggregate([
        { 
          $match: { 
            createdAt: { $gte: startDate },
            status: 'resolved',
          } 
        },
        {
          $project: {
            resolutionTime: { $subtract: ['$updatedAt', '$createdAt'] },
          },
        },
        {
          $group: {
            _id: null,
            avgResolutionMs: { $avg: '$resolutionTime' },
          },
        },
      ]);
      
      res.json(ApiResponse.success({
        period: { days: parseInt(days as string), startDate },
        fraudTrend,
        resolutionStats,
        avgResolutionHours: resolutionTime[0] ? 
          (resolutionTime[0].avgResolutionMs / (1000 * 60 * 60)).toFixed(1) : 0,
        currentOpenAlerts: await models.FraudAlert.countDocuments({ status: 'open' }),
        totalAlerts: await models.FraudAlert.countDocuments({ createdAt: { $gte: startDate } }),
      }));
      
    } catch (error) {
      next(error);
    }
  }
}

// =============================================
// Analytics Routes
// =============================================

const router = Router();

// All analytics routes require Auditor or Admin role
router.use(authenticate);
router.use(rbacGate(UserRole.AUDITOR, UserRole.ADMIN));

// Get analytics summary
router.get('/summary', AnalyticsController.getSummary);

// Get system health
router.get('/health', AnalyticsController.getSystemHealth);

// Get revenue report
router.get('/revenue', AnalyticsController.getRevenueReport);

// Get fraud analytics
router.get('/fraud', AnalyticsController.getFraudAnalytics);

export default router;