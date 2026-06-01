import { Request, Response, NextFunction, Application } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { z } from 'zod';

import { JWTUtils, ApiError, SecurityHelpers } from '../utils';
import { UserRole, AuditAction, ThreatSeverity } from '../types';
import { AuditLogger } from '../services/auditService';
import { logger } from '../config/logger';
import config from '../config';
import models from '../models';

// =============================================
// Apply Security Middleware Chain
// =============================================

export const applySecurityMiddleware = (app: Application): void => {
  // Additional security headers (Helmet already applied in server.ts)
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Only set these if not already set by Helmet
    if (!res.getHeader('X-Frame-Options')) {
      res.setHeader('X-Frame-Options', 'DENY');
    }
    
    if (!res.getHeader('X-Content-Type-Options')) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    
    if (!res.getHeader('Referrer-Policy')) {
      res.setHeader('Referrer-Policy', 'no-referrer');
    }
    
    // Generate correlation ID if not provided
    if (!req.headers['x-correlation-id']) {
      req.headers['x-correlation-id'] = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    next();
  });
};

// =============================================
// Authentication Middleware
// =============================================

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw ApiError.unauthorized('No authorization token provided');
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Invalid authorization format. Use: Bearer <token>');
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      throw ApiError.unauthorized('No token provided');
    }
    
    let decoded;
    try {
      decoded = JWTUtils.verifyAccessToken(token);
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw ApiError.unauthorized('Token has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw ApiError.unauthorized('Invalid token');
      }
      throw ApiError.unauthorized('Token verification failed');
    }
    
    if (decoded.type && decoded.type !== 'access') {
      throw ApiError.unauthorized('Invalid token type');
    }
    
    const user = await models.User.findById(decoded.userId);
    
    if (!user) {
      throw ApiError.unauthorized('User not found');
    }
    
    if (!user.isActive) {
      throw ApiError.forbidden('Account has been disabled');
    }
    
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role as UserRole,
      sessionId: decoded.sessionId || '',
      mfaVerified: true,
    };
    
    req.correlationId = req.headers['x-correlation-id'] as string;
    
    next();
    
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) {
      await AuditLogger.log({
        action: AuditAction.UNAUTHORIZED_ACCESS,
        resource: req.path,
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: false,
        severity: ThreatSeverity.MEDIUM,
        details: { 
          method: req.method,
          path: req.path,
          error: error.message,
        },
      });
    }
    
    next(error);
  }
};

// =============================================
// RBAC (Role-Based Access Control) Middleware
// =============================================

export const rbacGate = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }
      
      const userRole = req.user!.role;
      
      if (!allowedRoles.includes(userRole)) {
        AuditLogger.log({
          userId: req.user!.userId,
          action: AuditAction.UNAUTHORIZED_ACCESS,
          resource: req.path,
          ip: req.ip || '0.0.0.0',
          userAgent: req.get('user-agent'),
          success: false,
          severity: ThreatSeverity.HIGH,
          details: {
            userRole,
            requiredRoles: allowedRoles,
            method: req.method,
            path: req.path,
          },
        }).catch(err => logger.error('Failed to log RBAC violation', { error: err.message }));
        
        throw ApiError.forbidden(
          `Access denied. Required role: ${allowedRoles.join(' or ')}`
        );
      }
      
      next();
      
    } catch (error) {
      next(error);
    }
  };
};

// =============================================
// MFA Requirement Middleware
// =============================================

export const requireMfa = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }
    
    const user = await models.User.findById(req.user!.userId);
    
    if (!user) {
      throw ApiError.notFound('User not found');
    }
    
    if (
      (user.role === UserRole.ADMIN || user.role === UserRole.AUDITOR) &&
      !user.mfaEnabled
    ) {
      throw ApiError.forbidden('MFA is required for administrative accounts');
    }
    
    next();
    
  } catch (error) {
    next(error);
  }
};

// =============================================
// Rate Limiter Factory
// =============================================

export const createRateLimiter = (
  windowMs: number = 15 * 60 * 1000,
  max: number = 100,
  message: string = 'Too many requests'
) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: message,
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      return req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
    },
    handler: (req: Request, _res: Response, next: NextFunction, options: any) => {
      AuditLogger.log({
        action: AuditAction.RATE_LIMIT_EXCEEDED,
        resource: req.path,
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: false,
        severity: ThreatSeverity.HIGH,
        details: {
          method: req.method,
          path: req.path,
          windowMs,
          maxRequests: max,
        },
      }).catch(err => logger.error('Failed to log rate limit', { error: err.message }));
      
      next(ApiError.tooManyRequests(message));
    },
  });
};

// =============================================
// Input Validation Middleware
// =============================================

export const validate = (schema: z.ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        
        next(ApiError.badRequest('Validation failed', details));
      } else {
        next(error);
      }
    }
  };
};

// =============================================
// Request Sanitization Middleware
// =============================================

export const sanitizeInput = (req: Request, _res: Response, next: NextFunction) => {
  if (req.body) {
    const sanitize = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(item => sanitize(item));
      }
      
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('$')) {
          logger.warn('MongoDB operator injection attempt blocked', {
            key,
            path: req.path,
            ip: req.ip || '0.0.0.0',
          });
          continue;
        }
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    };
    
    req.body = sanitize(req.body);
  }
  
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (key.startsWith('$')) {
        delete req.query[key];
      }
    }
  }
  
  next();
};

// =============================================
// Audit Middleware (Auto-log certain actions)
// =============================================

export const auditAction = (
  action: AuditAction,
  resource: string,
  getResourceId?: (req: Request) => string | undefined
) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      await AuditLogger.log({
        userId: req.user?.userId,
        action,
        resource,
        resourceId: getResourceId ? getResourceId(req) : undefined,
        ip: req.ip || '0.0.0.0',
        userAgent: req.get('user-agent'),
        success: true,
        details: {
          method: req.method,
          body: process.env.NODE_ENV === 'development' ? req.body : undefined,
        },
        correlationId: req.correlationId,
      });
    } catch (error) {
      logger.error('Audit middleware failed', { error: (error as Error).message });
    }
    
    next();
  };
};

// =============================================
// Threat Detection Middleware
// =============================================

export const threatDetection = (req: Request, _res: Response, next: NextFunction) => {
  const suspiciousPatterns = {
    hasSqli: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b)/i.test(req.url),
    hasXss: /<script|javascript:|onerror=|onload=/i.test(JSON.stringify(req.body)),
    hasPathTravel: /\.\.\//.test(req.url),
    hasNullByte: /\0/.test(req.url),
  };
  
  if (Object.values(suspiciousPatterns).some(Boolean)) {
    logger.warn('Suspicious request pattern detected', {
      ip: req.ip || '0.0.0.0',
      path: req.path,
      patterns: Object.entries(suspiciousPatterns)
        .filter(([_, detected]) => detected)
        .map(([pattern]) => pattern),
    });
    
    AuditLogger.log({
      action: AuditAction.SUSPICIOUS_ACTIVITY,
      resource: req.path,
      ip: req.ip || '0.0.0.0',
      userAgent: req.get('user-agent'),
      success: false,
      severity: ThreatSeverity.HIGH,
      details: {
        patterns: Object.entries(suspiciousPatterns)
          .filter(([_, detected]) => detected)
          .map(([pattern]) => pattern),
      },
    }).catch(err => logger.error('Failed to log suspicious activity', { error: err.message }));
    
    return next(ApiError.badRequest('Request blocked due to suspicious activity'));
  }
  
  next();
};

// =============================================
// CORS Configuration Helper
// =============================================

export const configureCors = () => {
  return cors({
    origin: (origin, callback) => {
      const allowedOrigins = (config.cors.origin || 'http://localhost:3000').split(',');
      
      if (!origin) {
        callback(null, true);
        return;
      }
      
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked request', { origin });
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'content-type',
      'authorization',
      'x-correlation-id',
      'x-requested-with',
      'x-session-id',
    ],
    exposedHeaders: [
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
      'x-correlation-id',
    ],
    maxAge: 86400,
  });
};

// =============================================
// Error Handling Middleware
// =============================================

export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  logger.error('Request error', {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    correlationId: req.headers['x-correlation-id'],
  });
  
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(process.env.NODE_ENV === 'development' && err.details && { 
        details: err.details 
      }),
    });
  }
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.message,
    });
  }
  
  if ((err as any).code === 11000) {
    return res.status(409).json({
      success: false,
      error: 'Duplicate entry',
      details: process.env.NODE_ENV === 'development' ? (err as any).keyValue : undefined,
    });
  }
  
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { 
      details: err.message,
      stack: err.stack,
    }),
  });
};

export default {
  applySecurityMiddleware,
  authenticate,
  rbacGate,
  requireMfa,
  createRateLimiter,
  validate,
  sanitizeInput,
  auditAction,
  threatDetection,
  configureCors,
  errorHandler,
};